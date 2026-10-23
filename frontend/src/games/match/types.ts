export type TileType = 'CIRCLE' | 'STAR' | 'DIAMOND' | 'TRIANGLE' | 'SQUARE'

export interface TileShapeInfo {
  type: TileType
  name: string
  color: string
  colorLight: string
  colorDark: string
  symbol: string
  description: string
}

export const TILE_DEFINITIONS: Record<TileType, TileShapeInfo> = {
  CIRCLE: {
    type: 'CIRCLE',
    name: 'Blue Sphere',
    color: '#2563eb',
    colorLight: '#60a5fa',
    colorDark: '#1d4ed8',
    symbol: '●',
    description: 'Blue Sphere with circular ring',
  },
  STAR: {
    type: 'STAR',
    name: 'Golden Star',
    color: '#eab308',
    colorLight: '#fde047',
    colorDark: '#ca8a04',
    symbol: '★',
    description: 'Golden five-point star',
  },
  DIAMOND: {
    type: 'DIAMOND',
    name: 'Emerald Diamond',
    color: '#16a34a',
    colorLight: '#4ade80',
    colorDark: '#15803d',
    symbol: '◆',
    description: 'Emerald green four-point diamond',
  },
  TRIANGLE: {
    type: 'TRIANGLE',
    name: 'Amethyst Triangle',
    color: '#9333ea',
    colorLight: '#c084fc',
    colorDark: '#7e22ce',
    symbol: '▲',
    description: 'Amethyst purple triangle',
  },
  SQUARE: {
    type: 'SQUARE',
    name: 'Coral Cube',
    color: '#ea580c',
    colorLight: '#fb923c',
    colorDark: '#c2410c',
    symbol: '■',
    description: 'Coral orange cube square',
  },
}

export const ALL_TILE_TYPES: TileType[] = ['CIRCLE', 'STAR', 'DIAMOND', 'TRIANGLE', 'SQUARE']

export interface GridPosition {
  row: number // 0 to 5
  col: number // 0 to 5
}

export interface MatchTile {
  id: number
  type: TileType
  row: number
  col: number
  visualX: number // Canvas X coordinate
  visualY: number // Canvas Y coordinate
  scale: number // 0 to 1 for spawn/pop animations
  alpha: number // 0 to 1 for fade
  isMatched: boolean
}

export type MatchBoard = (MatchTile | null)[][]

export type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER'
export type GameMode = 'CHALLENGE' | 'ZEN'
export type PauseReason = 'MANUAL' | 'TRACKING_LOST'

export interface MatchGroup {
  tiles: GridPosition[]
  type: TileType
  orientation: 'HORIZONTAL' | 'VERTICAL'
  length: number
}

export interface MatchResult {
  matches: MatchGroup[]
  uniqueTilesCleared: number
  pointsAwarded: number
  cascadeLevel: number
}

export interface MatchStats {
  score: number
  highScore: number
  movesRemaining: number
  movesMade: number
  matchesCount: number
  targetScore: number
  isWin: boolean
}

export interface DwellState {
  target: GridPosition | null
  progress: number // 0 to 1
  elapsedMs: number
  isLocked: boolean
}

export interface CursorPosition {
  x: number // Pixels on board (0 to boardWidth)
  y: number // Pixels on board (0 to boardHeight)
  activeTile: GridPosition | null
}

export interface MatchParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export interface MatchEngineOptions {
  gridRows?: number // Default: 6
  gridCols?: number // Default: 6
  targetScore?: number // Default: 1500
  maxMoves?: number // Default: 20
  reducedMotion?: boolean
  rng?: () => number // For deterministic test injection
}
