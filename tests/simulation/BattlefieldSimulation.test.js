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

  it('selects detailed, simplified mid, and crowd LODs without changing actors', () => {
    const simulation = createBattlefieldSimulation({
      farVisuals: true,
      nearDistance: 10,
      midDistance: 30,
    });
    const squad = simulation.createSquad({
      id: 'lod-line',
      factionId: FactionId.VANGUARD,
      count: 3,
      anchor: new Vector3(),
    });
    const camera = new Vector3(0, 2, 0);
    squad.actors[0].setPosition(0, 0, 5);
    squad.actors[1].setPosition(0, 0, 20);
    squad.actors[2].setPosition(0, 0, 40);

    simulation.update(0.1, camera);

    expect(squad.actors.map((actor) => actor.lod)).toEqual([0, 1, 2]);
    expect(squad.actors[0].detailedRoot.visible).toBe(true);
    expect(squad.actors[0].midRoot.visible).toBe(false);
    expect(squad.actors[1].detailedRoot.visible).toBe(false);
    expect(squad.actors[1].midRoot.visible).toBe(true);
    expect(squad.actors[1].object3d.visible).toBe(true);
    expect(squad.actors[2].detailedRoot.visible).toBe(false);
    expect(squad.actors[2].midRoot.visible).toBe(false);
    expect(squad.actors[2].object3d.visible).toBe(false);
    expect(simulation.actors).toHaveLength(3);

    simulation.dispose();
  });

  it('resets observed flank pressure when enemies leave the flank', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const squad = simulation.createSquad({
      id: 'line',
      factionId: FactionId.VANGUARD,
      count: 2,
      anchor: new Vector3(0, 0, 0),
      forward: new Vector3(0, 0, 1),
    });
    const flanker = simulation.createSquad({
      id: 'flanker',
      factionId: FactionId.SAINT_ORENS,
      count: 2,
      anchor: new Vector3(8, 0, 0),
      forward: new Vector3(-1, 0, 0),
    });

    simulation.update(0.1, new Vector3(0, 2, 2));
    expect(squad.morale.flankPressure).toBeGreaterThan(0);

    flanker.anchor.set(100, 0, 100);
    flanker.actors.forEach((actor, index) => actor.setPosition(100 + index, 0, 100));
    for (let i = 0; i < 20; i += 1) simulation.update(0.1, new Vector3(0, 2, 2));

    expect(squad.observedFlankPressure).toBe(0);
    expect(squad.morale.flankPressure).toBeLessThan(0.1);
    simulation.dispose();
  });

  it('separates overlapping near actors through the shared spatial query', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const squad = simulation.createSquad({
      id: 'packed',
      factionId: FactionId.VANGUARD,
      count: 2,
      anchor: new Vector3(),
    });
    squad.actors[0].setPosition(0, 0, 0);
    squad.actors[1].setPosition(0, 0, 0);
    const before = squad.actors[0].object3d.position.distanceTo(squad.actors[1].object3d.position);

    for (let i = 0; i < 8; i += 1) simulation.update(0.05, new Vector3(0, 2, 1));

    const after = squad.actors[0].object3d.position.distanceTo(squad.actors[1].object3d.position);
    expect(after).toBeGreaterThan(before + 0.2);
    simulation.dispose();
  });

  it('forwards sampled AI attack and impact events through the simulation dispatcher', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const attackers = simulation.createSquad({
      id: 'attackers',
      factionId: FactionId.VANGUARD,
      count: 1,
      anchor: new Vector3(0, 0, 0),
      role: 'man-at-arms',
    });
    const defenders = simulation.createSquad({
      id: 'defenders',
      factionId: FactionId.SAINT_ORENS,
      count: 1,
      anchor: new Vector3(0, 0, 1),
      role: 'man-at-arms',
    });
    const events = [];
    simulation.addEventListener('aiattack', (event) => events.push(event.type));
    simulation.addEventListener('aiimpact', (event) => events.push(event.type));
    attackers.actors[0].brain.target = defenders.actors[0];
    simulation.attackCoordinator.reserve(attackers.actors[0], defenders.actors[0]);
    attackers.actors[0].brain.attackDelay = 0;

    for (let i = 0; i < 30 && !events.includes('aiimpact'); i += 1) {
      simulation.update(0.05, new Vector3(0, 2, 2));
    }

    expect(events).toContain('aiattack');
    expect(events).toContain('aiimpact');
    simulation.dispose();
  });

  it('keeps dormant squads visible but out of combat until explicitly activated', () => {
    const simulation = createBattlefieldSimulation({ farVisuals: false });
    const dormant = simulation.createSquad({
      id: 'dormant',
      factionId: FactionId.SAINT_ORENS,
      count: 2,
      anchor: new Vector3(0, 0, 0),
      active: false,
    });
    const allies = simulation.createSquad({
      id: 'allies',
      factionId: FactionId.VANGUARD,
      count: 2,
      anchor: new Vector3(0, 0, 2),
    });

    simulation.update(0.1, new Vector3(0, 2, 2));
    expect(dormant.actors.every((actor) => actor.object3d.visible)).toBe(true);
    expect(dormant.actors.every((actor) => actor.combatant.targetable === false)).toBe(true);
    expect(simulation.queryActors(new Vector3(), 5)).not.toContain(dormant.actors[0]);
    expect(simulation.getBattleState().squads.map((squad) => squad.id)).not.toContain('dormant');

    simulation.setSquadActive('dormant', true);
    simulation.update(0.1, new Vector3(0, 2, 2));
    expect(dormant.actors.every((actor) => actor.combatant.targetable)).toBe(true);
    expect(simulation.queryActors(new Vector3(), 5)).toContain(dormant.actors[0]);
    expect(simulation.getBattleState().squads.map((squad) => squad.id)).toContain('dormant');
    expect(allies.active).toBe(true);
    simulation.dispose();
  });
});
