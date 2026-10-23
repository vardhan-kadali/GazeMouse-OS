import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SignalProcessor, LANDMARK_INDEX_NOSE_TIP, LANDMARK_INDEX_LEFT_EYE_OUTER, LANDMARK_INDEX_RIGHT_EYE_OUTER } from '../vision/signalProcessor'
import { GestureClassifier } from '../vision/gestureClassifier'
import { Runner3DEngine } from '../games/runner3d/runner3dEngine'
import type { FaceLandmarks, NeutralBaseline, NormalizedDisplacement } from '../types/tracking'

function createMockLandmarks(noseX: number, noseY: number, ipd: number = 0.20): FaceLandmarks {
  const landmarks: FaceLandmarks = new Array(478).fill(null).map(() => ({ x: 0.5, y: 0.5, z: 0 }))
  landmarks[LANDMARK_INDEX_LEFT_EYE_OUTER] = { x: noseX - ipd / 2, y: noseY - 0.05, z: 0 }
  landmarks[LANDMARK_INDEX_RIGHT_EYE_OUTER] = { x: noseX + ipd / 2, y: noseY - 0.05, z: 0 }
  landmarks[LANDMARK_INDEX_NOSE_TIP] = { x: noseX, y: noseY, z: 0 }
  return landmarks
}

