import type { DirectionalAction, NormalizedDisplacement } from '../types/tracking'

export interface GestureClassifierOptions {
  activationThreshold: number // Default 0.15 normalized offset to trigger a turn
  cooldownMs: number // Default 400ms cooldown after an action triggers
  returnToNeutralThreshold: number // Offset threshold to confirm user returned to center (e.g. 0.08)
  verticalGestures: boolean
}

export const DEFAULT_CLASSIFIER_OPTIONS: GestureClassifierOptions = {
  activationThreshold: 0.15,
  cooldownMs: 400,
  returnToNeutralThreshold: 0.08,
  verticalGestures: false,
}

export class GestureClassifier {
  private lastTriggerTime: number = 0
  private awaitingNeutralReturn: boolean = false
  private currentAction: DirectionalAction = 'NONE'

  public reset(): void {
    this.lastTriggerTime = 0
    this.awaitingNeutralReturn = false
    this.currentAction = 'NONE'
  }

  /**
   * Evaluates current displacement against threshold, cooldown, and return-to-center hysteresis.
   * Returns a single action when crossed, then enters cooldown until user returns to neutral.
   */
  public classify(
    displacement: NormalizedDisplacement,
    options: Partial<GestureClassifierOptions> = {}
  ): DirectionalAction {
    const opts: GestureClassifierOptions = {
      ...DEFAULT_CLASSIFIER_OPTIONS,
      ...options,
    }

    const now = Date.now()
    const isInsideNeutralZone =
      displacement.inDeadZone ||
      (Math.abs(displacement.deltaX) < opts.returnToNeutralThreshold &&
       (!opts.verticalGestures || Math.abs(displacement.deltaY) < opts.returnToNeutralThreshold * 1.5))

    // Check if user has returned to neutral center after a previous trigger
    if (this.awaitingNeutralReturn) {
      if (isInsideNeutralZone) {
        this.awaitingNeutralReturn = false
      } else {
        // Still holding previous deflected pose; suppress repeated triggers
        this.currentAction = 'NONE'
        return 'NONE'
      }
    }

    // Check if cooldown timer has elapsed
    if (now - this.lastTriggerTime < opts.cooldownMs) {
      this.currentAction = 'NONE'
      return 'NONE'
    }

    const absX = Math.abs(displacement.deltaX)
    const absY = Math.abs(displacement.deltaY)

    // 1. Lateral Head Turn Evaluation (Primary accessibility control)
    // Deliberate lateral head turns trigger lane actions whenever horizontal displacement crosses the activation threshold.
    // Natural biomechanical chin dips during lateral turns must not block lateral movement.
    if (displacement.deltaX < -opts.activationThreshold) {
      this.lastTriggerTime = now
      this.awaitingNeutralReturn = true
      this.currentAction = 'LEFT'
      return 'LEFT'
    }

    if (displacement.deltaX > opts.activationThreshold) {
      this.lastTriggerTime = now
      this.awaitingNeutralReturn = true
      this.currentAction = 'RIGHT'
      return 'RIGHT'
    }

    // 2. Vertical Gesture Evaluation (Only if explicitly enabled by user)
    // To prevent false combinations or accidental slides during turns, vertical gestures require
    // unambiguous vertical intent: horizontal deflection must be below 75% of threshold and vertical deflection must dominate.
    if (opts.verticalGestures) {
      const isUnambiguousVertical = absY > absX * 1.25 && absX < opts.activationThreshold * 0.75

      if (isUnambiguousVertical) {
        if (displacement.deltaY < -opts.activationThreshold * 1.2) {
          this.lastTriggerTime = now
          this.awaitingNeutralReturn = true
          this.currentAction = 'UP'
          return 'UP'
        }

        if (displacement.deltaY > opts.activationThreshold * 1.2) {
          this.lastTriggerTime = now
          this.awaitingNeutralReturn = true
          this.currentAction = 'DOWN'
          return 'DOWN'
        }
      }
    }

    this.currentAction = 'NONE'
    return 'NONE'
  }

  public getCurrentAction(): DirectionalAction {
    return this.currentAction
  }

  public isAwaitingReturn(): boolean {
    return this.awaitingNeutralReturn
  }
}
