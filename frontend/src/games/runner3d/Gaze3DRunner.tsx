import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Card } from '../../components/common/Card'
import { Button } from '../../components/common/Button'
import { Badge } from '../../components/common/Badge'
import { Alert } from '../../components/common/Alert'
import { EyeGazeIcon } from '../../components/common/Icons'
import { GestureGauge } from '../../components/common/GestureGauge'
import { useTracking } from '../../context/TrackingContext'
import { useSettings } from '../../context/SettingsContext'
import { Runner3DEngine } from './runner3dEngine'
import { ThreeRenderer } from './threeRenderer'
import { soundEffects } from './soundEffects'
import type { GameState, PauseReason } from './types'

interface Gaze3DRunnerProps {
  onExit: () => void
  onNavigateToSetup?: () => void
}

export const Gaze3DRunner: React.FC<Gaze3DRunnerProps> = ({
  onExit,
  onNavigateToSetup,
}) => {
  const { trackingData, isCameraActive, resetGestures } = useTracking()
  const { settings } = useSettings()

  const lastLoggedDecisionRef = useRef<string>('')
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [engine] = useState(
    () =>
      new Runner3DEngine({
        initialSpeed: 22,
        maxSpeed: 48,
        speedIncrement: 0.35,
        reducedMotion: settings.reducedMotion,
      })
  )
  const engineRef = useRef<Runner3DEngine>(engine)
  const rendererRef = useRef<ThreeRenderer | null>(null)
  const animFrameIdRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)

  // Synced React UI state for overlays and HUD
  const [gameState, setGameState] = useState<GameState>('MENU')
  const [pauseReason, setPauseReason] = useState<PauseReason | null>(null)
  const [trackingRestored, setTrackingRestored] = useState<boolean>(false)
  const [initStatus, setInitStatus] = useState<'OK' | 'UNSUPPORTED' | 'INIT_FAILED'>(() =>
    typeof window !== 'undefined' && !ThreeRenderer.isWebGLAvailable() ? 'UNSUPPORTED' : 'OK'
  )
  const [isContextLost, setIsContextLost] = useState<boolean>(false)
  const [retryTrigger, setRetryTrigger] = useState<number>(0)
  const [stats, setStats] = useState({
    score: 0,
    coins: 0,
    distance: 0,
    speed: 22,
    highScore: 0,
  })
  const [playerLane, setPlayerLane] = useState<0 | 1 | 2>(1)
  const [verticalState, setVerticalState] = useState<'GROUNDED' | 'JUMPING' | 'SLIDING'>('GROUNDED')

  // Synchronize React state from game engine
  const syncStateFromEngine = useCallback(() => {
    const engine = engineRef.current
    if (!engine) return
    setGameState(engine.state)
    setPauseReason(engine.pauseReason)
    setTrackingRestored(engine.trackingRestoredDuringPause)
    setPlayerLane(engine.player.targetLane)
    setVerticalState(engine.player.verticalState)
    setStats({ ...engine.stats })
  }, [])

  // 1. Gesture Input Integration (Lateral Head Turns & Optional Vertical Gestures)
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || engine.state !== 'PLAYING') return

    const action = trackingData.action
    const deltaX = trackingData.displacement.deltaX
    const inDeadZone = trackingData.displacement.inDeadZone
    const verticalGesturesEnabled = settingsRef.current.verticalGestures

    const executed = engine.handleGestureAction(action, deltaX, inDeadZone, verticalGesturesEnabled)

    // Throttled diagnostic logging: logs only when decision or state changes
    if (engine.lastDecision.reason !== lastLoggedDecisionRef.current) {
      lastLoggedDecisionRef.current = engine.lastDecision.reason
      console.log('[Gaze3DRunner Diagnostic]', {
        action: trackingData.action,
        deltaX: Number(deltaX.toFixed(3)),
        deltaY: Number(trackingData.displacement.deltaY.toFixed(3)),
        inDeadZone,
        awaitingNeutral: engine.awaitingNeutral,
        decision: engine.lastDecision.reason,
        targetLane: engine.player.targetLane,
        playerX: Number(engine.player.x.toFixed(2)),
      })
    }

    if (executed) {
      if (engine.lastGestureAction === 'LEFT' || engine.lastGestureAction === 'RIGHT') {
        soundEffects.playLaneShift(settingsRef.current.soundEnabled)
      } else if (engine.lastGestureAction === 'UP') {
        soundEffects.playJump(settingsRef.current.soundEnabled)
      } else if (engine.lastGestureAction === 'DOWN') {
        soundEffects.playSlide(settingsRef.current.soundEnabled)
      }
      syncStateFromEngineRef.current()
    }
  }, [
    trackingData.action,
    trackingData.displacement.deltaX,
    trackingData.displacement.deltaY,
    trackingData.displacement.inDeadZone,
    gameState,
  ])

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

  // Stable refs to prevent stale closures inside animation frame and event listeners
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const gameStateRef = useRef(gameState)
  gameStateRef.current = gameState

  const syncStateFromEngineRef = useRef(syncStateFromEngine)
  syncStateFromEngineRef.current = syncStateFromEngine

  // 3A. Three.js Renderer Mount & Teardown Lifecycle
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Safe WebGL2 capability check
    if (!ThreeRenderer.isWebGLAvailable()) {
      setInitStatus('UNSUPPORTED')
      return
    }

    try {
      if (!rendererRef.current) {
        rendererRef.current = new ThreeRenderer(canvas, canvas.clientWidth || 540, canvas.clientHeight || 640)
      }
      setInitStatus('OK')
    } catch (err) {
      console.error('[Gaze3DRunner] WebGL initialization failed:', err)
      rendererRef.current = null
      setInitStatus('INIT_FAILED')
      return
    }

    // Window resize observer
    const handleResize = () => {
      if (canvas && rendererRef.current) {
        const w = canvas.clientWidth || 540
        const h = canvas.clientHeight || 640
        rendererRef.current.setSize(w, h)
      }
    }
    window.addEventListener('resize', handleResize)

    // WebGL Context Loss / Restoration Safety Handlers
    const handleContextLost = (e: Event) => {
      e.preventDefault()
      console.warn('[Gaze3DRunner] WebGL context lost event received.')
      setIsContextLost(true)
      if (engineRef.current.state === 'PLAYING') {
        engineRef.current.pause('MANUAL')
        syncStateFromEngineRef.current()
      }
    }

    const handleContextRestored = () => {
      console.info('[Gaze3DRunner] WebGL context restored event received.')
      setIsContextLost(false)
      if (canvas && rendererRef.current) {
        const w = canvas.clientWidth || 540
        const h = canvas.clientHeight || 640
        rendererRef.current.setSize(w, h)
      }
    }

    canvas.addEventListener('webglcontextlost', handleContextLost)
    canvas.addEventListener('webglcontextrestored', handleContextRestored)

    return () => {
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      canvas.removeEventListener('webglcontextrestored', handleContextRestored)
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
  }, [retryTrigger])

  // 3B. Animation & Render Loop Lifecycle (Decoupled from gameState and sound toggles)
  useEffect(() => {
    if (initStatus !== 'OK' || isContextLost) {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current)
        animFrameIdRef.current = null
      }
      return
    }

    lastTimeRef.current = performance.now()

    const gameLoop = (currentTime: number) => {
      const dtRaw = (currentTime - lastTimeRef.current) / 1000
      lastTimeRef.current = currentTime
      // Cap dt to 0.1s to prevent unbounded physics explosions when switching tabs
      const dt = Math.min(Math.max(dtRaw, 0), 0.1)

      const engine = engineRef.current
      const renderer = rendererRef.current

      if (engine && renderer) {
        const prevCoins = engine.stats.coins
        engine.update(dt)
        renderer.render(engine, dt)

        // Audio cues on state triggers
        if (engine.stats.coins > prevCoins) {
          soundEffects.playCoin(settingsRef.current.soundEnabled)
        }

        if (engine.state === 'PLAYING') {
          setStats({ ...engine.stats })
          setPlayerLane(engine.player.targetLane)
          setVerticalState(engine.player.verticalState)
        } else if (engine.state === 'GAME_OVER' && gameStateRef.current !== 'GAME_OVER') {
          soundEffects.playCrash(settingsRef.current.soundEnabled)
          syncStateFromEngineRef.current()
        }
      }

      animFrameIdRef.current = requestAnimationFrame(gameLoop)
    }

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
  }, [initStatus, isContextLost])

  // 4. Keyboard Controls Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const engine = engineRef.current
      if (!engine) return

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) {
        e.preventDefault()
      }

      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        if (engine.moveLeft()) {
          soundEffects.playLaneShift(settingsRef.current.soundEnabled)
          syncStateFromEngineRef.current()
        }
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        if (engine.moveRight()) {
          soundEffects.playLaneShift(settingsRef.current.soundEnabled)
          syncStateFromEngineRef.current()
        }
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        if (engine.jump()) {
          soundEffects.playJump(settingsRef.current.soundEnabled)
          syncStateFromEngineRef.current()
        }
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        if (engine.slide()) {
          soundEffects.playSlide(settingsRef.current.soundEnabled)
          syncStateFromEngineRef.current()
        }
      } else if (e.code === 'Space' || e.code === 'KeyP') {
        if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
          syncStateFromEngineRef.current()
        } else if (engine.state === 'PAUSED') {
          engine.resume()
          syncStateFromEngineRef.current()
        } else if (engine.state === 'MENU' || engine.state === 'GAME_OVER') {
          engine.start()
          syncStateFromEngineRef.current()
        }
      } else if (e.code === 'KeyR') {
        engine.reset()
        engine.start()
        syncStateFromEngineRef.current()
      } else if (e.code === 'Escape') {
        if (engine.state === 'PLAYING') {
          engine.pause('MANUAL')
          syncStateFromEngineRef.current()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Control handlers
  const handleStartGame = () => {
    resetGestures?.()
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
      soundEffects.playLaneShift(settings.soundEnabled)
      syncStateFromEngine()
    }
  }

  const handleMoveRight = () => {
    if (engineRef.current?.moveRight()) {
      soundEffects.playLaneShift(settings.soundEnabled)
      syncStateFromEngine()
    }
  }

  const handleJump = () => {
    if (engineRef.current?.jump()) {
      soundEffects.playJump(settings.soundEnabled)
      syncStateFromEngine()
    }
  }

  const handleSlide = () => {
    if (engineRef.current?.slide()) {
      soundEffects.playSlide(settings.soundEnabled)
      syncStateFromEngine()
    }
  }

  const handleRestart = () => {
    resetGestures?.()
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
            Gaze 3D Runner
          </h1>
          <Badge status="info" size="sm">
            Phase 5 Engine (Three.js)
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
            <span style={{ color: 'var(--color-text-muted)', marginRight: '6px' }}>Distance:</span>
            <strong style={{ color: 'var(--color-text-main)', fontFamily: 'var(--font-family-mono)' }}>{Math.round(stats.distance)}m</strong>
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
              You can play right now using keyboard (Arrow keys / A, D, W, S) or the on-screen buttons below. To play using head gestures, enable camera tracking.
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

        {/* WebGL Alerts: Unsupported, Init Failed, Context Lost */}
        {initStatus === 'UNSUPPORTED' && (
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <Alert
              type="error"
              title="WebGL Hardware Acceleration Unavailable"
              action={
                <Button size="sm" variant="outline" onClick={() => setRetryTrigger((n) => n + 1)}>
                  Check Again
                </Button>
              }
            >
              Your browser or environment does not support WebGL 3D rendering. Please enable hardware acceleration in your browser settings to play Gaze 3D Runner.
            </Alert>
          </div>
        )}

        {initStatus === 'INIT_FAILED' && (
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <Alert
              type="error"
              title="WebGL Renderer Initialization Failed"
              action={
                <Button size="sm" variant="outline" onClick={() => setRetryTrigger((n) => n + 1)}>
                  Retry Initialization
                </Button>
              }
            >
              An unexpected error occurred while initializing the 3D graphics renderer. Please check the browser console for details or click Retry.
            </Alert>
          </div>
        )}

        {isContextLost && (
          <div style={{ width: '100%', marginBottom: '16px' }}>
            <Alert type="warning" title="WebGL Graphics Context Interrupted">
              The 3D graphics context was temporarily lost. The game has been paused. Please wait for recovery or reload the page.
            </Alert>
          </div>
        )}

        {/* Responsive Gameplay Layout: 3D Viewport + Real-Time Gesture Gauge */}
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
          {/* Main 3D Gameplay Column */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '540px' }}>
            {/* 3D Canvas Container */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: '540px',
                aspectRatio: '5 / 6',
                borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                backgroundColor: '#090d16',
              }}
            >
              {/* Three.js WebGL Canvas */}
              <canvas
                ref={canvasRef}
                width={540}
                height={640}
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
                    backgroundColor: 'rgba(9, 13, 22, 0.90)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    textAlign: 'center',
                    color: '#ffffff',
                    backdropFilter: 'blur(5px)',
                  }}
                >
                  <div style={{ fontSize: '3.5rem', marginBottom: '8px' }}>🚅⚡</div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#38bdf8', marginBottom: '4px' }}>
                    GAZE 3D RUNNER
                  </h2>
                  <div style={{ fontSize: '0.9rem', color: '#facc15', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '12px' }}>
                    CYBER SUBWAY EXPRESS
                  </div>
                  <p style={{ color: '#cbd5e1', fontSize: '0.92rem', maxWidth: '380px', lineHeight: 1.5, marginBottom: '20px' }}>
                    Navigate an endless 3-track futuristic transit corridor. Turn your head gently <strong>Left</strong> or <strong>Right</strong> to change tracks. All obstacles have at least one open lane!
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '22px' }}>
                    <div>◀ Head Left / Key A: Shift Left</div>
                    <div>▶ Head Right / Key D: Shift Right</div>
                    <div>▲ Key W / Up Arrow: Bonus Jump</div>
                    <div>▼ Key S / Down Arrow: Bonus Slide</div>
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
                    backgroundColor: 'rgba(9, 13, 22, 0.94)',
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
                    backgroundColor: 'rgba(9, 13, 22, 0.90)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    textAlign: 'center',
                    color: '#ffffff',
                    backdropFilter: 'blur(5px)',
                  }}
                >
                  <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                    Game Paused
                  </h2>
                  <p style={{ color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '20px' }}>
                    Take your time. Press Space or click Resume to continue your 3D run.
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
                    backgroundColor: 'rgba(9, 13, 22, 0.95)',
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
                      backgroundColor: 'rgba(30, 41, 59, 0.85)',
                      border: '1px solid #334155',
                      borderRadius: 'var(--radius-md)',
                      padding: '16px',
                      width: '85%',
                      maxWidth: '320px',
                      marginBottom: '20px',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '12px',
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

            {/* Accessible In-Game Controls */}
            <div style={{ marginTop: '20px', width: '100%', maxWidth: '540px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Primary Lane Shifter Buttons (Large, high-contrast, touch/mouse accessible) */}
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

              {/* Bonus Jump & Slide Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={gameState !== 'PLAYING' || verticalState !== 'GROUNDED'}
                  onClick={handleJump}
                  style={{ fontWeight: 600 }}
                >
                  Jump ▲ (W)
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={gameState !== 'PLAYING'}
                  onClick={handleSlide}
                  style={{ fontWeight: 600 }}
                >
                  Slide ▼ (S)
                </Button>
              </div>

              {/* Action Row: Pause, Lane Indicator, Restart */}
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
                  Current Track: {playerLane === 0 ? 'Left' : playerLane === 1 ? 'Center' : 'Right'}
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
                        trackingData.action !== 'NONE'
                          ? 'var(--color-primary-blue)'
                          : 'var(--color-text-muted)',
                    }}
                  >
                    {trackingData.action === 'LEFT'
                      ? '◀ LEFT'
                      : trackingData.action === 'RIGHT'
                      ? 'RIGHT ▶'
                      : settings.verticalGestures && trackingData.action === 'UP'
                      ? '▲ UP'
                      : settings.verticalGestures && trackingData.action === 'DOWN'
                      ? '▼ DOWN'
                      : 'CENTER'}
                  </span>
                </div>
              </div>

              {/* Phase 5F Real-Time Diagnostic Instrumentation Panel */}
              <div
                data-testid="diagnostic-panel"
                style={{
                  marginTop: '10px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#0f172a',
                  color: '#38bdf8',
                  fontFamily: 'var(--font-family-mono, monospace)',
                  fontSize: '0.72rem',
                  lineHeight: 1.45,
                  border: '1px solid #1e293b',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    color: '#f8fafc',
                    borderBottom: '1px solid #334155',
                    paddingBottom: '4px',
                    marginBottom: '6px',
                  }}
                >
                  <span>[DIAGNOSTICS] Gaze 3D Runner Live Telemetry</span>
                  <span>FPS: {trackingData.fps} | Status: {trackingData.status}</span>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '4px',
                  }}
                >
                  <div>
                    <strong>Face:</strong>{' '}
                    <span style={{ color: trackingData.facePresent ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {trackingData.facePresent ? 'DETECTED' : 'NO FACE DETECTED'}
                    </span>
                  </div>
                  <div>
                    <strong>Game State:</strong> {gameState}
                  </div>
                  <div>
                    <strong>Displacement:</strong> X={trackingData.displacement.deltaX.toFixed(3)} | Y={trackingData.displacement.deltaY.toFixed(3)}
                  </div>
                  <div>
                    <strong>Dead Zone:</strong>{' '}
                    <span style={{ color: trackingData.displacement.inDeadZone ? '#38bdf8' : '#f59e0b', fontWeight: 700 }}>
                      {trackingData.displacement.inDeadZone ? 'YES (Center)' : 'NO (Deflected)'}
                    </span>
                  </div>
                  <div>
                    <strong>Classifier:</strong>{' '}
                    <span style={{ color: trackingData.action !== 'NONE' ? '#4ade80' : '#94a3b8', fontWeight: 700 }}>
                      {trackingData.action}
                    </span>
                  </div>
                  <div>
                    <strong>Re-Arming:</strong>{' '}
                    <span style={{ color: engine.awaitingNeutral ? '#f59e0b' : '#4ade80', fontWeight: 700 }}>
                      {engine.awaitingNeutral ? 'AWAITING NEUTRAL' : 'ARMED (Ready)'}
                    </span>
                  </div>
                  <div>
                    <strong>Last Action:</strong> {engine.lastGestureAction}
                  </div>
                  <div>
                    <strong>Player Lane:</strong> {playerLane} (Target: {engine.player.targetLane}) | X: {engine.player.x.toFixed(2)}
                  </div>
                  <div style={{ gridColumn: '1 / -1', marginTop: '2px' }}>
                    <strong>Decision:</strong>{' '}
                    <span
                      style={{
                        color: engine.lastDecision.accepted ? '#4ade80' : '#94a3b8',
                        fontWeight: 700,
                      }}
                    >
                      {engine.lastDecision.reason}
                    </span>
                  </div>
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

export default Gaze3DRunner
