import { describe, it, expect, beforeEach } from 'vitest'
import { Runner3DEngine, LANE_COORDINATES } from '../games/runner3d/runner3dEngine'
import type { Runner3DObstacle, Runner3DCoin } from '../games/runner3d/types'

describe('Gaze 3D Runner — Pure Engine & Physics Logic', () => {
  let engine: Runner3DEngine

  beforeEach(() => {
    localStorage.clear()
    engine = new Runner3DEngine({
      initialSpeed: 20,
      maxSpeed: 40,
      speedIncrement: 0.5,
    })
  })

  it('1. Initializes with Middle Track, zero score, grounded state, and initial speed', () => {
    expect(engine.state).toBe('MENU')
    expect(engine.player.lane).toBe(1)
    expect(engine.player.targetLane).toBe(1)
    expect(engine.player.x).toBe(LANE_COORDINATES[1])
    expect(engine.player.y).toBe(0)
    expect(engine.player.verticalState).toBe('GROUNDED')
    expect(engine.stats.score).toBe(0)
    expect(engine.stats.coins).toBe(0)
    expect(engine.stats.speed).toBe(20)
  })

  it('2. Shifts target lane left and right, strictly clamping at track boundaries', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    // Start in center track (1)
    expect(engine.player.targetLane).toBe(1)

    // Move left -> track 0
    expect(engine.moveLeft()).toBe(true)
    expect(engine.player.targetLane).toBe(0)

    // Cannot move left beyond track 0
    expect(engine.moveLeft()).toBe(false)
    expect(engine.player.targetLane).toBe(0)

    // Move right -> track 1
    expect(engine.moveRight()).toBe(true)
    expect(engine.player.targetLane).toBe(1)

    // Move right -> track 2
    expect(engine.moveRight()).toBe(true)
    expect(engine.player.targetLane).toBe(2)

    // Cannot move right beyond track 2
    expect(engine.moveRight()).toBe(false)
    expect(engine.player.targetLane).toBe(2)
  })

  it('3. Enforces edge-triggered gesture hysteresis for lateral turns', () => {
    engine.start()

    // First LEFT gesture shifts lane
    expect(engine.handleGestureAction('LEFT')).toBe(true)
    expect(engine.player.targetLane).toBe(0)

    // Sustained LEFT gesture does NOT trigger another shift while held
    expect(engine.handleGestureAction('LEFT')).toBe(false)
    expect(engine.player.targetLane).toBe(0)

    // Return to neutral 'NONE'
    engine.handleGestureAction('NONE')

    // Now a RIGHT gesture shifts lane back
    expect(engine.handleGestureAction('RIGHT')).toBe(true)
    expect(engine.player.targetLane).toBe(1)
  })

  it('4. Handles jump physics and parabolic arc progression', () => {
    engine.start()

    expect(engine.jump()).toBe(true)
    expect(engine.player.verticalState).toBe('JUMPING')
    expect(engine.player.jumpTimer).toBeGreaterThan(0)

    // Cannot jump again while already jumping
    expect(engine.jump()).toBe(false)

    // Advance halfway through jump
    engine.update(0.35)
    expect(engine.player.verticalState).toBe('JUMPING')
    expect(engine.player.y).toBeGreaterThan(1.5) // Near jump apex

    // Advance past jump duration (0.75s total)
    engine.update(0.45)
    expect(engine.player.verticalState).toBe('GROUNDED')
    expect(engine.player.y).toBe(0)
  })

  it('5. Handles slide duration and fast-drop from jump into slide', () => {
    engine.start()

    // Grounded slide
    expect(engine.slide()).toBe(true)
    expect(engine.player.verticalState).toBe('SLIDING')

    // Advance past slide duration
    engine.update(0.8)
    expect(engine.player.verticalState).toBe('GROUNDED')

    // Fast-drop test: initiate jump then immediately slide
    engine.jump()
    expect(engine.player.verticalState).toBe('JUMPING')
    expect(engine.slide()).toBe(true)
    expect(engine.player.verticalState).toBe('SLIDING')
    expect(engine.player.y).toBe(0)
  })

  it('6. Guarantees every obstacle wave leaves at least one open safe passage track', () => {
    engine.start()

    // Spawn 20 consecutive waves and verify every single one has an open lane
    for (let i = 0; i < 20; i++) {
      engine.obstacles = []
      engine.spawnWave()

      const occupiedLanes = new Set(engine.obstacles.map((o) => o.lane))
      expect(occupiedLanes.size).toBeLessThanOrEqual(2) // At least 1 of the 3 tracks is completely free!
      const freeLanes = ([0, 1, 2] as const).filter((l) => !occupiedLanes.has(l))
      expect(freeLanes.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('7. Detects TRAIN collision when in same track at ground level', () => {
    engine.start()
    const train: Runner3DObstacle = {
      id: 99,
      type: 'TRAIN',
      lane: 1,
      z: 0.2, // Overlapping player at Z=0
      length: 14.0,
      height: 3.2,
      passed: false,
    }

    expect(engine.checkObstacleCollision(train)).toBe(true)
  })

  it('8. Avoids LOW_BARRIER when jumping over it, but collides when grounded', () => {
    engine.start()
    const barrier: Runner3DObstacle = {
      id: 101,
      type: 'LOW_BARRIER',
      lane: 1,
      z: 0.1,
      length: 1.0,
      height: 0.9,
      passed: false,
    }

    // Grounded collision
    expect(engine.player.verticalState).toBe('GROUNDED')
    expect(engine.checkObstacleCollision(barrier)).toBe(true)

    // Jump clears barrier
    engine.jump()
    engine.update(0.35) // Bring to apex (y > 1.0)
    expect(engine.player.y).toBeGreaterThan(1.0)
    expect(engine.checkObstacleCollision(barrier)).toBe(false)
  })

  it('9. Avoids HIGH_ARCH when sliding under it, but collides when standing', () => {
    engine.start()
    const arch: Runner3DObstacle = {
      id: 102,
      type: 'HIGH_ARCH',
      lane: 1,
      z: 0.1,
      length: 1.2,
      height: 2.6,
      passed: false,
    }

    // Standing collision
    expect(engine.player.verticalState).toBe('GROUNDED')
    expect(engine.checkObstacleCollision(arch)).toBe(true)

    // Slide clears arch
    engine.slide()
    expect(engine.player.verticalState).toBe('SLIDING')
    expect(engine.checkObstacleCollision(arch)).toBe(false)
  })

  it('10. Collects coins in 3D proximity and increments score and coin count', () => {
    engine.start()
    const coin: Runner3DCoin = {
      id: 201,
      lane: 1,
      x: 0,
      y: 0,
      z: 0.5,
      collected: false,
      pulse: 0,
      isHigh: false,
    }
    engine.coins.push(coin)

    engine.update(0.05)
    expect(coin.collected).toBe(true)
    expect(engine.stats.coins).toBe(1)
    expect(engine.stats.score).toBeGreaterThanOrEqual(100)
  })

  it('11. Tracking loss triggers immediate auto-pause and NEVER auto-resumes on recovery', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    // Simulate face lost
    engine.handleTrackingLoss()
    expect(engine.state).toBe('PAUSED')
    expect(engine.pauseReason).toBe('TRACKING_LOST')
    expect(engine.trackingRestoredDuringPause).toBe(false)

    // Simulate face restored
    engine.handleTrackingRecovery()
    // Game MUST remain PAUSED!
    expect(engine.state).toBe('PAUSED')
    expect(engine.trackingRestoredDuringPause).toBe(true)

    // Requires explicit manual resume
    engine.resume()
    expect(engine.state).toBe('PLAYING')
    expect(engine.pauseReason).toBe(null)
  })

  it('12. Resets stats and clears obstacles on restart', () => {
    engine.start()
    engine.stats.score = 500
    engine.stats.coins = 12
    engine.moveLeft()
    expect(engine.player.targetLane).toBe(0)

    engine.reset()
    expect(engine.state).toBe('MENU')
    expect(engine.player.lane).toBe(1)
    expect(engine.player.targetLane).toBe(1)
    expect(engine.stats.score).toBe(0)
    expect(engine.stats.coins).toBe(0)
    expect(engine.obstacles.length).toBe(0)
  })

  it('13. Enforces single lane change on sustained head gesture and re-arms on neutral return', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)

    // First left turn with displacement
    expect(engine.handleGestureAction('LEFT', -0.22, false)).toBe(true)
    expect(engine.player.targetLane).toBe(0)

    // Sustained left pose (action is NONE, but user is still deflected left at deltaX = -0.25)
    expect(engine.handleGestureAction('NONE', -0.25, false)).toBe(false)
    expect(engine.player.targetLane).toBe(0)

    // Minor jitter around -0.16 still in deflected state -> MUST NOT trigger repeated shift
    expect(engine.handleGestureAction('NONE', -0.16, false)).toBe(false)
    expect(engine.player.targetLane).toBe(0)

    // User returns to neutral center (in dead-zone, deltaX ≈ 0)
    expect(engine.handleGestureAction('NONE', 0.02, true)).toBe(false)
    expect(engine.player.targetLane).toBe(0)
    expect(engine.awaitingNeutral).toBe(false) // re-armed

    // User turns right -> shifts lane back to center (1)
    expect(engine.handleGestureAction('RIGHT', 0.2, false)).toBe(true)
    expect(engine.player.targetLane).toBe(1)
    expect(engine.awaitingNeutral).toBe(true)

    // Sustained right pose does not shift again
    expect(engine.handleGestureAction('NONE', 0.22, false)).toBe(false)
    expect(engine.player.targetLane).toBe(1)
  })

  it('14. Keyboard and on-screen controls update authoritative player lane independent of gesture re-arming state', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)

    // Set gesture to awaiting neutral
    engine.handleGestureAction('LEFT', -0.2, false)
    expect(engine.player.targetLane).toBe(0)
    expect(engine.awaitingNeutral).toBe(true)

    // Keyboard Right should immediately work and update the same target lane
    expect(engine.moveRight()).toBe(true)
    expect(engine.player.targetLane).toBe(1)

    // Keyboard Right again to lane 2
    expect(engine.moveRight()).toBe(true)
    expect(engine.player.targetLane).toBe(2)

    // Keyboard Left back to lane 1
    expect(engine.moveLeft()).toBe(true)
    expect(engine.player.targetLane).toBe(1)
  })

  it('15. Disables head-based UP (jump) and DOWN (slide) when verticalGesturesEnabled is false', () => {
    engine.start()
    expect(engine.player.verticalState).toBe('GROUNDED')

    // Head-based UP gesture with vertical gestures disabled
    const jumped = engine.handleGestureAction('UP', 0, false, false)
    expect(jumped).toBe(false)
    expect(engine.player.verticalState).toBe('GROUNDED')

    // Head-based DOWN gesture with vertical gestures disabled
    const slid = engine.handleGestureAction('DOWN', 0, false, false)
    expect(slid).toBe(false)
    expect(engine.player.verticalState).toBe('GROUNDED')
  })

  it('16. Executes head-based UP and DOWN when verticalGesturesEnabled is true without altering lane', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)
    expect(engine.player.verticalState).toBe('GROUNDED')

    // Head UP triggers jump without altering lane
    expect(engine.handleGestureAction('UP', 0, false, true)).toBe(true)
    expect(engine.player.verticalState).toBe('JUMPING')
    expect(engine.player.targetLane).toBe(1)
    expect(engine.awaitingNeutral).toBe(true)

    // Sustained head pose blocks repeat actions
    expect(engine.handleGestureAction('UP', 0, false, true)).toBe(false)

    // Re-arm via neutral return
    engine.handleGestureAction('NONE', 0, true, true)
    expect(engine.awaitingNeutral).toBe(false)

    // Return player to ground
    engine.player.verticalState = 'GROUNDED'

    // Head DOWN triggers slide without altering lane
    expect(engine.handleGestureAction('DOWN', 0, false, true)).toBe(true)
    expect(engine.player.verticalState).toBe('SLIDING')
    expect(engine.player.targetLane).toBe(1)
  })

  it('17. Strictly blocks raw deltaX bypass when action is NONE or in dead-zone', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)

    // action is NONE even if raw deltaX is deflected past -0.15
    expect(engine.handleGestureAction('NONE', -0.25, false)).toBe(false)
    expect(engine.player.targetLane).toBe(1)

    // inside dead-zone
    expect(engine.handleGestureAction('LEFT', -0.20, true)).toBe(false)
    expect(engine.player.targetLane).toBe(1)
  })

  it('18. Enforces neutral re-arming on resume after tracking loss to prevent accidental actions on reacquisition', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    // Tracking lost
    engine.handleTrackingLoss()
    expect(engine.state).toBe('PAUSED')

    // Tracking recovered while paused
    engine.handleTrackingRecovery()
    expect(engine.trackingRestoredDuringPause).toBe(true)

    // Player manually resumes
    engine.resume()
    expect(engine.state).toBe('PLAYING')
    // awaitingNeutral MUST be true so that existing head deflection cannot trigger an immediate move
    expect(engine.awaitingNeutral).toBe(true)

    // Sustained deflection is blocked
    expect(engine.handleGestureAction('NONE', -0.22, false)).toBe(false)
    expect(engine.player.targetLane).toBe(1)

    // Returns to neutral center: re-arms
    engine.handleGestureAction('NONE', 0, true)
    expect(engine.awaitingNeutral).toBe(false)

    // Now moves left cleanly
    expect(engine.handleGestureAction('LEFT', -0.22, false)).toBe(true)
    expect(engine.player.targetLane).toBe(0)
  })

  it('19. Populates detailed lastDecision telemetry reasons on acceptance, boundary, neutral re-arming, and rejection', () => {
    engine.start()
    expect(engine.lastDecision.reason).toMatch(/Reset/i)

    // Accepted move left
    expect(engine.handleGestureAction('LEFT', -0.20, false)).toBe(true)
    expect(engine.lastDecision.accepted).toBe(true)
    expect(engine.lastDecision.reason).toContain('Accepted: shifted LEFT to lane 0')

    // Boundary attempt (already at lane 0)
    engine.awaitingNeutral = false
    expect(engine.handleGestureAction('LEFT', -0.20, false)).toBe(false)
    expect(engine.lastDecision.accepted).toBe(false)
    expect(engine.lastDecision.reason).toContain('Boundary: already in leftmost lane (0)')

    // Re-arming on center return
    engine.awaitingNeutral = true
    engine.handleGestureAction('NONE', 0, true)
    expect(engine.lastDecision.accepted).toBe(false)
    expect(engine.lastDecision.reason).toContain('Re-armed: returned to neutral center')
  })
})
