import { Vector3 } from 'three';
import { FactionId } from '../actors/Factions.js';
import { FormationType } from './Formation.js';
import { createBattlefieldSimulation } from '../simulation/BattlefieldSimulation.js';
import { SquadOrder } from '../simulation/SquadController.js';
import { RouteSquadId } from '../gameplay/RouteEncounterDirector.js';

export const name = 'ashen-standard-battlefield';

export function install(context) {
  const { scene, player, camera, app, events } = context;
  const simulation = createBattlefieldSimulation({
    player,
    nearDistance: 34,
    midDistance: 86,
    maxAttackersPerTarget: 1,
    terrainHeight: (x, z) => context.physics.groundHeightAt(x, z),
  });
  app.battlefieldSimulation = simulation;
  scene.add(simulation.object3d);

  const allied = simulation.createSquad({
    id: RouteSquadId.ALLIED_RETINUE,
    factionId: FactionId.VANGUARD,
    count: 8,
    role: 'man-at-arms',
    captain: true,
    standard: true,
    anchor: new Vector3(-5, 0, -2),
    forward: new Vector3(0, 0, -1),
    retreatPoint: new Vector3(0, 0, 24),
    formation: FormationType.LINE,
    morale: { initial: 0.56, discipline: 0.58 },
  });
  simulation.createSquad({
    id: RouteSquadId.OPENING_ALLIES,
    factionId: FactionId.VANGUARD,
    count: 3,
    role: 'man-at-arms',
    anchor: new Vector3(8, 0, 95),
    forward: new Vector3(0.2, 0, -1),
    retreatPoint: new Vector3(-5, 0, 125),
    formation: FormationType.SKIRMISH,
    morale: { initial: 0.62, discipline: 0.48 },
    active: false,
  });
  simulation.createSquad({
    id: RouteSquadId.OPENING_ENEMIES,
    factionId: FactionId.SAINT_ORENS,
    count: 4,
    role: 'man-at-arms',
    anchor: new Vector3(17, 0, 84),
    forward: new Vector3(-0.2, 0, 1),
    retreatPoint: new Vector3(28, 0, 58),
    formation: FormationType.SKIRMISH,
    morale: { initial: 0.66, discipline: 0.44 },
    active: false,
  });
  simulation.createSquad({
    id: RouteSquadId.RALLY_PRESSURE,
    factionId: FactionId.SAINT_ORENS,
    count: 4,
    role: 'man-at-arms',
    anchor: new Vector3(-12, 0, 16),
    forward: new Vector3(-1, 0, 0.2),
    retreatPoint: new Vector3(30, 0, 5),
    formation: FormationType.SKIRMISH,
    morale: { initial: 0.7, discipline: 0.5 },
    active: false,
  });
  const spearLine = simulation.createSquad({
    id: RouteSquadId.SPEAR_LINE,
    factionId: FactionId.SAINT_ORENS,
    count: 8,
    standard: true,
    anchor: new Vector3(4, 0, -13),
    forward: new Vector3(0, 0, 1),
    retreatPoint: new Vector3(0, 0, -46),
    formation: FormationType.SPEAR_WALL,
    morale: { initial: 0.9, discipline: 0.67 },
    active: false,
  });
  simulation.createSquad({
    id: RouteSquadId.BRIDGE_GUARD,
    factionId: FactionId.SAINT_ORENS,
    count: 3,
    role: 'spearman',
    standard: true,
    anchor: new Vector3(-7, 0, -152),
    forward: new Vector3(0, 0, 1),
    retreatPoint: new Vector3(-4, 0, -205),
    formation: FormationType.SPEAR_WALL,
    morale: { initial: 0.88, discipline: 0.7 },
    active: false,
  });
  simulation.createSquad({
    id: RouteSquadId.CAPTAIN_GUARD,
    factionId: FactionId.SAINT_ORENS,
    count: 1,
    role: 'man-at-arms',
    captain: true,
    anchor: new Vector3(-4, 0, -187),
    forward: new Vector3(0, 0, 1),
    retreatPoint: new Vector3(0, 0, -235),
    formation: FormationType.LINE,
    morale: { initial: 0.96, discipline: 0.78 },
    active: false,
  });
  allied.issueOrder(SquadOrder.HOLD);
  spearLine.issueOrder(SquadOrder.HOLD);
  simulation.addDistantFormation({
    id: 'ashen-reserve-belt',
    factionId: FactionId.VANGUARD,
    count: 90,
    anchor: new Vector3(-12, 0, 34),
    forward: new Vector3(0.08, 0, -1),
    frontage: 18,
    state: 'pressured',
    speed: 0.18,
  });
  simulation.addDistantFormation({
    id: 'orens-ford-ranks',
    factionId: FactionId.SAINT_ORENS,
    count: 120,
    anchor: new Vector3(8, 0, -215),
    forward: new Vector3(-0.04, 0, 1),
    frontage: 24,
    state: 'ordered',
    speed: 0.12,
  });

  const onCohesion = (event) => events.emit('battlefield:cohesion', event);
  const onReversal = (event) => events.emit('battlefield:reversal', event);
  const onAiAttack = (event) => events.emit('battlefield:ai-attack', event);
  const onAiImpact = (event) => events.emit('battlefield:ai-impact', event);
  const onCasualty = (event) => events.emit('battlefield:casualty', event);
  const onRout = (event) => events.emit('battlefield:rout', event);
  simulation.addEventListener('cohesionchange', onCohesion);
  simulation.addEventListener('reversal', onReversal);
  simulation.addEventListener('aiattack', onAiAttack);
  simulation.addEventListener('aiimpact', onAiImpact);
  simulation.addEventListener('casualty', onCasualty);
  simulation.addEventListener('rout', onRout);
  events.emit('battlefield:ready', simulation);

  const api = Object.freeze({
    simulation,
    issueOrder: (order, options) => simulation.issuePlayerOrder(order, options),
    rally: (options) => simulation.issuePlayerOrder(SquadOrder.RALLY, options),
    brace: (options) => simulation.issuePlayerOrder(SquadOrder.BRACE, options),
    advance: (target, options = {}) => simulation.issuePlayerOrder(
      SquadOrder.ADVANCE,
      { ...options, target },
    ),
    focus: (focusTarget, options = {}) => simulation.issuePlayerOrder(
      SquadOrder.FOCUS,
      { ...options, focusTarget },
    ),
    triggerReversal: (options) => simulation.triggerBattlefieldReversal(options),
    getState: () => simulation.getBattleState(),
  });
  app.battlefield = api;

  return {
    update(dt) {
      simulation.update(dt, camera.position);
    },
    dispose() {
      simulation.removeEventListener('cohesionchange', onCohesion);
      simulation.removeEventListener('reversal', onReversal);
      simulation.removeEventListener('aiattack', onAiAttack);
      simulation.removeEventListener('aiimpact', onAiImpact);
      simulation.removeEventListener('casualty', onCasualty);
      simulation.removeEventListener('rout', onRout);
      simulation.dispose();
      if (app.battlefieldSimulation === simulation) delete app.battlefieldSimulation;
      if (app.battlefield === api) delete app.battlefield;
    },
  };
}

export default { name, install };
