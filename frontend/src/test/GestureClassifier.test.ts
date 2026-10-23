import { describe, it, expect, beforeEach, vi } from 'vitest'
import { GestureClassifier } from '../vision/gestureClassifier'
import { NormalizedDisplacement } from '../types/tracking'

function makeDisplacement(deltaX: number, deltaY: number = 0): NormalizedDisplacement {
  return {
    deltaX,
    deltaY,
    rawDeltaX: deltaX,
    rawDeltaY: deltaY,
    inDeadZone: deltaX === 0 && deltaY === 0,
    magnitude: Math.sqrt(deltaX * deltaX + deltaY * deltaY),
  }
}

describe('GestureClassifier', () => {
  let classifier: GestureClassifier

  beforeEach(() => {
    classifier = new GestureClassifier()
    vi.useRealTimers()
  })

  it('triggers LEFT action when negative displacement exceeds activation threshold', () => {
    // -0.20 exceeds the default 0.15 threshold
    const action = classifier.classify(makeDisplacement(-0.20))
    expect(action).toBe('LEFT')
    expect(classifier.isAwaitingReturn()).toBe(true)
  })

  it('triggers RIGHT action when positive displacement exceeds activation threshold', () => {
    // 0.20 exceeds 0.15 threshold
    const action = classifier.classify(makeDisplacement(0.20))
    expect(action).toBe('RIGHT')
    expect(classifier.isAwaitingReturn()).toBe(true)
  })

  it('suppresses repeated actions when user holds the head deflected (hysteresis return requirement)', () => {
    // Frame 1: Triggers LEFT
    const action1 = classifier.classify(makeDisplacement(-0.22))
    expect(action1).toBe('LEFT')

    // Frame 2: Still holding head at -0.22
    const action2 = classifier.classify(makeDisplacement(-0.22))
    expect(action2).toBe('NONE')

    // Frame 3: Still holding
    const action3 = classifier.classify(makeDisplacement(-0.20))
    expect(action3).toBe('NONE')
  })

  it('re-arms trigger once user returns head inside neutral zone and cooldown passes', () => {
    vi.useFakeTimers()

    // 1. Trigger LEFT
    expect(classifier.classify(makeDisplacement(-0.25))).toBe('LEFT')

    // 2. Return to neutral center (0.02 is well inside return threshold 0.08)
    expect(classifier.classify(makeDisplacement(0.02))).toBe('NONE')
    expect(classifier.isAwaitingReturn()).toBe(false)

    // 3. Advance time past cooldown (450ms)
    vi.advanceTimersByTime(450)

    // 4. Trigger RIGHT cleanly
    expect(classifier.classify(makeDisplacement(0.25))).toBe('RIGHT')

    vi.useRealTimers()
  })

  it('blocks rapid back-to-back triggers if cooldown has not elapsed', () => {
    vi.useFakeTimers()

    // Trigger LEFT
    expect(classifier.classify(makeDisplacement(-0.25))).toBe('LEFT')

    // Return to neutral instantly
    classifier.classify(makeDisplacement(0.0))

    // Only advance 100ms (cooldown is 400ms)
    vi.advanceTimersByTime(100)

    // Attempt second trigger prematurely
    expect(classifier.classify(makeDisplacement(0.25))).toBe('NONE')

    // Advance remaining 350ms
    vi.advanceTimersByTime(350)

    // Now it fires
    expect(classifier.classify(makeDisplacement(0.25))).toBe('RIGHT')

    vi.useRealTimers()
  })

  it('suppresses vertical gestures when verticalGestures option is false', () => {
    const upAction = classifier.classify(makeDisplacement(0, -0.3), { verticalGestures: false })
    expect(upAction).toBe('NONE')

    const downAction = classifier.classify(makeDisplacement(0, 0.3), { verticalGestures: false })
    expect(downAction).toBe('NONE')
  })

  it('triggers UP and DOWN when verticalGestures is true', () => {
    const upAction = classifier.classify(makeDisplacement(0, -0.3), { verticalGestures: true })
    expect(upAction).toBe('UP')

    classifier.reset()

    const downAction = classifier.classify(makeDisplacement(0, 0.3), { verticalGestures: true })
    expect(downAction).toBe('DOWN')
  })

  it('prioritizes dominant horizontal axis over natural chin dips to prevent false DOWN triggers', () => {
    // User turns head left (-0.20) with a concurrent chin dip (+0.16) and verticalGestures enabled
    const action = classifier.classify(makeDisplacement(-0.20, 0.16), { verticalGestures: true })
    expect(action).toBe('LEFT')
    expect(action).not.toBe('DOWN')

    classifier.reset()

    // User turns head right (+0.20) with a concurrent chin dip (+0.16) and verticalGestures enabled
    const actionRight = classifier.classify(makeDisplacement(0.20, 0.16), { verticalGestures: true })
    expect(actionRight).toBe('RIGHT')
    expect(actionRight).not.toBe('DOWN')
  })

  it('suppresses premature vertical trigger during diagonal turn onset until dominant direction is clear', () => {
    // User starts turning head laterally (-0.13) with slight pitch dip (+0.19)
    // Horizontal deflection is substantial (>75% of threshold), so vertical gesture must be suppressed
    const actionOnset = classifier.classify(makeDisplacement(-0.13, 0.19), { verticalGestures: true })
    expect(actionOnset).toBe('NONE')

    // Follow-through of lateral turn reaches -0.18: triggers LEFT cleanly
    const actionTurn = classifier.classify(makeDisplacement(-0.18, 0.14), { verticalGestures: true })
    expect(actionTurn).toBe('LEFT')
  })
})