describe('Head-Gesture Reliability & Subway Surfers Pre-Integration Validation', () => {
  let processor: SignalProcessor
  let classifier: GestureClassifier
  const baseline: NeutralBaseline = {
    noseX: 0.50,
    noseY: 0.50,
    interPupilDist: 0.20,
    sampleCount: 60,
    timestamp: Date.now(),
  }

  beforeEach(() => {
    processor = new SignalProcessor()
    classifier = new GestureClassifier()
    vi.useRealTimers()
  })

  // 1. Horizontal Direction & Sign Convention
  describe('1. Horizontal Direction Mapping & Sign Convention', () => {
    it('classifies physical head turn to the LEFT as LEFT action with negative displacement', () => {
      // In laptop webcam geometry, user turning left moves nose to camera right (0.54 > baseline 0.50)
      const landmarks = createMockLandmarks(0.54, 0.50, 0.20)
      const displacement = processor.process(landmarks, baseline, {
        sensitivity: 1.5,
        smoothing: 0.1,
        deadZonePercent: 10,
        verticalGestures: false,
      })

      expect(displacement.rawDeltaX).toBeLessThan(0) // Inverted sensor coordinate
      expect(displacement.deltaX).toBeLessThan(-0.15) // Outside deadzone, exceeds threshold
      expect(displacement.inDeadZone).toBe(false)

      const action = classifier.classify(displacement)
      expect(action).toBe('LEFT')
    })

    it('classifies physical head turn to the RIGHT as RIGHT action with positive displacement', () => {
      // User turning right moves nose to camera left (0.46 < baseline 0.50)
      const landmarks = createMockLandmarks(0.46, 0.50, 0.20)
      const displacement = processor.process(landmarks, baseline, {
        sensitivity: 1.5,
        smoothing: 0.1,
        deadZonePercent: 10,
        verticalGestures: false,
      })

      expect(displacement.rawDeltaX).toBeGreaterThan(0)
      expect(displacement.deltaX).toBeGreaterThan(0.15)
      expect(displacement.inDeadZone).toBe(false)

      const action = classifier.classify(displacement)
      expect(action).toBe('RIGHT')
    })
  })

  // 2. Dead-Zone and Activation Threshold Integration
  describe('2. Dead-Zone & Activation Threshold Clean Coexistence', () => {
    it('suppresses micro-movements strictly within the dead-zone threshold', () => {
      // 0.505 offset: normalized displacement = 0.005 / 0.20 * 1.5 = 0.0375 (inside 10% deadzone)
      const landmarks = createMockLandmarks(0.505, 0.50, 0.20)
      const displacement = processor.process(landmarks, baseline, {
        sensitivity: 1.5,
        smoothing: 0.1,
        deadZonePercent: 10,
        verticalGestures: false,
      })

      expect(displacement.inDeadZone).toBe(true)
      expect(displacement.deltaX).toBe(0)
      expect(displacement.magnitude).toBe(0)

      const action = classifier.classify(displacement)
      expect(action).toBe('NONE')
    })

    it('retains true normalized displacement outside deadzone without double-subtraction penalty', () => {
      // 0.525 offset: normalized displacement = (0.025 / 0.20) * 1.5 = 0.1875
      // With 10% deadzone, previously it subtracted 0.10 leaving 0.0875 (blocking activation < 0.15)
      // Now it cleanly passes through 0.1875, activating naturally without exaggerated head swings
      const landmarks = createMockLandmarks(0.525, 0.50, 0.20)
      const displacement = processor.process(landmarks, baseline, {
        sensitivity: 1.5,
        smoothing: 0.0, // Zero smoothing for raw threshold check
        deadZonePercent: 10,
        verticalGestures: false,
      })

      expect(displacement.inDeadZone).toBe(false)
      expect(displacement.deltaX).toBeCloseTo(-0.1875, 3)

      const action = classifier.classify(displacement)
      expect(action).toBe('LEFT')
    })
  })

  // 3. Sensitivity Scaling
  describe('3. Sensitivity Scaling Linear Path', () => {
    it('scales linearly with user sensitivity setting without undocumented multipliers', () => {
      const landmarks = createMockLandmarks(0.53, 0.50, 0.20)
      const rawNormalized = 0.03 / 0.20 // 0.15

      // At sensitivity 1.0:
      const p1 = new SignalProcessor()
      const d1 = p1.process(landmarks, baseline, { sensitivity: 1.0, smoothing: 0.0, deadZonePercent: 5, verticalGestures: false })
      expect(d1.deltaX).toBeCloseTo(-rawNormalized * 1.0, 3)

      // At sensitivity 2.0: exactly double sensitivity 1.0
      const p2 = new SignalProcessor()
      const d2 = p2.process(landmarks, baseline, { sensitivity: 2.0, smoothing: 0.0, deadZonePercent: 5, verticalGestures: false })
      expect(d2.deltaX).toBeCloseTo(-rawNormalized * 2.0, 3)
      expect(Math.abs(d2.deltaX)).toBeCloseTo(Math.abs(d1.deltaX) * 2.0, 3)

      // At sensitivity 3.0: exactly triple sensitivity 1.0
      const p3 = new SignalProcessor()
      const d3 = p3.process(landmarks, baseline, { sensitivity: 3.0, smoothing: 0.0, deadZonePercent: 5, verticalGestures: false })
      expect(d3.deltaX).toBeCloseTo(-rawNormalized * 3.0, 3)
      expect(Math.abs(d3.deltaX)).toBeCloseTo(Math.abs(d1.deltaX) * 3.0, 3)
    })
  })

  // 4. Return-to-Neutral Re-Arming & Sustained Hold Hysteresis
  describe('4. Return-to-Neutral Re-Arming & Sustained Pose Hysteresis', () => {
    it('fires exactly ONE action when holding a sustained head turn', () => {
      const deflectedDisplacement: NormalizedDisplacement = {
        deltaX: -0.22,
        deltaY: 0,
        rawDeltaX: -0.05,
        rawDeltaY: 0,
        inDeadZone: false,
        magnitude: 0.22,
      }

      // Frame 1: Threshold crossed -> Action fires
      const action1 = classifier.classify(deflectedDisplacement)
      expect(action1).toBe('LEFT')
      expect(classifier.isAwaitingReturn()).toBe(true)

      // Frames 2 to 20: User continues holding head turned left
      for (let frame = 2; frame <= 20; frame++) {
        const actionHeld = classifier.classify(deflectedDisplacement)
        expect(actionHeld).toBe('NONE')
        expect(classifier.isAwaitingReturn()).toBe(true)
      }
    })

    it('re-arms immediately when head returns to neutral center zone', () => {
      vi.useFakeTimers()

      // 1. Fire LEFT action
      const action1 = classifier.classify({
        deltaX: -0.22,
        deltaY: 0,
        rawDeltaX: -0.05,
        rawDeltaY: 0,
        inDeadZone: false,
        magnitude: 0.22,
      })
      expect(action1).toBe('LEFT')
      expect(classifier.isAwaitingReturn()).toBe(true)

      // 2. Return head to resting neutral center (deltaX = 0, inDeadZone = true)
      const neutralDisplacement: NormalizedDisplacement = {
        deltaX: 0,
        deltaY: 0,
        rawDeltaX: 0,
        rawDeltaY: 0,
        inDeadZone: true,
        magnitude: 0,
      }
      const actionNeutral = classifier.classify(neutralDisplacement)
      expect(actionNeutral).toBe('NONE')
      // Awaiting return MUST be cleared
      expect(classifier.isAwaitingReturn()).toBe(false)

      // Advance past standard cooldown
      vi.advanceTimersByTime(400)

      // 3. Fire second deliberate action (RIGHT)
      const action2 = classifier.classify({
        deltaX: 0.22,
        deltaY: 0,
        rawDeltaX: 0.05,
        rawDeltaY: 0,
        inDeadZone: false,
        magnitude: 0.22,
      })
      expect(action2).toBe('RIGHT')

      vi.useRealTimers()
    })

    it('executes a clean sequence: LEFT -> Neutral -> LEFT -> Neutral -> RIGHT', () => {
      vi.useFakeTimers()

      const leftDisp: NormalizedDisplacement = { deltaX: -0.20, deltaY: 0, rawDeltaX: -0.04, rawDeltaY: 0, inDeadZone: false, magnitude: 0.20 }
      const rightDisp: NormalizedDisplacement = { deltaX: 0.20, deltaY: 0, rawDeltaX: 0.04, rawDeltaY: 0, inDeadZone: false, magnitude: 0.20 }
      const neutralDisp: NormalizedDisplacement = { deltaX: 0, deltaY: 0, rawDeltaX: 0, rawDeltaY: 0, inDeadZone: true, magnitude: 0 }

      // 1. First turn Left
      expect(classifier.classify(leftDisp)).toBe('LEFT')
      expect(classifier.classify(leftDisp)).toBe('NONE') // Held

      // 2. Return to center
      expect(classifier.classify(neutralDisp)).toBe('NONE')
      vi.advanceTimersByTime(400)

      // 3. Second turn Left
      expect(classifier.classify(leftDisp)).toBe('LEFT')
      expect(classifier.classify(leftDisp)).toBe('NONE') // Held

      // 4. Return to center
      expect(classifier.classify(neutralDisp)).toBe('NONE')
      vi.advanceTimersByTime(400)

      // 5. Turn Right
      expect(classifier.classify(rightDisp)).toBe('RIGHT')
      expect(classifier.classify(rightDisp)).toBe('NONE') // Held

      vi.useRealTimers()
    })
  })

  // 5. 3D Game Engine Re-Arming Without Conflicting Deadlock
  describe('5. Runner3DEngine Integration Re-Arming', () => {
    it('re-arms lane shifts when head returns within 0.10 neutral zone even before action latch expires', () => {
      const engine = new Runner3DEngine()
      engine.start()
      expect(engine.player.targetLane).toBe(1) // Middle lane

      // 1. Shift LEFT
      expect(engine.handleGestureAction('LEFT', -0.22, false, false)).toBe(true)
      expect(engine.player.targetLane).toBe(0) // Left lane
      expect(engine.awaitingNeutral).toBe(true)

      // 2. Held deflection rejects
      expect(engine.handleGestureAction('LEFT', -0.22, false, false)).toBe(false)
      expect(engine.player.targetLane).toBe(0)

      // 3. Head returns toward center (deltaX = -0.04, inside 0.10 neutral zone)
      // Even if action is still latched, returning to neutral MUST re-arm!
      engine.handleGestureAction('NONE', -0.04, false, false)
      expect(engine.awaitingNeutral).toBe(false) // Cleanly re-armed!

      // 4. Subsequent RIGHT shift executes immediately
      expect(engine.handleGestureAction('RIGHT', 0.22, false, false)).toBe(true)
      expect(engine.player.targetLane).toBe(1) // Back to center lane
    })
  })

  // 6. Tracking Loss and Recovery
  describe('6. Tracking Loss and Recovery Lifecycle', () => {
    it('resets tracking history so recovery starts clean without lingering pre-loss deflections', () => {
      // User held head turned left before losing face tracking
      processor.process(createMockLandmarks(0.60, 0.50, 0.20), baseline, {
        sensitivity: 2.0,
        smoothing: 0.8,
        deadZonePercent: 10,
        verticalGestures: false,
      })

      // Tracking loss occurs -> pipeline reset
      processor.reset()
      classifier.reset()

      // User re-acquires face in neutral resting position (0.50, 0.50)
      const recoveryFrame = processor.process(createMockLandmarks(0.50, 0.50, 0.20), baseline, {
        sensitivity: 2.0,
        smoothing: 0.8,
        deadZonePercent: 10,
        verticalGestures: false,
      })

      expect(recoveryFrame.inDeadZone).toBe(true)
      expect(recoveryFrame.deltaX).toBe(0)
      expect(classifier.classify(recoveryFrame)).toBe('NONE')
      expect(classifier.isAwaitingReturn()).toBe(false)
    })
  })

  // 7. Vertical Gestures Disabled by Default
  describe('7. Vertical Gesture Suppression by Default', () => {
    it('completely suppresses pitch movements when verticalGestures is false', () => {
      // Significant chin up / down movements
      const upLandmarks = createMockLandmarks(0.50, 0.40, 0.20)
      const upDisp = processor.process(upLandmarks, baseline, { sensitivity: 1.5, smoothing: 0.1, deadZonePercent: 10, verticalGestures: false })
      expect(upDisp.deltaY).toBe(0)
      expect(classifier.classify(upDisp, { verticalGestures: false })).toBe('NONE')

      const downLandmarks = createMockLandmarks(0.50, 0.60, 0.20)
      const downDisp = processor.process(downLandmarks, baseline, { sensitivity: 1.5, smoothing: 0.1, deadZonePercent: 10, verticalGestures: false })
      expect(downDisp.deltaY).toBe(0)
      expect(classifier.classify(downDisp, { verticalGestures: false })).toBe('NONE')
    })

    it('preserves clean horizontal turn classification during natural chin dips when verticalGestures is false', () => {
      // Lateral head turn with natural downward chin pitch
      const diagonalLandmarks = createMockLandmarks(0.54, 0.55, 0.20)
      const disp = processor.process(diagonalLandmarks, baseline, { sensitivity: 1.5, smoothing: 0.1, deadZonePercent: 10, verticalGestures: false })
      expect(disp.deltaX).toBeLessThan(-0.15)
      expect(disp.deltaY).toBe(0) // Suppressed
      expect(classifier.classify(disp, { verticalGestures: false })).toBe('LEFT')
    })
  })
})
