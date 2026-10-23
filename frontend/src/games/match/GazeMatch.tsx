import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Alert } from '../../components/common/Alert'
import { EyeGazeIcon } from '../../components/common/Icons'
import { GestureGauge } from '../../components/common/GestureGauge'
import { useTracking } from '../../context/TrackingContext'
import { useSettings } from '../../context/SettingsContext'
import { MatchEngine } from './matchEngine'
import { MatchRenderer } from './canvasRenderer'
import type { GameState, PauseReason, GridPosition, DwellState, CursorPosition } from './types'
import { TILE_DEFINITIONS } from './types'

interface GazeMatchProps {
  onExit: () => void
  onNavigateToSetup?: () => void
}

export const GazeMatch: React.FC<GazeMatchProps> = ({
  onExit,
  onNavigateToSetup,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<MatchEngine | null>(null)
  const rendererRef = useRef<MatchRenderer | null>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(performance.now())

  const { trackingData, isCameraActive } = useTracking()
  const { settings } = useSettings()

  // Synced React UI state for overlays and HUD
  const [gameState, setGameState] = useState<GameState>('MENU')
  const [pauseReason, setPauseReason] = useState<PauseReason | null>(null)
  const [trackingRestored, setTrackingRestored] = useState<boolean>(false)
  const [stats, setStats] = useState({
    score: 0,
    highScore: 0,
    movesRemaining: 20,
    movesMade: 0,
    matchesCount: 0,
    targetScore: 1500,
    isWin: false,
  })

  // Selected tile for swap (Step 1)
  const [selectedTile, setSelectedTile] = useState<GridPosition | null>(null)
  // Keyboard-focused tile
  const [focusedTile, setFocusedTile] = useState<GridPosition>({ row: 2, col: 2 })
  // Virtual cursor position
  const [cursorPos, setCursorPos] = useState<CursorPosition>({ x: 240, y: 240, activeTile: { row: 2, col: 2 } })
  // Dwell state
  const [dwellState, setDwellState] = useState<DwellState>({
    target: null,
    progress: 0,
    elapsedMs: 0,
    isLocked: false,
  })
  // Screen-reader live region announcement
  const [announcement, setAnnouncement] = useState<string>('Gaze Match ready. Select a tile to begin.')

  // Initialize pure puzzle engine
  if (!engineRef.current) {
    engineRef.current = new MatchEngine({
      gridRows: 6,
      gridCols: 6,
      targetScore: 1500,
      maxMoves: 20,
      reducedMotion: settings.reducedMotion,
    })
  }

  // Synchronize React state from game engine
  const syncStateFromEngine = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    setGameState(engine.state)
    setPauseReason(engine.pauseReason)
    setTrackingRestored(engine.trackingRestoredDuringPause)
    setStats({ ...engine.stats })
  }, [])

  // Audio tone cue synthesizer (uses browser Web Audio API if soundEnabled is true)
  const playSoundCue = useCallback((type: 'select' | 'match' | 'invalid' | 'win' | 'lose') => {
    if (!settings.soundEnabled) return
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime
      if (type === 'select') {
        osc.frequency.setValueAtTime(440, now) // A4
        gain.gain.setValueAtTime(0.12, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
        osc.start(now)
        osc.stop(now + 0.12)
      } else if (type === 'match') {
        osc.frequency.setValueAtTime(587.33, now) // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.2) // A5
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25)
        osc.start(now)
        osc.stop(now + 0.25)
      } else if (type === 'invalid') {
        osc.frequency.setValueAtTime(220, now) // A3
        osc.frequency.setValueAtTime(180, now + 0.1)
        gain.gain.setValueAtTime(0.12, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)
        osc.start(now)
        osc.stop(now + 0.2)
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, now) // C5
        osc.frequency.setValueAtTime(659.25, now + 0.12) // E5
        osc.frequency.setValueAtTime(783.99, now + 0.24) // G5
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5)
        osc.start(now)
        osc.stop(now + 0.5)
      } else if (type === 'lose') {
        osc.frequency.setValueAtTime(330, now)
        osc.frequency.exponentialRampToValueAtTime(165, now + 0.4)
        gain.gain.setValueAtTime(0.15, now)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
        osc.start(now)
        osc.stop(now + 0.45)
      }
    } catch {
      // Audio context unavailable or blocked fallback
    }
  }, [settings.soundEnabled])

  // Handles tile interaction (selection or swap)
  const handleTileAction = useCallback((targetPos: GridPosition) => {
    const engine = engineRef.current
    if (!engine || engine.state !== 'PLAYING') return

    const targetTile = engine.getTile(targetPos.row, targetPos.col)
    if (!targetTile) return
    const targetInfo = TILE_DEFINITIONS[targetTile.type]

    // Step 1: No tile currently selected -> Select target as Source
    if (!selectedTile) {
      setSelectedTile(targetPos)
      setFocusedTile(targetPos)
      playSoundCue('select')
      setAnnouncement(`Selected ${targetInfo.name} at Row ${targetPos.row + 1}, Column ${targetPos.col + 1}. Select an adjacent tile to swap.`)
      return
    }

    // Step 2a: Clicking the already selected tile -> Deselect
    if (selectedTile.row === targetPos.row && selectedTile.col === targetPos.col) {
      setSelectedTile(null)
      playSoundCue('select')
      setAnnouncement('Selection cancelled.')
      return
    }

    // Step 2b: Selecting an orthogonally adjacent tile -> Execute Swap!
    if (engine.areOrthogonallyAdjacent(selectedTile, targetPos)) {
      const swapResult = engine.executeSwap(selectedTile, targetPos)

      if (swapResult.valid) {
        playSoundCue('match')
        const totalCleared = swapResult.results.reduce((acc, r) => acc + r.uniqueTilesCleared, 0)
        const totalPoints = swapResult.results.reduce((acc, r) => acc + r.pointsAwarded, 0)
        setAnnouncement(`Matched ${totalCleared} tiles! Awarded ${totalPoints} points. ${engine.stats.movesRemaining} moves remaining.`)

        // Spawn visual burst particles
        if (rendererRef.current) {
          const clearedPositions = swapResult.results.flatMap((r) => r.matches.flatMap((m) => m.tiles))
          rendererRef.current.spawnParticlesForTiles(clearedPositions)
        }
      } else {
        playSoundCue('invalid')
        setAnnouncement('No match created. Swap reverted. 0 moves lost.')
      }

      setSelectedTile(null)
      setFocusedTile(targetPos)
      syncStateFromEngine()

      // Evaluate win/loss sound
      if (engine.isGameOver()) {
        if (engine.stats.isWin) {
          playSoundCue('win')
        } else {
          playSoundCue('lose')
        }
      }
      return
    }

    // Step 2c: Selecting a non-adjacent tile -> Shift Source selection to new tile
    setSelectedTile(targetPos)
    setFocusedTile(targetPos)
    playSoundCue('select')
    setAnnouncement(`Switched selection to ${targetInfo.name} at Row ${targetPos.row + 1}, Column ${targetPos.col + 1}.`)
  }, [selectedTile, playSoundCue, syncStateFromEngine])

  const dwellTargetRef = useRef<GridPosition | null>(null)
  const dwellStartTimeRef = useRef<number>(0)
  const isLockedRef = useRef<boolean>(false)

  // 1. Head-Tracking Virtual Cursor Position Integration
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || engine.state !== 'PLAYING') {
      dwellTargetRef.current = null
      isLockedRef.current = false
      return
    }

    // Derive cursor coordinate on 480x480 board from displacement
    const sensitivity = settings.sensitivity || 1.5
    const dx = trackingData.displacement.deltaX
    const dy = trackingData.displacement.deltaY

    // Map delta (-1 to 1) amplified by sensitivity to board pixels (0 to 480)
    const rawX = 240 + dx * 240 * sensitivity
    const rawY = 240 + dy * 240 * sensitivity
    const clampedX = Math.max(20, Math.min(460, rawX))
    const clampedY = Math.max(20, Math.min(460, rawY))

    // Calculate tile coordinate under cursor (80px per tile)
    const cellW = 80
    const cellH = 80
    const hoverCol = Math.max(0, Math.min(5, Math.floor(clampedX / cellW)))
    const hoverRow = Math.max(0, Math.min(5, Math.floor(clampedY / cellH)))
    const activeTilePos: GridPosition = { row: hoverRow, col: hoverCol }

    setCursorPos({ x: clampedX, y: clampedY, activeTile: activeTilePos })
    setFocusedTile(activeTilePos)

    // Check if target changed
    const currentTarget = dwellTargetRef.current
    if (!currentTarget || currentTarget.row !== hoverRow || currentTarget.col !== hoverCol) {
      dwellTargetRef.current = activeTilePos
      dwellStartTimeRef.current = Date.now()
      isLockedRef.current = false
      setDwellState({
        target: activeTilePos,
        progress: 0,
        elapsedMs: 0,
        isLocked: false,
      })
    }
  }, [
    gameState,
    trackingData.displacement.deltaX,
    trackingData.displacement.deltaY,
    settings.sensitivity,
  ])

  // 1b. Dwell Timer Progress Loop
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || engine.state !== 'PLAYING' || !isCameraActive) return

    const dwellDuration = settings.dwellDuration || 1200

    const timer = setInterval(() => {
      const target = dwellTargetRef.current
      if (!target || isLockedRef.current) return
      if (trackingData.status === 'TRACKING_LOST' || !trackingData.facePresent) return

      const elapsed = Date.now() - dwellStartTimeRef.current
      const progress = Math.min(1, elapsed / dwellDuration)

      if (progress >= 1) {
        isLockedRef.current = true
        setDwellState({
          target,
          progress: 1,
          elapsedMs: dwellDuration,
          isLocked: true,
        })
        handleTileAction(target)
      } else {
        setDwellState({
          target,
          progress,
          elapsedMs: elapsed,
          isLocked: false,
        })
      }
    }, 30)

    return () => {
      clearInterval(timer)
    }
  }, [
    gameState,
    isCameraActive,
    settings.dwellDuration,
    trackingData.status,
    trackingData.facePresent,
    handleTileAction,
  ])

  // 2. Tracking Loss Safety Detection
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    if (isCameraActive) {
      if (trackingData.status === 'TRACKING_LOST' || !trackingData.facePresent) {
        if (engine.state === 'PLAYING') {
          engine.handleTrackingLoss()
          dwellTargetRef.current = null
          isLockedRef.current = false
          setDwellState({ target: null, progress: 0, elapsedMs: 0, isLocked: false })
          syncStateFromEngine()
          setAnnouncement('Tracking lost. Game paused automatically for safety.')
        }
      } else if (trackingData.status === 'ACTIVE' && trackingData.facePresent) {
        if (engine.state === 'PAUSED' && engine.pauseReason === 'TRACKING_LOST') {
          engine.handleTrackingRecovery()
          syncStateFromEngine()
          setAnnouncement('Face detected. Click Resume Game to continue.')
        }
      }
    }
  }, [trackingData.status, trackingData.facePresent, isCameraActive, syncStateFromEngine])

  // 3. Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!rendererRef.current) {
      rendererRef.current = new MatchRenderer(ctx, canvas.width, canvas.height, settings.reducedMotion)
    }
    rendererRef.current.setReducedMotion(settings.reducedMotion)

    lastTimeRef.current = performance.now()

    const loop = (currentTime: number) => {
      const dt = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime

      const engine = engineRef.current
      const renderer = rendererRef.current

      if (engine && renderer) {
        renderer.render(
          engine,
          selectedTile,
          focusedTile,
          isCameraActive ? cursorPos : null,
          isCameraActive ? dwellState : null,
          dt
        )
      }

      animFrameIdRef.current = requestAnimationFrame(loop)
    }

    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current)
    }
    animFrameIdRef.current = requestAnimationFrame(loop)

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
    }
  }, [selectedTile, focusedTile, cursorPos, dwellState, isCameraActive, settings.reducedMotion])

  // 4. Keyboard Controls Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current
      if (!engine) return

      // Prevent scrolling when using arrow keys or spacebar
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }

      // Navigation: Arrow keys / WASD
      if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        setFocusedTile((prev) => ({ row: Math.max(0, prev.row - 1), col: prev.col }))
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setFocusedTile((prev) => ({ row: Math.min(5, prev.row + 1), col: prev.col }))
      } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        setFocusedTile((prev) => ({ row: prev.row, col: Math.max(0, prev.col - 1) }))
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        setFocusedTile((prev) => ({ row: prev.row, col: Math.min(5, prev.col + 1) }))
      } else if (e.code === 'Enter' || e.code === 'Space') {
        // Selection / Confirmation
        if (engine.state === 'PLAYING') {
          handleTileAction(focusedTile)
        } else if (engine.state === 'PAUSED') {
          engine.resume()
          syncStateFromEngine()
        } else if (engine.state === 'MENU' || engine.state === 'GAME_OVER') {
          engine.start()
          syncStateFromEngine()
        }
      } else if (e.code === 'Escape') {
        // Cancel selection or Pause
        if (selectedTile) {
          setSelectedTile(null)
          playSoundCue('select')
          setAnnouncement('Selection cancelled.')
        } else if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
          syncStateFromEngine()
        }
      } else if (e.code === 'KeyP') {
        if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
        } else if (engine.state === 'PAUSED') {
          engine.resume()
        }
        syncStateFromEngine()
      } else if (e.code === 'KeyR') {
        engine.reset()
        engine.start()
        setSelectedTile(null)
        syncStateFromEngine()
        setAnnouncement('Game restarted.')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusedTile, selectedTile, handleTileAction, playSoundCue, syncStateFromEngine])

  // Button handlers
  const handleStartGame = () => {
    engineRef.current?.start()
    setSelectedTile(null)
    syncStateFromEngine()
    setAnnouncement('Challenge started! Match tiles by shape and color.')
  }

  const handlePauseToggle = () => {
    const engine = engineRef.current
    if (!engine) return
    if (engine.state === 'PLAYING') {
      engine.pause('MANUAL')
    } else if (engine.state === 'PAUSED') {
      engine.resume()
    }
    syncStateFromEngine()
  }

  const handleRestart = () => {
    engineRef.current?.reset()
    engineRef.current?.start()
    setSelectedTile(null)
    syncStateFromEngine()
    setAnnouncement('Challenge restarted.')
  }

  const handleDeselect = () => {
    setSelectedTile(null)
    playSoundCue('select')
    setAnnouncement('Selection cancelled.')
  }

  const currentTileInfo = engineRef.current?.getTile(focusedTile.row, focusedTile.col)
    ? TILE_DEFINITIONS[engineRef.current.getTile(focusedTile.row, focusedTile.col)!.type]
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Screen-reader Live Region */}
      <div aria-live="polite" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        {announcement}
      </div>

      {/* Top Header Navigation & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="outline" size="sm" onClick={onExit}>
            ← Back to Games
          </Button>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--color-deep-blue)', margin: 0 }}>
            Gaze Match
          </h1>
          <Badge status="info" size="sm">
            Phase 4 Engine
          </Badge>
        </div>

        {/* Live HUD Counter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Moves Left:</span>
            <strong style={{ color: stats.movesRemaining <= 5 ? '#ef4444' : 'var(--color-deep-blue)', fontFamily: 'var(--font-family-mono)' }}>
              {stats.movesRemaining}
            </strong>
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Score:</span>
            <strong style={{ color: 'var(--color-primary-blue)', fontFamily: 'var(--font-family-mono)' }}>
              {stats.score} / {stats.targetScore}
            </strong>
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Best:</span>
            <strong style={{ color: '#ca8a04', fontFamily: 'var(--font-family-mono)' }}>
              ★ {stats.highScore}
            </strong>
          </div>
        </div>
      </div>

      {/* Main Game Card Viewport */}
      <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Tracking Guidance Banners */}
        {!isCameraActive && (
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <Alert
              type="info"
              title="Camera is Standby"
              action={
                onNavigateToSetup && (
                  <Button size="sm" variant="outline" onClick={onNavigateToSetup}>
                    Camera Setup
                  </Button>
                )
              }
            >
              You can play right now using keyboard (Arrow keys / WASD + Spacebar) or the on-screen buttons below. To play using head-dwell controls, enable camera tracking.
            </Alert>
          </div>
        )}

        {isCameraActive && !trackingData.baseline && (
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <Alert
              type="warning"
              title="Neutral Baseline Recommended"
              action={
                onNavigateToSetup && (
                  <Button size="sm" variant="outline" onClick={onNavigateToSetup}>
                    Calibrate Now
                  </Button>
                )
              }
            >
              For the most comfortable head cursor navigation, calibrate your resting posture in Camera Setup before playing.
            </Alert>
          </div>
        )}

        {/* Responsive Gameplay Layout: Game Board + Real-Time Gesture Gauge */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'flex-start',
            gap: '24px',
            width: '100%',
          }}
        >
          {/* Main Puzzle Column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '480px' }}>
            {/* Canvas Game Area Container */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '480px',
                aspectRatio: '1 / 1',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                backgroundColor: '#0f172a',
              }}
            >
          {/* HTML5 Canvas */}
          <canvas
            ref={canvasRef}
            width={480}
            height={480}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
            }}
          />

          {/* 1. Start Menu Overlay */}
          {gameState === 'MENU' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>🧩✨</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                GAZE MATCH
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem', maxWidth: '360px', lineHeight: 1.5, marginBottom: '16px' }}>
                Score <strong>1,500 points</strong> in <strong>20 moves</strong>. Align 3 or more identical shapes horizontally or vertically.
              </p>

              {/* Symbols Legend */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(37, 99, 235, 0.3)', border: '1px solid #3b82f6', fontSize: '0.8rem', color: '#93c5fd' }}>
                  ● Sphere
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(234, 179, 8, 0.3)', border: '1px solid #eab308', fontSize: '0.8rem', color: '#fde047' }}>
                  ★ Star
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(22, 163, 74, 0.3)', border: '1px solid #22c55e', fontSize: '0.8rem', color: '#86efac' }}>
                  ◆ Diamond
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(147, 51, 234, 0.3)', border: '1px solid #a855f7', fontSize: '0.8rem', color: '#d8b4fe' }}>
                  ▲ Triangle
                </span>
                <span style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(234, 88, 12, 0.3)', border: '1px solid #f97316', fontSize: '0.8rem', color: '#fdba74' }}>
                  ■ Cube
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '24px' }}>
                <div>Hover / Arrow keys to focus a tile</div>
                <div>Hold {settings.dwellDuration || 1200}ms or Spacebar to select</div>
                <div>Hover adjacent neighbor to swap</div>
              </div>

              <Button size="lg" variant="primary" onClick={handleStartGame}>
                Start Challenge
              </Button>
            </div>
          )}

          {/* 2. Auto-Pause (Tracking Loss) Overlay */}
          {gameState === 'PAUSED' && pauseReason === 'TRACKING_LOST' && (
            <div
              role="alert"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '28px',
                textAlign: 'center',
                color: '#ffffff',
                backdropFilter: 'blur(6px)',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '8px' }}>⚠️</div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#facc15', marginBottom: '10px' }}>
                Face Tracking Lost
              </h2>
              <p style={{ color: '#e2e8f0', fontSize: '0.95rem', maxWidth: '340px', lineHeight: 1.5, marginBottom: '16px' }}>
                The puzzle paused automatically for safety because your face was not visible in camera frame.
              </p>

              {trackingRestored ? (
                <div style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(34, 197, 94, 0.2)', border: '1px solid #22c55e', color: '#86efac', fontSize: '0.85rem', marginBottom: '20px' }}>
                  ✓ Face detected! Settle into position and click Resume.
                </div>
              ) : (
                <div style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(234, 179, 8, 0.2)', border: '1px solid #eab308', color: '#fde047', fontSize: '0.85rem', marginBottom: '20px' }}>
                  Please face your webcam directly to re-acquire tracking.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px' }}>
                <Button variant="primary" onClick={handlePauseToggle}>
                  Resume Game
                </Button>
                <Button variant="outline" onClick={handleRestart} style={{ color: '#ffffff', borderColor: '#64748b' }}>
                  Restart
                </Button>
              </div>
            </div>
          )}

          {/* 3. Manual Pause Overlay */}
          {gameState === 'PAUSED' && pauseReason === 'MANUAL' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.88)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                color: '#ffffff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                Game Paused
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '20px' }}>
                Take your time. Press Space or click Resume to continue your puzzle challenge.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button variant="primary" onClick={handlePauseToggle}>
                  Resume Game
                </Button>
                <Button variant="outline" onClick={handleRestart} style={{ color: '#ffffff', borderColor: '#64748b' }}>
                  Restart
                </Button>
              </div>
            </div>
          )}

          {/* 4. Game Over Overlay (Win or Loss) */}
          {gameState === 'GAME_OVER' && (
            <div
              role="alert"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.94)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                color: '#ffffff',
                backdropFilter: 'blur(6px)',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: '6px' }}>
                {stats.isWin ? '🎉🏆' : '⏳'}
              </div>
              <h2
                style={{
                  fontSize: '1.8rem',
                  fontWeight: 800,
                  color: stats.isWin ? '#4ade80' : '#f87171',
                  marginBottom: '8px',
                }}
              >
                {stats.isWin ? 'Challenge Solved!' : 'Moves Exhausted'}
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem', maxWidth: '320px', marginBottom: '18px' }}>
                {stats.isWin
                  ? `Congratulations! You reached ${stats.score} points with ${stats.movesRemaining} moves to spare!`
                  : `You scored ${stats.score} points. Target was ${stats.targetScore}. Great try!`}
              </p>

              <div
                style={{
                  backgroundColor: 'rgba(30, 41, 59, 0.8)',
                  border: '1px solid #334155',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  width: '80%',
                  maxWidth: '300px',
                  marginBottom: '20px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  fontSize: '0.85rem',
                }}
              >
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Final Score</span>
                  <strong style={{ fontSize: '1.1rem', color: '#38bdf8' }}>{stats.score}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Target</span>
                  <strong style={{ fontSize: '1.1rem', color: '#facc15' }}>{stats.targetScore}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Matches</span>
                  <strong style={{ fontSize: '1rem', color: '#e2e8f0' }}>{stats.matchesCount}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>High Score</span>
                  <strong style={{ fontSize: '1rem', color: '#a78bfa' }}>★ {stats.highScore}</strong>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <Button variant="primary" onClick={handleRestart}>
                  Play Again
                </Button>
                <Button variant="outline" onClick={onExit} style={{ color: '#ffffff', borderColor: '#64748b' }}>
                  Back to Catalog
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Accessible Controls & Virtual Dwell Ribbon */}
        <div style={{ marginTop: '20px', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Selection Status & Tile Helper Bar */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <div>
              <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Focus:</span>
              <strong>{currentTileInfo?.name || 'Empty'}</strong> ({focusedTile.row + 1}, {focusedTile.col + 1})
            </div>

            <div>
              {selectedTile ? (
                <span style={{ color: 'var(--color-primary-blue)', fontWeight: 700 }}>
                  ✓ Source Selected ({selectedTile.row + 1}, {selectedTile.col + 1})
                </span>
              ) : (
                <span style={{ color: 'var(--color-text-muted)' }}>
                  Hover to Dwell-Select
                </span>
              )}
            </div>
          </div>

          {/* Large Accessible On-Screen Grid Shifters & Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING'}
              onClick={() => setFocusedTile((p) => ({ row: Math.max(0, p.row - 1), col: p.col }))}
              style={{ fontSize: '1rem', fontWeight: 700, minHeight: '52px' }}
            >
              ▲ Up
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING'}
              onClick={() => setFocusedTile((p) => ({ row: Math.min(5, p.row + 1), col: p.col }))}
              style={{ fontSize: '1rem', fontWeight: 700, minHeight: '52px' }}
            >
              ▼ Down
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING'}
              onClick={() => setFocusedTile((p) => ({ row: p.row, col: Math.max(0, p.col - 1) }))}
              style={{ fontSize: '1rem', fontWeight: 700, minHeight: '52px' }}
            >
              ◀ Left
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING'}
              onClick={() => setFocusedTile((p) => ({ row: p.row, col: Math.min(5, p.col + 1) }))}
              style={{ fontSize: '1rem', fontWeight: 700, minHeight: '52px' }}
            >
              Right ▶
            </Button>
          </div>

          {/* Action Row: Select/Swap, Deselect, Pause, Restart */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1fr 1fr', gap: '8px' }}>
            <Button
              variant="primary"
              size="md"
              disabled={gameState !== 'PLAYING'}
              onClick={() => handleTileAction(focusedTile)}
              style={{ minHeight: '44px', fontWeight: 700 }}
            >
              {selectedTile ? 'Confirm Swap (Space)' : 'Select Tile (Space)'}
            </Button>

            <Button
              variant="outline"
              size="md"
              disabled={gameState !== 'PLAYING' || !selectedTile}
              onClick={handleDeselect}
              style={{ minHeight: '44px' }}
            >
              Cancel (Esc)
            </Button>

            <Button
              variant="secondary"
              size="md"
              disabled={gameState === 'MENU' || gameState === 'GAME_OVER'}
              onClick={handlePauseToggle}
              style={{ minHeight: '44px' }}
            >
              {gameState === 'PAUSED' ? 'Resume' : 'Pause'}
            </Button>

            <Button
              variant="outline"
              size="md"
              disabled={gameState === 'MENU'}
              onClick={handleRestart}
              style={{ minHeight: '44px' }}
            >
              Restart
            </Button>
          </div>

          {/* Live Head-Tracking Telemetry Ribbon */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <EyeGazeIcon size={16} />
              <span>Head Tracker:</span>
              <strong>
                {isCameraActive
                  ? trackingData.status === 'ACTIVE'
                    ? `Active (${trackingData.fps} FPS)`
                    : trackingData.status === 'TRACKING_LOST'
                    ? 'Tracking Lost'
                    : trackingData.status
                  : 'Standby (Off)'}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Dwell:</span>
              <div
                style={{
                  width: '80px',
                  height: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.2)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.round(dwellState.progress * 100)}%`,
                    backgroundColor: dwellState.progress >= 0.98 ? '#22c55e' : '#38bdf8',
                    transition: 'width 33ms linear',
                  }}
                />
              </div>
              <span style={{ fontFamily: 'var(--font-family-mono)', fontWeight: 700 }}>
                {Math.round(dwellState.progress * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-Time Gesture Guidance Side Panel */}
      <div style={{ width: '100%', maxWidth: '300px', flex: '1 1 280px' }}>
        <GestureGauge
          variant="compact"
          title="Gesture Gauges"
          showDescription={false}
        />
      </div>
    </div>
  </Card>
    </div>
  )
}
