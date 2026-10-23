"""Asynchronous RFC 6455 WebSocket server implementation using Python standard library."""

import asyncio
import base64
import hashlib
import json
import logging
import struct
import sys
import time
import urllib.parse
from typing import Optional, Set, Tuple

from config import BridgeConfig
from protocol import (
    parse_and_validate_message,
    format_response,
    ProtocolError,
    RateLimiter,
    MSG_PING,
    MSG_STATUS,
    MSG_ENABLE,
    MSG_DISABLE,
    MSG_ACTION,
    MSG_STOP,
    MSG_RESET_STOP,
)
from window_watcher import WindowWatcher
from input_dispatcher import InputDispatcher
from emergency_stop import EmergencyStopListener

# Operational State Constants
STATE_DISABLED = "DISABLED"
STATE_ENABLED = "ENABLED"
STATE_STOPPED = "STOPPED"
STATE_ERROR = "ERROR"

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

logger = logging.getLogger("BridgeServer")


class BridgeServer:
    """
    Secure desktop input bridge WebSocket server.
    Binds strictly to loopback (127.0.0.1) and processes validated gesture events.
    Thread-safe, single-client exclusive, with asynchronous pulse timing and safety watchdog.
    """

    def __init__(
        self,
        config: BridgeConfig,
        window_watcher: Optional[WindowWatcher] = None,
        input_dispatcher: Optional[InputDispatcher] = None,
        emergency_listener: Optional[EmergencyStopListener] = None,
    ):
        self.config = config
        self.window_watcher = window_watcher or WindowWatcher(
            allowed_keywords=config.allowed_titles,
            excluded_keywords=config.excluded_titles,
        )
        self.input_dispatcher = input_dispatcher or InputDispatcher(pulse_duration_ms=config.pulse_duration_ms)

        self.state = STATE_DISABLED
        self.server: Optional[asyncio.Server] = None
        self.active_writer: Optional[asyncio.StreamWriter] = None
        self.active_clients: Set[asyncio.StreamWriter] = set()

        self.last_action_time: float = 0.0
        self.last_heartbeat_time: float = time.monotonic()
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self._watchdog_task: Optional[asyncio.Task] = None

        self.emergency_listener = emergency_listener or EmergencyStopListener(callback=self._on_emergency_hotkey)

    def _on_emergency_hotkey(self) -> None:
        """Scheduled thread-safely by EmergencyStopListener background OS thread."""
        if self.loop and self.loop.is_running():
            try:
                self.loop.call_soon_threadsafe(self.trigger_emergency_stop)
            except Exception as e:
                logger.error(f"Failed to schedule emergency stop callback: {e}")
                self.trigger_emergency_stop()
        else:
            self.trigger_emergency_stop()

    def trigger_emergency_stop(self) -> None:
        """
        Triggered globally by Ctrl+Alt+Q or internal safety trip.
        Idempotent: halts input immediately, releases all held keys, and notifies clients.
        """
        prev_state = self.state
        self.state = STATE_STOPPED
        released = self.input_dispatcher.release_all_held_keys()
        logger.warning(
            f"EMERGENCY STOP ACTIVATED (Prev state: {prev_state})! Input halted. Released {released} held keys."
        )
        self.broadcast_status("EMERGENCY_STOP_TRIGGERED")

    def broadcast_status(self, reason: str = "", exclude_writer: Optional[asyncio.StreamWriter] = None) -> None:
        """Sends the current operational state to connected clients."""
        payload = format_response(
            "STATUS_UPDATE",
            self.state,
            {
                "state": self.state,
                "reason": reason,
                "foregroundAllowed": self.window_watcher.is_foreground_allowed(),
                "activeTitle": self.window_watcher.get_foreground_window_title()[:80],
                "emergencyStopActive": (self.state == STATE_STOPPED),
            },
        )
        for writer in list(self.active_clients):
            if writer is not exclude_writer:
                try:
                    self._send_ws_text(writer, payload)
                except Exception:
                    pass

    async def _watchdog_loop(self) -> None:
        """Background watchdog: automatically disables input if client ceases communication."""
        try:
            while True:
                await asyncio.sleep(0.1)
                if self.state == STATE_ENABLED:
                    elapsed = time.monotonic() - self.last_heartbeat_time
                    if elapsed >= self.config.watchdog_timeout_sec:
                        logger.warning(
                            f"Safety watchdog expired! Inactivity ({elapsed:.2f}s >= {self.config.watchdog_timeout_sec}s). Disabling input."
                        )
                        self.state = STATE_DISABLED
                        self.input_dispatcher.release_all_held_keys()
                        self.broadcast_status("WATCHDOG_TIMEOUT")
        except asyncio.CancelledError:
            pass


    async def start(self) -> None:
        """Starts the loopback TCP server, hotkey listener, and safety watchdog."""
        self.loop = asyncio.get_running_loop()
        self.server = await asyncio.start_server(
            self._handle_client,
            self.config.host,
            self.config.port,
            reuse_address=True,
        )
        self.emergency_listener.start()
        self._watchdog_task = asyncio.create_task(self._watchdog_loop())
        logger.info(f"Desktop Bridge listening strictly on ws://{self.config.host}:{self.config.port}")
        logger.info(f"Initial State: [{self.state}] — Input locked until explicit ENABLE.")

    async def stop(self) -> None:
        """Gracefully shuts down the server, releases keys, and stops listeners."""
        self.state = STATE_STOPPED

        if self._watchdog_task:
            self._watchdog_task.cancel()
            try:
                await self._watchdog_task
            except asyncio.CancelledError:
                pass
            self._watchdog_task = None

        self.emergency_listener.stop()
        self.input_dispatcher.release_all_held_keys()

        # Disconnect active clients with close frame
        for writer in list(self.active_clients):
            try:
                self._send_ws_close(writer, code=1000, reason="Server shutting down")
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
        self.active_clients.clear()
        self.active_writer = None

        if self.server:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

        logger.info("Desktop Bridge successfully stopped. All keys released.")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        """Handles connection lifecycle for an incoming client."""
        client_addr = writer.get_extra_info("peername")
        remote_ip = client_addr[0] if client_addr else ""

        # 1. Enforce strict loopback remote address check
        if remote_ip not in ("127.0.0.1", "::1", "localhost"):
            logger.warning(f"Connection rejected from non-loopback IP: {remote_ip}")
            writer.close()
            await writer.wait_closed()
            return

        # 2. Enforce single-client exclusivity
        if self.active_writer is not None:
            logger.warning(f"Connection rejected from {client_addr}: Another client is actively connected.")
            self._send_http_error(writer, 429, "Too Many Requests: Another Client Already Connected")
            writer.close()
            await writer.wait_closed()
            return

        # 3. Complete RFC 6455 HTTP upgrade handshake with Origin and Token validation
        authenticated = await self._perform_handshake(reader, writer)
        if not authenticated:
            writer.close()
            await writer.wait_closed()
            return

        self.active_writer = writer
        self.active_clients.add(writer)
        self.last_heartbeat_time = time.monotonic()
        rate_limiter = RateLimiter(max_per_second=25)

        logger.info(f"Client connected and authenticated successfully from {client_addr}")

        # Send initial status
        self._send_ws_text(
            writer,
            format_response(
                "STATUS",
                self.state,
                {
                    "state": self.state,
                    "sessionTokenAccepted": True,
                    "foregroundAllowed": self.window_watcher.is_foreground_allowed(),
                    "activeTitle": self.window_watcher.get_foreground_window_title()[:80],
                    "emergencyStopActive": (self.state == STATE_STOPPED),
                },
            ),
        )

        fragment_buffer = bytearray()
        fragment_opcode: Optional[int] = None

        try:
            while True:
                frame_data = await self._read_ws_frame(reader)
                if frame_data is None:
                    # Client closed or fatal protocol error
                    break

                fin, rsv, opcode, payload = frame_data

                # RFC 6455 RSV check
                if rsv != 0:
                    logger.warning("Protocol violation: RSV bits must be 0.")
                    self._send_ws_close(writer, code=1002, reason="RSV bits non-zero")
                    break

                # Rate limit EVERY frame to prevent control frame abuse
                if not rate_limiter.check():
                    logger.warning("Client exceeded frame rate limit. Dropping frame.")
                    self._send_ws_text(
                        writer,
                        format_response("ERROR", "RATE_LIMIT_EXCEEDED", {"message": "Rate limit exceeded"}),
                    )
                    continue

                # Control frames (Close, Ping, Pong)
                if opcode == 0x8:  # Close
                    self._send_ws_close(writer, code=1000)
                    break
                elif opcode == 0x9:  # Ping
                    self._send_ws_pong(writer, payload)
                    self.last_heartbeat_time = time.monotonic()
                    continue
                elif opcode == 0xA:  # Pong
                    self.last_heartbeat_time = time.monotonic()
                    continue

                # Data frames (Text = 0x1, Continuation = 0x0)
                if opcode not in (0x0, 0x1):
                    logger.warning(f"Unsupported opcode 0x{opcode:X}. Closing.")
                    self._send_ws_close(writer, code=1003, reason="Unsupported opcode")
                    break

                if opcode == 0x1:  # Text start
                    if fragment_opcode is not None:
                        # Protocol violation: started new message while continuation expected
                        logger.warning("Protocol violation: Expected continuation frame, received text frame.")
                        self._send_ws_close(writer, code=1002, reason="Expected continuation frame")
                        break
                    if not fin:
                        fragment_opcode = 0x1
                        fragment_buffer = bytearray(payload)
                        continue
                    else:
                        complete_payload = payload
                elif opcode == 0x0:  # Continuation
                    if fragment_opcode is None:
                        logger.warning("Protocol violation: Unexpected continuation frame.")
                        self._send_ws_close(writer, code=1002, reason="Unexpected continuation frame")
                        break
                    fragment_buffer.extend(payload)
                    if len(fragment_buffer) > self.config.max_message_size:
                        logger.warning("Assembled fragmented message exceeds max size.")
                        self._send_ws_close(writer, code=1009, reason="Message too large")
                        break
                    if not fin:
                        continue
                    else:
                        complete_payload = bytes(fragment_buffer)
                        fragment_buffer = bytearray()
                        fragment_opcode = None

                # Strict UTF-8 validation
                try:
                    text_message = complete_payload.decode("utf-8")
                except UnicodeDecodeError:
                    logger.warning("Invalid UTF-8 payload received. Protocol error 1007.")
                    self._send_ws_close(writer, code=1007, reason="Invalid UTF-8")
                    break

                self.last_heartbeat_time = time.monotonic()
                await self._process_client_message(writer, text_message)

        except asyncio.IncompleteReadError:
            pass
        except Exception as e:
            logger.error(f"Error handling client connection: {e}")
        finally:
            if self.active_writer == writer:
                self.active_writer = None
            self.active_clients.discard(writer)

            # When client disconnects: fail-safe to DISABLED and release keys
            if self.state == STATE_ENABLED:
                self.state = STATE_DISABLED
                self.input_dispatcher.release_all_held_keys()
                logger.info("Client disconnected. State reset to [DISABLED]. All keys released.")

            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def _perform_handshake(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> bool:
        """Performs strict RFC 6455 HTTP Upgrade handshake with Origin and Token verification."""
        try:
            request_line = await reader.readline()
            if not request_line:
                return False

            req_str = request_line.decode("utf-8", errors="replace").strip()
            parts = req_str.split()
            if len(parts) < 3 or parts[0] != "GET":
                self._send_http_error(writer, 400, "Bad Request")
                return False

            raw_path = parts[1]
            parsed_url = urllib.parse.urlparse(raw_path)

            # Read headers
            headers = {}
            while True:
                line = await reader.readline()
                if not line or line == b"\r\n":
                    break
                header_line = line.decode("utf-8", errors="replace").strip()
                if ":" in header_line:
                    k, v = header_line.split(":", 1)
                    headers[k.strip().lower()] = v.strip()

            # Verify WebSocket upgrade and connection headers
            if headers.get("upgrade", "").lower() != "websocket":
                self._send_http_error(writer, 400, "Upgrade Header Must Be WebSocket")
                return False

            connection_hdr = headers.get("connection", "").lower()
            if "upgrade" not in connection_hdr:
                self._send_http_error(writer, 400, "Connection Header Must Include Upgrade")
                return False

            # Verify WebSocket Version 13
            ws_version = headers.get("sec-websocket-version", "")
            if ws_version != "13":
                self._send_http_error(writer, 426, "Sec-WebSocket-Version Must Be 13")
                return False

            # Verify Origin against explicit allowlist
            origin = headers.get("origin", "")
            if not self.config.is_origin_allowed(origin):
                logger.warning(f"Connection rejected: Origin '{origin}' not in allowlist.")
                self._send_http_error(writer, 403, "Forbidden Origin")
                return False

            # Verify Session Authentication Token using constant-time comparison
            query_params = urllib.parse.parse_qs(parsed_url.query)
            token = query_params.get("token", [None])[0]

            # Also check Sec-WebSocket-Protocol for token format: token.<secret>
            ws_protocol_header = headers.get("sec-websocket-protocol", "")
            selected_protocol = None
            if ws_protocol_header:
                for proto in ws_protocol_header.split(","):
                    p = proto.strip()
                    if p.startswith("token."):
                        proto_token = p[len("token."):]
                        if not token:
                            token = proto_token
                        if self.config.is_token_valid(proto_token):
                            selected_protocol = p
                            break

            if not self.config.is_token_valid(token):
                logger.warning("Connection rejected: Invalid or missing authentication token.")
                self._send_http_error(writer, 401, "Unauthorized: Invalid Session Token")
                return False

            ws_key = headers.get("sec-websocket-key")
            if not ws_key:
                self._send_http_error(writer, 400, "Missing Sec-WebSocket-Key")
                return False

            # Compute Sec-WebSocket-Accept
            accept_hash = hashlib.sha1((ws_key + WS_GUID).encode("utf-8")).digest()
            accept_val = base64.b64encode(accept_hash).decode("utf-8")

            # Send 101 Switching Protocols response
            response_headers = [
                "HTTP/1.1 101 Switching Protocols",
                "Upgrade: websocket",
                "Connection: Upgrade",
                f"Sec-WebSocket-Accept: {accept_val}",
            ]
            if selected_protocol:
                response_headers.append(f"Sec-WebSocket-Protocol: {selected_protocol}")
            response_headers.append("\r\n")

            writer.write("\r\n".join(response_headers).encode("utf-8"))
            await writer.drain()
            return True

        except Exception as err:
            logger.error(f"Handshake failed with exception: {err}")
            return False

    def _send_http_error(self, writer: asyncio.StreamWriter, status_code: int, reason: str) -> None:
        """Sends an HTTP error response before socket termination."""
        body = f"{status_code} {reason}\n"
        resp = (
            f"HTTP/1.1 {status_code} {reason}\r\n"
            f"Content-Type: text/plain\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Connection: close\r\n\r\n"
            f"{body}"
        )
        try:
            writer.write(resp.encode("utf-8"))
        except Exception:
            pass

    async def _read_ws_frame(self, reader: asyncio.StreamReader) -> Optional[Tuple[bool, int, int, bytes]]:
        """
        Reads and unmasks a single RFC 6455 WebSocket frame.
        Returns: (fin: bool, rsv: int, opcode: int, unmasked_payload: bytes) or None on failure.
        """
        try:
            two_bytes = await reader.readexactly(2)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return None

        byte0, byte1 = two_bytes[0], two_bytes[1]

        fin = bool(byte0 & 0x80)
        rsv = byte0 & 0x70
        opcode = byte0 & 0x0F
        has_mask = bool(byte1 & 0x80)
        payload_len = byte1 & 0x7F

        if not has_mask:
            # RFC 6455 requires all client-to-server frames to be masked
            logger.warning("Unmasked frame received from client. Protocol violation.")
            return None

        # Control frames MUST be final (FIN=1) and payload <= 125 bytes
        if opcode in (0x8, 0x9, 0xA):
            if not fin or payload_len > 125:
                logger.warning("Control frame violation: Must be final with payload <= 125 bytes.")
                return None

        if payload_len == 126:
            ext_len = await reader.readexactly(2)
            payload_len = struct.unpack("!H", ext_len)[0]
        elif payload_len == 127:
            ext_len = await reader.readexactly(8)
            payload_len = struct.unpack("!Q", ext_len)[0]

        if payload_len > self.config.max_message_size:
            logger.warning(f"Frame length {payload_len} exceeds max size {self.config.max_message_size}")
            return None

        mask_key = await reader.readexactly(4)
        masked_data = await reader.readexactly(payload_len)

        # Unmask payload
        unmasked = bytearray(payload_len)
        for i in range(payload_len):
            unmasked[i] = masked_data[i] ^ mask_key[i % 4]

        return fin, rsv, opcode, bytes(unmasked)

    def _send_ws_text(self, writer: asyncio.StreamWriter, text: str) -> None:
        """Encodes and sends an unmasked text frame to client."""
        payload = text.encode("utf-8")
        length = len(payload)

        header = bytearray([0x81])  # FIN + Text
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(127)
            header.extend(struct.pack("!Q", length))

        try:
            writer.write(bytes(header) + payload)
        except Exception:
            pass

    def _send_ws_pong(self, writer: asyncio.StreamWriter, payload: bytes) -> None:
        """Sends an unmasked pong frame (opcode 0xA)."""
        header = bytearray([0x8A, len(payload)])
        try:
            writer.write(bytes(header) + payload)
        except Exception:
            pass

    def _send_ws_close(self, writer: asyncio.StreamWriter, code: int = 1000, reason: str = "") -> None:
        """Sends a standard close frame (opcode 0x8) with status code."""
        reason_bytes = reason.encode("utf-8")[:123]
        payload = struct.pack("!H", code) + reason_bytes
        header = bytearray([0x88, len(payload)])
        try:
            writer.write(bytes(header) + payload)
        except Exception:
            pass

    async def _process_client_message(self, writer: asyncio.StreamWriter, raw_data: str) -> None:
        """Parses, validates, and routes incoming messages."""
        try:
            msg_type, payload = parse_and_validate_message(raw_data, max_size=self.config.max_message_size)
        except ProtocolError as p_err:
            logger.warning(f"Protocol error: {p_err}")
            self._send_ws_text(writer, format_response("ERROR", "PROTOCOL_VIOLATION", {"message": str(p_err)}))
            return

        now = time.monotonic()

        if msg_type == MSG_PING:
            self._send_ws_text(writer, format_response("PONG", self.state))

        elif msg_type == MSG_STATUS:
            self._send_ws_text(
                writer,
                format_response(
                    "STATUS",
                    self.state,
                    {
                        "state": self.state,
                        "foregroundAllowed": self.window_watcher.is_foreground_allowed(),
                        "activeTitle": self.window_watcher.get_foreground_window_title()[:80],
                        "emergencyStopActive": (self.state == STATE_STOPPED),
                    },
                ),
            )

        elif msg_type == MSG_RESET_STOP:
            # Explicit recovery from emergency stop
            if self.state != STATE_STOPPED:
                self._send_ws_text(
                    writer,
                    format_response("RESET_STOP_REJECTED", self.state, {"reason": "Bridge is not in STOPPED state."}),
                )
                return

            if self.emergency_listener.is_hotkey_currently_pressed():
                logger.warning("RESET_STOP rejected: Emergency hotkey Ctrl+Alt+Q is still held down.")
                self._send_ws_text(
                    writer,
                    format_response(
                        "RESET_STOP_REJECTED",
                        self.state,
                        {"reason": "Emergency stop hotkey is still physically pressed."},
                    ),
                )
                return

            self.state = STATE_DISABLED
            logger.info("Operational state recovered from STOPPED to [DISABLED]. Explicit ENABLE now permitted.")
            self.broadcast_status("RESET_STOP_ACCEPTED", exclude_writer=writer)
            self._send_ws_text(
                writer,
                format_response("RESET_STOP_ACK", self.state, {"message": "Emergency stop cleared. State is DISABLED."}),
            )

        elif msg_type == MSG_ENABLE:
            # Routine ENABLE CANNOT clear an emergency stop
            if self.state == STATE_STOPPED:
                logger.warning("ENABLE rejected: Bridge is STOPPED. Explicit RESET_STOP required first.")
                self._send_ws_text(
                    writer,
                    format_response(
                        "ENABLE_REJECTED",
                        self.state,
                        {"reason": "Bridge is STOPPED. Explicit RESET_STOP required before ENABLE."},
                    ),
                )
                return

            self.state = STATE_ENABLED
            logger.info("Operational state changed to [ENABLED]. Keystroke dispatch unlocked.")
            self.broadcast_status("ENABLED_BY_CLIENT", exclude_writer=writer)
            self._send_ws_text(writer, format_response("ENABLED", self.state))

        elif msg_type == MSG_DISABLE:
            self.state = STATE_DISABLED
            self.input_dispatcher.release_all_held_keys()
            logger.info("Operational state changed to [DISABLED]. All keys released.")
            self.broadcast_status("DISABLED_BY_CLIENT", exclude_writer=writer)
            self._send_ws_text(writer, format_response("DISABLED", self.state))

        elif msg_type == MSG_STOP:
            self.state = STATE_STOPPED
            self.input_dispatcher.release_all_held_keys()
            logger.warning("Stop command received. State changed to [STOPPED]. All keys released.")
            self.broadcast_status("STOPPED_BY_CLIENT", exclude_writer=writer)
            self._send_ws_text(writer, format_response("STOPPED", self.state))


        elif msg_type == MSG_ACTION:
            action = payload["action"]

            # Safety Gate 1: Check operational state
            if self.state != STATE_ENABLED:
                logger.info(f"Action '{action}' rejected: Bridge state is [{self.state}].")
                self._send_ws_text(
                    writer,
                    format_response("ACTION_REJECTED", self.state, {"reason": f"State is {self.state}"}),
                )
                return

            # Safety Gate 2: Active foreground window allowlist check via trusted Windows API
            if not self.window_watcher.is_foreground_allowed():
                current_title = self.window_watcher.get_foreground_window_title()
                logger.warning(
                    f"Action '{action}' rejected: Foreground window '{current_title}' not in allowlist. Disabling input."
                )
                self.state = STATE_DISABLED
                self.input_dispatcher.release_all_held_keys()
                self._send_ws_text(
                    writer,
                    format_response(
                        "ACTION_REJECTED",
                        self.state,
                        {"reason": "Foreground window not allowed", "activeTitle": current_title[:80]},
                    ),
                )
                self.broadcast_status("FOREGROUND_NOT_ALLOWED")
                return

            # Safety Gate 3: Action cooldown enforcement
            elapsed_ms = (now - self.last_action_time) * 1000.0
            if elapsed_ms < self.config.cooldown_ms:
                self._send_ws_text(
                    writer,
                    format_response("ACTION_REJECTED", self.state, {"reason": "Cooldown active"}),
                )
                return

            # Asynchronous non-blocking dispatch of discrete key pulse
            self.last_action_time = now
            success = await self.input_dispatcher.dispatch_action_async(action)

            logger.info(f"Action executed: [{action}] (Success: {success})")
            self._send_ws_text(
                writer,
                format_response("ACTION_EXECUTED", self.state, {"action": action, "success": success}),
            )
