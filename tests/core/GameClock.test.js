import { describe, expect, it } from 'vitest';
import { GameClock } from '../../src/core/GameClock.js';

describe('GameClock', () => {
  it('produces deterministic fixed steps and interpolation alpha', () => {
    const clock = new GameClock({ fixedStep: 0.01, maxDelta: 0.1, maxSubSteps: 10 });
    expect(clock.tick(1000).steps).toBe(0);

    const frame = clock.tick(1025);
    expect(frame.delta).toBeCloseTo(0.025);
    expect(frame.steps).toBe(2);
    expect(frame.alpha).toBeCloseTo(0.5);
  });

  it('clamps long frame gaps and limits catch-up work', () => {
    const clock = new GameClock({ fixedStep: 0.01, maxDelta: 0.05, maxSubSteps: 3 });
    clock.tick(0);
    const frame = clock.tick(1000);

    expect(frame.delta).toBe(0.05);
    expect(frame.steps).toBe(3);
    expect(frame.alpha).toBeLessThan(1);
  });
});
