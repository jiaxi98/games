import type { BoardSize, Difficulty, Direction, GamePhase, GameState, Point } from './types';

const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const DIRECTION_OFFSET: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const SPEED_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 170,
  normal: 130,
  hard: 95,
};

export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function containsPoint(points: Point[], target: Point): boolean {
  return points.some((point) => pointsEqual(point, target));
}

export function isInsideBoard(point: Point, board: BoardSize): boolean {
  return point.x >= 0 && point.x < board.cols && point.y >= 0 && point.y < board.rows;
}

export function isOppositeDirection(current: Direction, next: Direction): boolean {
  return OPPOSITE_DIRECTION[current] === next;
}

export function nextHeadPosition(head: Point, direction: Direction): Point {
  const offset = DIRECTION_OFFSET[direction];
  return { x: head.x + offset.x, y: head.y + offset.y };
}

export function createInitialSnake(board: BoardSize): Point[] {
  const centerX = Math.floor(board.cols / 2);
  const centerY = Math.floor(board.rows / 2);
  return [
    { x: centerX, y: centerY },
    { x: centerX - 1, y: centerY },
    { x: centerX - 2, y: centerY },
  ];
}

export function spawnFood(
  board: BoardSize,
  occupied: Point[],
  random: () => number = Math.random,
): Point | null {
  const blocked = new Set(occupied.map((point) => `${point.x}:${point.y}`));
  const available: Point[] = [];

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = `${x}:${y}`;
      if (!blocked.has(key)) {
        available.push({ x, y });
      }
    }
  }

  if (available.length === 0) {
    return null;
  }

  const index = Math.min(available.length - 1, Math.floor(random() * available.length));
  return available[index];
}

export function createInitialState(
  board: BoardSize,
  difficulty: Difficulty,
  random: () => number = Math.random,
): GameState {
  const snake = createInitialSnake(board);
  const food = spawnFood(board, snake, random);

  if (!food) {
    throw new Error('Failed to spawn initial food: board is full.');
  }

  return {
    board,
    snake,
    direction: 'right',
    queuedDirection: null,
    food,
    score: 0,
    phase: 'idle',
    difficulty,
    tickCount: 0,
  };
}

export function queueDirection(state: GameState, nextDirection: Direction): GameState {
  const baseDirection = state.queuedDirection ?? state.direction;
  if (nextDirection === baseDirection || isOppositeDirection(baseDirection, nextDirection)) {
    return state;
  }
  return {
    ...state,
    queuedDirection: nextDirection,
  };
}

export function setPhase(state: GameState, phase: GamePhase): GameState {
  return {
    ...state,
    phase,
  };
}

export function setDifficulty(
  state: GameState,
  difficulty: Difficulty,
  random: () => number = Math.random,
): GameState {
  return createInitialState(state.board, difficulty, random);
}

export function restartGame(state: GameState, random: () => number = Math.random): GameState {
  return createInitialState(state.board, state.difficulty, random);
}

export function advanceGame(state: GameState, random: () => number = Math.random): GameState {
  if (state.phase !== 'running') {
    return state;
  }

  const requestedDirection = state.queuedDirection ?? state.direction;
  const direction = isOppositeDirection(state.direction, requestedDirection)
    ? state.direction
    : requestedDirection;

  const currentHead = state.snake[0];
  const nextHead = nextHeadPosition(currentHead, direction);

  if (!isInsideBoard(nextHead, state.board)) {
    return {
      ...state,
      direction,
      queuedDirection: null,
      phase: 'game_over',
      tickCount: state.tickCount + 1,
    };
  }

  const eatsFood = pointsEqual(nextHead, state.food);
  const collisionBody = eatsFood ? state.snake : state.snake.slice(0, -1);
  if (containsPoint(collisionBody, nextHead)) {
    return {
      ...state,
      direction,
      queuedDirection: null,
      phase: 'game_over',
      tickCount: state.tickCount + 1,
    };
  }

  const nextSnake = [nextHead, ...state.snake];
  if (!eatsFood) {
    nextSnake.pop();
  }

  let nextFood = state.food;
  let nextScore = state.score;
  let nextPhase: GamePhase = state.phase;

  if (eatsFood) {
    nextScore += 1;
    const spawnedFood = spawnFood(state.board, nextSnake, random);
    if (spawnedFood) {
      nextFood = spawnedFood;
    } else {
      // Board is fully occupied, player wins this round.
      nextPhase = 'game_over';
    }
  }

  return {
    ...state,
    snake: nextSnake,
    direction,
    queuedDirection: null,
    food: nextFood,
    score: nextScore,
    phase: nextPhase,
    tickCount: state.tickCount + 1,
  };
}
