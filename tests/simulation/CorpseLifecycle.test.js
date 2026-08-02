import { describe, expect, it } from 'vitest';
import { createSoldierActor } from '../../src/actors/SoldierActor.js';
import { SquadController } from '../../src/simulation/SquadController.js';

describe('corpse lifecycle', () => {
  it('continues updating a dead actor until its collapse settles', () => {
    const actor = createSoldierActor({ id: 'fallen', factionId: 1 });
    const squad = new SquadController({ id: 'test', factionId: 1, actors: [actor] });
    actor.combatant.receiveImpact({ damage: 999, damageType: 'blunt' });

    for (let index = 0; index < 90; index += 1) {
      squad.update(1 / 60);
    }

    expect(actor._deathTime).toBeGreaterThanOrEqual(1);
    expect(Math.abs(actor.object3d.rotation.z)).toBeGreaterThan(1);
    squad.dispose();
    actor.dispose();
  });
});

