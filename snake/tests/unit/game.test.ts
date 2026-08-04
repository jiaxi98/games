import { describe, expect, it } from 'vitest';
import { advanceGame, createInitialState, queueDirection, spawnFood } from '../../src/core/game';
import type { GameState } from '../../src/core/types';

function sequenceRandom(sequence: number[]): () => number {
  let index = 0;
  return () => {
    const fallback = sequence.length === 0 ? 0 : sequence[sequence.length - 1];
    const value = sequence[index] ?? fallback;
    index += 1;
    return value;
  };
}

describe('snake core game logic', () => {
  it('creates an initial state with food outside the snake', () => {
    const state = createInitialState({ cols: 8, rows: 8 }, 'normal', () => 0);

    expect(state.snake).toHaveLength(3);
    expect(state.phase).toBe('idle');
    expect(state.snake.some((segment) => segment.x === state.food.x && segment.y === state.food.y)).toBe(
      false,
    );
  });

  it('ignores opposite direction input and accepts valid turns', () => {
    const state = createInitialState({ cols: 12, rows: 12 }, 'normal');
    const ignored = queueDirection(state, 'left');
    const accepted = queueDirection(state, 'up');

    expect(ignored.queuedDirection).toBeNull();
    expect(accepted.queuedDirection).toBe('up');
  });

  it('moves forward in running phase', () => {
    const base = createInitialState({ cols: 12, rows: 12 }, 'normal');
    const runningState: GameState = { ...base, phase: 'running' };
    const next = advanceGame(runningState, () => 0.4);

    expect(next.snake[0]).toEqual({ x: runningState.snake[0].x + 1, y: runningState.snake[0].y });
    expect(next.snake).toHaveLength(runningState.snake.length);
    expect(next.phase).toBe('running');
  });

  it('grows snake and increments score after eating food', () => {
    const runningState: GameState = {
      board: { cols: 6, rows: 6 },
      snake: [
        { x: 2, y: 2 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ],
      direction: 'right',
      queuedDirection: null,
      food: { x: 3, y: 2 },
      score: 0,
      phase: 'running',
      difficulty: 'normal',
      tickCount: 0,
    };

    const next = advanceGame(runningState, () => 0);
    expect(next.score).toBe(1);
    expect(next.snake).toHaveLength(4);
    expect(next.snake[0]).toEqual({ x: 3, y: 2 });
    expect(next.phase).toBe('running');
  });

  it('ends game when snake hits wall', () => {
    const runningState: GameState = {
      board: { cols: 4, rows: 4 },
      snake: [
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
      ],
      direction: 'right',
      queuedDirection: null,
      food: { x: 0, y: 0 },
      score: 2,
      phase: 'running',
      difficulty: 'normal',
      tickCount: 5,
    };

    const next = advanceGame(runningState);
    expect(next.phase).toBe('game_over');
    expect(next.score).toBe(2);
  });

  it('allows moving into old tail position when not growing', () => {
    const runningState: GameState = {
      board: { cols: 8, rows: 8 },
      snake: [
        { x: 2, y: 2 },
        { x: 2, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
      ],
      direction: 'left',
      queuedDirection: null,
      food: { x: 6, y: 6 },
      score: 3,
      phase: 'running',
      difficulty: 'normal',
      tickCount: 10,
    };

    const next = advanceGame(runningState);
    expect(next.phase).toBe('running');
    expect(next.snake[0]).toEqual({ x: 1, y: 2 });
  });

  it('returns null food spawn when board is full', () => {
    const board = { cols: 2, rows: 2 };
    const fullSnake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    const nextFood = spawnFood(board, fullSnake, sequenceRandom([0.2, 0.9]));
    expect(nextFood).toBeNull();
  });
});
