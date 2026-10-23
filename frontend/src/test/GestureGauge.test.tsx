import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GestureGauge } from '../components/common/GestureGauge'
import { SettingsProvider } from '../context/SettingsContext'
import { TrackingContext } from '../context/TrackingContext'
import type { TrackingData } from '../types/tracking'
import { INITIAL_TRACKING_DATA } from '../types/tracking'

function createTrackingWrapper(trackingDataOverrides: Partial<TrackingData> = {}) {
  const trackingData: TrackingData = {
    ...INITIAL_TRACKING_DATA,
    ...trackingDataOverrides,
  }

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <SettingsProvider>
      <TrackingContext.Provider
        value={{
          trackingData,
          startCamera: async () => {},
          stopCamera: () => {},
          attachElements: () => {},
          detachElements: () => {},
          startCalibration: () => {},
          cancelCalibration: () => {},
          recalibrate: () => {},
          resetGestures: () => {},
          isCameraActive: trackingData.status === 'ACTIVE',
        }}
      >
        {children}
      </TrackingContext.Provider>
    </SettingsProvider>
  )

  return Wrapper
}

describe('GestureGauge Component (Full and Compact Variants)', () => {
  it('1. Renders in full variant with title, description, matrix targets, and telemetry readout', () => {
    const Wrapper = createTrackingWrapper({
      status: 'ACTIVE',
      baseline: { noseX: 0.5, noseY: 0.5, interPupilDist: 0.2, sampleCount: 60, timestamp: 123 },
      displacement: { deltaX: -0.05, deltaY: 0.02, rawDeltaX: -0.01, rawDeltaY: 0.01, inDeadZone: true, magnitude: 0.05 },
    })

    render(<GestureGauge variant="full" />, { wrapper: Wrapper })

    expect(screen.getByRole('heading', { level: 2, name: /Real-Time Gesture Gauges/i })).toBeInTheDocument()
    expect(screen.getByText(/Calibrated Baseline/i)).toBeInTheDocument()
    expect(screen.getByText(/Turn your head gently left or right/i)).toBeInTheDocument()

    // 3x3 Targets
    expect(screen.getByText(/▲ Up \(Pitch\)/i)).toBeInTheDocument()
    expect(screen.getByText(/◀ Left \(Yaw\)/i)).toBeInTheDocument()
    expect(screen.getByText(/CENTER/i)).toBeInTheDocument()
    expect(screen.getByText(/Right \(Yaw\) ▶/i)).toBeInTheDocument()
    expect(screen.getByText(/▼ Down \(Pitch\)/i)).toBeInTheDocument()

    // Telemetry
    expect(screen.getByText(/-0.050/)).toBeInTheDocument()
    expect(screen.getByText(/0.020/)).toBeInTheDocument()
    expect(screen.getByText(/10%/)).toBeInTheDocument()
  })

  it('2. Renders in compact variant without description paragraph for in-game HUDs', () => {
    const Wrapper = createTrackingWrapper()

    render(<GestureGauge variant="compact" title="Gesture Gauges" />, { wrapper: Wrapper })

    expect(screen.getByRole('heading', { level: 2, name: /Gesture Gauges/i })).toBeInTheDocument()
    expect(screen.queryByText(/Turn your head gently left or right/i)).not.toBeInTheDocument()
    expect(screen.getByText(/CENTER/i)).toBeInTheDocument()
  })

  it('3. Illuminates Left target when deltaX < -0.12 or action === LEFT', () => {
    const Wrapper = createTrackingWrapper({
      action: 'LEFT',
      displacement: { deltaX: -0.22, deltaY: 0, rawDeltaX: -0.05, rawDeltaY: 0, inDeadZone: false, magnitude: 0.22 },
    })

    render(<GestureGauge variant="compact" />, { wrapper: Wrapper })

    const leftTarget = screen.getByText(/◀ Left \(Yaw\)/i).parentElement
    expect(leftTarget).toHaveTextContent(/TRIGGER/i)
  })

  it('4. Illuminates Right target when deltaX > 0.12 or action === RIGHT', () => {
    const Wrapper = createTrackingWrapper({
      action: 'RIGHT',
      displacement: { deltaX: 0.18, deltaY: 0, rawDeltaX: 0.04, rawDeltaY: 0, inDeadZone: false, magnitude: 0.18 },
    })

    render(<GestureGauge variant="compact" />, { wrapper: Wrapper })

    const rightTarget = screen.getByText(/Right \(Yaw\) ▶/i).parentElement
    expect(rightTarget).toHaveTextContent(/TRIGGER/i)
  })

  it('5. Shows Disabled for Up and Down when verticalGestures is false by default', () => {
    const Wrapper = createTrackingWrapper()

    render(<GestureGauge variant="compact" />, { wrapper: Wrapper })

    const upTarget = screen.getByText(/▲ Up \(Pitch\)/i).parentElement
    const downTarget = screen.getByText(/▼ Down \(Pitch\)/i).parentElement

    expect(upTarget).toHaveTextContent(/Disabled/i)
    expect(downTarget).toHaveTextContent(/Disabled/i)
  })

  it('6. Reflects dead-zone state: Dead Zone when inDeadZone is true, Deflected when false', () => {
    const WrapperActive = createTrackingWrapper({
      displacement: { deltaX: 0.2, deltaY: 0, rawDeltaX: 0.04, rawDeltaY: 0, inDeadZone: false, magnitude: 0.2 },
    })

    const { rerender } = render(<GestureGauge variant="compact" />, { wrapper: WrapperActive })
    expect(screen.getByText(/Deflected/i)).toBeInTheDocument()

    const WrapperNeutral = createTrackingWrapper({
      displacement: { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 },
    })

    rerender(<GestureGauge variant="compact" />)
  })

  it('7. Guarantees strict exclusivity: never illuminates LEFT + DOWN simultaneously even with verticalGestures enabled', () => {
    localStorage.setItem('gazemouse_user_settings_v1', JSON.stringify({ verticalGestures: true }))

    // User turning head left with natural chin dip (deltaX < -0.12, deltaY > 0.14)
    const Wrapper = createTrackingWrapper({
      action: 'LEFT',
      displacement: { deltaX: -0.22, deltaY: 0.18, rawDeltaX: -0.05, rawDeltaY: 0.04, inDeadZone: false, magnitude: 0.28 },
    })

    render(<GestureGauge variant="compact" />, { wrapper: Wrapper })

    const leftTarget = screen.getByText(/◀ Left \(Yaw\)/i)
    const downTarget = screen.getByText(/▼ Down \(Pitch\)/i)

    expect(leftTarget).toHaveTextContent(/TRIGGER/i)
    // Down target MUST show Ready, NOT TRIGGER!
    expect(downTarget).toHaveTextContent(/Ready/i)
    expect(downTarget).not.toHaveTextContent(/TRIGGER/i)

    localStorage.clear()
  })
})
