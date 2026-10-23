"""Configuration settings for GazeMouse-OS Desktop Input Bridge."""

import os
import secrets
from typing import List

# Network Transport
DEFAULT_HOST: str = "127.0.0.1"
DEFAULT_PORT: int = 8765

# Security & Origin Validation
DEFAULT_ALLOWED_ORIGINS: List[str] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

# Maximum allowed WebSocket message size in bytes (protects against memory flooding)
MAX_MESSAGE_SIZE: int = 4096  # 4 KB

# Message rate-limiting (maximum messages accepted per second per connection)
RATE_LIMIT_PER_SEC: int = 25

# Windows Target Window Allowlist and Excludelist
# Keystrokes will ONLY be dispatched if the active foreground window title
# contains at least one of these case-insensitive keywords AND does not contain
# any excluded keyword (e.g. search pages, video tabs, code editors).
DEFAULT_WINDOW_TITLE_KEYWORDS: List[str] = [
    "Subway Surfers",
    "Poki",
    "Test Window",  # For safe manual testing in Notepad or test target
]

DEFAULT_EXCLUDED_TITLE_KEYWORDS: List[str] = [
    " - google search",
    " - youtube",
    "visual studio code",
    " - visual studio code",
]

# Input Timing Constraints (in milliseconds)
ACTION_PULSE_DURATION_MS: int = 35  # Duration key is physically held down
ACTION_COOLDOWN_MS: int = 250       # Minimum delay between successive actions

# Safety Watchdog Inactivity Timeout (in seconds)
# If no valid message or heartbeat is received while in ENABLED state within
# this timeout, the bridge automatically disables input and releases all keys.
DEFAULT_WATCHDOG_TIMEOUT_SEC: float = 2.0

# Hotkey settings
EMERGENCY_STOP_HOTKEY: str = "Ctrl+Alt+Q"

# Token file location (written with restricted permissions on startup)
TOKEN_FILE_NAME: str = ".bridge_session_token"


class BridgeConfig:
    """Runtime configuration container."""

    def __init__(
        self,
        host: str = DEFAULT_HOST,
        port: int = DEFAULT_PORT,
        allowed_origins: List[str] = None,
        allowed_titles: List[str] = None,
        excluded_titles: List[str] = None,
        session_token: str = None,
        pulse_duration_ms: int = ACTION_PULSE_DURATION_MS,
        cooldown_ms: int = ACTION_COOLDOWN_MS,
        max_message_size: int = MAX_MESSAGE_SIZE,
        watchdog_timeout_sec: float = DEFAULT_WATCHDOG_TIMEOUT_SEC,
    ):
        # Strict security enforcement: host MUST be loopback
        if host not in ("127.0.0.1", "localhost"):
            raise ValueError(f"Security violation: Bridge must bind exclusively to loopback, rejected {host}")

        self.host = host
        self.port = port
        self.allowed_origins = allowed_origins or list(DEFAULT_ALLOWED_ORIGINS)
        self.allowed_titles = allowed_titles or list(DEFAULT_WINDOW_TITLE_KEYWORDS)
        self.excluded_titles = excluded_titles or list(DEFAULT_EXCLUDED_TITLE_KEYWORDS)
        self.pulse_duration_ms = pulse_duration_ms
        self.cooldown_ms = cooldown_ms
        self.max_message_size = max_message_size
        self.watchdog_timeout_sec = watchdog_timeout_sec

        # Generate a cryptographically strong 256-bit URL-safe token if not provided
        self.session_token = session_token or secrets.token_urlsafe(32)

    def is_token_valid(self, candidate_token: str) -> bool:
        """Performs a constant-time comparison of the session token."""
        if not candidate_token or not isinstance(candidate_token, str):
            return False
        return secrets.compare_digest(candidate_token.strip(), self.session_token)

    def is_origin_allowed(self, origin: str) -> bool:
        """Validates that incoming Origin header matches the explicit allowlist."""
        if not origin:
            return False
        normalized = origin.strip().rstrip("/")
        for allowed in self.allowed_origins:
            if normalized == allowed.rstrip("/"):
                return True
        return False

    def is_title_allowed(self, window_title: str) -> bool:
        """
        Validates that the active window title contains an approved keyword
        and is NOT an excluded window (such as a search page, video player, or code editor).
        """
        if not window_title or not isinstance(window_title, str):
            return False
        title_lower = window_title.lower()

        # Check exclusion list first (fails closed)
        for excl in self.excluded_titles:
            if excl.lower() in title_lower:
                return False

        # Require at least one allowed keyword
        return any(keyword.lower() in title_lower for keyword in self.allowed_titles)

