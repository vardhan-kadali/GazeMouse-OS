export interface Landmark {
  x: number
  y: number
  z: number
}

export type FaceLandmarks = Landmark[]

export interface NeutralBaseline {
  noseX: number
  noseY: number
  interPupilDist: number
  sampleCount: number
  timestamp: number
}

export interface NormalizedDisplacement {
  deltaX: number // Signed normalized displacement: negative = user left, positive = user right
  deltaY: number // Signed normalized displacement: negative = user up, positive = user down
  rawDeltaX: number
  rawDeltaY: number
  inDeadZone: boolean
  magnitude: number
}

export type DirectionalAction = 'NONE' | 'LEFT' | 'RIGHT' | 'UP' | 'DOWN'

export type TrackingStatus =
  | 'OFF'
  | 'INITIALIZING'
  | 'ACTIVE'
  | 'TRACKING_LOST'
  | 'PERMISSION_DENIED'
  | 'UNAVAILABLE'
  | 'ERROR'

export type CalibrationState =
  | 'IDLE'
  | 'PREPARING' // 3-second visual countdown
  | 'SAMPLING'  // 2-second frame accumulation
  | 'SUCCESS'
  | 'FAILED'

export interface CalibrationProgress {
  state: CalibrationState
  countdownSeconds: number // 3, 2, 1
  samplingPercent: number  // 0 to 100
  sampleCount: number
  errorMessage: string | null
}

export interface TrackingData {
  status: TrackingStatus
  errorMessage: string | null
  landmarks: FaceLandmarks | null
  baseline: NeutralBaseline | null
  displacement: NormalizedDisplacement
  action: DirectionalAction
  calibration: CalibrationProgress
  fps: number
  facePresent: boolean
}

export const INITIAL_DISPLACEMENT: NormalizedDisplacement = {
  deltaX: 0,
  deltaY: 0,
  rawDeltaX: 0,
  rawDeltaY: 0,
  inDeadZone: true,
  magnitude: 0,
}

export const INITIAL_CALIBRATION: CalibrationProgress = {
  state: 'IDLE',
  countdownSeconds: 3,
  samplingPercent: 0,
  sampleCount: 0,
  errorMessage: null,
}

export const INITIAL_TRACKING_DATA: TrackingData = {
  status: 'OFF',
  errorMessage: null,
  landmarks: null,
  baseline: null,
  displacement: INITIAL_DISPLACEMENT,
  action: 'NONE',
  calibration: INITIAL_CALIBRATION,
  fps: 0,
  facePresent: false,
}
