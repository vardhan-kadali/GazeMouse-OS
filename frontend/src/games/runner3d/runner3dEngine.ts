import type {
  Lane,
  GameState,
  PauseReason,
  Player3DState,
  Runner3DObstacle,
  Runner3DCoin,
  Runner3DParticle,
  Game3DStats,
  Game3DEngineOptions,
} from './types'
import type { DirectionalAction } from '../../types/tracking'

export const LANE_COORDINATES: Record<Lane, number> = {
  0: -3.5, // Left Track
  1: 0.0,  // Center Track
  2: 3.5,  // Right Track
}

const JUMP_DURATION = 0.75 // seconds
const JUMP_MAX_HEIGHT = 2.2 // meters
const SLIDE_DURATION = 0.75 // seconds
const HIGH_SCORE_KEY = 'gazemouse_runner3d_highscore'

export interface GestureDecision {
  accepted: boolean
  action: DirectionalAction
  reason: string
  timestamp: number
}

export class Runner3DEngine {
  public state: GameState = 'MENU'
  public pauseReason: PauseReason | null = null
  public trackingRestoredDuringPause: boolean = false
  public awaitingNeutral: boolean = false
  public lastDecision: GestureDecision = {
    accepted: false,
    action: 'NONE',
    reason: 'Ready (Awaiting input)',
    timestamp: Date.now(),
  }

  public player: Player3DState
  public obstacles: Runner3DObstacle[] = []
  public coins: Runner3DCoin[] = []
  public particles: Runner3DParticle[] = []

  public stats: Game3DStats = {
    score: 0,
    coins: 0,
    distance: 0,
    speed: 22,
    highScore: 0,
  }

  private options: Required<Game3DEngineOptions>
  private nextObstacleId = 1
  private nextCoinId = 1
  private spawnTimer = 0
  public lastGestureAction: DirectionalAction = 'NONE'

  constructor(options: Game3DEngineOptions = {}) {
    this.options = {
      initialSpeed: options.initialSpeed ?? 22,
      maxSpeed: options.maxSpeed ?? 48,
      speedIncrement: options.speedIncrement ?? 0.35,
      reducedMotion: options.reducedMotion ?? false,
    }

    const startLane: Lane = 1
    this.player = {
      lane: startLane,
      targetLane: startLane,
      x: LANE_COORDINATES[startLane],
      y: 0,
      z: 0,
      verticalState: 'GROUNDED',
      jumpTimer: 0,
      slideTimer: 0,
      rollAngle: 0,
    }

    this.stats.speed = this.options.initialSpeed
    this.stats.highScore = this.loadHighScore()
  }

  public getLaneX(lane: Lane): number {
    return LANE_COORDINATES[lane]
  }

  public start(): void {
    this.reset()
    this.state = 'PLAYING'
    this.pauseReason = null
    this.trackingRestoredDuringPause = false
  }

  public reset(): void {
    const startLane: Lane = 1
    this.player = {
      lane: startLane,
      targetLane: startLane,
      x: LANE_COORDINATES[startLane],
      y: 0,
      z: 0,
      verticalState: 'GROUNDED',
      jumpTimer: 0,
      slideTimer: 0,
      rollAngle: 0,
    }

    this.obstacles = []
    this.coins = []
    this.particles = []

    this.stats = {
      score: 0,
      coins: 0,
      distance: 0,
      speed: this.options.initialSpeed,
      highScore: this.loadHighScore(),
    }

    this.nextObstacleId = 1
    this.nextCoinId = 1
    this.spawnTimer = 0
    this.lastGestureAction = 'NONE'
    this.awaitingNeutral = false
    this.lastDecision = {
      accepted: false,
      action: 'NONE',
      reason: 'Reset (Awaiting input)',
      timestamp: Date.now(),
    }
    this.pauseReason = null
    this.trackingRestoredDuringPause = false
    this.state = 'MENU'
  }

