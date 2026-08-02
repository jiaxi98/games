import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { FactionId } from '../../src/actors/Factions.js';
import {
  RouteSquadId,
  createRouteEncounterDirector,
} from '../../src/gameplay/RouteEncounterDirector.js';
import { MissionStage } from '../../src/gameplay/MissionState.js';
import { createBattlefieldSimulation } from '../../src/simulation/BattlefieldSimulation.js';
import { SquadOrder } from '../../src/simulation/SquadController.js';

describe('RouteEncounterDirector', () => {
  it('activates route skirmishes by mission stage and proximity without adding actors', () => {
    const { simulation, landmarks, player, route } = createHarness();
    const actorCount = simulation.actors.length;

    route.director.update(0.1, {
      stage: MissionStage.RECOVER,
      playerPosition: landmarks.playerStart,
    });
    expect(route.squads.OPENING_ALLIES.active).toBe(false);
    expect(route.squads.OPENING_ENEMIES.active).toBe(false);

    route.director.update(0.1, {
      stage: MissionStage.RECOVER,
      playerPosition: landmarks.meleeLane,
    });
    expect(route.squads.OPENING_ALLIES.active).toBe(true);
    expect(route.squads.OPENING_ENEMIES.active).toBe(true);
    expect(route.squads.OPENING_ALLIES.order).toBe(SquadOrder.ADVANCE);
    expect(route.squads.OPENING_ENEMIES.order).toBe(SquadOrder.ADVANCE);

    route.director.update(0.1, {
      stage: MissionStage.RALLY,
      playerPosition: landmarks.hedgerowRally,
    });
    expect(route.squads.RALLY_PRESSURE.active).toBe(true);
    expect(route.squads.RALLY_PRESSURE.order).toBe(SquadOrder.ADVANCE);
    expect(simulation.actors).toHaveLength(actorCount);
    expect(actorCount).toBeGreaterThanOrEqual(30);
    expect(actorCount).toBeLessThanOrEqual(40);

    route.dispose();
    simulation.dispose();
    expect(player.position).toBeDefined();
  });

  it('keeps the withdrawn captain invulnerable until the bridge encounter activates', () => {
    const { simulation, landmarks, route } = createHarness();
    const captain = route.captain;
    const health = captain.combatant.health;

    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.spearLine,
    });
    expect(route.squads.BRIDGE_GUARD.active).toBe(false);
    expect(route.squads.CAPTAIN_GUARD.active).toBe(false);
    expect(captain.combatant.targetable).toBe(false);
    expect(captain.combatant.receiveImpact({
      damage: 999,
      damageType: 'blunt',
    })).toMatchObject({ outcome: 'invulnerable', damage: 0 });
    expect(captain.combatant.health).toBe(health);

    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.bridge.clone().add(new Vector3(0, 0, 90)),
    });
    expect(route.squads.BRIDGE_GUARD.active).toBe(true);
    expect(route.squads.CAPTAIN_GUARD.active).toBe(false);
    expect(captain.combatant.targetable).toBe(false);

    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.bridge,
    });
    expect(route.squads.CAPTAIN_GUARD.active).toBe(true);
    expect(captain.combatant.targetable).toBe(true);
    expect(route.director.getCaptainPhase()).toBe('commanding');

    route.dispose();
    simulation.dispose();
  });

  it('transitions the captain through commanding, pressed, and desperate behaviors', () => {
    const { simulation, landmarks, route } = createHarness();
    const captain = route.captain;

    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.bridge,
    });
    expect(route.director.getCaptainPhase()).toBe('commanding');
    expect(route.squads.BRIDGE_GUARD.order).toBe(SquadOrder.BRACE);

    captain.combatant.health = captain.combatant.maxHealth * 0.6;
    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.bridge,
    });
    expect(route.director.getCaptainPhase()).toBe('pressed');
    expect(route.squads.CAPTAIN_GUARD.order).toBe(SquadOrder.ADVANCE);

    captain.combatant.health = captain.combatant.maxHealth * 0.25;
    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.bridge,
    });
    expect(route.director.getCaptainPhase()).toBe('desperate');
    expect(route.squads.BRIDGE_GUARD.order).toBe(SquadOrder.RETREAT);
    expect(route.squads.CAPTAIN_GUARD.order).toBe(SquadOrder.ADVANCE);

    route.dispose();
    simulation.dispose();
  });

  it('lets player commands affect every active allied route group', () => {
    const { simulation, landmarks, player, route } = createHarness();
    player.position.copy(landmarks.meleeLane);
    route.director.update(0.1, {
      stage: MissionStage.RECOVER,
      playerPosition: player.position,
    });

    const affected = simulation.issuePlayerOrder(SquadOrder.ADVANCE, {
      radius: 180,
      target: landmarks.spearLine,
      factionId: FactionId.VANGUARD,
    });

    expect(affected.map((squad) => squad.id)).toEqual(expect.arrayContaining([
      RouteSquadId.ALLIED_RETINUE,
      RouteSquadId.OPENING_ALLIES,
    ]));
    expect(route.squads.OPENING_ALLIES.orderTarget.distanceTo(landmarks.spearLine)).toBe(0);

    route.dispose();
    simulation.dispose();
  });
});

function createHarness() {
  const player = {
    factionId: FactionId.VANGUARD,
    position: new Vector3(4, 0, 255),
  };
  const simulation = createBattlefieldSimulation({
    player,
    farVisuals: false,
    maxAttackersPerTarget: 1,
  });
  createRouteSquads(simulation);
  const landmarks = {
    playerStart: new Vector3(4, 0, 255),
    meleeLane: new Vector3(12, 0, 90),
    hedgerowRally: new Vector3(-42, 0, 34),
    spearLine: new Vector3(3, 0, -75),
    bridge: new Vector3(-7, 0, -174),
  };
  const route = createRouteEncounterDirector({
    simulation,
    landmarks,
    player,
  });
  return { simulation, landmarks, player, route };
}

function createRouteSquads(simulation) {
  const definitions = [
    [RouteSquadId.ALLIED_RETINUE, FactionId.VANGUARD, 8, { captain: true, standard: true }],
    [RouteSquadId.OPENING_ALLIES, FactionId.VANGUARD, 3, {}],
    [RouteSquadId.OPENING_ENEMIES, FactionId.SAINT_ORENS, 4, {}],
    [RouteSquadId.RALLY_PRESSURE, FactionId.SAINT_ORENS, 4, {}],
    [RouteSquadId.SPEAR_LINE, FactionId.SAINT_ORENS, 8, { standard: true }],
    [RouteSquadId.BRIDGE_GUARD, FactionId.SAINT_ORENS, 3, { standard: true }],
    [RouteSquadId.CAPTAIN_GUARD, FactionId.SAINT_ORENS, 1, { captain: true }],
  ];
  for (const [id, factionId, count, options] of definitions) {
    simulation.createSquad({
      id,
      factionId,
      count,
      anchor: new Vector3(),
      ...options,
    });
  }
}
