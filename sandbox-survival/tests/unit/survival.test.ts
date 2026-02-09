import { describe, expect, it } from 'vitest';
import {
  applyToolWear,
  assessSurvivalState,
  canUseTool,
  createInitialSurvivalState,
  isDowned,
  recoverFromDowned,
  tickSurvival,
} from '../../src/survival/survival';

describe('survival state', () => {
  it('reduces hunger over time and eventually affects health', () => {
    let state = createInitialSurvivalState();
    state = tickSurvival(state, 400, false);

    expect(state.hunger).toBe(0);
    expect(state.health).toBeLessThan(100);
  });

  it('warms up faster when near heat source', () => {
    const base = createInitialSurvivalState();
    const coldStart = { ...base, temperature: 20 };

    const withoutHeat = tickSurvival(coldStart, 3, false);
    const withHeat = tickSurvival(coldStart, 3, true);

    expect(withHeat.temperature).toBeGreaterThan(withoutHeat.temperature);
  });

  it('blocks tool usage when durability reaches zero', () => {
    const state = createInitialSurvivalState();
    const worn = applyToolWear(state, 100);

    expect(worn.durability).toBe(0);
    expect(canUseTool(worn)).toBe(false);
  });

  it('assesses downed state and exposes a recovery message', () => {
    const state = {
      ...createInitialSurvivalState(),
      health: 0,
      hunger: 0,
    };

    const assessment = assessSurvivalState(state);

    expect(isDowned(state)).toBe(true);
    expect(assessment.condition).toBe('downed');
    expect(assessment.message).toContain('recover');
  });

  it('recovers downed state to playable baseline', () => {
    const downed = {
      ...createInitialSurvivalState(),
      health: 0,
      hunger: 10,
      temperature: 15,
      durability: 5,
    };

    const recovered = recoverFromDowned(downed);

    expect(recovered.health).toBeGreaterThan(0);
    expect(recovered.hunger).toBeGreaterThanOrEqual(50);
    expect(recovered.temperature).toBeGreaterThan(40);
    expect(recovered.durability).toBeGreaterThanOrEqual(35);
  });
});
