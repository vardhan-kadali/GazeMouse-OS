import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SubwaySurfersBridgeController } from '../games/external/SubwaySurfersBridgeController'
import { TrackingContext } from '../context/TrackingContext'
import { SettingsProvider } from '../context/SettingsContext'

// Mock WebSocket implementation for component tests
class MockWebSocket {
  public static instances: MockWebSocket[] = []
  public url: string
  public protocols?: string | string[]
  public readyState: number = 0
  public onopen: ((event: unknown) => void) | null = null
  public onclose: ((event: { code: number; reason: string }) => void) | null = null
  public onerror: ((event: unknown) => void) | null = null
  public onmessage: ((event: { data: string }) => void) | null = null
  public sentMessages: string[] = []

  public static readonly CONNECTING = 0
  public static readonly OPEN = 1
  public static readonly CLOSING = 2
  public static readonly CLOSED = 3

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    MockWebSocket.instances.push(this)
  }

  public send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sentMessages.push(data)
  }

  public close(code: number = 1000, reason: string = ''): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose({ code, reason })
    }
  }

  public simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen({})
    }
  }

  public simulateMessage(data: Record<string, unknown>): void {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) })
    }
  }

  public simulateError(err: unknown = {}): void {
    if (this.onerror) {
      this.onerror(err)
    }
  }
}

