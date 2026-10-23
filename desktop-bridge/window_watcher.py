"""Active foreground window watcher using Windows Win32 API via ctypes."""

import sys
import ctypes
from typing import Optional, List


class WindowWatcher:
    """Queries and validates the current active foreground window on Windows."""

    def __init__(
        self,
        allowed_keywords: Optional[List[str]] = None,
        excluded_keywords: Optional[List[str]] = None,
    ):
        self.allowed_keywords = allowed_keywords or []
        self.excluded_keywords = excluded_keywords or [
            " - google search",
            " - youtube",
            "visual studio code",
            " - visual studio code",
        ]
        self._is_windows = sys.platform.startswith("win")
        self._user32 = ctypes.windll.user32 if self._is_windows else None

        # Correct ctypes signatures for 64-bit Windows pointers and handles
        if self._is_windows and self._user32:
            try:
                self._user32.GetForegroundWindow.argtypes = []
                self._user32.GetForegroundWindow.restype = ctypes.c_void_p

                self._user32.GetWindowTextLengthW.argtypes = [ctypes.c_void_p]
                self._user32.GetWindowTextLengthW.restype = ctypes.c_int

                self._user32.GetWindowTextW.argtypes = [ctypes.c_void_p, ctypes.c_wchar_p, ctypes.c_int]
                self._user32.GetWindowTextW.restype = ctypes.c_int
            except Exception:
                pass

    def get_foreground_window_title(self) -> str:
        """
        Retrieves the exact Unicode title of the current foreground window.
        Returns an empty string if unable to query or if not running on Windows.
        Fails closed on any API failure or invalid handle.
        """
        if not self._is_windows or not self._user32:
            return ""

        try:
            hwnd = self._user32.GetForegroundWindow()
            if not hwnd:
                return ""

            length = self._user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return ""

            buffer_size = min(max(length + 1, 64), 1024)
            buffer = ctypes.create_unicode_buffer(buffer_size)
            chars_read = self._user32.GetWindowTextW(hwnd, buffer, buffer_size)
            if chars_read > 0:
                return buffer.value.strip()
            return ""
        except Exception:
            return ""

    def is_foreground_allowed(self) -> bool:
        """
        Returns True if the current foreground window title matches at least one
        of the allowed keywords in a case-insensitive match AND does not match
        any excluded keyword. Fails closed if title cannot be read.
        """
        title = self.get_foreground_window_title()
        if not title:
            return False

        title_lower = title.lower()

        # Fail closed if title matches an excluded category (search, videos, code editors)
        for excl in self.excluded_keywords:
            if excl.lower() in title_lower:
                return False

        for kw in self.allowed_keywords:
            if kw.lower() in title_lower:
                return True

        return False

