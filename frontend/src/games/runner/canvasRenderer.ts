import type { RunnerEngine } from './gameEngine'

export class RunnerRenderer {
  private ctx: CanvasRenderingContext2D
  private width: number
  private height: number
  private roadOffset: number = 0

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.ctx = ctx
    this.width = width
    this.height = height
  }

  public setSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  public render(engine: RunnerEngine, dtSeconds: number): void {
    const ctx = this.ctx
    const w = this.width
    const h = this.height

    ctx.clearRect(0, 0, w, h)

    // 1. Draw Road Background
    this.drawTrack(engine, dtSeconds)

    // 2. Draw Collectible Coins
    this.drawCoins(engine)

    // 3. Draw Obstacles
    this.drawObstacles(engine)

    // 4. Draw Particles
    this.drawParticles(engine)

    // 5. Draw Player Avatar
    this.drawPlayer(engine)
  }

  private drawTrack(engine: RunnerEngine, dtSeconds: number): void {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    const laneWidth = w / 3

    // Dark sleek cyber track surface
    const gradient = ctx.createLinearGradient(0, 0, 0, h)
    gradient.addColorStop(0, '#0f172a') // Slate 900
    gradient.addColorStop(1, '#1e293b') // Slate 800
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)

    // Outer track borders (Electric Blue)
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 0, w - 4, h)

    // Animated dashed lane dividers
    if (engine.state === 'PLAYING') {
      this.roadOffset = (this.roadOffset + engine.stats.speed * dtSeconds) % 60
    }

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    ctx.lineWidth = 3
    ctx.setLineDash([30, 30])
    ctx.lineDashOffset = -this.roadOffset

    // Divider 1 (between lane 0 and 1)
    ctx.beginPath()
    ctx.moveTo(laneWidth, 0)
    ctx.lineTo(laneWidth, h)
    ctx.stroke()

    // Divider 2 (between lane 1 and 2)
    ctx.beginPath()
    ctx.moveTo(laneWidth * 2, 0)
    ctx.lineTo(laneWidth * 2, h)
    ctx.stroke()

    ctx.setLineDash([]) // Reset
  }

  private drawCoins(engine: RunnerEngine): void {
    const ctx = this.ctx

    for (const coin of engine.coins) {
      if (coin.collected) continue

      const x = engine.getLaneCenterX(coin.lane)
      const y = coin.y

      ctx.save()
      ctx.translate(x, y)

      // Outer golden glow
      const glow = Math.sin(coin.pulse) * 3
      ctx.fillStyle = 'rgba(250, 204, 21, 0.25)'
      ctx.beginPath()
      ctx.arc(0, 0, coin.radius + 6 + glow, 0, Math.PI * 2)
      ctx.fill()

      // Main Coin Body
      const coinGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, coin.radius)
      coinGrad.addColorStop(0, '#fef08a')
      coinGrad.addColorStop(0.7, '#eab308')
      coinGrad.addColorStop(1, '#ca8a04')

      ctx.fillStyle = coinGrad
      ctx.beginPath()
      ctx.arc(0, 0, coin.radius, 0, Math.PI * 2)
      ctx.fill()

      // Inner Star / Gem symbol
      ctx.strokeStyle = '#713f12'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(0, 0, 4, 0, Math.PI * 2)
      ctx.fill()

      ctx.restore()
    }
  }

  private drawObstacles(engine: RunnerEngine): void {
    const ctx = this.ctx

    for (const obs of engine.obstacles) {
      const centerX = engine.getLaneCenterX(obs.lane)
      const x = centerX - obs.width / 2
      const y = obs.y
      const r = 8 // corner radius

      ctx.save()

      // Shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
      ctx.beginPath()
      ctx.roundRect(x + 3, y + 4, obs.width, obs.height, r)
      ctx.fill()

      // Red/Amber Hazard Base
      const obsGrad = ctx.createLinearGradient(x, y, x, y + obs.height)
      obsGrad.addColorStop(0, '#ef4444')
      obsGrad.addColorStop(1, '#b91c1c')

      ctx.fillStyle = obsGrad
      ctx.beginPath()
      ctx.roundRect(x, y, obs.width, obs.height, r)
      ctx.fill()

      // Diagonal Hazard Stripes (Yellow/Black)
      ctx.save()
      ctx.clip() // Clip stripes within rounded rectangle
      ctx.strokeStyle = '#facc15'
      ctx.lineWidth = 6
      for (let sx = -obs.height; sx < obs.width + obs.height; sx += 14) {
        ctx.beginPath()
        ctx.moveTo(x + sx, y)
        ctx.lineTo(x + sx + obs.height, y + obs.height)
        ctx.stroke()
      }
      ctx.restore()

      // Border
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.roundRect(x, y, obs.width, obs.height, r)
      ctx.stroke()

      ctx.restore()
    }
  }

  private drawParticles(engine: RunnerEngine): void {
    const ctx = this.ctx

    for (const p of engine.particles) {
      const alpha = 1.0 - p.life / p.maxLife
      ctx.fillStyle = p.color
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.globalAlpha = 1.0
  }

  private drawPlayer(engine: RunnerEngine): void {
    const ctx = this.ctx
    const p = engine.player

    ctx.save()
    ctx.translate(p.currentX, p.y + p.height / 2)

    // Slight lateral tilt when transitioning lanes
    const targetX = engine.getLaneCenterX(p.targetLane)
    const tilt = (targetX - p.currentX) * 0.002
    ctx.rotate(tilt)

    const w = p.width
    const h = p.height

    // Thruster Jet Flame
    if (engine.state === 'PLAYING') {
      const flameHeight = 16 + Math.random() * 8
      const flameGrad = ctx.createLinearGradient(0, h / 2, 0, h / 2 + flameHeight)
      flameGrad.addColorStop(0, '#38bdf8')
      flameGrad.addColorStop(0.6, '#0284c7')
      flameGrad.addColorStop(1, 'transparent')

      ctx.fillStyle = flameGrad
      ctx.beginPath()
      ctx.moveTo(-10, h / 2 - 4)
      ctx.lineTo(0, h / 2 + flameHeight)
      ctx.lineTo(10, h / 2 - 4)
      ctx.closePath()
      ctx.fill()
    }

    // Shadow below craft
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    ctx.ellipse(0, h / 2 + 6, w / 2, 8, 0, 0, Math.PI * 2)
    ctx.fill()

    // Craft Outer Hull (Aerodynamic Shield)
    const hullGrad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2)
    hullGrad.addColorStop(0, '#2563eb') // Primary Blue
    hullGrad.addColorStop(0.5, '#1d4ed8')
    hullGrad.addColorStop(1, '#1e3a8a') // Deep Blue

    ctx.fillStyle = hullGrad
    ctx.beginPath()
    ctx.moveTo(0, -h / 2) // Nose tip
    ctx.lineTo(w / 2, h / 4)
    ctx.lineTo(w / 2 - 6, h / 2)
    ctx.lineTo(-w / 2 + 6, h / 2)
    ctx.lineTo(-w / 2, h / 4)
    ctx.closePath()
    ctx.fill()

    // Cyan High-tech Wing accents
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 2
    ctx.stroke()

    // Glowing Visor / Cockpit
    const visorGrad = ctx.createLinearGradient(0, -h / 4, 0, 0)
    visorGrad.addColorStop(0, '#e0f2fe')
    visorGrad.addColorStop(1, '#0284c7')

    ctx.fillStyle = visorGrad
    ctx.beginPath()
    ctx.ellipse(0, -h / 6, 12, 8, 0, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()

    ctx.restore()
  }
}
