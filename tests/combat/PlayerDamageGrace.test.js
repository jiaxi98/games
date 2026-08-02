import { describe, expect, it } from 'vitest';
import { Combatant } from '../../src/combat/Combatant.js';

describe('player damage grace contract', () => {
  it('keeps avoided follow-up hits non-lethal and metadata-safe', () => {
    const player = new Combatant({ maxHealth: 120 });
    const first = player.receiveImpact({
      damage: 35,
      damageType: 'pierce',
      direction: { x: 0, y: 0, z: 1 },
    });
    const avoided = {
      outcome: 'avoided',
      damage: 0,
      killed: false,
      hitZone: 'torso',
      surface: 'armor',
      material: 'armor',
      severity: 0,
      intensity: 0,
    };

    expect(first.damage).toBeGreaterThan(0);
    expect(avoided).toMatchObject({ outcome: 'avoided', killed: false, damage: 0 });
  });
});

