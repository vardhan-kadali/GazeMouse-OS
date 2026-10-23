import type {
  MatchBoard,
  MatchTile,
  TileType,
  GridPosition,
  MatchGroup,
  MatchResult,
  MatchStats,
  GameState,
  PauseReason,
  MatchEngineOptions,
} from './types'
import { ALL_TILE_TYPES } from './types'

export class MatchEngine {
  public rows: number = 6
  public cols: number = 6
  public board: MatchBoard = []
  public state: GameState = 'MENU'
  public pauseReason: PauseReason | null = null
  public trackingRestoredDuringPause: boolean = false

  public stats: MatchStats = {
    score: 0,
    highScore: 0,
    movesRemaining: 20,
    movesMade: 0,
    matchesCount: 0,
    targetScore: 1500,
    isWin: false,
  }

  private nextTileId: number = 1
  private rng: () => number
  private options: Required<Omit<MatchEngineOptions, 'rng'>> & { rng?: () => number }

  constructor(options: MatchEngineOptions = {}) {
    this.rows = options.gridRows ?? 6
    this.cols = options.gridCols ?? 6
    this.rng = options.rng ?? Math.random
    this.options = {
      gridRows: this.rows,
      gridCols: this.cols,
      targetScore: options.targetScore ?? 1500,
      maxMoves: options.maxMoves ?? 20,
      reducedMotion: options.reducedMotion ?? false,
      rng: options.rng,
    }

    this.stats.targetScore = this.options.targetScore
    this.stats.movesRemaining = this.options.maxMoves
    this.stats.highScore = this.loadHighScore()

    this.initBoard()
  }

  public isGameOver(): boolean {
    return this.state === 'GAME_OVER'
  }

  public getState(): GameState {
    return this.state
  }

  /**
   * Initializes a new playable 6x6 board guaranteed to have:
   * 1. Exactly 36 valid tiles.
   * 2. Zero pre-existing matches of 3 or more.
   * 3. At least two valid moves available to the player.
   */
  public initBoard(): void {
    let attempts = 0
    const maxAttempts = 30

    while (attempts < maxAttempts) {
      attempts++
      this.board = this.generateMatchFreeBoard()
      const available = this.findAvailableMoves()
      if (available.length >= 2) {
        return
      }
    }

    // Deterministic fallback if random sampling did not yield >= 2 moves:
    // Forcefully inject at least two valid swap setups
    this.injectGuaranteedMoves()
  }

  public start(): void {
    this.reset()
    this.state = 'PLAYING'
    this.pauseReason = null
    this.trackingRestoredDuringPause = false
  }

  public reset(): void {
    this.initBoard()
    this.stats = {
      score: 0,
      highScore: this.loadHighScore(),
      movesRemaining: this.options.maxMoves,
      movesMade: 0,
      matchesCount: 0,
      targetScore: this.options.targetScore,
      isWin: false,
    }
    this.state = 'PLAYING'
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

  public getTile(row: number, col: number): MatchTile | null {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) {
      return null
    }
    return this.board[row]?.[col] ?? null
  }

  public areOrthogonallyAdjacent(posA: GridPosition, posB: GridPosition): boolean {
    const dr = Math.abs(posA.row - posB.row)
    const dc = Math.abs(posA.col - posB.col)
    return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
  }

