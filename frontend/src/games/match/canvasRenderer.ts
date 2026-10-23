import type {
  MatchBoard,
  GridPosition,
  DwellState,
  CursorPosition,
  MatchParticle,
} from './types'
import { TILE_DEFINITIONS } from './types'
import type { MatchEngine } from './matchEngine'

export class MatchRenderer {
  private ctx: CanvasRenderingContext2D
  private width: number
  private height: number
  private particles: MatchParticle[] = []
  private reducedMotion: boolean = false

  constructor(ctx: CanvasRenderingContext2D, width: number, height: number, reducedMotion: boolean = false) {
    this.ctx = ctx
    this.width = width
    this.height = height
    this.reducedMotion = reducedMotion
  }

  public setSize(width: number, height: number): void {
    this.width = width
    this.height = height
  }

  public setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
  }

  public spawnParticlesForTiles(positions: GridPosition[]): void {
    if (this.reducedMotion) return

    const cellWidth = this.width / 6
    const cellHeight = this.height / 6

    for (const pos of positions) {
      const cx = pos.col * cellWidth + cellWidth / 2
      const cy = pos.row * cellHeight + cellHeight / 2
      const colors = ['#38bdf8', '#facc15', '#4ade80', '#c084fc', '#ffffff']

      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8 + Math.random() * 0.4
        const speed = 60 + Math.random() * 80
        this.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 0.35 + Math.random() * 0.2,
          color: colors[i % colors.length],
          size: 3 + Math.random() * 3,
        })
      }
    }
  }

  public render(
    engine: MatchEngine,
    selectedTile: GridPosition | null,
    focusedTile: GridPosition | null,
    cursor: CursorPosition | null,
    dwell: DwellState | null,
    dtSeconds: number = 0.016
  ): void {
    const ctx = this.ctx
    const w = this.width
    const h = this.height
    const cellW = w / engine.cols
    const cellH = h / engine.rows

    ctx.clearRect(0, 0, w, h)

    // 1. Draw Sleek Board Background
    this.drawBoardBackground(w, h, engine.rows, engine.cols, cellW, cellH)

    // 2. Draw Tiles
    this.drawTiles(engine.board, cellW, cellH)

    // 3. Highlight Valid Orthogonal Neighbors if Source Tile Selected
    if (selectedTile) {
      this.drawNeighborHighlights(selectedTile, engine.rows, engine.cols, cellW, cellH)
    }

    // 4. Highlight Selected Source Tile
    if (selectedTile) {
      this.drawSelectedTileHalo(selectedTile, cellW, cellH)
    }

    // 5. Highlight Keyboard-Focused Tile
    if (focusedTile && (!selectedTile || focusedTile.row !== selectedTile.row || focusedTile.col !== selectedTile.col)) {
      this.drawFocusedTileBox(focusedTile, cellW, cellH)
    }

    // 6. Draw Match Particles
    if (!this.reducedMotion) {
      this.updateAndDrawParticles(dtSeconds)
    }

    // 7. Draw Virtual Cursor & Radial Dwell Ring
    if (cursor) {
      this.drawVirtualCursor(cursor, dwell, cellW, cellH)
    }
  }

  private drawBoardBackground(w: number, h: number, rows: number, cols: number, cellW: number, cellH: number): void {
    const ctx = this.ctx

    // Dark sleek cyber background
    const bgGrad = ctx.createLinearGradient(0, 0, w, h)
    bgGrad.addColorStop(0, '#0f172a') // Slate 900
    bgGrad.addColorStop(1, '#1e293b') // Slate 800
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, w, h)

    // Subtle cell slots
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellW
        const y = r * cellH
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'
        ctx.beginPath()
        ctx.roundRect(x + 4, y + 4, cellW - 8, cellH - 8, 12)
        ctx.fill()
        ctx.stroke()
      }
    }
  }

  private drawTiles(board: MatchBoard, cellW: number, cellH: number): void {
    const ctx = this.ctx

    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[r].length; c++) {
        const tile = board[r][c]
        if (!tile) continue

        const x = c * cellW
        const y = r * cellH
        const pad = 6
        const tileW = cellW - pad * 2
        const tileH = cellH - pad * 2
        const info = TILE_DEFINITIONS[tile.type]

        // Glossy gradient for tile body
        const tileGrad = ctx.createLinearGradient(x + pad, y + pad, x + pad, y + pad + tileH)
        tileGrad.addColorStop(0, info.colorLight)
        tileGrad.addColorStop(0.3, info.color)
        tileGrad.addColorStop(1, info.colorDark)

        ctx.fillStyle = tileGrad
        ctx.beginPath()
        ctx.roundRect(x + pad, y + pad, tileW, tileH, 12)
        ctx.fill()

        // Crisp border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Draw Embedded Vector Glyph in center
        const cx = x + cellW / 2
        const cy = y + cellH / 2
        this.drawTileGlyph(tile.type, cx, cy)
      }
    }
  }

  private drawTileGlyph(type: string, cx: number, cy: number): void {
    const ctx = this.ctx
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (type === 'CIRCLE') {
      // Crisp concentric sphere ring
      ctx.beginPath()
      ctx.arc(cx, cy, 14, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(cx, cy, 6, 0, Math.PI * 2)
      ctx.fill()
    } else if (type === 'STAR') {
      // 5-point star
      this.drawStar(cx, cy, 5, 16, 8)
      ctx.fill()
    } else if (type === 'DIAMOND') {
      // 4-point diamond
      ctx.beginPath()
      ctx.moveTo(cx, cy - 16)
      ctx.lineTo(cx + 14, cy)
      ctx.lineTo(cx, cy + 16)
      ctx.lineTo(cx - 14, cy)
      ctx.closePath()
      ctx.fill()
    } else if (type === 'TRIANGLE') {
      // Equilateral triangle
      ctx.beginPath()
      ctx.moveTo(cx, cy - 15)
      ctx.lineTo(cx + 15, cy + 13)
      ctx.lineTo(cx - 15, cy + 13)
      ctx.closePath()
      ctx.fill()
    } else if (type === 'SQUARE') {
      // Rounded square
      ctx.beginPath()
      ctx.roundRect(cx - 12, cy - 12, 24, 24, 4)
      ctx.fill()
    }
  }

  private drawStar(cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number): void {
    const ctx = this.ctx
    let rot = (Math.PI / 2) * 3
    let x = cx
    let y = cy
    const step = Math.PI / spikes

    ctx.beginPath()
    ctx.moveTo(cx, cy - outerRadius)
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius
      y = cy + Math.sin(rot) * outerRadius
      ctx.lineTo(x, y)
      rot += step

      x = cx + Math.cos(rot) * innerRadius
      y = cy + Math.sin(rot) * innerRadius
      ctx.lineTo(x, y)
      rot += step
    }
    ctx.lineTo(cx, cy - outerRadius)
    ctx.closePath()
  }

  private drawSelectedTileHalo(pos: GridPosition, cellW: number, cellH: number): void {
    const ctx = this.ctx
    const x = pos.col * cellW
    const y = pos.row * cellH

    // Glowing cyan selection halo
    ctx.save()
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 4
    ctx.shadowColor = '#38bdf8'
    ctx.shadowBlur = 14
    ctx.beginPath()
    ctx.roundRect(x + 3, y + 3, cellW - 6, cellH - 6, 14)
    ctx.stroke()
    ctx.restore()
  }

  private drawNeighborHighlights(pos: GridPosition, rows: number, cols: number, cellW: number, cellH: number): void {
    const ctx = this.ctx
    const neighbors: GridPosition[] = [
      { row: pos.row - 1, col: pos.col },
      { row: pos.row + 1, col: pos.col },
      { row: pos.row, col: pos.col - 1 },
      { row: pos.row, col: pos.col + 1 },
    ].filter((p) => p.row >= 0 && p.row < rows && p.col >= 0 && p.col < cols)

    ctx.save()
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.85)' // Emerald green
    ctx.lineWidth = 3
    ctx.setLineDash([6, 4])

    for (const n of neighbors) {
      const nx = n.col * cellW
      const ny = n.row * cellH

      ctx.beginPath()
      ctx.roundRect(nx + 4, ny + 4, cellW - 8, cellH - 8, 12)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawFocusedTileBox(pos: GridPosition, cellW: number, cellH: number): void {
    const ctx = this.ctx
    const x = pos.col * cellW
    const y = pos.row * cellH

    // High-contrast gold dashed focus indicator for keyboard users
    ctx.save()
    ctx.strokeStyle = '#facc15'
    ctx.lineWidth = 3
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    ctx.roundRect(x + 2, y + 2, cellW - 4, cellH - 4, 14)
    ctx.stroke()
    ctx.restore()
  }

  private updateAndDrawParticles(dt: number): void {
    const ctx = this.ctx

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life += dt

      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1)
        continue
      }

      const alpha = 1 - p.life / p.maxLife
      ctx.fillStyle = p.color
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  private drawVirtualCursor(
    cursor: CursorPosition,
    dwell: DwellState | null,
    cellW: number,
    cellH: number
  ): void {
    const ctx = this.ctx
    const cx = cursor.x
    const cy = cursor.y

    ctx.save()

    // 1. Draw Target Reticle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, 14, 0, Math.PI * 2)
    ctx.stroke()

    ctx.fillStyle = 'rgba(56, 189, 248, 0.7)'
    ctx.beginPath()
    ctx.arc(cx, cy, 4, 0, Math.PI * 2)
    ctx.fill()

    // Crosshairs
    ctx.beginPath()
    ctx.moveTo(cx - 18, cy)
    ctx.lineTo(cx - 8, cy)
    ctx.moveTo(cx + 8, cy)
    ctx.lineTo(cx + 18, cy)
    ctx.moveTo(cx, cy - 18)
    ctx.lineTo(cx, cy - 8)
    ctx.moveTo(cx, cy + 8)
    ctx.lineTo(cx, cy + 18)
    ctx.stroke()

    // 2. Draw Radial Dwell Progress Ring if hovering tile
    if (dwell && dwell.progress > 0 && dwell.target) {
      const targetCellX = dwell.target.col * cellW + cellW / 2
      const targetCellY = dwell.target.row * cellH + cellH / 2

      const radius = 24
      const startAngle = -Math.PI / 2
      const endAngle = startAngle + dwell.progress * Math.PI * 2

      // Background track
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.arc(targetCellX, targetCellY, radius, 0, Math.PI * 2)
      ctx.stroke()

      // Active fill arc
      ctx.strokeStyle = dwell.progress >= 0.98 ? '#22c55e' : '#38bdf8'
      ctx.lineWidth = 5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.arc(targetCellX, targetCellY, radius, startAngle, endAngle)
      ctx.stroke()
    }

    ctx.restore()
  }
}
