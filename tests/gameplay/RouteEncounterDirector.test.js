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
      playerPosition: landmarks.southApproach,
    });
    expect(route.squads.BRIDGE_GUARD.active).toBe(true);
    expect(route.squads.CAPTAIN_GUARD.active).toBe(false);
    expect(captain.combatant.targetable).toBe(false);

    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.duelPoint,
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
      playerPosition: landmarks.duelPoint,
    });
    expect(route.director.getCaptainPhase()).toBe('commanding');
    expect(route.squads.BRIDGE_GUARD.order).toBe(SquadOrder.BRACE);

    captain.combatant.health = captain.combatant.maxHealth * 0.6;
    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.duelPoint,
    });
    expect(route.director.getCaptainPhase()).toBe('pressed');
    expect(route.squads.CAPTAIN_GUARD.order).toBe(SquadOrder.HOLD);

    captain.combatant.health = captain.combatant.maxHealth * 0.25;
    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.duelPoint,
    });
    expect(route.director.getCaptainPhase()).toBe('desperate');
    expect(route.squads.BRIDGE_GUARD.order).toBe(SquadOrder.RETREAT);
    expect(route.squads.CAPTAIN_GUARD.order).toBe(SquadOrder.HOLD);

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

  it('stages the captain on the authored duel floor and settles the corpse beside the route', () => {
    const { simulation, landmarks, route } = createHarness();
    const captain = route.captain;

    expect(captain.object3d.position.distanceTo(landmarks.duelPoint)).toBeLessThan(0.01);
    route.director.update(0.1, {
      stage: MissionStage.CAPTAIN,
      playerPosition: landmarks.duelPoint,
    });

    const deathOrigin = captain.object3d.position.clone();
    captain.combatant.receiveImpact({
      damage: captain.combatant.maxHealth * 2,
      damageType: 'blunt',
    });
    expect(captain.object3d.position.distanceTo(deathOrigin)).toBe(0);

    route.director.update(0.2, {
      stage: MissionStage.VICTORY,
      playerPosition: landmarks.duelPoint,
    });
    expect(captain.object3d.position.distanceTo(deathOrigin)).toBeGreaterThan(0);
    expect(captain.object3d.position.distanceTo(landmarks.captainFall)).toBeGreaterThan(0);

    for (let index = 0; index < 10; index += 1) {
      route.director.update(0.12, {
        stage: MissionStage.VICTORY,
        playerPosition: landmarks.duelPoint,
      });
    }
    const settledTarget = captain.object3d.userData.captainFallTarget;
    expect(settledTarget).toBeTruthy();
    expect(captain.object3d.position.distanceTo(settledTarget)).toBeLessThan(0.01);
    expect(captain.object3d.position.distanceTo(deathOrigin)).toBeLessThanOrEqual(5.61);
    expect(captain.object3d.userData.captainFallSettled).toBe(true);
    expect(distanceToSegment2D(
      captain.object3d.position,
      landmarks.duelPoint,
      landmarks.standardRaise,
    )).toBeGreaterThan(4.5);

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
    duelPoint: new Vector3(-5.272, 0, -138.672),
    captainFall: new Vector3(-10.584, 0, -139.696),
    bridgeGuardPoint: new Vector3(-7, 0, -150.832),
    southApproach: new Vector3(-7, 0, -118.96),
    standardRaise: new Vector3(-1.048, 0, -163.888),
    postKillRoute: new Vector3(-7, 0, -156.976),
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

function distanceToSegment2D(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.z - start.z) * dz
    ) / lengthSq))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}