describe('SubwaySurfersBridgeController Component', () => {
  const originalWebSocket = global.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    // @ts-expect-error Mock WebSocket assignment
    global.WebSocket = MockWebSocket
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.WebSocket = originalWebSocket
  })

  const createMockTrackingContext = (overrides = {}) => {
    const baseTracking = {
      status: 'ACTIVE' as const,
      errorMessage: null,
      landmarks: null,
      baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
      displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true },
      action: 'NONE' as const,
      calibration: { state: 'SUCCESS' as const, progress: 1, samplesCollected: 60, requiredSamples: 60 },
      isCalibrating: false,
      facePresent: true,
      fps: 30,
      ...overrides,
    }

    return {
      trackingData: baseTracking,
      isCameraActive: true,
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      attachElements: vi.fn(),
      detachElements: vi.fn(),
      startCalibration: vi.fn(),
      cancelCalibration: vi.fn(),
      recalibrate: vi.fn(),
    }
  }

  it('1. Renders the controller UI without auto-connecting to the bridge or enabling input', () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    // Heading and Step 1/Step 2 headers must be present
    expect(screen.getByRole('heading', { level: 1, name: /Official Subway Surfers Desktop Bridge/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Step 1: Webcam & Calibration/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /Step 2: Desktop Input Bridge/i })).toBeInTheDocument()

    // Explicit warning about external game pausing
    expect(screen.getByText(/Gameplay Notice: External Game Pausing/i)).toBeInTheDocument()
    expect(screen.getByText(/not automatically pause the external web game/i)).toBeInTheDocument()

    // No WebSocket connection was created on mount
    expect(MockWebSocket.instances.length).toBe(0)

    // Input state is disabled
    expect(screen.getByText(/DISCONNECTED/i)).toBeInTheDocument()
    const enableBtn = screen.getByRole('button', { name: /Enable Keyboard Input/i })
    expect(enableBtn).toBeDisabled()
  })

  it('2. Connects to the desktop bridge using provided session token and handles auth failure', async () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    const tokenInput = screen.getByPlaceholderText(/Enter or load session token/i)
    const connectBtn = screen.getByRole('button', { name: /Connect to Bridge/i })

    // Connect button disabled when token is empty
    expect(connectBtn).toBeDisabled()

    // Enter token
    fireEvent.change(tokenInput, { target: { value: 'my-session-token-abc' } })
    expect(connectBtn).not.toBeDisabled()

    // Click connect
    fireEvent.click(connectBtn)
    expect(MockWebSocket.instances.length).toBe(1)
    const ws = MockWebSocket.instances[0]

    expect(ws.url).toBe('ws://127.0.0.1:8765/?token=my-session-token-abc')

    // Simulate rejection / auth error
    await act(async () => {
      ws.simulateError()
      ws.close(1006, 'Abnormal closure')
      await Promise.resolve()
    })

    // UI shows error alert
    expect(screen.getByText(/Bridge Alert/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Connect to Bridge/i })).toBeInTheDocument()
  })

  it('3. Successfully connects and transitions to CONNECTED state, enabling the manual enable button', async () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    const tokenInput = screen.getByPlaceholderText(/Enter or load session token/i)
    fireEvent.change(tokenInput, { target: { value: 'valid-secret-token' } })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))

    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({
        type: 'STATUS',
        status: 'DISABLED',
        state: 'DISABLED',
        foregroundAllowed: false,
        activeTitle: 'Subway Surfers',
        emergencyStopActive: false,
      })
    })

    // Bridge is CONNECTED, but input is STILL DISABLED
    const enableBtn = screen.getByRole('button', { name: /Enable Keyboard Input/i })
    expect(enableBtn).toBeEnabled()

    // Explicitly click Enable Keyboard Input
    fireEvent.click(enableBtn)
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'ENABLE' }))

    // Simulate server acknowledging ENABLE
    act(() => {
      ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    })

    expect(screen.getByRole('button', { name: /Disable Input/i })).toBeInTheDocument()
  })

  it('4. Enforces gesture latch and neutral-return hysteresis (single action per deflection)', () => {
    let setTrackState: any = null

    const TrackingWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        status: 'ACTIVE' as const,
        errorMessage: null,
        landmarks: null,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true },
        action: 'NONE' as const,
        calibration: { state: 'SUCCESS' as const, progress: 1, samplesCollected: 60, requiredSamples: 60 },
        isCalibrating: false,
        facePresent: true,
        fps: 30,
      })
      setTrackState = setTracking

      return (
        <TrackingContext.Provider
          value={{
            trackingData,
            isCameraActive: true,
            startCamera: vi.fn(),
            stopCamera: vi.fn(),
            attachElements: vi.fn(),
            detachElements: vi.fn(),
            startCalibration: vi.fn(),
            cancelCalibration: vi.fn(),
            recalibrate: vi.fn(),
          }}
        >
          {children}
        </TrackingContext.Provider>
      )
    }

    render(
      <SettingsProvider>
        <TrackingWrapper>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingWrapper>
      </SettingsProvider>
    )

    // Connect & Enable
    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    })

    ws.sentMessages = []

    // 1. User turns head LEFT
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'LEFT',
        displacement: { ...prev.displacement, deltaX: -0.25, inDeadZone: false },
      }))
    })

    // Action LEFT must be dispatched
    expect(ws.sentMessages).toEqual([JSON.stringify({ type: 'ACTION', action: 'LEFT' })])

    // 2. User holds head turned LEFT
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'LEFT',
        displacement: { ...prev.displacement, deltaX: -0.28, inDeadZone: false },
      }))
    })

    // MUST NOT send a duplicate action while awaiting neutral!
    expect(ws.sentMessages.length).toBe(1)

    // 3. User returns to neutral center
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: 0, inDeadZone: true },
      }))
    })

    // Latch is re-armed
    expect(screen.getByText(/READY/i)).toBeInTheDocument()

    // 4. User turns head RIGHT
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'RIGHT',
        displacement: { ...prev.displacement, deltaX: 0.25, inDeadZone: false },
      }))
    })

    // Action RIGHT dispatched
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'ACTION', action: 'RIGHT' }))
  })

  it('5. Automatically disables input upon tracking loss or camera stop', () => {
    let setTrackState: any = null

    const TrackingWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        status: 'ACTIVE' as const,
        errorMessage: null,
        landmarks: null,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true },
        action: 'NONE' as const,
        calibration: { state: 'SUCCESS' as const, progress: 1, samplesCollected: 60, requiredSamples: 60 },
        isCalibrating: false,
        facePresent: true,
        fps: 30,
      })
      setTrackState = setTracking

      return (
        <TrackingContext.Provider
          value={{
            trackingData,
            isCameraActive: true,
            startCamera: vi.fn(),
            stopCamera: vi.fn(),
            attachElements: vi.fn(),
            detachElements: vi.fn(),
            startCalibration: vi.fn(),
            cancelCalibration: vi.fn(),
            recalibrate: vi.fn(),
          }}
        >
          {children}
        </TrackingContext.Provider>
      )
    }

    render(
      <SettingsProvider>
        <TrackingWrapper>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingWrapper>
      </SettingsProvider>
    )

    // Connect & Enable
    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    })

    ws.sentMessages = []

    // Simulate face loss / tracking lost
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        facePresent: false,
      }))
    })

    // Immediately sends DISABLE to bridge
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'DISABLE' }))
  })

  it('6. Automatically disables input when browser visibility is hidden', () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    // Connect & Enable
    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    })

    ws.sentMessages = []

    // Simulate tab switching / visibility hidden
    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true })
      fireEvent(document, new Event('visibilitychange'))
    })

    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'DISABLE' }))

    // Restore visibilityState
    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true })
  })

  it('7. Displays Emergency Stop banner and provides Reset button in STOPPED state', () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({ type: 'STOPPED', status: 'STOPPED' })
    })

    // Emergency stop banner displayed
    expect(screen.getByText(/Emergency Stop Active \(Ctrl\+Alt\+Q\)/i)).toBeInTheDocument()
    const resetBtn = screen.getByRole('button', { name: /Reset Emergency Stop/i })
    expect(resetBtn).toBeInTheDocument()

    // Click Reset
    act(() => {
      fireEvent.click(resetBtn)
    })
    expect(ws.sentMessages).toContain(JSON.stringify({ type: 'RESET_STOP' }))

    // Simulate server accepting reset
    act(() => {
      ws.simulateMessage({ type: 'RESET_STOP_ACK', status: 'DISABLED' })
    })

    // Emergency stop banner cleared, state is DISABLED
    expect(screen.queryByText(/Emergency Stop Active \(Ctrl\+Alt\+Q\)/i)).not.toBeInTheDocument()
    // Must NOT auto-enable; user must click Enable Keyboard Input
    expect(screen.getByRole('button', { name: /Enable Keyboard Input/i })).toBeInTheDocument()
  })

  it('8. Cleans up connection and disables input on component unmount', () => {
    const mockCtx = createMockTrackingContext()

    const { unmount } = render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({ type: 'ENABLED', status: 'ENABLED' })
    })

    ws.sentMessages = []
    unmount()

    // WebSocket closed cleanly
    expect(ws.readyState).toBe(MockWebSocket.CLOSED)
  })

  it('9. Differentiates foreground window states: GazeMouse-OS setup mode vs Approved Game vs Other Window', () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    // Initial disconnected state
    expect(screen.getByText(/Offline \(Not Connected\)/i)).toBeInTheDocument()

    // Connect to bridge
    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]

    // 1. Simulate GazeMouse-OS tab focused (setup mode)
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({
        type: 'STATUS',
        status: 'DISABLED',
        state: 'DISABLED',
        foregroundAllowed: false,
        activeTitle: 'GazeMouse-OS — Accessible Head-Movement Gaming — Google Chrome',
        emergencyStopActive: false,
      })
    })

    expect(screen.getAllByText(/GazeMouse-OS Active \(Setup Mode\)/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Setup Focus:/i)).toBeInTheDocument()

    // 2. Simulate user switching focus to Subway Surfers window
    act(() => {
      ws.simulateMessage({
        type: 'STATUS',
        status: 'DISABLED',
        state: 'DISABLED',
        foregroundAllowed: true,
        activeTitle: 'SUBWAY SURFERS - Play on Poki - Google Chrome',
        emergencyStopActive: false,
      })
    })

    expect(screen.getAllByText(/Approved Game Window/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Game Window Ready:/i)).toBeInTheDocument()

    // 3. Simulate user switching to an unapproved window (e.g. YouTube or VS Code)
    act(() => {
      ws.simulateMessage({
        type: 'STATUS',
        status: 'DISABLED',
        state: 'DISABLED',
        foregroundAllowed: false,
        activeTitle: 'Music Video - YouTube - Google Chrome',
        emergencyStopActive: false,
      })
    })

    expect(screen.getByText(/Other Window Active \(Keystrokes Blocked\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Keystrokes Blocked:/i)).toBeInTheDocument()
  })

  it('10. Distinguishes bridge connected vs keyboard input disabled vs emergency stop states', () => {
    const mockCtx = createMockTrackingContext()

    render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockCtx}>
          <SubwaySurfersBridgeController onExit={() => {}} onNavigateToSetup={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    // Connect
    fireEvent.change(screen.getByPlaceholderText(/Enter or load session token/i), {
      target: { value: 'valid-secret-token' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Connect to Bridge/i }))
    const ws = MockWebSocket.instances[0]

    // Connected but DISABLED: Bridge is DISABLED, Keyboard input is Disabled
    act(() => {
      ws.simulateOpen()
      ws.simulateMessage({
        type: 'STATUS',
        status: 'DISABLED',
        state: 'DISABLED',
        foregroundAllowed: true,
        activeTitle: 'Subway Surfers - Poki',
        emergencyStopActive: false,
      })
    })

    expect(screen.getByText('DISABLED')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    const enableBtn = screen.getByRole('button', { name: /Enable Keyboard Input/i })
    expect(enableBtn).toBeEnabled()

    // Enabled with approved window: Armed & Injecting
    act(() => {
      ws.simulateMessage({
        type: 'STATUS_UPDATE',
        status: 'ENABLED',
        state: 'ENABLED',
        foregroundAllowed: true,
        activeTitle: 'Subway Surfers - Poki',
        emergencyStopActive: false,
      })
    })
    expect(screen.getByText('Armed & Injecting')).toBeInTheDocument()

    // Enabled but unapproved window: Armed (Awaiting Game Focus)
    act(() => {
      ws.simulateMessage({
        type: 'STATUS_UPDATE',
        status: 'ENABLED',
        state: 'ENABLED',
        foregroundAllowed: false,
        activeTitle: 'GazeMouse-OS — Accessible Head-Movement Gaming — Google Chrome',
        emergencyStopActive: false,
      })
    })
    expect(screen.getByText('Armed (Awaiting Game Focus)')).toBeInTheDocument()

    // Emergency stop: Input Blocked (Emergency Stop)
    act(() => {
      ws.simulateMessage({
        type: 'STOPPED',
        status: 'STOPPED',
        state: 'STOPPED',
        foregroundAllowed: false,
        emergencyStopActive: true,
      })
    })
    expect(screen.getByText('Input Blocked (Emergency Stop)')).toBeInTheDocument()
  })
})