  public pause(reason: PauseReason = 'MANUAL'): void {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED'
      this.pauseReason = reason
      this.trackingRestoredDuringPause = false
    }
  }

  public resume(): void {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING'
      this.pauseReason = null
      this.trackingRestoredDuringPause = false
      this.awaitingNeutral = true
    }
  }

  public handleTrackingLoss(): void {
    if (this.state === 'PLAYING') {
      this.pause('TRACKING_LOST')
    }
  }

  public handleTrackingRecovery(): void {
    // Critical accessibility safeguard: NEVER auto-resume when tracking recovers!
    if (this.state === 'PAUSED' && this.pauseReason === 'TRACKING_LOST') {
      this.trackingRestoredDuringPause = true
    }
  }

  public moveLeft(): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.player.targetLane > 0) {
      this.player.targetLane = (this.player.targetLane - 1) as Lane
      return true
    }
    return false
  }

  public moveRight(): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.player.targetLane < 2) {
      this.player.targetLane = (this.player.targetLane + 1) as Lane
      return true
    }
    return false
  }

  public jump(): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.player.verticalState === 'GROUNDED') {
      this.player.verticalState = 'JUMPING'
      this.player.jumpTimer = JUMP_DURATION
      this.player.slideTimer = 0
      return true
    }
    return false
  }

  public slide(): boolean {
    if (this.state !== 'PLAYING') return false
    if (this.player.verticalState === 'JUMPING') {
      // Fast drop cancellation into slide
      this.player.verticalState = 'SLIDING'
      this.player.y = 0
      this.player.jumpTimer = 0
      this.player.slideTimer = SLIDE_DURATION
      return true
    }
    if (this.player.verticalState === 'GROUNDED') {
      this.player.verticalState = 'SLIDING'
      this.player.slideTimer = SLIDE_DURATION
      return true
    }
    return false
  }

  /**
   * Edge-triggered gesture input handler with hysteresis return-to-neutral re-arming.
   * Requires user to return to center neutral zone before triggering another lane shift.
   */
  public handleGestureAction(
    action: DirectionalAction,
    deltaX: number = 0,
    inDeadZone: boolean = false,
    verticalGesturesEnabled: boolean = false
  ): boolean {
    if (this.state !== 'PLAYING') {
      this.lastDecision = {
        accepted: false,
        action,
        reason: `Ignored: game state is ${this.state}`,
        timestamp: Date.now(),
      }
      return false
    }

    // Return-to-neutral re-arming check:
    // Re-arms whenever the user's head returns to the center neutral zone
    const isNeutral = inDeadZone || Math.abs(deltaX) < 0.10 || deltaX === 0
    if (this.awaitingNeutral) {
      if (isNeutral) {
        this.awaitingNeutral = false
        this.lastGestureAction = 'NONE'
        this.lastDecision = {
          accepted: false,
          action: 'NONE',
          reason: 'Re-armed: returned to neutral center',
          timestamp: Date.now(),
        }
        return false
      } else {
        // Sustained deflected pose: do not trigger repeated actions
        this.lastDecision = {
          accepted: false,
          action,
          reason: 'Holding deflected pose: awaiting return to neutral center',
          timestamp: Date.now(),
        }
        return false
      }
    }

    // STRICT REQUIREMENT 4:
    // "No raw-coordinate bypass: Gaze3DRunner must not independently infer LEFT/RIGHT from deltaX
    // when the shared classifier reports NONE or when the signal is inside the neutral/dead zone."
    if (inDeadZone) {
      this.lastDecision = {
        accepted: false,
        action: 'NONE',
        reason: 'Neutral: inside center dead-zone',
        timestamp: Date.now(),
      }
      return false
    }

    if (action === 'NONE') {
      return false
    }

    let executed = false
    if (action === 'LEFT') {
      executed = this.moveLeft()
      if (executed) {
        this.awaitingNeutral = true
        this.lastGestureAction = 'LEFT'
        this.lastDecision = {
          accepted: true,
          action: 'LEFT',
          reason: `Accepted: shifted LEFT to lane ${this.player.targetLane}`,
          timestamp: Date.now(),
        }
      } else {
        this.lastDecision = {
          accepted: false,
          action: 'LEFT',
          reason: 'Boundary: already in leftmost lane (0)',
          timestamp: Date.now(),
        }
      }
    } else if (action === 'RIGHT') {
      executed = this.moveRight()
      if (executed) {
        this.awaitingNeutral = true
        this.lastGestureAction = 'RIGHT'
        this.lastDecision = {
          accepted: true,
          action: 'RIGHT',
          reason: `Accepted: shifted RIGHT to lane ${this.player.targetLane}`,
          timestamp: Date.now(),
        }
      } else {
        this.lastDecision = {
          accepted: false,
          action: 'RIGHT',
          reason: 'Boundary: already in rightmost lane (2)',
          timestamp: Date.now(),
        }
      }
    } else if (verticalGesturesEnabled && action === 'UP') {
      executed = this.jump()
      if (executed) {
        this.awaitingNeutral = true
        this.lastGestureAction = 'UP'
        this.lastDecision = {
          accepted: true,
          action: 'UP',
          reason: 'Accepted: bonus Jump executed',
          timestamp: Date.now(),
        }
      } else {
        this.lastDecision = {
          accepted: false,
          action: 'UP',
          reason: 'Rejected: already airborne',
          timestamp: Date.now(),
        }
      }
    } else if (verticalGesturesEnabled && action === 'DOWN') {
      executed = this.slide()
      if (executed) {
        this.awaitingNeutral = true
        this.lastGestureAction = 'DOWN'
        this.lastDecision = {
          accepted: true,
          action: 'DOWN',
          reason: 'Accepted: bonus Slide executed',
          timestamp: Date.now(),
        }
      } else {
        this.lastDecision = {
          accepted: false,
          action: 'DOWN',
          reason: 'Rejected: cannot slide while airborne',
          timestamp: Date.now(),
        }
      }
    } else if (!verticalGesturesEnabled && (action === 'UP' || action === 'DOWN')) {
      this.lastDecision = {
        accepted: false,
        action,
        reason: `Ignored: vertical gesture (${action}) disabled in settings`,
        timestamp: Date.now(),
      }
    }

    return executed
  }

  public update(dtSeconds: number): void {
    if (this.state !== 'PLAYING') return

    // Cap total elapsed time to prevent unbounded lag spikes (max 1.0s)
    let remaining = Math.min(dtSeconds, 1.0)
    const stepSize = 0.05

    while (remaining > 0 && this.state === 'PLAYING') {
      const dt = Math.min(remaining, stepSize)
      this.step(dt)
      remaining -= dt
    }
  }

  private step(dt: number): void {
    // 1. Advance distance and score
    this.stats.distance += this.stats.speed * dt
    this.stats.score += Math.round(dt * 20)

    // 2. Gradually increase speed
    if (this.stats.speed < this.options.maxSpeed) {
      this.stats.speed += this.options.speedIncrement * dt
    }

    // 3. Smooth lateral lane interpolation & roll banking
    const targetX = LANE_COORDINATES[this.player.targetLane]
    const lerpSpeed = this.options.reducedMotion ? 24.0 : 12.0
    const dx = targetX - this.player.x
    this.player.x += dx * Math.min(1, lerpSpeed * dt)

    if (Math.abs(dx) < 0.05) {
      this.player.x = targetX
      this.player.lane = this.player.targetLane
      this.player.rollAngle = 0
    } else if (!this.options.reducedMotion) {
      // Tilt into the turn: moving left rolls left (-), moving right rolls right (+)
      const targetRoll = dx < 0 ? -0.22 : 0.22
      this.player.rollAngle += (targetRoll - this.player.rollAngle) * Math.min(1, 15.0 * dt)
    }

    // 4. Update vertical state (Jump / Slide)
    if (this.player.verticalState === 'JUMPING') {
      this.player.jumpTimer -= dt
      if (this.player.jumpTimer <= 0) {
        this.player.verticalState = 'GROUNDED'
        this.player.jumpTimer = 0
        this.player.y = 0
      } else {
        // Smooth parabolic jump arc: 4 * H * (t / T) * (1 - t / T)
        const progress = 1 - this.player.jumpTimer / JUMP_DURATION
        this.player.y = Math.sin(progress * Math.PI) * JUMP_MAX_HEIGHT
      }
    } else if (this.player.verticalState === 'SLIDING') {
      this.player.slideTimer -= dt
      this.player.y = 0
      if (this.player.slideTimer <= 0) {
        this.player.verticalState = 'GROUNDED'
        this.player.slideTimer = 0
      }
    } else {
      this.player.y = 0
    }

    // 5. Spawn obstacle & coin waves
    this.spawnTimer += dt
    // Interval scales with speed so distance between waves remains reasonable
    const spawnInterval = Math.max(1.8, 3.2 - (this.stats.speed - this.options.initialSpeed) / 20)

    if (this.spawnTimer >= spawnInterval) {
      this.spawnWave()
      this.spawnTimer = 0
    }

    // 6. Update obstacles (travel toward player at Z=0)
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i]
      obs.z -= this.stats.speed * dt

      // Collision check with player at Z=0
      if (!obs.passed && this.checkObstacleCollision(obs)) {
        this.gameOver()
        return
      }

      // Passed check
      if (obs.z + obs.length / 2 < -5 && !obs.passed) {
        obs.passed = true
        this.stats.score += 50
      }

      // Remove off-screen obstacles behind camera
      if (obs.z + obs.length / 2 < -25) {
        this.obstacles.splice(i, 1)
      }
    }

    // 7. Update coins & collection
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]
      coin.z -= this.stats.speed * dt
      coin.pulse += dt * 4

      if (!coin.collected && this.checkCoinCollection(coin)) {
        coin.collected = true
        this.stats.coins += 1
        this.stats.score += 100
        this.spawnCoinParticles(coin.x, coin.y, coin.z)
      }

      // Remove off-screen coins
      if (coin.z < -20) {
        this.coins.splice(i, 1)
      }
    }

    // 8. Update particle systems
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.life += dt
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
      }
    }
  }

  /**
   * Spawns an obstacle wave with GUARANTEED safe passage.
   * At least one lane is strictly kept free of any obstacle.
   */
  public spawnWave(): void {
    const spawnZ = 120 // 120 meters ahead

    // Randomly select 1 lane that is GUARANTEED to be completely clear
    const safeLane = Math.floor(Math.random() * 3) as Lane
    const remainingLanes: Lane[] = ([0, 1, 2] as Lane[]).filter((l) => l !== safeLane)

    // In remaining lanes, decide obstacle types
    const waveType = Math.random()

    if (waveType < 0.45) {
      // Single obstacle on one remaining lane (very forgiving, 2 lanes open)
      const targetLane = remainingLanes[Math.floor(Math.random() * remainingLanes.length)]
      const obsType = Math.random() < 0.6 ? 'TRAIN' : Math.random() < 0.8 ? 'LOW_BARRIER' : 'HIGH_ARCH'
      this.createObstacle(obsType, targetLane, spawnZ)
    } else {
      // Two obstacles across the 2 remaining lanes (safeLane is STILL completely clear)
      const typeA = Math.random() < 0.6 ? 'TRAIN' : 'LOW_BARRIER'
      const typeB = Math.random() < 0.5 ? 'TRAIN' : 'HIGH_ARCH'
      this.createObstacle(typeA, remainingLanes[0], spawnZ)
      this.createObstacle(typeB, remainingLanes[1], spawnZ)
    }

    // Spawn a line of collectible coins along the safe lane or over low obstacles
    this.spawnCoinArc(safeLane, spawnZ)
  }

  private createObstacle(type: Runner3DObstacle['type'], lane: Lane, z: number): void {
    let length = 1.0
    let height = 1.0

    if (type === 'TRAIN') {
      length = 14.0 // 14 meter long train pod
      height = 3.2
    } else if (type === 'LOW_BARRIER') {
      length = 1.0
      height = 0.9 // Low hurdle
    } else if (type === 'HIGH_ARCH') {
      length = 1.2
      height = 2.6 // Overhead clearance sign
    }

    this.obstacles.push({
      id: this.nextObstacleId++,
      type,
      lane,
      z,
      length,
      height,
      passed: false,
    })
  }

  private spawnCoinArc(lane: Lane, baseZ: number): void {
    const laneX = LANE_COORDINATES[lane]
    const count = 5
    const spacing = 4.0

    for (let i = 0; i < count; i++) {
      this.coins.push({
        id: this.nextCoinId++,
        lane,
        x: laneX,
        y: 1.0, // Standard floating height
        z: baseZ + i * spacing,
        collected: false,
        pulse: i * 0.5,
        isHigh: false,
      })
    }
  }

  /**
   * 3D AABB Collision Check between Player and Obstacle
   */
  public checkObstacleCollision(obs: Runner3DObstacle): boolean {
    // 1. Z-axis overlap check (player is at Z=0, extent ~0.8m)
    const playerHalfDepth = 0.7
    const obsHalfDepth = obs.length / 2
    const zOverlap = Math.abs(this.player.z - obs.z) < (playerHalfDepth + obsHalfDepth)

    if (!zOverlap) return false

    // 2. X-axis lane overlap check
    const laneX = LANE_COORDINATES[obs.lane]
    const playerHalfWidth = 0.8
    const obsHalfWidth = 1.2
    const xOverlap = Math.abs(this.player.x - laneX) < (playerHalfWidth + obsHalfWidth)

    if (!xOverlap) return false

    // 3. Y-axis vertical interaction check
    if (obs.type === 'TRAIN') {
      // Trains cannot be cleared by jump or slide at ground level
      return true
    }

    if (obs.type === 'LOW_BARRIER') {
      // Barrier height is 0.9m. If player jumps high enough (y >= 1.0m), collision is avoided!
      if (this.player.y >= 0.95) {
        return false // Safe jump over hurdle!
      }
      return true // Hit barrier
    }

    if (obs.type === 'HIGH_ARCH') {
      // High arch bar begins at Y=1.2m. If player is sliding (height <= 0.7m), collision is avoided!
      if (this.player.verticalState === 'SLIDING') {
        return false // Safe slide under arch!
      }
      return true // Hit overhead beam
    }

    return false
  }

  public checkCoinCollection(coin: Runner3DCoin): boolean {
    const dx = this.player.x - coin.x
    const dy = this.player.y - coin.y
    const dz = this.player.z - coin.z
    const distSq = dx * dx + dy * dy + dz * dz

    // Pickup radius ~ 1.8 meters
    return distSq < 3.24
  }

  private spawnCoinParticles(x: number, y: number, z: number): void {
    if (this.options.reducedMotion) return
    const count = 8
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count
      const speed = 3.5 + Math.random() * 2.5
      this.particles.push({
        x,
        y: y + 0.5,
        z,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2.0,
        vz: (Math.random() - 0.5) * speed,
        life: 0,
        maxLife: 0.45,
        color: '#facc15',
      })
    }
  }

  public gameOver(): void {
    this.state = 'GAME_OVER'
    this.pauseReason = null
    if (this.stats.score > this.stats.highScore) {
      this.stats.highScore = this.stats.score
      this.saveHighScore(this.stats.highScore)
    }
  }

  private loadHighScore(): number {
    try {
      const saved = localStorage.getItem(HIGH_SCORE_KEY)
      return saved ? parseInt(saved, 10) || 0 : 0
    } catch {
      return 0
    }
  }

  private saveHighScore(score: number): void {
    try {
      localStorage.setItem(HIGH_SCORE_KEY, score.toString())
    } catch {
      // Ignore localStorage access failures
    }
  }
}
