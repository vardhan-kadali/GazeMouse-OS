export type Lane = 0 | 1 | 2

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'

export type PauseReason = 'MANUAL' | 'TRACKING_LOST'

export type VerticalState = 'GROUNDED' | 'JUMPING' | 'SLIDING'

export type ObstacleType = 'TRAIN' | 'LOW_BARRIER' | 'HIGH_ARCH'

export interface Player3DState {
  lane: Lane
  targetLane: Lane
  x: number // Current interpolated world X
  y: number // Current elevation Y (0 = track level, >0 = jumping)
  z: number // Player fixed Z plane (0)
  verticalState: VerticalState
  jumpTimer: number // Remaining jump duration
  slideTimer: number // Remaining slide duration
  rollAngle: number // Banking angle when shifting lanes (in radians)
}

export interface Runner3DObstacle {
  id: number
  type: ObstacleType
  lane: Lane
  z: number // World Z position (spawns ahead at +120m, travels towards player at z=0)
  length: number // Extent along Z
  height: number // Extent along Y
  passed: boolean
}

export interface Runner3DCoin {
  id: number
  lane: Lane
  x: number
  y: number
  z: number
  collected: boolean
  pulse: number
  isHigh: boolean // Elevated coin requiring a jump or placed atop a train
}

export interface Runner3DParticle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  color: string
}

export interface Game3DStats {
  score: number
  coins: number
  distance: number
  speed: number // in meters/sec (e.g. 20 to 50)
  highScore: number
}

export interface Game3DEngineOptions {
  initialSpeed?: number
  maxSpeed?: number
  speedIncrement?: number
  reducedMotion?: boolean
}
