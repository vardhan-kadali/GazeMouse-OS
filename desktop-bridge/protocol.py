"""Strict message protocol and schema validation for GazeMouse-OS Desktop Input Bridge."""

import json
import time
from typing import Dict, Any, Optional, Set, Tuple

# Supported Message Types
MSG_PING = "PING"
MSG_STATUS = "STATUS"
MSG_ENABLE = "ENABLE"
MSG_DISABLE = "DISABLE"
MSG_ACTION = "ACTION"
MSG_STOP = "STOP"
MSG_RESET_STOP = "RESET_STOP"

VALID_MESSAGE_TYPES: Set[str] = {
    MSG_PING,
    MSG_STATUS,
    MSG_ENABLE,
    MSG_DISABLE,
    MSG_ACTION,
    MSG_STOP,
    MSG_RESET_STOP,
}

# Permitted Actions mapped strictly to game controls
ACTION_LEFT = "LEFT"
ACTION_RIGHT = "RIGHT"
ACTION_JUMP = "JUMP"
ACTION_SLIDE = "SLIDE"

VALID_ACTIONS: Set[str] = {
    ACTION_LEFT,
    ACTION_RIGHT,
    ACTION_JUMP,
    ACTION_SLIDE,
}


class ProtocolError(Exception):
    """Raised when an incoming message violates the protocol schema or constraints."""
    pass


class RateLimiter:
    """Sliding-window rate limiter per connection."""

    def __init__(self, max_per_second: int = 25):
        self.max_per_second = max_per_second
        self.timestamps = []

    def check(self) -> bool:
        """Returns True if request is allowed, False if rate limit exceeded."""
        now = time.monotonic()
        # Drop timestamps older than 1 second
        self.timestamps = [t for t in self.timestamps if now - t < 1.0]
        if len(self.timestamps) >= self.max_per_second:
            return False
        self.timestamps.append(now)
        return True


def parse_and_validate_message(raw_data: str, max_size: int = 4096) -> Tuple[str, Dict[str, Any]]:
    """
    Parses and validates a raw incoming WebSocket text frame.

    Returns:
        (message_type, validated_payload)

    Raises:
        ProtocolError: If parsing fails or constraints are violated.
    """
    if not isinstance(raw_data, str):
        raise ProtocolError("Invalid frame format: Expected UTF-8 text")

    if len(raw_data.encode("utf-8")) > max_size:
        raise ProtocolError(f"Oversized message: Exceeds {max_size} bytes limit")

    try:
        data = json.loads(raw_data)
    except Exception as err:
        raise ProtocolError(f"Malformed JSON: {err}")

    if not isinstance(data, dict):
        raise ProtocolError("Invalid schema: Top-level message must be a JSON object")

    msg_type = data.get("type")
    if not msg_type or not isinstance(msg_type, str):
        raise ProtocolError("Missing or invalid 'type' field")

    msg_type_upper = msg_type.strip().upper()
    if msg_type_upper not in VALID_MESSAGE_TYPES:
        raise ProtocolError(f"Unsupported message type: '{msg_type}'. Allowed: {sorted(list(VALID_MESSAGE_TYPES))}")

    # Specific schema checks per message type with strict unexpected-field rejection
    if msg_type_upper == MSG_ACTION:
        unexpected = set(data.keys()) - {"type", "action"}
        if unexpected:
            raise ProtocolError(f"Unexpected fields in ACTION message: {sorted(list(unexpected))}")
        action = data.get("action")
        if not action or not isinstance(action, str):
            raise ProtocolError("ACTION message missing required 'action' string field")
        action_upper = action.strip().upper()
        if action_upper not in VALID_ACTIONS:
            raise ProtocolError(f"Invalid action: '{action}'. Permitted actions: {sorted(list(VALID_ACTIONS))}")
        return msg_type_upper, {"type": MSG_ACTION, "action": action_upper}

    elif msg_type_upper == MSG_PING:
        unexpected = set(data.keys()) - {"type", "timestamp"}
        if unexpected:
            raise ProtocolError(f"Unexpected fields in PING message: {sorted(list(unexpected))}")
        payload = {"type": MSG_PING}
        if "timestamp" in data:
            payload["timestamp"] = data["timestamp"]
        return msg_type_upper, payload

    elif msg_type_upper in (MSG_STATUS, MSG_ENABLE, MSG_DISABLE, MSG_STOP, MSG_RESET_STOP):
        unexpected = set(data.keys()) - {"type"}
        if unexpected:
            raise ProtocolError(f"Unexpected fields in {msg_type_upper} message: {sorted(list(unexpected))}")
        return msg_type_upper, {"type": msg_type_upper}

    raise ProtocolError("Unhandled protocol state")


def format_response(msg_type: str, status: str, details: Optional[Dict[str, Any]] = None) -> str:
    """Formats an outgoing JSON message conforming to standard bridge response schema."""
    resp = {
        "type": msg_type,
        "status": status,
        "timestamp": int(time.time() * 1000),
    }
    if details:
        resp.update(details)
    return json.dumps(resp)
