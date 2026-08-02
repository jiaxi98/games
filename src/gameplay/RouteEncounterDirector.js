import { Vector3 } from 'three';
import { SquadOrder } from '../simulation/SquadController.js';
import { StagedEncounterDirector } from '../simulation/StagedEncounterDirector.js';
import { MissionStage } from './MissionState.js';

export const RouteSquadId = Object.freeze({
  ALLIED_RETINUE: 'ashen-vanguard',
  OPENING_ALLIES: 'ashen-standard-survivors',
  OPENING_ENEMIES: 'orens-standard-raiders',
  RALLY_PRESSURE: 'orens-hedgerow-pressure',
  SPEAR_LINE: 'orens-spear-line',
  BRIDGE_GUARD: 'orens-bridge-guard',
  CAPTAIN_GUARD: 'orens-captain-guard',
});

export function createRouteEncounterDirector({
  simulation,
  landmarks,
  player,
  events = null,
} = {}) {
  const squads = Object.fromEntries(
    Object.entries(RouteSquadId).map(([key, id]) => [key, simulation.getSquad(id)]),
  );
  const captain = squads.CAPTAIN_GUARD?.officer
    ?? squads.CAPTAIN_GUARD?.actors.find((actor) => actor.role === 'captain')
    ?? null;

  stageSquad(
    squads.ALLIED_RETINUE,
    offset(landmarks.hedgerowRally, -4, 3),
    new Vector3(0.08, 0, -1),
  );
  stageSquad(
    squads.OPENING_ALLIES,
    offset(landmarks.meleeLane, -5, 5),
    new Vector3(0.25, 0, -1),
  );
  stageSquad(
    squads.OPENING_ENEMIES,
    offset(landmarks.meleeLane, 5, -5),
    new Vector3(-0.25, 0, 1),
  );
  stageSquad(
    squads.RALLY_PRESSURE,
    offset(landmarks.hedgerowRally, 30, -18),
    directionTo(offset(landmarks.hedgerowRally, 30, -18), landmarks.hedgerowRally),
  );
  stageSquad(squads.SPEAR_LINE, landmarks.spearLine, new Vector3(0, 0, 1));
  stageSquad(
    squads.BRIDGE_GUARD,
    offset(landmarks.bridge, 0, 22),
    new Vector3(0, 0, 1),
  );
  stageSquad(
    squads.CAPTAIN_GUARD,
    // Keep the authored duel on the accessible south approach rather than
    // behind the bridge gate/parapet colliders.
    offset(landmarks.bridge, 5, 14),
    new Vector3(-0.06, 0, 1),
  );

  for (const squad of [
    squads.OPENING_ALLIES,
    squads.OPENING_ENEMIES,
    squads.RALLY_PRESSURE,
    squads.SPEAR_LINE,
    squads.BRIDGE_GUARD,
    squads.CAPTAIN_GUARD,
  ]) {
    if (squad) simulation.setSquadActive(squad, false);
  }
  squads.ALLIED_RETINUE?.issueOrder(SquadOrder.HOLD);

  const director = new StagedEncounterDirector({ simulation });
  const announceActivation = ({ beat }) => {
    events?.emit?.('battlefield:stage-activated', {
      id: beat.id,
      squadIds: beat.squads.map((squad) => squad.id),
    });
  };

  director.addBeat({
    id: 'fallen-standard-clash',
    stages: [MissionStage.RECOVER],
    position: landmarks.meleeLane,
    radius: 62,
    squads: [squads.OPENING_ALLIES, squads.OPENING_ENEMIES],
    onActivate(payload) {
      squads.OPENING_ALLIES?.issueOrder(SquadOrder.ADVANCE, {
        target: offset(landmarks.meleeLane, 1, -2),
      });
      squads.OPENING_ENEMIES?.issueOrder(SquadOrder.ADVANCE, {
        target: offset(landmarks.meleeLane, -2, 2),
      });
      announceActivation(payload);
    },
  });

  director.addBeat({
    id: 'hedgerow-pressure',
    stages: [MissionStage.RALLY],
    position: landmarks.hedgerowRally,
    radius: 88,
    squads: [squads.RALLY_PRESSURE],
    onActivate(payload) {
      squads.RALLY_PRESSURE?.issueOrder(SquadOrder.ADVANCE, {
        target: offset(landmarks.hedgerowRally, 4, -1),
      });
      announceActivation(payload);
    },
  });

  director.addBeat({
    id: 'spear-line-contact',
    stages: [MissionStage.BREAK],
    position: landmarks.spearLine,
    radius: 94,
    squads: [squads.SPEAR_LINE],
    onActivate(payload) {
      squads.SPEAR_LINE?.issueOrder(SquadOrder.BRACE);
      announceActivation(payload);
    },
  });

  director.addBeat({
    id: 'bridge-perimeter',
    stages: [MissionStage.CAPTAIN],
    position: landmarks.bridge,
    radius: 96,
    squads: [squads.BRIDGE_GUARD],
    onActivate(payload) {
      squads.BRIDGE_GUARD?.issueOrder(SquadOrder.BRACE);
      announceActivation(payload);
    },
  });

  if (captain) {
    captain.combatant.addEventListener('death', () => {
      // Keep the final bridge approach readable instead of leaving the
      // featured corpse directly under the player's camera.
      const side = captain.object3d.position.x >= landmarks.bridge.x ? 1 : -1;
      captain.object3d.position.x += side * 2.4;
      captain.object3d.position.z += 1.2;
    });
    director.setCaptainEncounter({
      stage: MissionStage.CAPTAIN,
      position: landmarks.bridge,
      radius: 72,
      captain,
    squads: [squads.CAPTAIN_GUARD],
      onActivate() {
        const duelPoint = offset(landmarks.bridge, 5, 14);
        squads.CAPTAIN_GUARD?.issueOrder(SquadOrder.HOLD, { target: duelPoint });
        squads.BRIDGE_GUARD?.issueOrder(SquadOrder.RETREAT);
        captain.brain?.configureEncounter?.({
          aggression: 0.58,
          damageScale: 0.48,
          telegraphScale: 2.25,
          attackDelay: 1.25,
        });
        events?.emit?.('battlefield:stage-activated', {
          id: 'captain-encounter',
          squadIds: [squads.CAPTAIN_GUARD?.id].filter(Boolean),
        });
      },
      phases: [
        {
          id: 'commanding',
          atOrBelow: 1,
          onEnter() {
            squads.BRIDGE_GUARD?.issueOrder(SquadOrder.BRACE);
            squads.CAPTAIN_GUARD?.issueOrder(SquadOrder.HOLD);
            squads.CAPTAIN_GUARD?.morale.rally(0.12);
            captain.brain?.configureEncounter?.({
              aggression: 0.58,
              damageScale: 0.48,
              telegraphScale: 2.25,
              attackDelay: 1.25,
            });
          },
        },
        {
          id: 'pressed',
          atOrBelow: 0.66,
          onEnter() {
            squads.CAPTAIN_GUARD?.morale.rally(0.18);
            captain.brain?.configureEncounter?.({
              aggression: 0.68,
              damageScale: 0.52,
              telegraphScale: 2.05,
              attackDelay: 1,
            });
            squads.CAPTAIN_GUARD?.issueOrder(SquadOrder.HOLD);
          },
        },
        {
          id: 'desperate',
          atOrBelow: 0.33,
          onEnter() {
            squads.BRIDGE_GUARD?.issueOrder(SquadOrder.RETREAT);
            squads.CAPTAIN_GUARD?.morale.rally(0.28);
            captain.brain?.configureEncounter?.({
              aggression: 0.76,
              damageScale: 0.58,
              telegraphScale: 1.9,
              attackDelay: 0.9,
            });
            squads.CAPTAIN_GUARD?.issueOrder(SquadOrder.HOLD);
          },
        },
      ],
    });
  }

  return {
    director,
    squads,
    captain,
    dispose() {
      director.dispose();
    },
  };
}

function stageSquad(squad, position, forward) {
  if (!squad || !position) return;
  squad.anchor.copy(position);
  squad.orderTarget.copy(position);
  squad.forward.copy(forward).setY(0).normalize();
  squad.retreatPoint.copy(position).addScaledVector(squad.forward, -58);
  const alive = squad.actors.filter((actor) => actor.combatant.alive);
  alive.forEach((actor, index) => {
    squad.formation.worldSlot(
      index,
      alive.length,
      squad.morale.state,
      squad.anchor,
      squad.forward,
      actor.object3d.position,
    );
    actor.object3d.position.y = position.y;
    actor.setHeading(Math.atan2(squad.forward.x, squad.forward.z));
  });
}

function offset(position, x, z) {
  return new Vector3(position.x + x, position.y, position.z + z);
}

function directionTo(from, to) {
  return new Vector3(to.x - from.x, 0, to.z - from.z).normalize();
}

export default createRouteEncounterDirector;
