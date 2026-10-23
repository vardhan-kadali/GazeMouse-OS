import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GazeRunner } from '../games/runner/GazeRunner'
import { SettingsProvider } from '../context/SettingsContext'
import { TrackingProvider, TrackingContext } from '../context/TrackingContext'

describe('GazeRunner Component & Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    // Mock HTML5 Canvas 2D context in JSDOM
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
      setLineDash: vi.fn(),
      roundRect: vi.fn(),
      ellipse: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      clip: vi.fn(),
    })
  })

  it('renders start screen with Start Run button and middle lane indication', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: /Gaze Runner/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Run/i })).toBeInTheDocument()
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()
  })

  it('Requirement 9: Unmount/cleanup stops animation loop and removes key listeners', () => {
    const cancelAnimSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    unmount()

    expect(cancelAnimSpy).toHaveBeenCalled()
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('handles on-screen button clicks to shift lanes left and right', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    // Start game
    const startBtn = screen.getByRole('button', { name: /Start Run/i })
    fireEvent.click(startBtn)

    // Initially middle
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()

    // Click Move Left
    const moveLeftBtn = screen.getByRole('button', { name: /◀ Move Left/i })
    fireEvent.click(moveLeftBtn)

    expect(screen.getByText(/Current Lane: Left/i)).toBeInTheDocument()

    // Left button should now be disabled (at leftmost bound)
    expect(moveLeftBtn).toBeDisabled()

    // Click Move Right twice to reach right lane
    const moveRightBtn = screen.getByRole('button', { name: /Move Right/i })
    fireEvent.click(moveRightBtn)
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()

    fireEvent.click(moveRightBtn)
    expect(screen.getByText(/Current Lane: Right/i)).toBeInTheDocument()
    expect(moveRightBtn).toBeDisabled()
  })

  it('keyboard arrows shift lanes when playing', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeRunner onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))

    // Press ArrowLeft
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    expect(screen.getByText(/Current Lane: Left/i)).toBeInTheDocument()

    // Press ArrowRight
    fireEvent.keyDown(window, { code: 'ArrowRight' })
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()
  })

  it('shifts lanes when tracking context emits LEFT and RIGHT gestures during gameplay', () => {
    // Create state container component to dynamically feed tracking actions to GazeRunner
    let setTrackState: any = null

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        status: 'ACTIVE' as const,
        errorMessage: null,
        landmarks: null,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
        action: 'NONE' as const,
        calibration: { state: 'SUCCESS' as const, countdownSeconds: 0, samplingPercent: 100, sampleCount: 60, errorMessage: null },
        fps: 30,
        facePresent: true,
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
            }}
          >
            {children}
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    }

    render(
      <TrackingTestWrapper>
        <GazeRunner onExit={() => {}} />
      </TrackingTestWrapper>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()

    // 1. Dispatch LEFT action
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'LEFT',
        displacement: { ...prev.displacement, deltaX: -0.25 },
      }))
    })

    // Player shifts to Left lane
    expect(screen.getByText(/Current Lane: Left/i)).toBeInTheDocument()

    // 2. Dispatch NONE (user returned towards center)
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: 0 },
      }))
    })

    // Player remains in Left lane
    expect(screen.getByText(/Current Lane: Left/i)).toBeInTheDocument()

    // 3. Dispatch RIGHT action
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'RIGHT',
        displacement: { ...prev.displacement, deltaX: 0.25 },
      }))
    })

    // Player shifts to Middle lane
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()
  })

  it('shifts lanes via sustained displacement fallback (deltaX < -0.15) even when action is NONE', () => {
    let setTrackState: any = null

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      const [trackingData, setTracking] = React.useState({
        status: 'ACTIVE' as const,
        errorMessage: null,
        landmarks: null,
        baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
        displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
        action: 'NONE' as const,
        calibration: { state: 'SUCCESS' as const, countdownSeconds: 0, samplingPercent: 100, sampleCount: 60, errorMessage: null },
        fps: 30,
        facePresent: true,
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
            }}
          >
            {children}
          </TrackingContext.Provider>
        </SettingsProvider>
      )
    }

    render(
      <TrackingTestWrapper>
        <GazeRunner onExit={() => {}} />
      </TrackingTestWrapper>
    )

    // Start game
    fireEvent.click(screen.getByRole('button', { name: /Start Run/i }))
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()

    // Dispatch sustained left displacement with action: 'NONE' (simulating 1-frame impulse already elapsed)
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        action: 'NONE',
        displacement: { ...prev.displacement, deltaX: -0.22 },
      }))
    })

    // Player shifts to Left lane via displacement fallback!
    expect(screen.getByText(/Current Lane: Left/i)).toBeInTheDocument()
  })
})
