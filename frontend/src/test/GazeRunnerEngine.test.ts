import { describe, it, expect, beforeEach } from 'vitest'
import { RunnerEngine } from '../games/runner/gameEngine'
import type { RunnerObstacle, RunnerCoin } from '../games/runner/types'

describe('Gaze Runner — Pure Engine & Logic', () => {
  let engine: RunnerEngine

  beforeEach(() => {
    engine = new RunnerEngine({
      trackWidth: 480,
      trackHeight: 600,
      initialSpeed: 300,
    })
  })

  it('Requirement 1: Player starts in the middle lane (lane 1)', () => {
    expect(engine.player.lane).toBe(1)
    expect(engine.player.targetLane).toBe(1)
    expect(engine.player.currentX).toBe(engine.getLaneCenterX(1))
    expect(engine.state).toBe('MENU')
  })

  it('Requirement 2: Left/right lane movement respects lane boundaries', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)

    // Move left to lane 0 (Leftmost)
    const movedLeft1 = engine.moveLeft()
    expect(movedLeft1).toBe(true)
    expect(engine.player.targetLane).toBe(0)

    // Cannot move further left past lane 0
    const movedLeftPastBound = engine.moveLeft()
    expect(movedLeftPastBound).toBe(false)
    expect(engine.player.targetLane).toBe(0)

    // Move right to lane 1
    const movedRight1 = engine.moveRight()
    expect(movedRight1).toBe(true)
    expect(engine.player.targetLane).toBe(1)

    // Move right to lane 2 (Rightmost)
    const movedRight2 = engine.moveRight()
    expect(movedRight2).toBe(true)
    expect(engine.player.targetLane).toBe(2)

    // Cannot move further right past lane 2
    const movedRightPastBound = engine.moveRight()
    expect(movedRightPastBound).toBe(false)
    expect(engine.player.targetLane).toBe(2)
  })

  it('Requirement 3: Repeated continuous gestures do not trigger repeated lane changes', () => {
    engine.start()
    expect(engine.player.targetLane).toBe(1)

    // Frame 1: Action is 'LEFT' -> shifts to lane 0
    const shift1 = engine.handleGestureAction('LEFT')
    expect(shift1).toBe(true)
    expect(engine.player.targetLane).toBe(0)

    // Frame 2: User holds head left -> action remains 'LEFT'
    const shift2 = engine.handleGestureAction('LEFT')
    expect(shift2).toBe(false) // Suppressed!
    expect(engine.player.targetLane).toBe(0)

    // Frame 3: Action returns to 'NONE' (user returned head towards center)
    engine.handleGestureAction('NONE')

    // Frame 4: User turns right -> action is 'RIGHT' -> shifts to lane 1
    const shift3 = engine.handleGestureAction('RIGHT')
    expect(shift3).toBe(true)
    expect(engine.player.targetLane).toBe(1)

    // Frame 5: User holds head right -> action remains 'RIGHT'
    const shift4 = engine.handleGestureAction('RIGHT')
    expect(shift4).toBe(false) // Suppressed!
    expect(engine.player.targetLane).toBe(1)
  })

  it('Requirement 4: Coin collection updates coin count and score correctly', () => {
    engine.start()
    const initialScore = engine.stats.score
    const initialCoins = engine.stats.coins

    // Inject coin directly at player location in middle lane (lane 1)
    const coinY = engine.player.y + 10
    const coin: RunnerCoin = {
      id: 999,
      lane: 1,
      y: coinY,
      radius: 12,
      collected: false,
      pulse: 0,
    }
    engine.coins.push(coin)

    // Advance 1 frame (small dt so coin stays within hitbox)
    engine.update(0.016)

    expect(coin.collected).toBe(true)
    expect(engine.stats.coins).toBe(initialCoins + 1)
    expect(engine.stats.score).toBeGreaterThan(initialScore)
  })

  it('Requirement 5: Obstacle collision ends the active run (GAME_OVER)', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    // Inject obstacle directly on top of player in lane 1
    const obstacle: RunnerObstacle = {
      id: 888,
      lane: 1,
      y: engine.player.y,
      width: 50,
      height: 40,
      passed: false,
    }
    engine.obstacles.push(obstacle)

    // Advance frame -> collision occurs
    engine.update(0.016)

    expect(engine.state).toBe('GAME_OVER')
  })

  it('Requirement 6: Tracking loss pauses gameplay promptly', () => {
    engine.start()
    expect(engine.state).toBe('PLAYING')

    engine.handleTrackingLoss()

    expect(engine.state).toBe('PAUSED')
    expect(engine.pauseReason).toBe('TRACKING_LOST')
  })

  it('Requirement 7: Tracking recovery does NOT automatically resume the game', () => {
    engine.start()
    engine.handleTrackingLoss()
    expect(engine.state).toBe('PAUSED')

    // Face returns
    engine.handleTrackingRecovery()

    // CRUCIAL: state must REMAIN PAUSED!
    expect(engine.state).toBe('PAUSED')
    expect(engine.trackingRestoredDuringPause).toBe(true)

    // User must perform explicit resume
    engine.resume()
    expect(engine.state).toBe('PLAYING')
  })

  it('Requirement 8: Restart resets the game state correctly', () => {
    engine.start()
    engine.moveLeft()
    engine.stats.score = 500
    engine.stats.coins = 5

    // Collision causes Game Over
    const obstacle: RunnerObstacle = {
      id: 111,
      lane: 1,
      y: engine.player.y,
      width: 50,
      height: 40,
      passed: false,
    }
    engine.obstacles.push(obstacle)
    engine.update(0.016)
    expect(engine.state).toBe('GAME_OVER')

    // Restart
    engine.start()

    expect(engine.state).toBe('PLAYING')
    expect(engine.player.lane).toBe(1)
    expect(engine.player.targetLane).toBe(1)
    expect(engine.stats.score).toBe(0)
    expect(engine.stats.coins).toBe(0)
    expect(engine.obstacles.length).toBe(0)
    expect(engine.pauseReason).toBeNull()
  })

  it('Movement gestures are ignored when the game is not actively playing', () => {
    // Engine is in MENU
    expect(engine.state).toBe('MENU')
    const movedInMenu = engine.handleGestureAction('LEFT')
    expect(movedInMenu).toBe(false)
    expect(engine.player.targetLane).toBe(1)

    // Engine is in PAUSED
    engine.start()
    engine.pause('MANUAL')
    expect(engine.state).toBe('PAUSED')

    const movedInPause = engine.handleGestureAction('RIGHT')
    expect(movedInPause).toBe(false)
    expect(engine.player.targetLane).toBe(1)
  })
})
