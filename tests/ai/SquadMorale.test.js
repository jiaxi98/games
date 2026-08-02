import { describe, expect, it } from 'vitest';
import { CohesionState, SquadMorale } from '../../src/ai/SquadMorale.js';

describe('SquadMorale', () => {
  it('transitions ordered -> pressured -> fractured -> routed under escalating shock', () => {
    const morale = new SquadMorale({ initial: 0.9, discipline: 0.45 });
    const seen = [morale.state];
    morale.addEventListener('statechange', (event) => seen.push(event.state));

    for (let i = 0; i < 6; i += 1) {
      morale.applyCasualty({ nearby: true });
      morale.update(0.6, {
        casualtyRatio: i / 8,
        localOutnumbered: 0.7,
        flankPressure: 0.55,
        officerAlive: i < 4,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      morale.update(0.6, {
        casualtyRatio: 0.75,
        localOutnumbered: 1,
        flankPressure: 1,
        officerAlive: false,
      });
    }

    expect(seen).toContain(CohesionState.PRESSURED);
    expect(seen).toContain(CohesionState.FRACTURED);
    expect(morale.state).toBe(CohesionState.ROUTED);
  });

  it('allows an explicit rally to recover a broken formation', () => {
    const morale = new SquadMorale({ initial: 0.1 });
    expect(morale.state).toBe(CohesionState.ROUTED);
    morale.rally(0.68);
    expect(morale.value).toBeCloseTo(0.78);
    expect(morale.state).toBe(CohesionState.ORDERED);
  });
});

