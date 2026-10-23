import { describe, it, expect, beforeEach } from 'vitest'
import {
  SignalProcessor,
  CalibrationAccumulator,
  LANDMARK_INDEX_NOSE_TIP,
  LANDMARK_INDEX_LEFT_EYE_OUTER,
  LANDMARK_INDEX_RIGHT_EYE_OUTER,
} from '../vision/signalProcessor'
import { FaceLandmarks, NeutralBaseline } from '../types/tracking'

function createMockLandmarks(noseX: number, noseY: number, ipd: number = 0.2): FaceLandmarks {
  const landmarks: FaceLandmarks = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  // Center eyes around noseX
  landmarks[LANDMARK_INDEX_LEFT_EYE_OUTER] = { x: noseX - ipd / 2, y: noseY - 0.05, z: 0 }
  landmarks[LANDMARK_INDEX_RIGHT_EYE_OUTER] = { x: noseX + ipd / 2, y: noseY - 0.05, z: 0 }
  landmarks[LANDMARK_INDEX_NOSE_TIP] = { x: noseX, y: noseY, z: 0 }
  return landmarks
}

describe('SignalProcessor', () => {
  let processor: SignalProcessor
  const mockBaseline: NeutralBaseline = {
    noseX: 0.5,
    noseY: 0.5,
    interPupilDist: 0.2,
    sampleCount: 60,
    timestamp: Date.now(),
  }

  beforeEach(() => {
    processor = new SignalProcessor()
  })

  it('calculates inter-pupillary distance correctly', () => {
    const landmarks = createMockLandmarks(0.5, 0.5, 0.25)
    const ipd = SignalProcessor.calculateInterPupilDistance(landmarks)
    expect(ipd).toBeCloseTo(0.25, 2)
  })

  it('returns zero displacement when nose is at baseline position (dead-zone)', () => {
    const landmarks = createMockLandmarks(0.5, 0.5, 0.2)
    const result = processor.process(landmarks, mockBaseline, {
      sensitivity: 1.5,
      smoothing: 0.3,
      deadZonePercent: 10,
      verticalGestures: false,
    })

    expect(result.inDeadZone).toBe(true)
    expect(result.deltaX).toBe(0)
    expect(result.deltaY).toBe(0)
  })

  it('suppresses small involuntary tremors within the dead-zone threshold', () => {
    // 0.505 is a micro-movement (0.005 offset on 0.2 IPD = 0.025 scaled, well inside 10% deadzone)
    const landmarks = createMockLandmarks(0.505, 0.5, 0.2)
    const result = processor.process(landmarks, mockBaseline, {
      sensitivity: 1.5,
      smoothing: 0.3,
      deadZonePercent: 10,
      verticalGestures: false,
    })

    expect(result.inDeadZone).toBe(true)
    expect(result.deltaX).toBe(0)
  })

  it('detects physical left head turn (nose.x > baseline) as negative deltaX outside dead-zone', () => {
    // Optical camera inversion: physical left turn moves nose toward camera right (0.54 > baseline 0.50)
    // Produces rawDeltaX = -(0.54 - 0.50) = -0.04 (negative, indicating left movement)
    const landmarks = createMockLandmarks(0.54, 0.5, 0.2)
    const result = processor.process(landmarks, mockBaseline, {
      sensitivity: 2.0,
      smoothing: 0.1, // Low smoothing for direct test
      deadZonePercent: 10,
      verticalGestures: false,
    })

    expect(result.inDeadZone).toBe(false)
    expect(result.deltaX).toBeLessThan(0)
    expect(result.rawDeltaX).toBeCloseTo(-0.04, 3)
  })

  it('detects physical right head turn (nose.x < baseline) as positive deltaX outside dead-zone', () => {
    // Optical camera inversion: physical right turn moves nose toward camera left (0.46 < baseline 0.50)
    // Produces rawDeltaX = -(0.46 - 0.50) = +0.04 (positive, indicating right movement)
    const landmarks = createMockLandmarks(0.46, 0.5, 0.2)
    const result = processor.process(landmarks, mockBaseline, {
      sensitivity: 2.0,
      smoothing: 0.1,
      deadZonePercent: 10,
      verticalGestures: false,
    })

    expect(result.inDeadZone).toBe(false)
    expect(result.deltaX).toBeGreaterThan(0)
    expect(result.rawDeltaX).toBeCloseTo(0.04, 3)
  })

  it('suppresses vertical displacement when verticalGestures is disabled', () => {
    const landmarks = createMockLandmarks(0.5, 0.58, 0.2)
    const result = processor.process(landmarks, mockBaseline, {
      sensitivity: 1.5,
      smoothing: 0.3,
      deadZonePercent: 10,
      verticalGestures: false, // Disabled
    })

    expect(result.deltaY).toBe(0)
  })

  it('smooths sudden noise spikes across frames using exponential moving average', () => {
    // Frame 1: baseline
    processor.process(createMockLandmarks(0.5, 0.5), mockBaseline, {
      sensitivity: 1.5,
      smoothing: 0.8, // High smoothing
      deadZonePercent: 5,
      verticalGestures: false,
    })

    // Frame 2: sudden jump to physical left
    const frame2 = processor.process(createMockLandmarks(0.55, 0.5), mockBaseline, {
      sensitivity: 1.5,
      smoothing: 0.8,
      deadZonePercent: 5,
      verticalGestures: false,
    })

    // Because smoothing is high, deltaX will be dampened rather than jumping to full magnitude instantly
    expect(frame2.deltaX).toBeGreaterThan(-0.7)
    expect(frame2.deltaX).toBeLessThan(0)
  })

  it('resets EMA history so tracking recovery starts clean without blending stale deflected history', () => {
    // Step 1: User holds head deflected to physical left before losing face tracking
    processor.process(createMockLandmarks(0.60, 0.5), mockBaseline, {
      sensitivity: 2.0,
      smoothing: 0.8, // High smoothing
      deadZonePercent: 5,
      verticalGestures: false,
    })

    // Step 2: Tracking loss occurs -> reset() is invoked
    processor.reset()

    // Step 3: Face re-acquired at exact neutral center (0.50)
    const recoveryFrame = processor.process(createMockLandmarks(0.50, 0.5), mockBaseline, {
      sensitivity: 2.0,
      smoothing: 0.8,
      deadZonePercent: 5,
      verticalGestures: false,
    })

    // Because history was reset, deltaX is immediately 0 inside dead-zone, not contaminated by pre-loss deflection
    expect(recoveryFrame.inDeadZone).toBe(true)
    expect(recoveryFrame.deltaX).toBe(0)
  })
})

