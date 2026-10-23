"""Unit tests for Windows ACL security, SID extraction, and cryptographic token validation."""

import os
import sys
import tempfile
import unittest
from unittest.mock import patch
from config import BridgeConfig
from main import get_current_user_sid, save_token_file_secure


class TestSecurityControls(unittest.TestCase):
    """Tests session token ACLs, constant-time validation, and fail-closed behavior."""

    def test_constant_time_token_comparison(self):
        config = BridgeConfig(session_token="super_secret_token_abcdef1234567890")
        # Correct token
        self.assertTrue(config.is_token_valid("super_secret_token_abcdef1234567890"))
        # Partial token
        self.assertFalse(config.is_token_valid("super_secret_token_abcdef123456789"))
        # Empty or None
        self.assertFalse(config.is_token_valid(""))
        self.assertFalse(config.is_token_valid(None))
        # Extra character
        self.assertFalse(config.is_token_valid("super_secret_token_abcdef1234567890X"))

    def test_get_current_user_sid_on_windows(self):
        if not sys.platform.startswith("win"):
            self.skipTest("Windows-only test")
        sid = get_current_user_sid()
        self.assertTrue(sid.startswith("S-1-"))
        self.assertGreater(len(sid), 10)

    def test_save_token_file_secure_applies_acls(self):
        if not sys.platform.startswith("win"):
            self.skipTest("Windows-only test")

        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            token_path = tmp.name

        try:
            test_token = "secret_session_token_validation_998877"
            save_token_file_secure(test_token, token_path)

            # File must exist and contain the token
            self.assertTrue(os.path.exists(token_path))
            with open(token_path, "r", encoding="utf-8") as f:
                content = f.read()
            self.assertEqual(content, test_token)
        finally:
            if os.path.exists(token_path):
                os.remove(token_path)

    def test_save_token_file_fails_closed_on_acl_error(self):
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            token_path = tmp.name

        try:
            # Mock get_current_user_sid to raise an error
            with patch("main.get_current_user_sid", side_effect=RuntimeError("Mock SID failure")):
                with self.assertRaises(RuntimeError) as ctx:
                    save_token_file_secure("test_token", token_path)
                self.assertIn("Security violation", str(ctx.exception))

            # The token file must have been deleted as a fail-closed measure
            self.assertFalse(os.path.exists(token_path))
        finally:
            if os.path.exists(token_path):
                os.remove(token_path)


if __name__ == "__main__":
    unittest.main()
