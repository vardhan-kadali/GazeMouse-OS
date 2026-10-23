import type {
  FaceLandmarks,
  NeutralBaseline,
  NormalizedDisplacement,
} from '../types/tracking'

// MediaPipe FaceMesh canonical landmark indices
export const LANDMARK_INDEX_NOSE_TIP = 1
export const LANDMARK_INDEX_LEFT_EYE_OUTER = 33
export const LANDMARK_INDEX_RIGHT_EYE_OUTER = 263
export const LANDMARK_INDEX_CHIN = 152
export const LANDMARK_INDEX_FOREHEAD = 10

export class SignalProcessor {
  private smoothedDeltaX: number = 0
  private smoothedDeltaY: number = 0
  private hasPreviousSample: boolean = false

  /**
   * Calculates the Euclidean inter-pupillary distance between outer eye canthi.
   * Acts as a scale factor invariant to user distance from the webcam.
   */
  public static calculateInterPupilDistance(landmarks: FaceLandmarks): number {
    const leftEye = landmarks[LANDMARK_INDEX_LEFT_EYE_OUTER]
    const rightEye = landmarks[LANDMARK_INDEX_RIGHT_EYE_OUTER]

    if (!leftEye || !rightEye) {
      return 0.2 // Fallback safe normalized distance if points are missing
    }

    const dx = rightEye.x - leftEye.x
    const dy = rightEye.y - leftEye.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    return Math.max(dist, 0.05) // Prevent division by zero
  }

  /**
   * Resets the smoothing filter state (e.g. on new session or recalibration)
   */
  public reset(): void {
    this.smoothedDeltaX = 0
    this.smoothedDeltaY = 0
    this.hasPreviousSample = false
  }

  /**
   * Processes raw face landmarks relative to the neutral baseline.
   * Applies distance normalization, dead-zone thresholding, sensitivity scaling,
   * and exponential moving average (EMA) smoothing.
   */
  public process(
    landmarks: FaceLandmarks,
    baseline: NeutralBaseline,
    options: {
      sensitivity: number // 1.0 to 3.0
      smoothing: number // 0.1 to 0.9 (alpha weight)
      deadZonePercent: number // 5 to 30
      verticalGestures: boolean
    }
  ): NormalizedDisplacement {
    const nose = landmarks[LANDMARK_INDEX_NOSE_TIP]
    if (!nose) {
      return {
        deltaX: 0,
        deltaY: 0,
        rawDeltaX: 0,
        rawDeltaY: 0,
        inDeadZone: true,
        magnitude: 0,
      }
    }

    const currentIpd = SignalProcessor.calculateInterPupilDistance(landmarks)
    const baselineIpd = baseline.interPupilDist > 0 ? baseline.interPupilDist : currentIpd

    // Distance scale factor: if user moves closer, currentIpd increases
    const scaleFactor = Math.max(baselineIpd, 0.05)

    // Raw displacement from neutral baseline in normalized coordinates (0 to 1).
    // Optical camera sensor inversion:
    // The webcam sensor faces the user like an observer. When the user physically turns their head
    // to their own LEFT, their nose moves toward the camera sensor's right edge (larger x value).
    // To align physical user head movement with mirrored screen-space and directional controls
    // (where turning left yields negative deltaX to trigger LEFT, and turning right yields positive deltaX to trigger RIGHT),
    // we invert the horizontal difference:
    const rawDiffX = -(nose.x - baseline.noseX)
    const rawDiffY = nose.y - baseline.noseY

    // Normalized by facial scale and amplified by sensitivity multiplier (linear scaling without hidden multipliers)
    const scaledX = (rawDiffX / scaleFactor) * options.sensitivity
    const scaledY = (rawDiffY / scaleFactor) * options.sensitivity

    // Apply Exponential Moving Average (EMA) smoothing filter
    // Alpha: higher = more responsive, lower = smoother
    // We invert the user's smoothing setting so higher smoothing slider = lower alpha
    const alpha = Math.max(0.05, Math.min(0.95, 1.0 - options.smoothing * 0.8))

    if (!this.hasPreviousSample) {
      this.smoothedDeltaX = scaledX
      this.smoothedDeltaY = scaledY
      this.hasPreviousSample = true
    } else {
      this.smoothedDeltaX = alpha * scaledX + (1 - alpha) * this.smoothedDeltaX
      this.smoothedDeltaY = alpha * scaledY + (1 - alpha) * this.smoothedDeltaY
    }

    // Dead-Zone Threshold (percentage converted to displacement threshold)
    // e.g. 10% deadzone -> threshold of 0.10
    const deadZoneThreshold = options.deadZonePercent / 100.0

    const inDeadZoneX = Math.abs(this.smoothedDeltaX) < deadZoneThreshold
    const inDeadZoneY = Math.abs(this.smoothedDeltaY) < deadZoneThreshold

    // Retain true normalized displacement outside dead-zone without subtracting threshold,
    // ensuring activationThreshold operates consistently across dead-zone settings
    const finalX = inDeadZoneX ? 0 : this.smoothedDeltaX
    const finalY = options.verticalGestures ? (inDeadZoneY ? 0 : this.smoothedDeltaY) : 0

    const inDeadZone = inDeadZoneX && (inDeadZoneY || !options.verticalGestures)
    const magnitude = inDeadZone ? 0 : Math.sqrt(finalX * finalX + finalY * finalY)

    return {
      deltaX: finalX,
      deltaY: finalY,
      rawDeltaX: rawDiffX,
      rawDeltaY: rawDiffY,
      inDeadZone,
      magnitude,
    }
  }
}

