# GazeMouse-OS — Accessible Webcam Head-Movement Gaming & Assistive Control

> **“Your movement. Your game. Your freedom.”**

GazeMouse-OS is an accessibility-first gaming and assistive-control system designed to empower players with limited upper-limb or motor mobility to navigate applications and play games using comfortable, customizable head gestures detected through a standard commodity webcam.

---

## 1. Project Overview & Architecture

The project consists of two primary operational components:

1. **Frontend Web Application (`frontend/`):**
   - High-performance React 19 application built with TypeScript and Vite.
   - 100% on-device optical computer vision powered by Google MediaPipe Face Landmarker via WebAssembly and WebGL.
   - **Zero Video Transmission:** Raw webcam frames and biometric coordinates are processed purely client-side in browser memory and never leave the machine.
   - Accessible Vanilla CSS design tokens with responsive layout and WCAG AA considerations.
   - Three built-in playable games:
     - **Gaze Runner:** HTML5 Canvas 2D endless runner.
     - **Gaze Match:** HTML5 Canvas match-3 puzzle game.
     - **Gaze 3D Runner:** Three.js 3D endless runner.
   - **Subway Surfers Bridge Client:** Web interface to connect to and monitor the local desktop bridge.

2. **Standalone Python Desktop Bridge (`desktop-bridge/`):**
   - Standalone daemon running on Windows 10/11 (64-bit) built entirely on the Python 3 Standard Library (`asyncio`, `ctypes`, `secrets`, `json`).
   - Secure RFC 6455 WebSocket server binding strictly to loopback (`127.0.0.1`).
   - Injects discrete keystrokes into an approved foreground window (e.g., official *Subway Surfers* on Poki) via Windows DirectInput scancodes.
   - Comprehensive safety protections:
     - Ephemeral cryptographically random session token generated at runtime.
     - Current-user Windows NTFS ACLs applied to the local session token file.
     - Global hardware emergency stop hotkey (`Ctrl + Alt + Q`).
     - Activity watchdog timer (disables input upon 2.0s client silence).
     - Foreground window title allowlist filtering.

> **Note on Coursework Requirements:** Java-related coursework project requirements are distinct; the existing GazeMouse-OS architecture and components are preserved independently.

---

## 2. Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite |
| **Styling & Design System** | Vanilla CSS custom properties & accessible tokens |
| **Computer Vision** | `@mediapipe/tasks-vision` (WebAssembly / WebGL) |
| **3D Rendering** | Three.js |
| **Frontend Testing** | Vitest, React Testing Library, jsdom |
| **Desktop Bridge** | Python 3.10+ (`asyncio`, `ctypes`, Win32 API) |
| **Bridge Testing** | Python standard library `unittest` (mocked Win32 inputs) |

---

## 3. Folder Structure

```
GazeMouse-OS/
├── .gitignore                     # Comprehensive Git ignore rules (secrets, tokens, build outputs)
├── README.md                      # Project documentation and developer setup guide
├── desktop-bridge/                # Python Windows desktop input bridge daemon
│   ├── README.md                  # Detailed desktop bridge documentation and security specifications
│   ├── config.py                  # Bridge configuration and token validation
│   ├── emergency_stop.py          # Global hotkey listener (Ctrl+Alt+Q) and safe recovery logic
│   ├── input_dispatcher.py        # Win32 SendInput and DirectInput scancode injector
│   ├── main.py                    # Bridge entrypoint and CLI options
│   ├── protocol.py                # RFC 6455 WebSocket framing and framing parser
│   ├── requirements.txt           # Python dependency documentation (core requires 0 external packages)
│   ├── server.py                  # Loopback WebSocket server and handshake authentication
│   ├── window_watcher.py          # Foreground window detection and title allowlist validation
│   └── tests/                     # Automated unit test suite (54 mocked tests)
│       ├── test_input_dispatcher.py
│       ├── test_protocol.py
│       ├── test_security.py
│       ├── test_server.py
│       └── test_window_watcher.py
└── frontend/                      # React / TypeScript / Vite web application
    ├── index.html                 # Single page application entrypoint
    ├── package.json               # Node.js dependencies and scripts
    ├── package-lock.json          # Deterministic dependency lockfile
    ├── tsconfig.json              # TypeScript root configuration
    ├── vite.config.ts             # Vite build and Vitest configuration
    ├── public/
    │   ├── models/                # MediaPipe Face Landmarker model tasks
    │   └── wasm/                  # MediaPipe WebAssembly and WebGL runtime modules
    └── src/
        ├── App.tsx                # Main application component and routing
        ├── main.tsx               # React DOM bootstrap
        ├── context/               # React context providers (TrackingContext, SettingsContext)
        ├── games/                 # Game implementations
        │   ├── runner/            # Gaze Runner (2D Canvas)
        │   ├── match/             # Gaze Match (2D Canvas)
        │   ├── runner3d/          # Gaze 3D Runner (Three.js)
        │   └── external/          # Subway Surfers bridge controller UI
        ├── pages/                 # Application views (Home, Setup, Games, Settings, Accessibility, Help)
        ├── services/              # Desktop bridge WebSocket client service
        ├── types/                 # TypeScript type definitions
        ├── vision/                # MediaPipe vision manager, signal smoothing, gesture classifier
        └── test/                  # Frontend automated test suite (18 test files, 158 unit tests)
```

---

## 4. Prerequisites

Before setting up the project, ensure you have the following installed on your Windows machine:

