import type {
  Lane,
  GameState,
  PauseReason,
  RunnerObstacle,
  RunnerCoin,
  RunnerParticle,
  PlayerState,
  GameStats,
  GameEngineOptions,
} from './types'
import type { DirectionalAction } from '../../types/tracking'

export class RunnerEngine {
  public state: GameState = 'MENU'
  public pauseReason: PauseReason | null = null
  public trackingRestoredDuringPause: boolean = false

  public player: PlayerState
  public obstacles: RunnerObstacle[] = []
  public coins: RunnerCoin[] = []
  public particles: RunnerParticle[] = []

  public stats: GameStats = {
    score: 0,
    coins: 0,
    distance: 0,
    speed: 300,
    highScore: 0,
  }

  private options: Required<GameEngineOptions>
  private nextObstacleId = 1
  private nextCoinId = 1
  private spawnTimer = 0
  private lastGestureAction: DirectionalAction = 'NONE'

  constructor(options: GameEngineOptions) {
    this.options = {
      trackHeight: options.trackHeight,
      trackWidth: options.trackWidth,
      initialSpeed: options.initialSpeed ?? 300,
      maxSpeed: options.maxSpeed ?? 620,
      speedIncrement: options.speedIncrement ?? 6, // Pixels/sec increase per 5 seconds
      reducedMotion: options.reducedMotion ?? false,
    }

    const startLane: Lane = 1 // Middle lane
    const startX = this.getLaneCenterX(startLane)
    const playerY = this.options.trackHeight - 110

    this.player = {
      lane: startLane,
      targetLane: startLane,
      currentX: startX,
      y: playerY,
      width: 44,
      height: 60,
    }

    this.stats.speed = this.options.initialSpeed
    this.stats.highScore = this.loadHighScore()
  }

  public getLaneCenterX(lane: Lane): number {
    const laneWidth = this.options.trackWidth / 3
    return laneWidth * lane + laneWidth / 2
  }

  public start(): void {
    this.reset()
    this.state = 'PLAYING'
    this.pauseReason = null
    this.trackingRestoredDuringPause = false
  }

  public reset(): void {
    const startLane: Lane = 1
    const startX = this.getLaneCenterX(startLane)

    this.player = {
      lane: startLane,
      targetLane: startLane,
      currentX: startX,
      y: this.options.trackHeight - 110,
      width: 44,
      height: 60,
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
    this.pauseReason = null
    this.trackingRestoredDuringPause = false
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
    }
  }

  public handleTrackingLoss(): void {
    if (this.state === 'PLAYING') {
      this.pause('TRACKING_LOST')
    }
  }

  public handleTrackingRecovery(): void {
    // Crucial accessibility requirement: NEVER auto-resume when tracking recovers!
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

  /**
   * Processes head-gesture action. Requires edge trigger so holding a turn gesture
   * does not continuously shift across multiple lanes.
   */
  public handleGestureAction(action: DirectionalAction): boolean {
    if (this.state !== 'PLAYING') return false

    let shifted = false

    if (action === 'LEFT' && this.lastGestureAction !== 'LEFT') {
      shifted = this.moveLeft()
    } else if (action === 'RIGHT' && this.lastGestureAction !== 'RIGHT') {
      shifted = this.moveRight()
    }

    this.lastGestureAction = action
    return shifted
  }

  public update(dtSeconds: number): void {
    if (this.state !== 'PLAYING') return

    // Cap delta time to prevent physics tunneling on lag spikes
    const dt = Math.min(dtSeconds, 0.1)

    // 1. Advance distance and score
    this.stats.distance += (this.stats.speed * dt) / 10
    this.stats.score += Math.round(dt * 15)

    // 2. Gradually increase difficulty
    if (this.stats.speed < this.options.maxSpeed) {
      this.stats.speed += this.options.speedIncrement * dt
    }

    // 3. Smooth lateral lane interpolation
    const targetX = this.getLaneCenterX(this.player.targetLane)
    const lerpRate = this.options.reducedMotion ? 25.0 : 14.0
    this.player.currentX += (targetX - this.player.currentX) * Math.min(1, lerpRate * dt)

    // Snap to lane if very close
    if (Math.abs(targetX - this.player.currentX) < 1.0) {
      this.player.currentX = targetX
      this.player.lane = this.player.targetLane
    }

    // 4. Spawn obstacle & coin waves
    this.spawnTimer += dt
    // Interval shortens slightly as speed increases
    const spawnInterval = Math.max(1.3, 2.3 - (this.stats.speed - this.options.initialSpeed) / 400)

    if (this.spawnTimer >= spawnInterval) {
      this.spawnWave()
      this.spawnTimer = 0
    }

    // 5. Update obstacle positions
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i]
      obs.y += this.stats.speed * dt

      // Collision check with player
      if (!obs.passed && this.checkObstacleCollision(obs)) {
        this.gameOver()
        return
      }

      // Mark as passed if behind player
      if (obs.y > this.player.y + this.player.height && !obs.passed) {
        obs.passed = true
        this.stats.score += 25
      }

      // Remove off-screen obstacles
      if (obs.y > this.options.trackHeight + 50) {
        this.obstacles.splice(i, 1)
      }
    }

