import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FactionId } from '../../src/actors/Factions.js';
import { FormationType } from '../../src/ai/Formation.js';
import { SquadOrder } from '../../src/simulation/SquadController.js';
import { createBattlefieldSimulation } from '../../src/simulation/BattlefieldSimulation.js';

describe('BattlefieldSimulation', () => {
  it('creates squads with a captain using the same combat rules', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const squad = simulation.createSquad({
      id: 'captain-retinue',
      factionId: FactionId.SAINT_ORENS,
      count: 4,
      captain: true,
      anchor: new Vector3(),
      formation: FormationType.SPEAR_WALL,
    });
    expect(squad.officer.role).toBe('captain');
    expect(squad.officer.brain.combat).toBeDefined();
    expect(squad.officer.combatant.maxHealth).toBeGreaterThan(squad.actors[1].combatant.maxHealth);
    simulation.dispose();
  });

  it('turns an objective reversal into morale and formation movement', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const allies = simulation.createSquad({
      id: 'ashen',
      factionId: FactionId.VANGUARD,
      count: 4,
      anchor: new Vector3(0, 0, 0),
      forward: new Vector3(0, 0, -1),
      morale: { initial: 0.3 },
    });
    const enemies = simulation.createSquad({
      id: 'orens',
      factionId: FactionId.SAINT_ORENS,
      count: 4,
      anchor: new Vector3(0, 0, -12),
      forward: new Vector3(0, 0, 1),
    });
    const allyBefore = allies.morale.value;
    const enemyBefore = enemies.morale.value;
    const advanceTarget = new Vector3(0, 0, -30);
    const changed = simulation.triggerBattlefieldReversal({
      id: 'standard-recovered',
      factionId: FactionId.VANGUARD,
      position: new Vector3(0, 0, -6),
      advanceTarget,
    });
    expect(changed).toBe(true);
    expect(allies.morale.value).toBeGreaterThan(allyBefore);
    expect(enemies.morale.value).toBeLessThan(enemyBefore);
    expect(allies.order).toBe(SquadOrder.ADVANCE);
    simulation.update(0.25, new Vector3(0, 2, 4));
    expect(allies.anchor.z).toBeLessThan(0);
    simulation.dispose();
  });

  it('represents large distant ranks without allocating full soldier actors', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: true });
    const formation = simulation.addDistantFormation({
      id: 'ford-ranks',
      factionId: FactionId.SAINT_ORENS,
      count: 180,
      anchor: new Vector3(0, 0, -80),
    });
    expect(formation.instances).toHaveLength(180);
    expect(simulation.actors).toHaveLength(0);
    simulation.setDistantFormationState('ford-ranks', 'fractured', { speed: -1 });
    simulation.update(0.5, new Vector3());
    expect(formation.state).toBe('fractured');
    expect(formation.anchor.z).toBeLessThan(-80);
    simulation.dispose();
  });
});
