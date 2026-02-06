export type Direction = 'up' | 'down' | 'left' | 'right';

export type GamePhase = 'idle' | 'running' | 'paused' | 'game_over';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Point {
  x: number;
  y: number;
}

export interface BoardSize {
  cols: number;
  rows: number;
}

export interface GameState {
  board: BoardSize;
  snake: Point[];
  direction: Direction;
  queuedDirection: Direction | null;
  food: Point;
  score: number;
  phase: GamePhase;
  difficulty: Difficulty;
  tickCount: number;
}
