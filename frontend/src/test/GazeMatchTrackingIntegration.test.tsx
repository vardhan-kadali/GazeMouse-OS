import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GazeMatch } from '../games/match/GazeMatch'
import { GazeRunner } from '../games/runner/GazeRunner'
import { GamesPage } from '../pages/GamesPage'
import { SettingsProvider } from '../context/SettingsContext'
import { TrackingContext } from '../context/TrackingContext'

describe('GazeMatch Tracking & Navigation Integration', () => {
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

  it('1. Head displacement maps deltaX/deltaY to board cursor coordinates and focused tile', () => {
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
        <GazeMatch onExit={() => {}} />
      </TrackingTestWrapper>
    )

    // Start challenge
    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Initially neutral cursor is centered around (240, 240) -> Row 3, Col 3 (0-indexed), displayed as (4, 4)
    expect(screen.getByText(/\(4, 4\)/i)).toBeInTheDocument()

    // Move head to top-left quadrant (deltaX: -0.5, deltaY: -0.5)
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        displacement: {
          ...prev.displacement,
          deltaX: -0.5,
          deltaY: -0.5,
          inDeadZone: false,
        },
      }))
    })

    // Active tile updates towards top-left (Row 1 or 2, Col 1 or 2)
    expect(screen.getByText(/Focus:/i)).toBeInTheDocument()
    expect(screen.getByText(/\([1-2], [1-2]\)/i)).toBeInTheDocument()
  })

  it('2. Dwell progression advances on a sustained tile and triggers selection when elapsedMs >= dwellDuration', () => {
    vi.useFakeTimers()

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      return (
        <SettingsProvider>
          <TrackingContext.Provider
            value={{
              trackingData: {
                status: 'ACTIVE' as const,
                errorMessage: null,
                landmarks: null,
                baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
                displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: false, magnitude: 0 },
                action: 'NONE' as const,
                calibration: { state: 'SUCCESS' as const, countdownSeconds: 0, samplingPercent: 100, sampleCount: 60, errorMessage: null },
                fps: 30,
                facePresent: true,
              },
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
        <GazeMatch onExit={() => {}} />
      </TrackingTestWrapper>
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Initially no tile is selected as source
    expect(screen.getByText(/Hover to Dwell-Select/i)).toBeInTheDocument()

    // Advance fake timers by 1300ms (dwellDuration default is 1200ms)
    act(() => {
      vi.advanceTimersByTime(1300)
    })

    // Dwell completes and triggers tile selection!
    expect(screen.getByText(/✓ Source Selected/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Confirm Swap \(Space\)/i })).toBeInTheDocument()

    vi.useRealTimers()
  })

  it('3. Navigation into and out of Gaze Match preserves the camera stream without restarting or duplicating', () => {
    const mockStartCamera = vi.fn()
    const mockStopCamera = vi.fn()

    const TrackingTestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
      return (
        <SettingsProvider>
          <TrackingContext.Provider
            value={{
              trackingData: {
                status: 'ACTIVE',
                errorMessage: null,
                landmarks: null,
                baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
                displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
                action: 'NONE',
                calibration: { state: 'SUCCESS', countdownSeconds: 0, samplingPercent: 100, sampleCount: 60, errorMessage: null },
                fps: 30,
                facePresent: true,
              },
              isCameraActive: true,
              startCamera: mockStartCamera,
              stopCamera: mockStopCamera,
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
        <GamesPage />
      </TrackingTestWrapper>
    )

    // Launch Gaze Match from the catalogue card
    const playMatchButtons = screen.getAllByRole('button', { name: /Play Gaze Match/i })
    fireEvent.click(playMatchButtons[0])

    // Gaze Match is active
    expect(screen.getByRole('heading', { level: 1, name: /Gaze Match/i })).toBeInTheDocument()

    // Camera must NOT be stopped or duplicated when mounting Gaze Match
    expect(mockStopCamera).not.toHaveBeenCalled()
    expect(mockStartCamera).not.toHaveBeenCalled()

    // Click Back to Games in Gaze Match header
    const exitBtn = screen.getByRole('button', { name: /Back to Games/i })
    fireEvent.click(exitBtn)

    // Returned to Games Catalog
    expect(screen.getByRole('heading', { name: /Accessible Games Catalog/i })).toBeInTheDocument()

    // Camera still active and not stopped
    expect(mockStopCamera).not.toHaveBeenCalled()
  })

  it('4. Gaze Runner regression: existing runner remains fully functional and accessible', () => {
    render(
      <SettingsProvider>
        <TrackingContext.Provider
          value={{
            trackingData: {
              status: 'STANDBY',
              errorMessage: null,
              landmarks: null,
              baseline: null,
              displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
              action: 'NONE',
              calibration: { state: 'IDLE', countdownSeconds: 0, samplingPercent: 0, sampleCount: 0, errorMessage: null },
              fps: 0,
              facePresent: false,
            },
            isCameraActive: false,
            startCamera: vi.fn(),
            stopCamera: vi.fn(),
            attachElements: vi.fn(),
            detachElements: vi.fn(),
            startCalibration: vi.fn(),
            cancelCalibration: vi.fn(),
            recalibrate: vi.fn(),
          }}
        >
          <GazeRunner onExit={() => {}} />
        </TrackingContext.Provider>
      </SettingsProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: /Gaze Runner/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Run/i })).toBeInTheDocument()
    expect(screen.getByText(/Current Lane: Middle/i)).toBeInTheDocument()
  })
})
