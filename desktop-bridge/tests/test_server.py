"""Integration tests for bridge WebSocket server lifecycle, security, and state machine."""

import asyncio
import base64
import json
import struct
import unittest
from config import BridgeConfig
from server import (
    BridgeServer,
    STATE_DISABLED,
    STATE_ENABLED,
    STATE_STOPPED,
)
from input_dispatcher import InputDispatcher
from tests.test_window_watcher import MockWindowWatcher


class TestBridgeServer(unittest.IsolatedAsyncioTestCase):
    """Tests the asynchronous bridge server over loopback with mock hardware dispatchers."""

    async def asyncSetUp(self):
        self.config = BridgeConfig(
            host="127.0.0.1",
            port=0,  # OS assigned ephemeral port for testing
            allowed_origins=["http://localhost:5173"],
            allowed_titles=["Subway Surfers", "Poki"],
            session_token="test_secret_token_12345",
            cooldown_ms=100,
            watchdog_timeout_sec=5.0,
        )
        self.mock_watcher = MockWindowWatcher(
            allowed_keywords=self.config.allowed_titles,
            excluded_keywords=self.config.excluded_titles,
            mock_title="Subway Surfers - Poki - Google Chrome",
        )
        self.mock_dispatcher = InputDispatcher(mock_mode=True, pulse_duration_ms=5)

        self.server = BridgeServer(
            config=self.config,
            window_watcher=self.mock_watcher,
            input_dispatcher=self.mock_dispatcher,
        )
        await self.server.start()
        # Retrieve actual assigned port
        self.port = self.server.server.sockets[0].getsockname()[1]

    async def asyncTearDown(self):
        await self.server.stop()

    def test_rejects_non_loopback_binding(self):
        with self.assertRaises(ValueError) as ctx:
            BridgeConfig(host="0.0.0.0", port=8765)
        self.assertIn("Security violation", str(ctx.exception))

        with self.assertRaises(ValueError):
            BridgeConfig(host="192.168.1.100", port=8765)

    def test_initial_state_is_disabled(self):
        self.assertEqual(self.server.state, STATE_DISABLED)

    async def _connect_raw(self, origin: str, token: str, path: str = "/", subprotocol: str = ""):
        """Connects and performs HTTP upgrade handshake."""
        reader, writer = await asyncio.open_connection("127.0.0.1", self.port)
        key = base64.b64encode(b"test_nonce_1234").decode("utf-8")
        req_path = f"{path}?token={token}" if token else path
        proto_hdr = f"Sec-WebSocket-Protocol: {subprotocol}\r\n" if subprotocol else ""
        req = (
            f"GET {req_path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:{self.port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Origin: {origin}\r\n"
            f"{proto_hdr}\r\n"
        )
        writer.write(req.encode("utf-8"))
        await writer.drain()

        # Read handshake response
        response_line = await reader.readline()
        status_line = response_line.decode("utf-8", errors="replace")

        # Read rest of headers
        self.last_resp_headers = {}
        while True:
            line = await reader.readline()
            if not line or line == b"\r\n":
                break
            h_str = line.decode("utf-8", errors="replace").strip()
            if ":" in h_str:
                k, v = h_str.split(":", 1)
                self.last_resp_headers[k.strip().lower()] = v.strip()

        return status_line, reader, writer

    async def test_handshake_rejects_unauthorized_origin(self):
        status, reader, writer = await self._connect_raw(
            origin="http://evil-website.com",
            token="test_secret_token_12345",
        )
        self.assertIn("403", status)
        writer.close()
        await writer.wait_closed()

    async def test_handshake_rejects_invalid_token(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="wrong_token_guess",
        )
        self.assertIn("401", status)
        writer.close()
        await writer.wait_closed()

    async def test_handshake_rejects_missing_token(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="",
        )
        self.assertIn("401", status)
        writer.close()
        await writer.wait_closed()

    async def test_valid_handshake_succeeds(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101 Switching Protocols", status)
        writer.close()
        await writer.wait_closed()

    async def test_handshake_with_subprotocol_selects_and_returns_protocol(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
            subprotocol="token.test_secret_token_12345",
        )
        self.assertIn("101", status)
        self.assertEqual(
            self.last_resp_headers.get("sec-websocket-protocol"),
            "token.test_secret_token_12345",
        )
        writer.close()
        await writer.wait_closed()

    async def test_handshake_with_subprotocol_alone_succeeds(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="",
            subprotocol="token.test_secret_token_12345",
        )
        self.assertIn("101", status)
        self.assertEqual(
            self.last_resp_headers.get("sec-websocket-protocol"),
            "token.test_secret_token_12345",
        )
        writer.close()
        await writer.wait_closed()

    async def test_initial_status_message_schema(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101", status)
        initial_msg = await self._read_unmasked_text(reader)
        self.assertEqual(initial_msg["type"], "STATUS")
        self.assertEqual(initial_msg["state"], STATE_DISABLED)
        self.assertEqual(initial_msg["status"], STATE_DISABLED)
        self.assertIn("foregroundAllowed", initial_msg)
        self.assertIn("activeTitle", initial_msg)
        self.assertIn("emergencyStopActive", initial_msg)
        writer.close()
        await writer.wait_closed()

    async def test_concurrent_connection_rejected(self):
        # Client 1 connects successfully
        status1, reader1, writer1 = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101", status1)

        # Client 2 attempts to connect while Client 1 is active -> must be rejected with 429
        status2, reader2, writer2 = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("429", status2)
        writer2.close()
        await writer2.wait_closed()

        # Disconnect Client 1
        writer1.close()
        await writer1.wait_closed()
        await asyncio.sleep(0.05)

        # Client 3 can now connect
        status3, reader3, writer3 = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101", status3)
        writer3.close()
        await writer3.wait_closed()

    async def _send_masked_text(self, writer, text: str):
        payload = text.encode("utf-8")
        mask = b"\x12\x34\x56\x78"
        masked = bytearray(len(payload))
        for i in range(len(payload)):
            masked[i] = payload[i] ^ mask[i % 4]

        header = bytearray([0x81, 0x80 | len(payload)])
        writer.write(bytes(header) + mask + bytes(masked))
        await writer.drain()

    async def _read_unmasked_text(self, reader) -> dict:
        two_bytes = await reader.readexactly(2)
        payload_len = two_bytes[1] & 0x7F
        if payload_len == 126:
            ext_len = await reader.readexactly(2)
            payload_len = struct.unpack("!H", ext_len)[0]
        elif payload_len == 127:
            ext_len = await reader.readexactly(8)
            payload_len = struct.unpack("!Q", ext_len)[0]
        payload = await reader.readexactly(payload_len)
        return json.loads(payload.decode("utf-8"))

    async def test_action_rejected_until_enabled(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101", status)
        # Read initial status
        await self._read_unmasked_text(reader)

        # Attempt ACTION while bridge is DISABLED
        await self._send_masked_text(writer, json.dumps({"type": "ACTION", "action": "LEFT"}))
        resp = await self._read_unmasked_text(reader)

        self.assertEqual(resp["type"], "ACTION_REJECTED")
        self.assertEqual(resp["status"], STATE_DISABLED)
        # Ensure zero actions dispatched to mock dispatcher
        self.assertEqual(len(self.mock_dispatcher.dispatched_events_history), 0)

        writer.close()
        await writer.wait_closed()

    async def test_enable_and_action_dispatch(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        self.assertIn("101", status)
        await self._read_unmasked_text(reader)  # initial status

        # Send ENABLE
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        enable_resp = await self._read_unmasked_text(reader)
        self.assertEqual(enable_resp["status"], STATE_ENABLED)
        self.assertEqual(self.server.state, STATE_ENABLED)

        # Send ACTION LEFT
        await self._send_masked_text(writer, json.dumps({"type": "ACTION", "action": "LEFT"}))
        action_resp = await self._read_unmasked_text(reader)
        self.assertEqual(action_resp["type"], "ACTION_EXECUTED")
        self.assertEqual(action_resp["action"], "LEFT")
        self.assertTrue(action_resp["success"])

        # Verify mock dispatcher recorded events
        self.assertEqual(len(self.mock_dispatcher.dispatched_events_history), 2)
        self.assertEqual(self.mock_dispatcher.dispatched_events_history[0][0], "LEFT")

        writer.close()
        await writer.wait_closed()

    async def test_focus_change_rejects_action_and_disables_input(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Enable bridge
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        await self._read_unmasked_text(reader)

        # Change active foreground window to an unapproved application (e.g. VS Code / Terminal)
        self.mock_watcher.mock_title = "cmd.exe - Administrator"

        # Attempt ACTION RIGHT
        await self._send_masked_text(writer, json.dumps({"type": "ACTION", "action": "RIGHT"}))
        resp = await self._read_unmasked_text(reader)

        self.assertEqual(resp["type"], "ACTION_REJECTED")
        self.assertIn("Foreground window not allowed", resp["reason"])
        # Safety enforcement: state MUST transition to DISABLED
        self.assertEqual(self.server.state, STATE_DISABLED)
        # Mock dispatcher must have zero keys held
        self.assertFalse(self.mock_dispatcher.has_held_keys)

        writer.close()
        await writer.wait_closed()

    async def test_emergency_stop_blocks_subsequent_actions(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Enable bridge
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        await self._read_unmasked_text(reader)
        self.assertEqual(self.server.state, STATE_ENABLED)

        # Trigger emergency stop
        self.server.trigger_emergency_stop()
        self.assertEqual(self.server.state, STATE_STOPPED)

        # Drain status broadcast
        await self._read_unmasked_text(reader)

        # Attempt ACTION while STOPPED
        await self._send_masked_text(writer, json.dumps({"type": "ACTION", "action": "JUMP"}))
        resp = await self._read_unmasked_text(reader)
        self.assertEqual(resp["type"], "ACTION_REJECTED")
        self.assertEqual(resp["status"], STATE_STOPPED)

        writer.close()
        await writer.wait_closed()

    async def test_stopped_state_cannot_be_cleared_by_enable_alone(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Trigger emergency stop
        self.server.trigger_emergency_stop()
        self.assertEqual(self.server.state, STATE_STOPPED)
        await self._read_unmasked_text(reader)  # drain broadcast

        # Attempt routine ENABLE -> MUST BE REJECTED
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        resp = await self._read_unmasked_text(reader)
        self.assertEqual(resp["type"], "ENABLE_REJECTED")
        self.assertIn("Explicit RESET_STOP required", resp["reason"])
        self.assertEqual(self.server.state, STATE_STOPPED)

        writer.close()
        await writer.wait_closed()

    async def test_explicit_reset_stop_plus_enable_recovery(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Trigger emergency stop
        self.server.trigger_emergency_stop()
        self.assertEqual(self.server.state, STATE_STOPPED)
        await self._read_unmasked_text(reader)  # drain broadcast

        # Client sends RESET_STOP
        await self._send_masked_text(writer, json.dumps({"type": "RESET_STOP"}))
        # Might receive broadcast followed by ACK
        msg1 = await self._read_unmasked_text(reader)
        if msg1.get("type") == "STATUS_UPDATE":
            msg2 = await self._read_unmasked_text(reader)
            ack_msg = msg2
        else:
            ack_msg = msg1
        self.assertEqual(ack_msg["type"], "RESET_STOP_ACK")
        self.assertEqual(self.server.state, STATE_DISABLED)

        # Now client can send explicit ENABLE
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        enable_resp = await self._read_unmasked_text(reader)
        self.assertEqual(enable_resp["status"], STATE_ENABLED)
        self.assertEqual(self.server.state, STATE_ENABLED)

        writer.close()
        await writer.wait_closed()

    async def test_reset_stop_rejected_if_hotkey_still_pressed(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        self.server.trigger_emergency_stop()
        await self._read_unmasked_text(reader)  # drain broadcast

        # Simulate user physically holding down Ctrl+Alt+Q
        self.server.emergency_listener._mock_pressed = True

        # Send RESET_STOP while keys held
        await self._send_masked_text(writer, json.dumps({"type": "RESET_STOP"}))
        resp = await self._read_unmasked_text(reader)
        self.assertEqual(resp["type"], "RESET_STOP_REJECTED")
        self.assertIn("still physically pressed", resp["reason"])
        self.assertEqual(self.server.state, STATE_STOPPED)

        # Release keys
        self.server.emergency_listener._mock_pressed = False
        await self._send_masked_text(writer, json.dumps({"type": "RESET_STOP"}))
        # Drain broadcast or ACK
        msg = await self._read_unmasked_text(reader)
        if msg.get("type") == "STATUS_UPDATE":
            msg = await self._read_unmasked_text(reader)
        self.assertEqual(msg["type"], "RESET_STOP_ACK")
        self.assertEqual(self.server.state, STATE_DISABLED)

        writer.close()
        await writer.wait_closed()

    async def test_watchdog_timeout_disables_input(self):
        self.server.config.watchdog_timeout_sec = 0.2
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Enable bridge
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        await self._read_unmasked_text(reader)
        self.assertEqual(self.server.state, STATE_ENABLED)

        # Inactivity for 0.4s (watchdog timeout is 0.2s)
        await asyncio.sleep(0.4)

        # Safety watchdog must have expired and disabled input
        self.assertEqual(self.server.state, STATE_DISABLED)
        self.assertFalse(self.mock_dispatcher.has_held_keys)

        writer.close()
        await writer.wait_closed()

    async def test_rfc6455_fragmented_message_assembly(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Enable bridge
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        await self._read_unmasked_text(reader)

        # Split JSON payload into 2 fragments:
        # Part 1: '{"type": "ACTION", "action": ' (FIN=0, opcode=0x1)
        part1 = b'{"type": "ACTION", "action": '
        mask1 = b"\x11\x22\x33\x44"
        masked1 = bytes(b ^ mask1[i % 4] for i, b in enumerate(part1))
        # Frame 1: byte0 = 0x01 (FIN=0, opcode=1), byte1 = 0x80 | len
        frame1 = bytes([0x01, 0x80 | len(part1)]) + mask1 + masked1

        # Part 2: '"LEFT"}' (FIN=1, opcode=0x0 continuation)
        part2 = b'"LEFT"}'
        mask2 = b"\x55\x66\x77\x88"
        masked2 = bytes(b ^ mask2[i % 4] for i, b in enumerate(part2))
        # Frame 2: byte0 = 0x80 (FIN=1, opcode=0), byte1 = 0x80 | len
        frame2 = bytes([0x80, 0x80 | len(part2)]) + mask2 + masked2

        writer.write(frame1 + frame2)
        await writer.drain()

        # Read response from server
        resp = await self._read_unmasked_text(reader)
        self.assertEqual(resp["type"], "ACTION_EXECUTED")
        self.assertEqual(resp["action"], "LEFT")

        writer.close()
        await writer.wait_closed()

    async def test_rfc6455_strict_utf8_validation(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Send invalid UTF-8 payload (0xFF, 0xFE, 0xFD)
        invalid_bytes = b"\xFF\xFE\xFD"
        mask = b"\x11\x22\x33\x44"
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(invalid_bytes))
        frame = bytes([0x81, 0x80 | len(invalid_bytes)]) + mask + masked

        writer.write(frame)
        await writer.drain()

        # Server must close connection with close frame containing code 1007
        try:
            two_bytes = await reader.readexactly(2)
            opcode = two_bytes[0] & 0x0F
            self.assertEqual(opcode, 0x8)  # Close frame
        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass

        writer.close()
        await writer.wait_closed()

    async def test_client_disconnect_disables_state_and_releases_keys(self):
        status, reader, writer = await self._connect_raw(
            origin="http://localhost:5173",
            token="test_secret_token_12345",
        )
        await self._read_unmasked_text(reader)

        # Enable bridge
        await self._send_masked_text(writer, json.dumps({"type": "ENABLE"}))
        await self._read_unmasked_text(reader)
        self.assertEqual(self.server.state, STATE_ENABLED)

        # Disconnect client
        writer.close()
        await writer.wait_closed()
        await asyncio.sleep(0.05)

        # State must automatically revert to DISABLED and keys released
        self.assertEqual(self.server.state, STATE_DISABLED)
        self.assertFalse(self.mock_dispatcher.has_held_keys)


if __name__ == "__main__":
    unittest.main()