describe('CalibrationAccumulator', () => {
  let accumulator: CalibrationAccumulator

  beforeEach(() => {
    accumulator = new CalibrationAccumulator()
  })

  it('fails calibration if insufficient samples are accumulated in the window', () => {
    // Only add 10 frames (minimum required is 20)
    for (let i = 0; i < 10; i++) {
      accumulator.addSample(createMockLandmarks(0.5, 0.5, 0.2))
    }

    const result = accumulator.finalize(20)
    expect(result.baseline).toBeNull()
    expect(result.error).toContain('Insufficient tracking frames')
  })

  it('successfully calculates neutral baseline arithmetic mean from valid frames', () => {
    // Add 40 steady frames centered at (0.48, 0.52)
    for (let i = 0; i < 40; i++) {
      accumulator.addSample(createMockLandmarks(0.48, 0.52, 0.22))
    }

    const result = accumulator.finalize(20)
    expect(result.error).toBeNull()
    expect(result.baseline).not.toBeNull()
    expect(result.baseline?.noseX).toBeCloseTo(0.48, 2)
    expect(result.baseline?.noseY).toBeCloseTo(0.52, 2)
    expect(result.baseline?.interPupilDist).toBeCloseTo(0.22, 2)
    expect(result.baseline?.sampleCount).toBe(40)
  })

  it('rejects calibration if user was shaking wildly (excessive variance)', () => {
    // Add 30 frames with extreme variance
    for (let i = 0; i < 30; i++) {
      const noisyX = i % 2 === 0 ? 0.2 : 0.8
      accumulator.addSample(createMockLandmarks(noisyX, 0.5, 0.2))
    }

    const result = accumulator.finalize(20)
    expect(result.baseline).toBeNull()
    expect(result.error).toContain('Too much head movement')
  })
})
