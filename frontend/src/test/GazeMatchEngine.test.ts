import { describe, it, expect, beforeEach } from 'vitest'
import { MatchEngine } from '../games/match/matchEngine'
import type { TileType, MatchTile } from '../games/match/types'

describe('Gaze Match — Pure Engine & Puzzle Logic', () => {
  let engine: MatchEngine

  beforeEach(() => {
    engine = new MatchEngine({
      gridRows: 6,
      gridCols: 6,
      targetScore: 1500,
      maxMoves: 20,
    })
  })

  it('1. Generates a valid 6x6 board with exactly 36 tiles and no pre-existing matches', () => {
    expect(engine.rows).toBe(6)
    expect(engine.cols).toBe(6)
    expect(engine.board.length).toBe(6)

    let tileCount = 0
    for (let r = 0; r < 6; r++) {
      expect(engine.board[r].length).toBe(6)
      for (let c = 0; c < 6; c++) {
        const tile = engine.board[r][c]
        expect(tile).not.toBeNull()
        expect(tile?.type).toBeDefined()
        tileCount++
      }
    }
    expect(tileCount).toBe(36)

    // Mathematically guaranteed to have 0 matches at start
    const initialMatches = engine.findMatches()
    expect(initialMatches.length).toBe(0)
  })

  it('2. Guarantees at least two valid swap moves exist on the initial board', () => {
    const availableMoves = engine.findAvailableMoves()
    expect(availableMoves.length).toBeGreaterThanOrEqual(2)
  })

  it('3. Rejects non-adjacent or diagonal swaps without altering board or move count', () => {
    engine.start()
    const initialMoves = engine.stats.movesRemaining

    // Diagonal swap (0,0) and (1,1)
    const diagonalResult = engine.executeSwap({ row: 0, col: 0 }, { row: 1, col: 1 })
    expect(diagonalResult.valid).toBe(false)
    expect(engine.stats.movesRemaining).toBe(initialMoves)

    // Distant swap (0,0) and (0,3)
    const distantResult = engine.executeSwap({ row: 0, col: 0 }, { row: 0, col: 3 })
    expect(distantResult.valid).toBe(false)
    expect(engine.stats.movesRemaining).toBe(initialMoves)
  })

  it('4. Reverts an invalid swap that creates no match and costs zero moves', () => {
    engine.start()
    const initialMoves = engine.stats.movesRemaining
    const initialScore = engine.stats.score

    // Find two adjacent tiles that do not create any match
    // Manually force a known non-matching pair
    engine.board[0][0] = { id: 101, type: 'CIRCLE', row: 0, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][1] = { id: 102, type: 'STAR', row: 0, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][2] = { id: 103, type: 'DIAMOND', row: 0, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][0] = { id: 104, type: 'TRIANGLE', row: 1, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][1] = { id: 105, type: 'SQUARE', row: 1, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    const swapResult = engine.executeSwap({ row: 0, col: 0 }, { row: 0, col: 1 })
    expect(swapResult.valid).toBe(false)
    expect(swapResult.reverted).toBe(true)

    // Tiles remain in their original spots
    expect(engine.board[0][0]?.type).toBe('CIRCLE')
    expect(engine.board[0][1]?.type).toBe('STAR')

    // Zero moves deducted, zero points changed
    expect(engine.stats.movesRemaining).toBe(initialMoves)
    expect(engine.stats.score).toBe(initialScore)
  })

  it('5. Detects horizontal match-3, awards 100 points, and deducts exactly 1 move', () => {
    engine.start()
    const initialMoves = engine.stats.movesRemaining

    // Setup: Row 0 has [CIRCLE, CIRCLE, STAR, ...]
    // Row 1 has [STAR, STAR, CIRCLE, ...]
    // Swapping (0,2) with (1,2) brings CIRCLE to (0,2) forming 3 in row 0!
    engine.board[0][0] = { id: 1, type: 'CIRCLE', row: 0, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][1] = { id: 2, type: 'CIRCLE', row: 0, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][2] = { id: 3, type: 'STAR', row: 0, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][3] = { id: 5, type: 'TRIANGLE', row: 0, col: 3, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][2] = { id: 4, type: 'CIRCLE', row: 1, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    const swapResult = engine.executeSwap({ row: 0, col: 2 }, { row: 1, col: 2 })
    expect(swapResult.valid).toBe(true)
    expect(swapResult.results.length).toBeGreaterThanOrEqual(1)

    // Deducts exactly 1 move
    expect(engine.stats.movesRemaining).toBe(initialMoves - 1)
    expect(engine.stats.movesMade).toBe(1)

    // First match awarded at least 100 points
    expect(engine.stats.score).toBeGreaterThanOrEqual(100)
  })

  it('6. Detects vertical match-4 and awards 250 points', () => {
    engine.start()
    cleanCheckerboard(engine)

    // Setup: Column 0 has [STAR, STAR, STAR, CIRCLE, SQUARE] on rows 0, 1, 2, 3, 4
    // and (3,1) is STAR. Swapping (3,0) with (3,1) forms 4-in-a-column on col 0!
    engine.board[0][0] = { id: 1, type: 'STAR', row: 0, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][0] = { id: 2, type: 'STAR', row: 1, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[2][0] = { id: 3, type: 'STAR', row: 2, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[3][0] = { id: 4, type: 'CIRCLE', row: 3, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[4][0] = { id: 7, type: 'SQUARE', row: 4, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[3][1] = { id: 5, type: 'STAR', row: 3, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    const swapResult = engine.executeSwap({ row: 3, col: 0 }, { row: 3, col: 1 })
    expect(swapResult.valid).toBe(true)

    // First step should match 4 stars
    const firstResult = swapResult.results[0]
    expect(firstResult.matches[0].length).toBe(4)
    expect(firstResult.pointsAwarded).toBe(250)
  })

  function cleanCheckerboard(targetEngine: MatchEngine) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        const type: TileType = (r + c) % 2 === 0 ? 'CIRCLE' : 'STAR'
        targetEngine.board[r][c] = {
          id: r * 6 + c + 1,
          type,
          row: r,
          col: c,
          visualX: 0,
          visualY: 0,
          scale: 1,
          alpha: 1,
          isMatched: false,
        }
      }
    }
  }

  it('7. Detects match of 5 tiles and awards 500 points', () => {
    engine.start()
    cleanCheckerboard(engine)

    // Setup 5 in a row: cols 0..3 DIAMOND, col 4 TRIANGLE, col 5 STAR (guaranteed exactly 5 diamonds after swap)
    for (let c = 0; c < 4; c++) {
      engine.board[0][c] = { id: c + 1, type: 'DIAMOND', row: 0, col: c, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    }
    engine.board[0][4] = { id: 5, type: 'TRIANGLE', row: 0, col: 4, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][5] = { id: 7, type: 'STAR', row: 0, col: 5, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][4] = { id: 6, type: 'DIAMOND', row: 1, col: 4, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    const swapResult = engine.executeSwap({ row: 0, col: 4 }, { row: 1, col: 4 })
    expect(swapResult.valid).toBe(true)
    const firstResult = swapResult.results[0]
    expect(firstResult.matches[0].length).toBe(5)
    expect(firstResult.pointsAwarded).toBe(500)
  })

  it('8. Handles simultaneous horizontal and vertical matches without double-counting the intersection tile', () => {
    // Construct T-shape centered at (2,2) with 'SQUARE'
    // Horizontal: (2,0), (2,1), (2,2) = length 3
    // Vertical: (0,2), (1,2), (2,2) = length 3
    engine.start()
    cleanCheckerboard(engine)

    engine.board[2][0] = { id: 1, type: 'SQUARE', row: 2, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[2][1] = { id: 2, type: 'SQUARE', row: 2, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[2][2] = { id: 3, type: 'SQUARE', row: 2, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][2] = { id: 4, type: 'SQUARE', row: 0, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][2] = { id: 5, type: 'SQUARE', row: 1, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    const matches = engine.findMatches()
    expect(matches.length).toBe(2) // 1 horizontal (length 3), 1 vertical (length 3)

    // Total unique tiles in this cross is 5 (not 6!)
    const uniqueTiles = new Set<string>()
    for (const m of matches) {
      for (const t of m.tiles) {
        uniqueTiles.add(`${t.row},${t.col}`)
      }
    }
    expect(uniqueTiles.size).toBe(5)
  })

  it('9. Applies gravity and refills top empty slots after clearing tiles', () => {
    engine.start()

    // Form match on bottom row (row 5)
    engine.board[5][0] = { id: 1, type: 'CIRCLE', row: 5, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[5][1] = { id: 2, type: 'CIRCLE', row: 5, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[5][2] = { id: 3, type: 'STAR', row: 5, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[4][2] = { id: 4, type: 'CIRCLE', row: 4, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    engine.executeSwap({ row: 5, col: 2 }, { row: 4, col: 2 })

    // Board must have exactly 36 tiles and no null slots
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        expect(engine.board[r][c]).not.toBeNull()
      }
    }
  })

  it('10. Triggers WIN when score reaches or exceeds targetScore (1500)', () => {
    engine.start()
    engine.stats.score = 1450

    // Trigger match giving 100 points -> 1550 points
    engine.board[0][0] = { id: 1, type: 'CIRCLE', row: 0, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][1] = { id: 2, type: 'CIRCLE', row: 0, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][2] = { id: 3, type: 'STAR', row: 0, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][2] = { id: 4, type: 'CIRCLE', row: 1, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    engine.executeSwap({ row: 0, col: 2 }, { row: 1, col: 2 })

    expect(engine.stats.score).toBeGreaterThanOrEqual(1500)
    expect(engine.state).toBe('GAME_OVER')
    expect(engine.stats.isWin).toBe(true)
  })

  it('11. Triggers LOSS when movesRemaining reaches 0 without reaching target score', () => {
    engine.start()
    engine.stats.movesRemaining = 1
    engine.stats.score = 200

    // Perform valid swap
    engine.board[0][0] = { id: 1, type: 'CIRCLE', row: 0, col: 0, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][1] = { id: 2, type: 'CIRCLE', row: 0, col: 1, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[0][2] = { id: 3, type: 'STAR', row: 0, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }
    engine.board[1][2] = { id: 4, type: 'CIRCLE', row: 1, col: 2, visualX: 0, visualY: 0, scale: 1, alpha: 1, isMatched: false }

    engine.executeSwap({ row: 0, col: 2 }, { row: 1, col: 2 })

    expect(engine.stats.movesRemaining).toBe(0)
    expect(engine.state).toBe('GAME_OVER')
    expect(engine.stats.isWin).toBe(false)
  })

  it('12. Does not permit additional swaps when game is in GAME_OVER or PAUSED', () => {
    engine.start()
    engine.state = 'GAME_OVER'

    const overSwap = engine.executeSwap({ row: 0, col: 0 }, { row: 0, col: 1 })
    expect(overSwap.valid).toBe(false)

    engine.state = 'PAUSED'
    const pauseSwap = engine.executeSwap({ row: 0, col: 0 }, { row: 0, col: 1 })
    expect(pauseSwap.valid).toBe(false)
  })

  it('13. Deadlock detection and bounded shuffle restores playable moves without unbounded loops', () => {
    engine.start()

    // Explicitly call shuffleBoard
    const shuffleSuccess = engine.shuffleBoard(20)
    expect(shuffleSuccess).toBe(true)

    // Must have at least 2 available moves after shuffle
    const movesAfterShuffle = engine.findAvailableMoves()
    expect(movesAfterShuffle.length).toBeGreaterThanOrEqual(2)
  })
})