  /**
   * Attempts a swap between posA and posB.
   * If valid: executes swap, deducts exactly 1 move, resolves full cascade sequence,
   * evaluates win/loss, and returns results.
   * If invalid: reverts swap, costs 0 moves, returns valid: false.
   */
  public executeSwap(
    posA: GridPosition,
    posB: GridPosition
  ): { valid: boolean; results: MatchResult[]; reverted: boolean } {
    if (this.state !== 'PLAYING') {
      return { valid: false, results: [], reverted: false }
    }

    if (!this.areOrthogonallyAdjacent(posA, posB)) {
      return { valid: false, results: [], reverted: false }
    }

    const tileA = this.getTile(posA.row, posA.col)
    const tileB = this.getTile(posB.row, posB.col)
    if (!tileA || !tileB) {
      return { valid: false, results: [], reverted: false }
    }

    // 1. Swap positions on the board
    this.swapTilesInGrid(posA, posB)

    // 2. Check if this swap creates any matches
    const initialMatches = this.findMatches()

    if (initialMatches.length === 0) {
      // Invalid swap: revert immediately without deducting moves
      this.swapTilesInGrid(posA, posB)
      return { valid: false, results: [], reverted: true }
    }

    // 3. Valid turn: deduct exactly 1 move regardless of cascade depth
    this.stats.movesRemaining -= 1
    this.stats.movesMade += 1

    // 4. Resolve full cascade sequence
    const allResults: MatchResult[] = []
    let cascadeLevel = 1
    let currentMatches = initialMatches

    while (currentMatches.length > 0) {
      const result = this.processMatchStep(currentMatches, cascadeLevel)
      allResults.push(result)

      // Apply gravity and refill
      this.applyGravity()
      this.refillEmptySlots()

      // Check for subsequent cascade matches
      cascadeLevel++
      currentMatches = this.findMatches()
    }

    // 5. Check for deadlock on new board state and auto-shuffle if needed
    const availableMoves = this.findAvailableMoves()
    if (availableMoves.length === 0 && this.stats.movesRemaining > 0 && !this.stats.isWin) {
      this.shuffleBoard()
    }

    // 6. Evaluate Win / Loss
    this.evaluateGameCompletion()

    return { valid: true, results: allResults, reverted: false }
  }

  /**
   * Finds all horizontal and vertical matches of 3 or more consecutive identical tiles.
   */
  public findMatches(): MatchGroup[] {
    const matches: MatchGroup[] = []

    // 1. Horizontal Matches
    for (let r = 0; r < this.rows; r++) {
      let matchLength = 1
      for (let c = 0; c < this.cols; c++) {
        const current = this.board[r][c]
        const next = c < this.cols - 1 ? this.board[r][c + 1] : null

        if (current && next && current.type === next.type) {
          matchLength++
        } else {
          if (matchLength >= 3 && current) {
            const tiles: GridPosition[] = []
            for (let i = 0; i < matchLength; i++) {
              tiles.push({ row: r, col: c - matchLength + 1 + i })
            }
            matches.push({
              tiles,
              type: current.type,
              orientation: 'HORIZONTAL',
              length: matchLength,
            })
          }
          matchLength = 1
        }
      }
    }

    // 2. Vertical Matches
    for (let c = 0; c < this.cols; c++) {
      let matchLength = 1
      for (let r = 0; r < this.rows; r++) {
        const current = this.board[r][c]
        const next = r < this.rows - 1 ? this.board[r + 1][c] : null

        if (current && next && current.type === next.type) {
          matchLength++
        } else {
          if (matchLength >= 3 && current) {
            const tiles: GridPosition[] = []
            for (let i = 0; i < matchLength; i++) {
              tiles.push({ row: r - matchLength + 1 + i, col: c })
            }
            matches.push({
              tiles,
              type: current.type,
              orientation: 'VERTICAL',
              length: matchLength,
            })
          }
          matchLength = 1
        }
      }
    }

    return matches
  }

