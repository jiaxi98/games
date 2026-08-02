import { describe, expect, it, vi } from 'vitest';
import { GameState, GameStates } from '../../src/core/GameState.js';

describe('GameState', () => {
  it('enforces the game lifecycle and emits changes', () => {
    const state = new GameState();
    const listener = vi.fn();
    state.onChange(listener);

    state.transition(GameStates.READY);
    state.transition(GameStates.PLAYING);
    state.transition(GameStates.PAUSED);

    expect(state.value).toBe(GameStates.PAUSED);
    expect(listener).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenLastCalledWith({
      previous: GameStates.PLAYING,
      current: GameStates.PAUSED,
      detail: undefined,
    });
  });

  it('rejects impossible transitions', () => {
    const state = new GameState();
    expect(() => state.transition(GameStates.PLAYING)).toThrow(/Invalid game state transition/);
  });
});