    // 6. Update coin positions & collect
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i]
      coin.y += this.stats.speed * dt
      coin.pulse += dt * 5

      if (!coin.collected && this.checkCoinCollection(coin)) {
        coin.collected = true
        this.stats.coins += 1
        this.stats.score += 75
        this.spawnCoinParticles(this.getLaneCenterX(coin.lane), coin.y)
      }

      // Remove off-screen coins
      if (coin.y > this.options.trackHeight + 50) {
        this.coins.splice(i, 1)
      }
    }

    // 7. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life += dt
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
      }
    }
  }

  private spawnWave(): void {
    // Guarantees at least 1 lane is safe and passable!
    const safeLane = Math.floor(Math.random() * 3) as Lane
    const blockedLanes: Lane[] = [0, 1, 2].filter((l) => l !== safeLane) as Lane[]

    // Randomly block 1 or 2 lanes
    const numBlockers = Math.random() < 0.65 ? 1 : 2
    const lanesToBlock = blockedLanes.slice(0, numBlockers)

    for (const lane of lanesToBlock) {
      this.obstacles.push({
        id: this.nextObstacleId++,
        lane,
        y: -60,
        width: 50,
        height: 40,
        passed: false,
      })
    }

    // Place a coin in the safe lane or non-blocked lane
    this.coins.push({
      id: this.nextCoinId++,
      lane: safeLane,
      y: -50,
      radius: 12,
      collected: false,
      pulse: 0,
    })
  }

  private checkObstacleCollision(obs: RunnerObstacle): boolean {
    const obsCenterX = this.getLaneCenterX(obs.lane)
    const obsLeft = obsCenterX - obs.width / 2
    const obsRight = obsCenterX + obs.width / 2
    const obsTop = obs.y
    const obsBottom = obs.y + obs.height

    // Player bounding box with 5px accessibility forgiveness
    const playerPadding = 6
    const playerLeft = this.player.currentX - this.player.width / 2 + playerPadding
    const playerRight = this.player.currentX + this.player.width / 2 - playerPadding
    const playerTop = this.player.y + playerPadding
    const playerBottom = this.player.y + this.player.height - playerPadding

    return (
      playerLeft < obsRight &&
      playerRight > obsLeft &&
      playerTop < obsBottom &&
      playerBottom > obsTop
    )
  }

  private checkCoinCollection(coin: RunnerCoin): boolean {
    const coinCenterX = this.getLaneCenterX(coin.lane)
    const coinCenterY = coin.y
    const playerCenterY = this.player.y + this.player.height / 2

    const dx = this.player.currentX - coinCenterX
    const dy = playerCenterY - coinCenterY
    const distSq = dx * dx + dy * dy

    const collisionDist = this.player.width / 2 + coin.radius + 4
    return distSq < collisionDist * collisionDist
  }

  private spawnCoinParticles(x: number, y: number): void {
    if (this.options.reducedMotion) return

    const colors = ['#facc15', '#38bdf8', '#ffffff']
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.4
      const speed = 70 + Math.random() * 90
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        color: colors[i % colors.length],
        size: 3 + Math.random() * 2,
      })
    }
  }

  private gameOver(): void {
    this.state = 'GAME_OVER'
    if (this.stats.score > this.stats.highScore) {
      this.stats.highScore = this.stats.score
      this.saveHighScore(this.stats.score)
    }
  }

  private loadHighScore(): number {
    try {
      const stored = localStorage.getItem('gazemouse_runner_highscore_v1')
      return stored ? parseInt(stored, 10) || 0 : 0
    } catch {
      return 0
    }
  }

  private saveHighScore(score: number): void {
    try {
      localStorage.setItem('gazemouse_runner_highscore_v1', score.toString())
    } catch {
      // Storage unavailable fallback
    }
  }
}