  /**
   * Clears matched tiles, computes scores with cascade multipliers,
   * avoiding double-counting tiles that are part of simultaneous horizontal and vertical matches.
   */
  private processMatchStep(matches: MatchGroup[], cascadeLevel: number): MatchResult {
    const uniquePositions = new Set<string>()
    let stepScore = 0

    for (const match of matches) {
      // Calculate score per match length:
      // Length 3: 100 points
      // Length 4: 250 points
      // Length 5+: 500 points + 100 for each additional tile
      let groupBaseScore = 100
      if (match.length === 4) {
        groupBaseScore = 250
      } else if (match.length >= 5) {
        groupBaseScore = 500 + (match.length - 5) * 100
      }

      // Multiply by cascade level
      stepScore += groupBaseScore * cascadeLevel

      for (const pos of match.tiles) {
        uniquePositions.add(`${pos.row},${pos.col}`)
      }
    }

    // Clear matched tiles from board
    for (const key of uniquePositions) {
      const [r, c] = key.split(',').map(Number)
      this.board[r][c] = null
    }

    this.stats.score += stepScore
    this.stats.matchesCount += matches.length

    if (this.stats.score > this.stats.highScore) {
      this.stats.highScore = this.stats.score
      this.saveHighScore(this.stats.score)
    }

    return {
      matches,
      uniqueTilesCleared: uniquePositions.size,
      pointsAwarded: stepScore,
      cascadeLevel,
    }
  }

  /**
   * Applies gravity: shifts non-null tiles downward to fill null holes.
   */
  public applyGravity(): void {
    for (let c = 0; c < this.cols; c++) {
      let writeRow = this.rows - 1
      for (let r = this.rows - 1; r >= 0; r--) {
        if (this.board[r][c] !== null) {
          if (r !== writeRow) {
            const tile = this.board[r][c]!
            tile.row = writeRow
            this.board[writeRow][c] = tile
            this.board[r][c] = null
          }
          writeRow--
        }
      }
    }
  }

