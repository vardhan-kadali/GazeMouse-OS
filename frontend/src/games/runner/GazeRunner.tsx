import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Alert } from '../../components/common/Alert'
import { EyeGazeIcon } from '../../components/common/Icons'
import { GestureGauge } from '../../components/common/GestureGauge'
import { useTracking } from '../../context/TrackingContext'
import { useSettings } from '../../context/SettingsContext'
import { RunnerEngine } from './gameEngine'
import { RunnerRenderer } from './canvasRenderer'
import type { GameState, PauseReason } from './types'

interface GazeRunnerProps {
  onExit: () => void
  onNavigateToSetup?: () => void
}

export const GazeRunner: React.FC<GazeRunnerProps> = ({
  onExit,
  onNavigateToSetup,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<RunnerEngine | null>(null)
  const rendererRef = useRef<RunnerRenderer | null>(null)
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
    coins: 0,
    distance: 0,
    speed: 300,
    highScore: 0,
  })
  const [playerLane, setPlayerLane] = useState<0 | 1 | 2>(1)

  // Initialize pure game engine
  if (!engineRef.current) {
    engineRef.current = new RunnerEngine({
      trackWidth: 480,
      trackHeight: 600,
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
    setPlayerLane(engine.player.targetLane)
    setStats({ ...engine.stats })
  }, [])

  // 1. Gesture Input Integration
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || engine.state !== 'PLAYING') return

    // Derive effective action from classifier action or sustained lateral displacement threshold
    const effectiveAction =
      trackingData.action !== 'NONE'
        ? trackingData.action
        : trackingData.displacement.deltaX < -0.15
        ? 'LEFT'
        : trackingData.displacement.deltaX > 0.15
        ? 'RIGHT'
        : 'NONE'

    if (effectiveAction === 'LEFT' || effectiveAction === 'RIGHT') {
      const shifted = engine.handleGestureAction(effectiveAction)
      if (shifted) {
        syncStateFromEngine()
      }
    } else if (effectiveAction === 'NONE') {
      engine.handleGestureAction('NONE')
    }
  }, [trackingData.action, trackingData.displacement.deltaX, syncStateFromEngine])

  // 2. Tracking Loss Safety Detection
  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return

    if (isCameraActive) {
      if (trackingData.status === 'TRACKING_LOST' || !trackingData.facePresent) {
        if (engine.state === 'PLAYING') {
          engine.handleTrackingLoss()
          syncStateFromEngine()
        }
      } else if (trackingData.status === 'ACTIVE' && trackingData.facePresent) {
        if (engine.state === 'PAUSED' && engine.pauseReason === 'TRACKING_LOST') {
          engine.handleTrackingRecovery()
          syncStateFromEngine()
        }
      }
    }
  }, [trackingData.status, trackingData.facePresent, isCameraActive, syncStateFromEngine])

  // 3. Game Loop Animation Runner
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    if (!rendererRef.current) {
      rendererRef.current = new RunnerRenderer(ctx, canvas.width, canvas.height)
    }

    lastTimeRef.current = performance.now()

    const gameLoop = (currentTime: number) => {
      const dt = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime

      const engine = engineRef.current
      const renderer = rendererRef.current

      if (engine && renderer) {
        engine.update(dt)
        renderer.render(engine, dt)

        // Sync React HUD state periodically
        if (engine.state === 'PLAYING') {
          setStats({ ...engine.stats })
          setPlayerLane(engine.player.targetLane)
        } else if (engine.state === 'GAME_OVER' && gameState !== 'GAME_OVER') {
          syncStateFromEngine()
        }
      }

      animFrameIdRef.current = requestAnimationFrame(gameLoop)
    }

    // Cancel existing loop before starting new one (defense in depth)
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current)
    }
    animFrameIdRef.current = requestAnimationFrame(gameLoop)

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
    }
  }, [gameState, syncStateFromEngine])

  // 4. Keyboard Controls Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current
      if (!engine) return

      // Prevent scrolling when using arrow keys or spacebar in-game
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault()
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (engine.moveLeft()) syncStateFromEngine()
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (engine.moveRight()) syncStateFromEngine()
      } else if (e.code === 'Space' || e.code === 'KeyP') {
        if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
          syncStateFromEngine()
        } else if (engine.state === 'PAUSED') {
          engine.resume()
          syncStateFromEngine()
        } else if (engine.state === 'MENU' || engine.state === 'GAME_OVER') {
          engine.start()
          syncStateFromEngine()
        }
      } else if (e.code === 'KeyR') {
        engine.reset()
        engine.start()
        syncStateFromEngine()
      } else if (e.code === 'Escape') {
        if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
          syncStateFromEngine()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [syncStateFromEngine])

  // Control handlers
  const handleStartGame = () => {
    engineRef.current?.start()
    syncStateFromEngine()
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

  const handleMoveLeft = () => {
    if (engineRef.current?.moveLeft()) {
      syncStateFromEngine()
    }
  }

  const handleMoveRight = () => {
    if (engineRef.current?.moveRight()) {
      syncStateFromEngine()
    }
  }

  const handleRestart = () => {
    engineRef.current?.reset()
    engineRef.current?.start()
    syncStateFromEngine()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header Navigation & Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button variant="outline" size="sm" onClick={onExit}>
            ← Back to Games
          </Button>
          <h1 style={{ fontSize: '1.75rem', color: 'var(--color-deep-blue)', margin: 0 }}>
            Gaze Runner
          </h1>
          <Badge status="info" size="sm">
            Phase 3 Engine
          </Badge>
        </div>

        {/* Live HUD Counter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Score:</span>
            <strong style={{ color: 'var(--color-deep-blue)', fontFamily: 'var(--font-family-mono)' }}>{stats.score}</strong>
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Coins:</span>
            <strong style={{ color: '#ca8a04', fontFamily: 'var(--font-family-mono)' }}>★ {stats.coins}</strong>
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', backgroundColor: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', fontSize: '0.9rem' }}>
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Best:</span>
            <strong style={{ color: 'var(--color-primary-blue)', fontFamily: 'var(--font-family-mono)' }}>{stats.highScore}</strong>
          </div>
        </div>
      </div>

      {/* Main Game Card Viewport */}
      <Card variant="bordered" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        {/* Tracking Guidance Banner */}
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
              You can play right now using keyboard (Arrow keys / A & D) or the on-screen buttons below. To play using head gestures, enable camera tracking.
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
              For the most comfortable head control, calibrate your resting posture in Camera Setup before playing.
            </Alert>
          </div>
        )}

        {/* Responsive Gameplay Layout: Game Viewport + Real-Time Gesture Gauge */}
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
          {/* Main Gameplay Column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '480px' }}>
            {/* Canvas Game Area Container */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '480px',
                aspectRatio: '4 / 5',
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
            height={600}
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
              <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🏃💨</div>
              <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                GAZE RUNNER
              </h2>
              <p style={{ color: '#cbd5e1', fontSize: '0.95rem', maxWidth: '340px', lineHeight: 1.5, marginBottom: '20px' }}>
                Turn your head gently <strong>Left</strong> or <strong>Right</strong> to shift lanes. Collect golden energy tokens and avoid hazard blocks!
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '24px' }}>
                <div>◀ Head Left / Key A: Move Left</div>
                <div>▶ Head Right / Key D: Move Right</div>
                <div>Spacebar: Pause / Resume</div>
              </div>

              <Button size="lg" variant="primary" onClick={handleStartGame}>
                Start Run
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
                The game paused automatically for safety because your face was not detected in the camera frame.
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
                Take your time. Press Space or click Resume to continue your run.
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button variant="primary" onClick={handlePauseToggle}>
                  Resume Run
                </Button>
                <Button variant="outline" onClick={handleRestart} style={{ color: '#ffffff', borderColor: '#64748b' }}>
                  Restart
                </Button>
              </div>
            </div>
          )}

          {/* 4. Game Over Overlay */}
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
              <div style={{ fontSize: '3rem', marginBottom: '6px' }}>💥</div>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444', marginBottom: '8px' }}>
                Run Complete!
              </h2>

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
                  <span style={{ color: '#94a3b8', display: 'block' }}>Score</span>
                  <strong style={{ fontSize: '1.1rem', color: '#38bdf8' }}>{stats.score}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Coins</span>
                  <strong style={{ fontSize: '1.1rem', color: '#facc15' }}>★ {stats.coins}</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Distance</span>
                  <strong style={{ fontSize: '1rem', color: '#e2e8f0' }}>{Math.round(stats.distance)}m</strong>
                </div>
                <div>
                  <span style={{ color: '#94a3b8', display: 'block' }}>Best</span>
                  <strong style={{ fontSize: '1rem', color: '#a78bfa' }}>{stats.highScore}</strong>
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

        {/* Accessible In-Game Controls & Lane Shifters */}
        <div style={{ marginTop: '20px', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Lane Shifter Buttons (Large, high-contrast, keyboard/touch friendly) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING' || playerLane === 0}
              onClick={handleMoveLeft}
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                borderColor: playerLane === 0 ? 'var(--color-border)' : 'var(--color-primary-blue)',
              }}
            >
              ◀ Move Left (A)
            </Button>
            <Button
              variant="outline"
              size="lg"
              disabled={gameState !== 'PLAYING' || playerLane === 2}
              onClick={handleMoveRight}
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                borderColor: playerLane === 2 ? 'var(--color-border)' : 'var(--color-primary-blue)',
              }}
            >
              Move Right (D) ▶
            </Button>
          </div>

          {/* Action Row: Pause & Restart */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <Button
              variant="secondary"
              size="sm"
              disabled={gameState === 'MENU' || gameState === 'GAME_OVER'}
              onClick={handlePauseToggle}
            >
              {gameState === 'PAUSED' ? 'Resume (Space)' : 'Pause (Space)'}
            </Button>

            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Current Lane: {playerLane === 0 ? 'Left' : playerLane === 1 ? 'Middle' : 'Right'}
            </span>

            <Button
              variant="outline"
              size="sm"
              disabled={gameState === 'MENU'}
              onClick={handleRestart}
            >
              Restart (R)
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Turn:</span>
              <span
                style={{
                  fontFamily: 'var(--font-family-mono)',
                  fontWeight: 700,
                  color:
                    trackingData.action === 'LEFT' ||
                    trackingData.action === 'RIGHT' ||
                    Math.abs(trackingData.displacement.deltaX) > 0.15
                      ? 'var(--color-primary-blue)'
                      : 'var(--color-text-muted)',
                }}
              >
                {trackingData.action === 'LEFT' || trackingData.displacement.deltaX < -0.15
                  ? '◀ LEFT'
                  : trackingData.action === 'RIGHT' || trackingData.displacement.deltaX > 0.15
                  ? 'RIGHT ▶'
                  : 'CENTER'}
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
