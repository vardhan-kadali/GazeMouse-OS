"""Global Emergency Stop listener for Windows using Win32 GetAsyncKeyState."""

import sys
import time
import ctypes
import threading
from typing import Callable, Optional

# Win32 Virtual Key Constants
VK_CONTROL = 0x11
VK_MENU = 0x12  # Alt key
VK_KEY_Q = 0x51  # 'Q' key


class EmergencyStopListener:
    """
    Monitors global key state in a background daemon thread.
    Triggers an emergency callback if Ctrl+Alt+Q is physically pressed anywhere on the OS.
    """

    def __init__(self, callback: Callable[[], None], poll_interval_sec: float = 0.05, mock_mode: bool = False):
        self.callback = callback
        self.poll_interval_sec = poll_interval_sec
        self.mock_mode = mock_mode or not sys.platform.startswith("win")
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._user32 = ctypes.windll.user32 if (not self.mock_mode and sys.platform.startswith("win")) else None

        if sys.platform.startswith("win") and self._user32:
            try:
                self._user32.GetAsyncKeyState.argtypes = [ctypes.c_int]
                self._user32.GetAsyncKeyState.restype = ctypes.c_short
            except Exception:
                pass

        self._mock_pressed = False

    def is_hotkey_currently_pressed(self) -> bool:
        """Public method to inspect if Ctrl+Alt+Q is physically pressed right now."""
        if self._mock_pressed:
            return True
        if self.mock_mode or not self._user32:
            return False
        return self._is_hotkey_pressed()

    def start(self) -> None:
        """Starts the background hotkey listener thread."""
        if self._running or self.mock_mode or not self._user32:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True, name="EmergencyStopListener")
        self._thread.start()

    def stop(self) -> None:
        """Stops the background listener thread."""
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=0.5)
            self._thread = None

    def _is_hotkey_pressed(self) -> bool:
        """Checks whether Ctrl, Alt, and Q are physically held down simultaneously."""
        if not self._user32:
            return False

        try:
            # GetAsyncKeyState returns MSB set (0x8000) if key is currently down
            ctrl_down = bool(self._user32.GetAsyncKeyState(VK_CONTROL) & 0x8000)
            alt_down = bool(self._user32.GetAsyncKeyState(VK_MENU) & 0x8000)
            q_down = bool(self._user32.GetAsyncKeyState(VK_KEY_Q) & 0x8000)
            return ctrl_down and alt_down and q_down
        except Exception:
            return False

    def _poll_loop(self) -> None:
        """Continuous polling loop."""
        triggered = False
        while self._running:
            try:
                pressed = self._is_hotkey_pressed()
                if pressed and not triggered:
                    triggered = True
                    try:
                        self.callback()
                    except Exception:
                        pass
                elif not pressed and triggered:
                    # Released keys, reset trigger
                    triggered = False
            except Exception:
                pass

            time.sleep(self.poll_interval_sec)

