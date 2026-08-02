import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createCaptainActor } from '../../src/actors/SoldierActor.js';
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
});