/**
 * Accumulator for the 2-second calibration sampling window.
 * Gathers frames, filters outliers, and computes the neutral baseline vector (0,0).
 */
export class CalibrationAccumulator {
  private samples: Array<{ noseX: number; noseY: number; ipd: number }> = []

  public reset(): void {
    this.samples = []
  }

  public addSample(landmarks: FaceLandmarks): void {
    const nose = landmarks[LANDMARK_INDEX_NOSE_TIP]
    if (!nose) return

    const ipd = SignalProcessor.calculateInterPupilDistance(landmarks)
    if (ipd < 0.05) return // Ignore corrupt/occluded frames

    this.samples.push({
      noseX: nose.x,
      noseY: nose.y,
      ipd,
    })
  }

  public getSampleCount(): number {
    return this.samples.length
  }

  /**
   * Finalizes the calibration.
   * Requires a minimum number of valid samples (default 20 frames) to ensure quality.
   */
  public finalize(minSamplesRequired: number = 20): {
    baseline: NeutralBaseline | null
    error: string | null
  } {
    if (this.samples.length < minSamplesRequired) {
      return {
        baseline: null,
        error: `Insufficient tracking frames (${this.samples.length}/${minSamplesRequired}). Please face the camera steadily during calibration.`,
      }
    }

    // Compute arithmetic mean for coordinates and scale
    let sumX = 0
    let sumY = 0
    let sumIpd = 0

    for (const sample of this.samples) {
      sumX += sample.noseX
      sumY += sample.noseY
      sumIpd += sample.ipd
    }

    const count = this.samples.length
    const meanX = sumX / count
    const meanY = sumY / count
    const meanIpd = sumIpd / count

    // Check sample variance to detect excessive head shaking during calibration
    let varianceSum = 0
    for (const sample of this.samples) {
      const dx = sample.noseX - meanX
      const dy = sample.noseY - meanY
      varianceSum += dx * dx + dy * dy
    }
    const standardDeviation = Math.sqrt(varianceSum / count)

    // If standard deviation > 0.05 normalized screen units, user was moving excessively
    if (standardDeviation > 0.08) {
      return {
        baseline: null,
        error: 'Too much head movement detected during calibration. Please sit still in your natural resting position and try again.',
      }
    }

    return {
      baseline: {
        noseX: meanX,
        noseY: meanY,
        interPupilDist: meanIpd,
        sampleCount: count,
        timestamp: Date.now(),
      },
      error: null,
    }
  }
}