  /**
   * Refills empty top slots with randomized new tiles.
   */
  public refillEmptySlots(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.board[r][c] === null) {
          const type = this.getRandomTileType()
          this.board[r][c] = {
            id: this.nextTileId++,
            type,
            row: r,
            col: c,
            visualX: c * 80 + 40,
            visualY: r * 80 + 40,
            scale: 1,
            alpha: 1,
            isMatched: false,
          }
        }
      }
    }
  }

  /**
   * Simulates all possible orthogonal swaps to find available moves.
   */
  public findAvailableMoves(): { from: GridPosition; to: GridPosition }[] {
    const validMoves: { from: GridPosition; to: GridPosition }[] = []

    // Check horizontal swaps
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        const from = { row: r, col: c }
        const to = { row: r, col: c + 1 }

        this.swapTilesInGrid(from, to)
        const matches = this.findMatches()
        this.swapTilesInGrid(from, to) // Revert

        if (matches.length > 0) {
          validMoves.push({ from, to })
        }
      }
    }

    // Check vertical swaps
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols; c++) {
        const from = { row: r, col: c }
        const to = { row: r + 1, col: c }

        this.swapTilesInGrid(from, to)
        const matches = this.findMatches()
        this.swapTilesInGrid(from, to) // Revert

        if (matches.length > 0) {
          validMoves.push({ from, to })
        }
      }
    }

    return validMoves
  }

  /**
   * Bounded shuffle recovery: reshuffles current board tiles if deadlocked.
   */
  public shuffleBoard(maxAttempts: number = 20): boolean {
    const allTiles: MatchTile[] = []
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.board[r][c]
        if (tile) allTiles.push(tile)
      }
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Fisher-Yates shuffle
      for (let i = allTiles.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1))
        const temp = allTiles[i]
        allTiles[i] = allTiles[j]
        allTiles[j] = temp
      }

      // Re-place into board
      let idx = 0
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const tile = allTiles[idx++]
          tile.row = r
          tile.col = c
          this.board[r][c] = tile
        }
      }

      // Check if board has no immediate matches but has available moves
      if (this.findMatches().length === 0 && this.findAvailableMoves().length >= 2) {
        return true
      }
    }

    // Safe bounded recovery: inject guaranteed moves if pure shuffling failed
    this.injectGuaranteedMoves()
    return true
  }

  private generateMatchFreeBoard(): MatchBoard {
    const board: MatchBoard = []

    for (let r = 0; r < this.rows; r++) {
      board[r] = []
      for (let c = 0; c < this.cols; c++) {
        // Collect forbidden types that would form 3-in-a-row
        const forbidden = new Set<TileType>()

        // Check horizontal left 2
        if (c >= 2 && board[r][c - 1] && board[r][c - 2]) {
          if (board[r][c - 1]!.type === board[r][c - 2]!.type) {
            forbidden.add(board[r][c - 1]!.type)
          }
        }

        // Check vertical top 2
        if (r >= 2 && board[r - 1]?.[c] && board[r - 2]?.[c]) {
          if (board[r - 1][c]!.type === board[r - 2][c]!.type) {
            forbidden.add(board[r - 1][c]!.type)
          }
        }

        const allowed = ALL_TILE_TYPES.filter((t) => !forbidden.has(t))
        const chosenType = allowed[Math.floor(this.rng() * allowed.length)] || ALL_TILE_TYPES[0]

        board[r][c] = {
          id: this.nextTileId++,
          type: chosenType,
          row: r,
          col: c,
          visualX: c * 80 + 40,
          visualY: r * 80 + 40,
          scale: 1,
          alpha: 1,
          isMatched: false,
        }
      }
    }

    return board
  }

  private injectGuaranteedMoves(): void {
    // Guarantees at least 2 valid swap configurations on rows 1 and 4
    if (this.rows >= 4 && this.cols >= 4) {
      // Setup move 1: [T, T, OTHER, T] on row 1
      const type1 = ALL_TILE_TYPES[0]
      const otherType = ALL_TILE_TYPES[1]

      if (this.board[1]?.[0]) this.board[1][0]!.type = type1
      if (this.board[1]?.[1]) this.board[1][1]!.type = type1
      if (this.board[1]?.[2]) this.board[1][2]!.type = otherType
      if (this.board[2]?.[2]) this.board[2][2]!.type = type1 // Swapping (1,2) with (2,2) completes 3-in-a-row!

      // Setup move 2: [T2, OTHER, T2, T2] on row 4
      const type2 = ALL_TILE_TYPES[2]
      const other2 = ALL_TILE_TYPES[3]

      if (this.board[4]?.[0]) this.board[4][0]!.type = type2
      if (this.board[4]?.[1]) this.board[4][1]!.type = other2
      if (this.board[4]?.[2]) this.board[4][2]!.type = type2
      if (this.board[3]?.[1]) this.board[3][1]!.type = type2 // Swapping (4,1) with (3,1) completes 3-in-a-row!
    }
  }

  private swapTilesInGrid(posA: GridPosition, posB: GridPosition): void {
    const tileA = this.board[posA.row][posA.col]
    const tileB = this.board[posB.row][posB.col]

    if (tileA && tileB) {
      tileA.row = posB.row
      tileA.col = posB.col

      tileB.row = posA.row
      tileB.col = posA.col

      this.board[posA.row][posA.col] = tileB
      this.board[posB.row][posB.col] = tileA
    }
  }

  private evaluateGameCompletion(): void {
    if (this.stats.score >= this.stats.targetScore) {
      this.state = 'GAME_OVER'
      this.stats.isWin = true
    } else if (this.stats.movesRemaining <= 0) {
      this.state = 'GAME_OVER'
      this.stats.isWin = false
    }
  }

  private getRandomTileType(): TileType {
    const idx = Math.floor(this.rng() * ALL_TILE_TYPES.length)
    return ALL_TILE_TYPES[idx]
  }

  private loadHighScore(): number {
    try {
      const stored = localStorage.getItem('gazemouse_match_highscore_v1')
      return stored ? parseInt(stored, 10) || 0 : 0
    } catch {
      return 0
    }
  }

  private saveHighScore(score: number): void {
    try {
      localStorage.setItem('gazemouse_match_highscore_v1', score.toString())
    } catch {
      // Storage unavailable fallback
    }
  }
}
