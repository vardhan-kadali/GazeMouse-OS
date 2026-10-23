import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Gaze3DRunner } from '../games/runner3d/Gaze3DRunner'
import { SettingsProvider } from '../context/SettingsContext'
import { TrackingProvider, TrackingContext } from '../context/TrackingContext'
import { INITIAL_TRACKING_DATA } from '../types/tracking'

const mockDispose = vi.fn()
const mockRender = vi.fn()
const mockSetSize = vi.fn()
let mockWebGLAvailable = true

vi.mock('../games/runner3d/threeRenderer', () => {
  return {
    ThreeRenderer: class MockThreeRenderer {
      public static isWebGLAvailable() {
        return mockWebGLAvailable
      }
      public render = mockRender
      public setSize = mockSetSize
      public dispose = mockDispose
    },
  }
})

describe('Gaze3DRunner Component & Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    mockWebGLAvailable = true
    mockDispose.mockClear()
    mockRender.mockClear()
    mockSetSize.mockClear()
  })

  it('1. Renders start screen with Cyber Subway Express theme, controls, and Middle Track indication', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: /Gaze 3D Runner/i })).toBeInTheDocument()
    expect(screen.getByText(/CYBER SUBWAY EXPRESS/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Run/i })).toBeInTheDocument()
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()
  })

  it('2. Unmount stops animation loop, removes key listeners, and disposes 3D resources', () => {
    const cancelAnimSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    unmount()

    expect(cancelAnimSpy).toHaveBeenCalled()
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(mockDispose).toHaveBeenCalled()
  })

  it('3. Handles on-screen button clicks to shift tracks left/right and jump/slide', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    // Start game
    const startBtn = screen.getByRole('button', { name: /Start Run/i })
    fireEvent.click(startBtn)

    // Initially in Center track
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // Shift Left
    const moveLeftBtn = screen.getByRole('button', { name: /Move Left/i })
    fireEvent.click(moveLeftBtn)
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()

    // Move Left button is now disabled (already at leftmost lane 0)
    expect(moveLeftBtn).toBeDisabled()

    // Shift Right back to Center
    const moveRightBtn = screen.getByRole('button', { name: /Move Right/i })
    fireEvent.click(moveRightBtn)
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // Jump button is clickable
    const jumpBtn = screen.getByRole('button', { name: /Jump/i })
    fireEvent.click(jumpBtn)

    // Slide button is clickable
    const slideBtn = screen.getByRole('button', { name: /Slide/i })
    fireEvent.click(slideBtn)
  })

  it('4. Handles keyboard navigation (Arrow keys / A, D, W, S, Space)', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    // Start via Space
    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // Shift Left via KeyA
    fireEvent.keyDown(window, { code: 'KeyA' })
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()

    // Shift Right via ArrowRight
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // Pause via KeyP
    fireEvent.keyDown(window, { code: 'KeyP' })
    expect(screen.getByRole('heading', { level: 2, name: /Game Paused/i })).toBeInTheDocument()

    // Resume via Space
    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.queryByRole('heading', { level: 2, name: /Game Paused/i })).not.toBeInTheDocument()
  })

  it('5. Automatically pauses on tracking loss and NEVER auto-resumes when tracking is restored', () => {
    const mockTrackingValue = {
      trackingData: {
        ...INITIAL_TRACKING_DATA,
        status: 'ACTIVE' as const,
        facePresent: true,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 30, timestamp: Date.now() },
      },
      isCameraActive: true,
      startCamera: vi.fn(),
      stopCamera: vi.fn(),
      calibrateNeutral: vi.fn(),
      resetCalibration: vi.fn(),
      attachVideoElement: vi.fn(),
      detachVideoElement: vi.fn(),
    }

    const { rerender } = render(
      <SettingsProvider>
        <TrackingContext.Provider value={mockTrackingValue}>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))

    // Simulate tracking loss
    act(() => {
      rerender(
        <SettingsProvider>
          <TrackingContext.Provider
            value={{
              ...mockTrackingValue,
              trackingData: {
                ...mockTrackingValue.trackingData,
                status: 'TRACKING_LOST' as const,
                facePresent: false,
              },
            }}
          >
            <Gaze3DRunner onExit={() => {}} />
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    })

    // Auto-pause overlay must appear
    expect(screen.getByRole('heading', { level: 2, name: /Face Tracking Lost/i })).toBeInTheDocument()
    expect(screen.getByText(/The game paused automatically for safety/i)).toBeInTheDocument()

    // Simulate face restored
    act(() => {
      rerender(
        <SettingsProvider>
          <TrackingContext.Provider
            value={{
              ...mockTrackingValue,
              trackingData: {
                ...mockTrackingValue.trackingData,
                status: 'ACTIVE' as const,
                facePresent: true,
              },
            }}
          >
            <Gaze3DRunner onExit={() => {}} />
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    })

    // Game must REMAIN PAUSED with recovery prompt!
    expect(screen.getByRole('heading', { level: 2, name: /Face Tracking Lost/i })).toBeInTheDocument()
    expect(screen.getByText(/Face detected! Settle into position and click Resume/i)).toBeInTheDocument()

    // User explicitly resumes
    const resumeBtn = screen.getByRole('button', { name: /Resume Game/i })
    fireEvent.click(resumeBtn)
    expect(screen.queryByRole('heading', { level: 2, name: /Face Tracking Lost/i })).not.toBeInTheDocument()
  })

  it('6. Shows WebGL hardware acceleration fallback alert when WebGL is unavailable', () => {
    mockWebGLAvailable = false

    render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    expect(screen.getByText(/WebGL Hardware Acceleration Unavailable/i)).toBeInTheDocument()
  })

  it('7. Handles live head gesture input: moves left on LEFT, suppresses while held, and moves right after return to neutral', () => {
    let setTrackState: any = null

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        ...INITIAL_TRACKING_DATA,
        status: 'ACTIVE' as const,
        facePresent: true,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
        action: 'NONE' as const,
      })

      setTrackState = setTracking

      return (
        <SettingsProvider>
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
              resetGestures: vi.fn(),
            }}
          >
            {children}
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    }

    render(
      <TrackingTestWrapper>
        <Gaze3DRunner onExit={() => {}} />
      </TrackingTestWrapper>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // 1. Dispatch LEFT action
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'LEFT',
        displacement: { ...prev.displacement, deltaX: -0.22, inDeadZone: false },
      }))
    })
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()

    // 2. Sustained left (action is NONE, but user is still deflected left at deltaX = -0.25)
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: -0.25, inDeadZone: false },
      }))
    })
    // Must remain in Left track, no repeated shift or glitch
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()

    // 3. Return to neutral center
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: 0, inDeadZone: true },
      }))
    })
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()

    // 4. Dispatch RIGHT action
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'RIGHT',
        displacement: { ...prev.displacement, deltaX: 0.22, inDeadZone: false },
      }))
    })
    // Shifts back to Center track
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()
  })

  it('8. Verifies that single action exclusivity prevents combining LEFT with DOWN/slide on head gesture', () => {
    let setTrackState: any = null

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        ...INITIAL_TRACKING_DATA,
        status: 'ACTIVE' as const,
        facePresent: true,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
        action: 'NONE' as const,
      })

      setTrackState = setTracking

      return (
        <SettingsProvider>
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
              resetGestures: vi.fn(),
            }}
          >
            {children}
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    }

    render(
      <TrackingTestWrapper>
        <Gaze3DRunner onExit={() => {}} />
      </TrackingTestWrapper>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))
    expect(screen.getByText(/Current Track: Center/i)).toBeInTheDocument()

    // Dispatch LEFT action with incidental chin dip deltaY
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'LEFT',
        displacement: { ...prev.displacement, deltaX: -0.22, deltaY: 0.18, inDeadZone: false },
      }))
    })

    // Moved left
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()
    // Jump and Slide buttons should not indicate an active slide from head gesture
    const slideBtn = screen.getByRole('button', { name: /Slide/i })
    expect(slideBtn).not.toBeDisabled()

    // Return to neutral
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: 0, deltaY: 0, inDeadZone: true },
      }))
    })

    // Head-based DOWN while verticalGestures is false by default should NOT trigger slide
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'DOWN',
        displacement: { ...prev.displacement, deltaX: 0, deltaY: 0.25, inDeadZone: false },
      }))
    })

    // Player remains grounded in Left track, no slide triggered
    expect(screen.getByText(/Current Track: Left/i)).toBeInTheDocument()
    expect(slideBtn).not.toBeDisabled()
  })

  it('9. Renders developer diagnostic instrumentation panel with live telemetry and decision reporting', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <Gaze3DRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    // Diagnostic instrumentation panel renders
    const diagPanel = screen.getByTestId('diagnostic-panel')
    expect(diagPanel).toBeInTheDocument()
    expect(diagPanel).toHaveTextContent(/\[DIAGNOSTICS\] Gaze 3D Runner Live Telemetry/i)
    expect(diagPanel).toHaveTextContent(/Face:/i)
    expect(diagPanel).toHaveTextContent(/Displacement:/i)
    expect(diagPanel).toHaveTextContent(/Dead Zone:/i)
    expect(diagPanel).toHaveTextContent(/Classifier:/i)
    expect(diagPanel).toHaveTextContent(/Re-Arming:/i)
    expect(diagPanel).toHaveTextContent(/Decision:/i)
  })
})
