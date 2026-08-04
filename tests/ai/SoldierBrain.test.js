import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  createCaptainActor,
  createSoldierActor,
} from '../../src/actors/SoldierActor.js';
import { SoldierBrain, BrainState } from '../../src/ai/SoldierBrain.js';

describe('SoldierBrain player telegraph response', () => {
  it('can guard against a player-proxy windup exposed through combatState', () => {
    const captain = createCaptainActor({ id: 'captain-reader', factionId: 2 });
    const player = {
      id: 'player',
      role: 'player',
      factionId: 1,
      object3d: { position: new Vector3(0, 0, 1) },
      combatant: { alive: true },
      combatState: {
        state: 'windup',
        windingUp: true,
        attacking: true,
      },
    };
    const brain = new SoldierBrain({
      actor: captain,
      queryActors: () => [player],
      rng: () => 0.99,
    });
    brain.target = player;
    brain.attackDelay = 1;
    captain.setPosition(0, 0, 0);

    brain.update(1 / 60, {
      cohesionState: 'ordered',
      senseRange: 10,
      slot: captain.object3d.position,
      anchor: captain.object3d.position,
      forward: new Vector3(0, 0, 1),
      lod: 0,
    });

    expect(brain.state).toBe(BrainState.GUARD);
    expect(brain.combat.state).toBe('blocking');
    brain.dispose();
    captain.dispose();
  });

  it('steers around settled corpses instead of ignoring their final placement', () => {
    const soldier = createSoldierActor({ id: 'corpse-avoider', factionId: 1 });
    const corpse = createSoldierActor({ id: 'corpse-obstacle', factionId: 2 });
    soldier.setPosition(0, 0, 0);
    corpse.setPosition(0.35, 0, 0);
    corpse.combatant.receiveImpact({ damage: 999, damageType: 'blunt' });
    for (let frame = 0; frame < 80; frame += 1) corpse.update(1 / 60);

    const brain = new SoldierBrain({
      actor: soldier,
      queryActors: () => [soldier, corpse],
      rng: () => 0.5,
    });
    brain.update(0.1, {
      cohesionState: 'ordered',
      slot: soldier.object3d.position,
      anchor: soldier.object3d.position,
      forward: new Vector3(0, 0, 1),
      lod: 0,
    });

    expect(soldier.velocity.x).toBeLessThan(-0.05);
    expect(soldier.object3d.position.x).toBeLessThan(-0.005);
    const firstPush = soldier.velocity.x;

    corpse.setPosition(5, 0, 0);
    brain.update(0.05, {
      cohesionState: 'ordered',
      slot: soldier.object3d.position,
      anchor: soldier.object3d.position,
      forward: new Vector3(0, 0, 1),
      lod: 0,
    });
    expect(soldier.velocity.x).toBeLessThan(0);
    expect(soldier.velocity.x).toBeGreaterThan(firstPush * 1.6);

    brain.dispose();
    soldier.dispose();
    corpse.dispose();
  });
});
