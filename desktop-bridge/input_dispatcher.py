"""Hardware-level Windows keyboard input dispatcher using Win32 SendInput via ctypes."""

import sys
import time
import ctypes
from typing import Set, Optional, Dict, Callable

# Win32 Constants
INPUT_KEYBOARD = 1
KEYEVENTF_KEYDOWN = 0x0000
KEYEVENTF_EXTENDEDKEY = 0x0001
KEYEVENTF_KEYUP = 0x0002
KEYEVENTF_SCANCODE = 0x0008

# Key mapping definition: (VirtualKey, ScanCode, isExtended)
KEY_DEFINITIONS: Dict[str, Dict[str, int]] = {
    "LEFT": {"vk": 0x25, "scan": 0x4B, "extended": 1},   # Arrow Left
    "RIGHT": {"vk": 0x27, "scan": 0x4D, "extended": 1},  # Arrow Right
    "JUMP": {"vk": 0x26, "scan": 0x48, "extended": 1},   # Arrow Up
    "SLIDE": {"vk": 0x28, "scan": 0x50, "extended": 1},  # Arrow Down
}

# Win32 Structures (defined only on Windows)
if sys.platform.startswith("win"):
    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [
            ("wVk", ctypes.c_ushort),
            ("wScan", ctypes.c_ushort),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class HARDWAREINPUT(ctypes.Structure):
        _fields_ = [
            ("uMsg", ctypes.c_ulong),
            ("wParamL", ctypes.c_short),
            ("wParamH", ctypes.c_ushort),
        ]

    class MOUSEINPUT(ctypes.Structure):
        _fields_ = [
            ("dx", ctypes.c_long),
            ("dy", ctypes.c_long),
            ("mouseData", ctypes.c_ulong),
            ("dwFlags", ctypes.c_ulong),
            ("time", ctypes.c_ulong),
            ("dwExtraInfo", ctypes.c_size_t),
        ]

    class INPUT_UNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT)]

    class INPUT(ctypes.Structure):
        _fields_ = [("type", ctypes.c_ulong), ("union", INPUT_UNION)]


import asyncio
import threading

class InputDispatcher:
    """
    Manages safe, discrete keystroke dispatching to Windows applications.
    Tracks all active key presses and guarantees key release via a finally block.
    Thread-safe and supports asynchronous pulse timing.
    """

    def __init__(self, mock_mode: bool = False, pulse_duration_ms: int = 35):
        self.mock_mode = mock_mode or not sys.platform.startswith("win")
        self.pulse_duration_ms = pulse_duration_ms
        self._held_actions: Set[str] = set()
        self._lock = threading.Lock()
        self._async_lock = asyncio.Lock()
        self.dispatched_events_history = []  # For auditing and test verification
        self._user32 = ctypes.windll.user32 if (not self.mock_mode and sys.platform.startswith("win")) else None

        # Correct ctypes signatures for 64-bit Windows SendInput
        if self._user32:
            try:
                self._user32.SendInput.argtypes = [ctypes.c_uint, ctypes.POINTER(INPUT), ctypes.c_int]
                self._user32.SendInput.restype = ctypes.c_uint
            except Exception:
                pass

    def _send_hardware_key(self, scan_code: int, extended: bool, key_up: bool, vk: int = 0) -> bool:
        """Sends a hardware scancode event using Win32 SendInput. Returns True if successful."""
        if self.mock_mode or not self._user32:
            return True

        flags = KEYEVENTF_SCANCODE
        if extended:
            flags |= KEYEVENTF_EXTENDEDKEY
        if key_up:
            flags |= KEYEVENTF_KEYUP

        inp = INPUT()
        inp.type = INPUT_KEYBOARD
        inp.union.ki.wVk = vk
        inp.union.ki.wScan = scan_code
        inp.union.ki.dwFlags = flags
        inp.union.ki.time = 0
        inp.union.ki.dwExtraInfo = 0

        try:
            sent = self._user32.SendInput(1, ctypes.byref(inp), ctypes.sizeof(INPUT))
            return sent == 1
        except Exception:
            return False

    async def dispatch_action_async(self, action: str) -> bool:
        """
        Asynchronously dispatches a short, discrete key pulse (KeyDown -> async sleep -> KeyUp).
        Does NOT block the asyncio event loop.
        Guarantees KeyUp release inside a finally block even if cancelled.
        """
        if action not in KEY_DEFINITIONS:
            return False

        key_def = KEY_DEFINITIONS[action]
        scan = key_def["scan"]
        vk = key_def.get("vk", 0)
        extended = bool(key_def["extended"])

        # Prevent overlapping actions
        async with self._async_lock:
            with self._lock:
                self._held_actions.add(action)
                self.dispatched_events_history.append((action, "DOWN", time.time()))
                self._send_hardware_key(scan, extended, key_up=False, vk=vk)

            try:
                await asyncio.sleep(self.pulse_duration_ms / 1000.0)
            finally:
                with self._lock:
                    self._send_hardware_key(scan, extended, key_up=True, vk=vk)
                    self._held_actions.discard(action)
                    self.dispatched_events_history.append((action, "UP", time.time()))

        return True

    def dispatch_action(self, action: str) -> bool:
        """
        Synchronous fallback for dispatching a key pulse.
        Guarantees KeyUp release inside a finally block.
        """
        if action not in KEY_DEFINITIONS:
            return False

        key_def = KEY_DEFINITIONS[action]
        scan = key_def["scan"]
        vk = key_def.get("vk", 0)
        extended = bool(key_def["extended"])

        with self._lock:
            self._held_actions.add(action)
            self.dispatched_events_history.append((action, "DOWN", time.time()))
            self._send_hardware_key(scan, extended, key_up=False, vk=vk)

        try:
            time.sleep(self.pulse_duration_ms / 1000.0)
        finally:
            with self._lock:
                self._send_hardware_key(scan, extended, key_up=True, vk=vk)
                self._held_actions.discard(action)
                self.dispatched_events_history.append((action, "UP", time.time()))

        return True

    def release_all_held_keys(self) -> int:
        """
        Emergency release: forces a KeyUp event for every action currently recorded as held.
        Thread-safe and can be called from hotkey poller thread or event loop.
        Returns the number of keys released.
        """
        released_count = 0
        with self._lock:
            held_list = list(self._held_actions)
            for action in held_list:
                if action in KEY_DEFINITIONS:
                    key_def = KEY_DEFINITIONS[action]
                    self._send_hardware_key(
                        key_def["scan"],
                        bool(key_def["extended"]),
                        key_up=True,
                        vk=key_def.get("vk", 0),
                    )
                    self.dispatched_events_history.append((action, "EMERGENCY_UP", time.time()))
                    released_count += 1
            self._held_actions.clear()

        return released_count

    @property
    def has_held_keys(self) -> bool:
        """Returns True if any key is currently in down state."""
        with self._lock:
            return len(self._held_actions) > 0

