export type Lane = 0 | 1 | 2 // 0: Left, 1: Middle, 2: Right

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'

export type PauseReason = 'MANUAL' | 'TRACKING_LOST'

export interface RunnerObstacle {
  id: number
  lane: Lane
  y: number // Distance down the track in pixels (0 is spawn at top, ~550 is player zone)
  width: number
  height: number
  passed: boolean
}

export interface RunnerCoin {
  id: number
  lane: Lane
  y: number
  radius: number
  collected: boolean
  pulse: number
}

export interface RunnerParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface PlayerState {
  lane: Lane
  targetLane: Lane
  currentX: number // Interpolated X coordinate across lanes
  y: number
  width: number
  height: number
}

export interface GameStats {
  score: number
  coins: number
  distance: number
  speed: number
  highScore: number
}

export interface GameEngineOptions {
  trackHeight: number
  trackWidth: number
  initialSpeed?: number // Pixels per second
  maxSpeed?: number
  speedIncrement?: number
  reducedMotion?: boolean
}
