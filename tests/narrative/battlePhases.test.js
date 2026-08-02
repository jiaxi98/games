import { describe, expect, it } from 'vitest';
import {
  BattlePhase,
  createBattlePhaseEvent,
  getBattlePhase,
} from '../../src/narrative/battlePhases.js';

describe('battle phase vocabulary', () => {
  it('provides one phase/intensity contract for mission, presentation, audio, and world', () => {
    expect(getBattlePhase(BattlePhase.OPENING)).toMatchObject({
      label: 'Vanguard scattered',
      intensity: 0.8,
    });
    expect(createBattlePhaseEvent(BattlePhase.FORD)).toEqual({
      phase: BattlePhase.FORD,
      label: 'Ford assault',
      intensity: 0.9,
    });
    expect(createBattlePhaseEvent(BattlePhase.VICTORY)).toMatchObject({
      intensity: 0.35,
    });
  });
});
