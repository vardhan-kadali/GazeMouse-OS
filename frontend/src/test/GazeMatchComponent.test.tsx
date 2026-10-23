import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { GazeMatch } from '../games/match/GazeMatch'
import { SettingsProvider } from '../context/SettingsContext'
import { TrackingProvider, TrackingContext } from '../context/TrackingContext'

describe('GazeMatch Component & UX Integration', () => {
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

  it('1. Renders start screen with Start Challenge button, moves remaining (20) and target score (1500)', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: /Gaze Match/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Start Challenge/i })).toBeInTheDocument()
    const movesContainer = screen.getByText(/Moves Left:/i).parentElement
    expect(movesContainer).toHaveTextContent('20')
    expect(screen.getByText(/0 \/ 1500/i)).toBeInTheDocument()
  })

  it('2. Starts the challenge upon clicking Start Challenge and transitions to active gameplay', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    const startBtn = screen.getByRole('button', { name: /Start Challenge/i })
    fireEvent.click(startBtn)

    // Start overlay is dismissed
    expect(screen.queryByRole('button', { name: /Start Challenge/i })).not.toBeInTheDocument()

    // Select/Swap button is active
    expect(screen.getByRole('button', { name: /Select Tile \(Space\)/i })).toBeInTheDocument()
  })

  it('3. On-screen directional buttons shift focus around the 6x6 grid', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Initial focus at center (240, 240) -> row 3, col 3 (0-indexed), displayed as (4, 4)
    expect(screen.getByText(/\(4, 4\)/i)).toBeInTheDocument()

    // Click Up -> row 2, col 3 (0-indexed), displayed as (3, 4)
    fireEvent.click(screen.getByRole('button', { name: /▲ Up/i }))
    expect(screen.getByText(/\(3, 4\)/i)).toBeInTheDocument()

    // Click Left -> row 2, col 2 (0-indexed), displayed as (3, 3)
    fireEvent.click(screen.getByRole('button', { name: /◀ Left/i }))
    expect(screen.getByText(/\(3, 3\)/i)).toBeInTheDocument()
  })

  it('4. Selecting a tile highlights it as Source and Cancel button clears selection', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Click Select Tile
    const selectBtn = screen.getByRole('button', { name: /Select Tile \(Space\)/i })
    fireEvent.click(selectBtn)

    // Now button becomes Confirm Swap and Cancel is enabled
    expect(screen.getByRole('button', { name: /Confirm Swap \(Space\)/i })).toBeInTheDocument()
    expect(screen.getByText(/✓ Source Selected/i)).toBeInTheDocument()

    const cancelBtn = screen.getByRole('button', { name: /Cancel \(Esc\)/i })
    expect(cancelBtn).not.toBeDisabled()

    // Click Cancel
    fireEvent.click(cancelBtn)
    expect(screen.getByText(/Hover to Dwell-Select/i)).toBeInTheDocument()
  })

  it('5. Manual Pause and Resume toggle freezes and unfreezes gameplay', () => {
    render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Click Pause
    const pauseBtn = screen.getByRole('button', { name: /^Pause$/i })
    fireEvent.click(pauseBtn)

    // Pause overlay appears
    expect(screen.getByRole('heading', { name: /Game Paused/i })).toBeInTheDocument()

    // Click Resume Game
    const resumeBtn = screen.getByRole('button', { name: /Resume Game/i })
    fireEvent.click(resumeBtn)

    expect(screen.queryByRole('heading', { name: /Game Paused/i })).not.toBeInTheDocument()
  })

  it('6. Tracking-loss safety detection automatically pauses game and NEVER auto-resumes', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /Start Challenge/i }))

    // Simulate tracking loss (>300ms face loss)
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        status: 'TRACKING_LOST',
        facePresent: false,
      }))
    })

    // Auto-pause modal engages immediately
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Face Tracking Lost/i })).toBeInTheDocument()

    // Simulate face returning
    act(() => {
      setTrackState((prev: any) => ({
        ...prev,
        status: 'ACTIVE',
        facePresent: true,
      }))
    })

    // CRUCIAL: Game must REMAIN paused!
    expect(screen.getByRole('heading', { name: /Face Tracking Lost/i })).toBeInTheDocument()
    expect(screen.getByText(/✓ Face detected!/i)).toBeInTheDocument()

    // Explicit resume required
    const resumeBtn = screen.getByRole('button', { name: /Resume Game/i })
    fireEvent.click(resumeBtn)

    expect(screen.queryByRole('heading', { name: /Face Tracking Lost/i })).not.toBeInTheDocument()
  })

  it('7. Unmount cleans up animation frame loop and window key listeners', () => {
    const cancelAnimSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = render(
      <SettingsProvider>
        <TrackingProvider>
          <GazeMatch onExit={() => {}} />
        </TrackingProvider>
      </SettingsProvider>
    )

    unmount()

    expect(cancelAnimSpy).toHaveBeenCalled()
    expect(removeListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })
})
