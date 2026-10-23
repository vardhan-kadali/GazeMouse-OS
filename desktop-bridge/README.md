# GazeMouse-OS Desktop Input Bridge (Phase 3 Remediation)

A secure, standalone, minimal local Python bridge daemon that receives approved head-gesture commands from GazeMouse-OS over a loopback WebSocket connection and dispatches discrete keyboard inputs directly to an approved foreground window (e.g., official *Subway Surfers* on Poki) via Windows DirectInput scancodes.

> **Phase 3 Scope Notice:** This bridge is implemented as a standalone service. Frontend integration is strictly deferred to Phase 4. Do not connect the frontend or real game automation until Phase 3 validation is approved.

---

## 1. Supported Platform & Python Version

- **Operating System:** Windows 10 / Windows 11 (64-bit)
- **Python Version:** Python 3.10+ (tested and verified on **Python 3.11.0**)
- **Architecture:** Zero external runtime dependencies. The server, RFC 6455 WebSocket engine, protocol validation, rate limiting, and Win32 input dispatch are built entirely on the Python Standard Library (`asyncio`, `ctypes`, `secrets`, `hashlib`, `json`, `threading`, `subprocess`).

---

## 2. Security Architecture & Audit Remediations

1. **Loopback-Only Binding:**
   The server binds exclusively to `127.0.0.1` and actively rejects attempts to bind to `0.0.0.0` or external network adapters. It is never exposed to the local network (LAN) or public Internet.
2. **Strict Origin & Header Validation:**
   The HTTP upgrade handshake validates the browser `Origin` header against an explicit allowlist (default: `http://localhost:5173`, `http://127.0.0.1:5173`). In addition, it verifies `Connection: Upgrade`, `Upgrade: websocket`, and `Sec-WebSocket-Version: 13`. Requests with missing or untrusted origins receive HTTP `403 Forbidden`.
3. **Unguessable Session Token Authentication & Constant-Time Validation:**
   A cryptographically secure 256-bit token (`secrets.token_urlsafe(32)`) is generated at bridge startup. Handshakes must provide this token via query parameter `?token=...` or WebSocket subprotocol `token.<TOKEN>`. Tokens are verified using `secrets.compare_digest()` to prevent timing side-channel attacks. Non-matching tokens receive HTTP `401 Unauthorized`.
4. **Current-User-Only Windows NTFS ACLs:**
   On startup, the active user's Windows Security Identifier (SID) is retrieved via `whoami.exe /user`. The session token file (`.bridge_session_token`) is secured with `icacls.exe /inheritance:r /grant:r *<SID>:(R,W)`. If ACL application fails, the bridge removes the token file and immediately terminates (fail-closed).
5. **Connection Exclusivity (Single Active Client):**
   The server strictly permits only one active authenticated control client at a time. Secondary connection attempts are rejected with HTTP `429 Too Many Requests`.
6. **Thread-Safe Emergency Stop (`Ctrl + Alt + Q`):**
   A dedicated daemon thread monitors `GetAsyncKeyState(VK_CONTROL)`, `GetAsyncKeyState(VK_MENU)`, and `GetAsyncKeyState(0x51)`. When triggered, work is scheduled thread-safely onto the running event loop via `loop.call_soon_threadsafe()`. Input is halted immediately, held keys are released, and the operational state locks into `STOPPED`.
7. **Strict Emergency Stop Recovery Handshake:**
   A routine `ENABLE` command cannot clear `STOPPED` state (preventing automated frontend retry loops from clearing emergency stops). Recovery requires two deliberate steps:
   - First, the user must physically release `Ctrl + Alt + Q`.
   - Second, the client must issue an explicit `RESET_STOP` command, transitioning state to `DISABLED`.
   - Only then can an explicit `ENABLE` command unlock key dispatch.
8. **Asynchronous Non-Blocking Pulse Timing:**
   Keystroke pulse hold durations (`pulse_duration_ms: 35ms`) use `await asyncio.sleep()`. The event loop is never blocked, allowing incoming `STOP`, `DISABLE`, or ping frames to be processed immediately while a pulse is active. Key-up is guaranteed in a `finally` block even if the task is cancelled.
9. **Active Inactivity Watchdog Timer:**
   If the bridge is in `ENABLED` state and receives no valid message or heartbeat for $\ge 2.0$ seconds (configurable), the safety watchdog trips, automatically transitions state to `DISABLED`, releases all held keys, and broadcasts `WATCHDOG_TIMEOUT`.
10. **Strict Win32 64-bit Pointer Widths & Exclusions:**
    All Win32 functions in `ctypes.windll.user32` (`GetForegroundWindow`, `GetWindowTextW`, `SendInput`, `GetAsyncKeyState`) have explicit `argtypes` and `restype` declarations (`c_void_p`, `POINTER(INPUT)`, etc.). In addition, foreground window checking excludes tabs matching search queries (`" - google search"`), videos (`" - youtube"`), and code editors (`"visual studio code"`).

---

## 3. Installation & Setup

No virtual environment or external packages are required to run the bridge daemon.

```powershell
# Navigate to the desktop-bridge directory
cd "D:\Gaze Mouse - OS\desktop-bridge"

# Optional: Install pytest if you wish to run the automated test suite with pytest
pip install pytest
```

---

## 4. Launching the Bridge

### Default Launch
```powershell
python main.py
```

