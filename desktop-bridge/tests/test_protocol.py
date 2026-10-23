"""Unit tests for desktop bridge protocol parser, schema validator, and rate limiter."""

import unittest
import time
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
    ACTION_LEFT,
    ACTION_RIGHT,
    ACTION_JUMP,
    ACTION_SLIDE,
)


class TestProtocolParser(unittest.TestCase):
    """Tests schema validation and adversarial payload rejection."""

    def test_valid_ping(self):
        msg_type, payload = parse_and_validate_message('{"type": "PING"}')
        self.assertEqual(msg_type, MSG_PING)
        self.assertEqual(payload, {"type": "PING"})

    def test_valid_status(self):
        msg_type, payload = parse_and_validate_message('{"type": "STATUS"}')
        self.assertEqual(msg_type, MSG_STATUS)

    def test_valid_enable_and_disable(self):
        t1, p1 = parse_and_validate_message('{"type": "ENABLE"}')
        self.assertEqual(t1, MSG_ENABLE)
        t2, p2 = parse_and_validate_message('{"type": "DISABLE"}')
        self.assertEqual(t2, MSG_DISABLE)

    def test_valid_stop(self):
        t, p = parse_and_validate_message('{"type": "STOP"}')
        self.assertEqual(t, MSG_STOP)

    def test_valid_actions(self):
        for act in (ACTION_LEFT, ACTION_RIGHT, ACTION_JUMP, ACTION_SLIDE):
            raw = f'{{"type": "ACTION", "action": "{act}"}}'
            msg_type, payload = parse_and_validate_message(raw)
            self.assertEqual(msg_type, MSG_ACTION)
            self.assertEqual(payload["action"], act)

    def test_rejects_case_insensitive_arbitrary_actions(self):
        raw = '{"type": "ACTION", "action": "left"}'
        msg_type, payload = parse_and_validate_message(raw)
        self.assertEqual(payload["action"], "LEFT")

    def test_rejects_arbitrary_key_names(self):
        # Client tries to inject arbitrary keys like Enter, Backspace, or F1
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('{"type": "ACTION", "action": "ENTER"}')
        self.assertIn("Invalid action", str(ctx.exception))

        with self.assertRaises(ProtocolError):
            parse_and_validate_message('{"type": "ACTION", "action": "BACKSPACE"}')

    def test_rejects_shell_commands_and_urls(self):
        # Client attempts to pass command lines or paths
        with self.assertRaises(ProtocolError):
            parse_and_validate_message('{"type": "ACTION", "action": "calc.exe"}')

        with self.assertRaises(ProtocolError):
            parse_and_validate_message('{"type": "ACTION", "action": "https://malicious.com"}')

    def test_rejects_unknown_message_types(self):
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('{"type": "EXECUTE", "cmd": "dir"}')
        self.assertIn("Unsupported message type", str(ctx.exception))

    def test_rejects_malformed_json(self):
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('{"type": "ACTION", action: ')
        self.assertIn("Malformed JSON", str(ctx.exception))

    def test_rejects_oversized_messages(self):
        large_payload = '{"type": "PING", "padding": "' + ("A" * 5000) + '"}'
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message(large_payload, max_size=4096)
        self.assertIn("Oversized message", str(ctx.exception))

    def test_rejects_non_object_json(self):
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('["PING", "LEFT"]')
        self.assertIn("Top-level message must be a JSON object", str(ctx.exception))

    def test_rejects_missing_type_field(self):
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('{"action": "LEFT"}')
        self.assertIn("Missing or invalid 'type' field", str(ctx.exception))

    def test_valid_reset_stop(self):
        t, p = parse_and_validate_message('{"type": "RESET_STOP"}')
        self.assertEqual(t, "RESET_STOP")
        self.assertEqual(p, {"type": "RESET_STOP"})

    def test_rejects_unexpected_fields_in_action(self):
        with self.assertRaises(ProtocolError) as ctx:
            parse_and_validate_message('{"type": "ACTION", "action": "LEFT", "shell": "rm -rf"}')
        self.assertIn("Unexpected fields in ACTION message", str(ctx.exception))

    def test_rejects_unexpected_fields_in_control_messages(self):
        for msg in ("STATUS", "ENABLE", "DISABLE", "STOP", "RESET_STOP"):
            with self.assertRaises(ProtocolError) as ctx:
                parse_and_validate_message(f'{{"type": "{msg}", "extra_field": 123}}')
            self.assertIn(f"Unexpected fields in {msg} message", str(ctx.exception))

    def test_rate_limiter(self):
        limiter = RateLimiter(max_per_second=5)
        # First 5 should succeed
        for _ in range(5):
            self.assertTrue(limiter.check())
        # 6th in same second must fail
        self.assertFalse(limiter.check())


if __name__ == "__main__":
    unittest.main()