- **Operating System:** Windows 10 or Windows 11 (64-bit required for the Win32 Desktop Bridge).
- **Node.js:** Node.js `v20.x` or `v24.x` (verified with npm `10+` / `11+`).
- **Python:** Python `3.10` or newer (verified with Python `3.11`).
- **Webcam:** Any standard USB or built-in webcam.
- **Git:** Git for Windows.

---

## 5. Getting Started & Local Development

### Step 1: Install Frontend Dependencies

Open PowerShell or your preferred terminal in the repository root:

```powershell
cd frontend
npm install
```

### Step 2: Start the Frontend Application

```powershell
npm run dev
```

The application will start locally at **`http://localhost:5173`**.

Open your browser to `http://localhost:5173` and visit **Camera Setup** to verify that your camera stream initializes and neutral calibration is established.

---

## 6. Running the Python Desktop Bridge & Subway Surfers Integration

The desktop bridge allows the web application to safely dispatch approved keystrokes (Left, Right, Jump, Slide) to an external game window running on your Windows desktop.

### Starting the Bridge

Open a **separate PowerShell window**:

```powershell
cd desktop-bridge
python main.py
```

When started, the bridge will output a message similar to:

```text
Bridge running on ws://127.0.0.1:8765
Session Token: <GENERATED_TOKEN>
Token file saved to: desktop-bridge\.bridge_session_token
```

> **Security & Token Isolation:**
> - Every time the bridge launches, a unique, cryptographically random session token is generated locally.
> - The token is written to `.bridge_session_token` with strict Windows NTFS ACLs restricting read/write access to the current Windows user SID only.
> - **The `.bridge_session_token` file is strictly ignored by Git and must never be shared or committed.**
> - Each collaborator generates and uses their own local token.

### Connecting the Frontend to the Bridge

1. Keep the bridge running in its terminal window.
2. In the GazeMouse-OS web app, navigate to **Games** $\to$ **Subway Surfers**.
3. Copy your local session token from your bridge terminal output.
4. Paste the token into the **Bridge Token** input field.
5. Click **Connect to Bridge**.
6. Once connected, the status badge will indicate `Connected` and the bridge state will show `DISABLED` (safety default). Click **Enable Input** to arm keystroke dispatch.

### Emergency Stop

If at any point you want to immediately halt input injection:
- Press **`Ctrl + Alt + Q`** anywhere in Windows.
- The bridge will instantly lock into the `STOPPED` state and release all simulated keys.
- To recover, release the hotkey and click **Reset Emergency Stop** in the web interface.

---

## 7. Running Automated Tests

### Frontend Tests (Vitest)

To run the complete suite of 18 test files (158 unit and integration tests):

```powershell
cd frontend
# Run vitest in serial mode for optimal Windows stability
npx vitest run --fileParallelism=false

# Or run the standard test script
npm test
```

To run TypeScript verification and production bundle compilation:

```powershell
cd frontend
npm run build
```

### Desktop Bridge Tests (Python Unittest)

The desktop bridge test suite completely mocks Windows `SendInput` and `GetForegroundWindow`. Zero real keystrokes are injected to your desktop during testing.

```powershell
cd desktop-bridge
python -m unittest discover -s tests -v
```

---

## 8. Current Known Issues & Limitations

- **Subway Surfers In-Game Control:**
  While the desktop bridge WebSocket connection, handshake authentication, state machine, safety watchdog, and DirectInput scancode generation are verified by automated tests, **head gestures are not yet confirmed to reliably control the player character in the official Subway Surfers web browser window**. Research into browser focus handling, iframe sandboxing, and direct Windows scancode routing is ongoing.
- **Game Auto-Pause:**
  Ceasing head movement or disconnecting the bridge halts further key injection, but does not automatically pause the external game unless the game provides an auto-pause feature.
- **Elevated Windows (UAC):**
  Due to Windows User Interface Privilege Isolation (UIPI), if a browser or game process is run with Administrator privileges, the desktop bridge must also be launched as Administrator to inject inputs.

---

## 9. Collaboration Workflow

To collaborate smoothly without risking code regressions or secret leakage, please adhere to this workflow:

1. **Branching Strategy:**
   - Do not commit directly to `main`.
   - Create focused feature branches from `main`:
     ```bash
     git checkout -b feature/<feature-name>
     # Example: git checkout -b feature/gaze-calibration-tuning
     ```

2. **Pre-Commit Checks:**
   - Always run the tests before committing:
     ```powershell
     cd frontend; npx vitest run --fileParallelism=false
     cd ../desktop-bridge; python -m unittest discover -s tests -v
     ```
   - Ensure the frontend builds cleanly without TypeScript errors:
     ```powershell
     cd frontend; npm run build
     ```

3. **Secret & Sensitive Data Hygiene:**
   - **Never commit `.bridge_session_token`, `.env`, API keys, credentials, or personal paths.**
   - Verify `git status` before running `git add` to ensure no unexpected files or local artifacts are staged.
   - The `.gitignore` is pre-configured to exclude all local tokens, Python caches, build outputs (`dist/`), and `node_modules/`.

4. **Pull Requests & Code Reviews:**
   - Push your feature branch:
     ```bash
     git push -u origin feature/<feature-name>
     ```
   - Open a Pull Request on GitHub against `main`.
   - Provide a clear description of changes and test verification results.
   - Request a review before merging into `main`.

---

## 10. License & Accessibility Statement

This project is developed with an accessibility-first mindset, following WCAG 2.1/2.2 AA guidelines to ensure full keyboard navigability and on-device privacy.