### Custom Configuration Options
```powershell
# Set custom port and allowlisted window titles
python main.py --port 8765 --title "Subway Surfers" --title "Poki"

# Supply an explicit session token via CLI argument
python main.py --token "your-secure-session-token-here"

# Supply an explicit session token via environment variable
$env:BRIDGE_SESSION_TOKEN = "your-secure-session-token-here"
python main.py
```

### Command-Line Arguments Reference

| Argument | Description | Default |
|---|---|---|
| `--host` | Bind address (must be `127.0.0.1` loopback) | `127.0.0.1` |
| `--port` | Local TCP listening port | `8765` |
| `--token` | Session authentication token (if omitted, generated randomly) | Auto-generated |
| `--title` | Allowed window title keyword (can be repeated) | `Subway Surfers, Poki, Test Window` |
| `--token-file` | Filepath to write the active session token | `.bridge_session_token` |

---

## 5. Safe Testing Without Controlling a Game

### Method A: Automated Mock Tests (Recommended)
The test suite completely mocks `SendInput` and `GetForegroundWindow`. Zero real keystrokes are sent to the desktop.
```powershell
# Run with Python standard library unittest (51 tests)
python -m unittest discover -s tests -v

# Or run with pytest
pytest -v
```

### Method B: Safe Manual Verification using Notepad
1. Launch the bridge with `Notepad` included in the approved titles:
   ```powershell
   python main.py --title "Test Window" --title "Notepad"
   ```
2. Open Windows Notepad (`notepad.exe`) and place it in the foreground.
3. Connect a loopback test script sending `ENABLE` and `ACTION: LEFT` / `ACTION: RIGHT`.
4. Observe the text cursor moving left and right within Notepad.
5. Click another window (e.g. File Explorer or Google Search); observe in bridge logs that input is immediately disabled.

---

## 6. Emergency Stop and Recovery Protocol

If an unexpected behavior occurs:
1. **Global Emergency Stop Hotkey:** Press `Ctrl + Alt + Q` anywhere in Windows (even if browser or bridge is minimized).
   - Bridge status immediately switches to `STOPPED`.
   - All held keys are instantly released.
   - Any incoming `ACTION` messages are rejected with state `STOPPED`.
2. **Recovery Handshake:**
   - User releases `Ctrl + Alt + Q`.
   - Client sends `{"type": "RESET_STOP"}`.
   - Bridge transitions from `STOPPED` to `DISABLED`.
   - Client sends `{"type": "ENABLE"}` to resume gameplay.
3. **Terminal Interrupt:** Press `Ctrl + C` in the PowerShell window hosting `main.py` for immediate graceful shutdown and key-state clearance.

---

## 7. Protocol Specification

All WebSocket frames must be masked text frames containing valid JSON within 4096 bytes.

### Client Messages

#### 1. PING
```json
{ "type": "PING", "timestamp": 1729600000000 }
```
Response:
```json
{ "type": "PONG", "status": "DISABLED", "timestamp": 1729600000000 }
```

#### 2. STATUS
```json
{ "type": "STATUS" }
```
Response:
```json
{
  "type": "STATUS",
  "status": "DISABLED",
  "foregroundAllowed": true,
  "activeTitle": "Subway Surfers - Play on Poki - Google Chrome",
  "emergencyStopActive": false
}
```

#### 3. ENABLE
```json
{ "type": "ENABLE" }
```
Response:
```json
{ "type": "ENABLED", "status": "ENABLED" }
```

#### 4. DISABLE
```json
{ "type": "DISABLE" }
```
Response:
```json
{ "type": "DISABLED", "status": "DISABLED" }
```

#### 5. ACTION
```json
{ "type": "ACTION", "action": "LEFT" }
```
- Valid `action` values: `"LEFT"`, `"RIGHT"`, `"JUMP"`, `"SLIDE"`.
- Response on success:
  ```json
  { "type": "ACTION_EXECUTED", "status": "ENABLED", "action": "LEFT", "success": true }
  ```
- Response on rejection:
  ```json
  { "type": "ACTION_REJECTED", "status": "DISABLED", "reason": "Foreground window not allowed" }
  ```

#### 6. STOP
```json
{ "type": "STOP" }
```
Response:
```json
{ "type": "STOPPED", "status": "STOPPED" }
```

#### 7. RESET_STOP
```json
{ "type": "RESET_STOP" }
```
Response on success:
```json
{ "type": "RESET_STOP_ACK", "status": "DISABLED", "message": "Emergency stop cleared. State is DISABLED." }
```
Response on rejection (e.g. if hotkey is still held):
```json
{ "type": "RESET_STOP_REJECTED", "status": "STOPPED", "reason": "Emergency stop hotkey is still physically pressed." }
```

---

## 8. Known Limitations

1. **Game Pausing:**
   Ceasing head gestures or sending a `STOP` command stops further input injection, but does **not** automatically pause an ongoing endless runner game (like *Subway Surfers*) unless the game itself features an auto-pause mechanism or receives a dedicated pause command.
2. **Window Elevation (UAC):**
   Windows User Interface Privilege Isolation (UIPI) prohibits standard-integrity processes from injecting input into high-integrity (Administrator) processes. If the browser or game is run with Administrator rights, the bridge must also be run with matching privileges.
3. **Bridge Watchdog Scope:**
   The bridge watchdog monitors client WebSocket communication and heartbeats over loopback; it cannot independently determine camera face-tracking loss. Tracking loss must be signaled by the client via `DISABLE` or `STOP` messages.
