import { EventDispatcher, Group, Vector3 } from 'three';
import { AttackCoordinator } from '../ai/AttackCoordinator.js';
import { SoldierBrain } from '../ai/SoldierBrain.js';
import { CohesionState } from '../ai/SquadMorale.js';
import { SoldierRole, createCaptainActor, createSoldierActor } from '../actors/SoldierActor.js';
import { SpatialHash } from './SpatialHash.js';
import { SquadController, SquadOrder } from './SquadController.js';
import { createCrowdVisuals } from './CrowdVisuals.js';

export class BattlefieldSimulation extends EventDispatcher {
  constructor({
    terrainHeight = () => 0,
    player = null,
    nearDistance = 36,
    midDistance = 90,
    farVisuals = true,
    seed = 1356,
    maxAttackersPerTarget = 2,
  } = {}) {
    super();
    this.object3d = new Group();
    this.object3d.name = 'BattlefieldSimulation';
    this.terrainHeight = terrainHeight;
    this.player = player;
    this.nearDistance = nearDistance;
    this.midDistance = midDistance;
    this.farVisuals = farVisuals;
    this.seed = seed;
    this.squads = [];
    this.actors = [];
    this.externalActors = [];
    this.spatial = new SpatialHash(7);
    this.attackCoordinator = new AttackCoordinator({ maxAttackersPerTarget });
    this.crowdVisuals = new Map();
    this.distantFormations = [];
    this._queryResult = [];
    this._combatantQueryResult = [];
    this._spatialItems = [];
    this._crowdByFaction = new Map();
    this._crowdActorInstances = new WeakMap();
    this._crowdElapsed = 0;
    this._crowdDirty = true;
    this._eventCounts = new Map();
    this._time = 0;
    this._frame = 0;
    this._disposed = false;
    this._reversal = {
      standardsRaised: new Set(),
      objectives: new Set(),
      momentum: new Map(),
    };
  }

  createSquad({
    id,
    factionId,
    count = 12,
    role = SoldierRole.SPEARMAN,
    captain = false,
    standard = false,
    anchor = new Vector3(),
    forward = new Vector3(0, 0, 1),
    retreatPoint,
    formation,
    morale,
  }) {
    const actors = [];
    let officer = null;
    let standardBearer = null;
    for (let i = 0; i < count; i += 1) {
      let actorRole = role;
      if (captain && i === 0) actorRole = SoldierRole.CAPTAIN;
      else if (standard && i === (captain ? 1 : 0)) actorRole = SoldierRole.STANDARD_BEARER;
      const actor = actorRole === SoldierRole.CAPTAIN
        ? createCaptainActor({ id: `${id}:${i}`, factionId })
        : createSoldierActor({ id: `${id}:${i}`, factionId, role: actorRole });
      actor.setPosition(
        anchor.x + (i % 6 - 2.5) * 1.1,
        this.terrainHeight(anchor.x, anchor.z),
        anchor.z + Math.floor(i / 6) * 1.1,
      ).setHeading(Math.atan2(forward.x, forward.z));
      actor.brain = new SoldierBrain({
        actor,
        queryActors: (position, radius, result) => this.queryActors(position, radius, result),
        terrainHeight: this.terrainHeight,
        rng: seededRandom(this.seed + hashString(`${id}:${i}`)),
        attackCoordinator: this.attackCoordinator,
      });
      this._attachActorEvents(actor);
      if (actorRole === SoldierRole.CAPTAIN) officer = actor;
      if (actorRole === SoldierRole.STANDARD_BEARER) standardBearer = actor;
      actors.push(actor);
      this.actors.push(actor);
      this.object3d.add(actor.object3d);
    }
    const squad = new SquadController({
      id,
      factionId,
      actors,
      formation,
      anchor,
      forward,
      retreatPoint,
      morale,
      officer,
      standardBearer,
    });
    this._attachSquadEvents(squad);
    this.squads.push(squad);
    this.spatial.rebuild(this.actors);
    return squad;
  }

  addSquad(squad) {
    this.squads.push(squad);
    for (const actor of squad.actors) {
      if (!actor.brain) {
        actor.brain = new SoldierBrain({
          actor,
          queryActors: (position, radius, result) => this.queryActors(position, radius, result),
          terrainHeight: this.terrainHeight,
          rng: seededRandom(this.seed + hashString(actor.id)),
          attackCoordinator: this.attackCoordinator,
        });
      }
      this._attachActorEvents(actor);
      this.actors.push(actor);
      this.object3d.add(actor.object3d);
    }
    this._attachSquadEvents(squad);
    this.spatial.rebuild(this.actors);
    return squad;
  }

  addDistantFormation({
    id,
    factionId,
    count = 80,
    anchor = new Vector3(),
    forward = new Vector3(0, 0, 1),
    frontage = 20,
    spacing = 1.08,
    depthSpacing = 1.02,
    state = CohesionState.ORDERED,
    speed = 0,
  }) {
    const formation = {
      id,
      factionId,
      count,
      anchor: anchor.clone(),
      forward: forward.clone().setY(0).normalize(),
      frontage,
      spacing,
      depthSpacing,
      state,
      speed,
      instances: [],
      dirty: true,
      layoutElapsed: 0,
    };
    for (let i = 0; i < count; i += 1) {
      formation.instances.push({
        position: new Vector3(),
        heading: Math.atan2(formation.forward.x, formation.forward.z),
        state,
        index: i,
      });
    }
    this.distantFormations.push(formation);
    this._layoutDistantFormation(formation);
    formation.dirty = false;
    this._crowdDirty = true;
    return formation;
  }

  setDistantFormationState(id, state, { speed } = {}) {
    const formation = this.distantFormations.find((entry) => entry.id === id);
    if (!formation) return false;
    formation.state = state;
    if (speed !== undefined) formation.speed = speed;
    formation.dirty = true;
    this._crowdDirty = true;
    for (const instance of formation.instances) instance.state = state;
    return true;
  }

  registerPlayer(player) {
    this.player = player;
  }

  registerExternalActor(actor) {
    if (!actor?.combatant || !actor?.object3d?.position) {
      throw new Error('External battlefield actors require combatant and object3d.position.');
    }
    if (!this.externalActors.includes(actor)) this.externalActors.push(actor);
    return () => {
      const index = this.externalActors.indexOf(actor);
      if (index !== -1) this.externalActors.splice(index, 1);
    };
  }

  queryActors(position, radius, result = null) {
    if (result) return this.spatial.query(position, radius, result);
    return this.spatial.query(position, radius, this._queryResult).slice();
  }

  queryCombatants(position, radius, result = this._combatantQueryResult) {
    const actors = this.spatial.query(position, radius, this._queryResult);
    result.length = 0;
    for (const actor of actors) {
      if (actor.combatant.alive) result.push(actor.combatant);
    }
    return result;
  }

  issuePlayerOrder(order, {
    radius = 18,
    target = null,
    focusTarget = null,
    factionId = this.player?.factionId,
  } = {}) {
    const position = this.player?.position ?? this.player?.object3d?.position;
    if (!position) return [];
    const affected = [];
    for (const squad of this.squads) {
      if (squad.factionId !== factionId || squad.center.distanceTo(position) > radius) continue;
      squad.issueOrder(order, { target, focusTarget, strength: order === SquadOrder.RALLY ? 0.3 : 0.2 });
      affected.push(squad);
    }
    this.dispatchEvent({ type: 'playerorder', order, squads: affected });
    return affected;
  }

  triggerBattlefieldReversal({
    id,
    factionId,
    position,
    radius = 55,
    moraleShift = 0.25,
    enemyShock = 0.2,
    advanceTarget = null,
  }) {
    if (this._reversal.objectives.has(id)) return false;
    this._reversal.objectives.add(id);
    this._reversal.standardsRaised.add(factionId);
    for (const squad of this.squads) {
      const distance = position ? squad.center.distanceTo(position) : 0;
      if (distance > radius) continue;
      if (squad.factionId === factionId) {
        squad.morale.rally(moraleShift);
        squad.applyBattlefieldEvent('standard-raised', 1);
        if (advanceTarget) squad.issueOrder(SquadOrder.ADVANCE, { target: advanceTarget });
      } else {
        squad.morale.applyShock(enemyShock);
        squad.applyBattlefieldEvent('flanked', 0.25);
      }
    }
    for (const formation of this.distantFormations) {
      const distance = position ? formation.anchor.distanceTo(position) : 0;
      if (distance > radius * 1.8) continue;
      if (formation.factionId === factionId) {
        formation.state = CohesionState.ORDERED;
        formation.speed = Math.max(formation.speed, 1.4);
      } else {
        formation.state = CohesionState.FRACTURED;
        formation.speed = Math.min(formation.speed, -0.45);
      }
      formation.dirty = true;
      for (const instance of formation.instances) instance.state = formation.state;
    }
    this.dispatchEvent({ type: 'reversal', id, factionId, position, advanceTarget });
    return true;
  }

  update(dt, cameraPosition = null) {
    if (this._disposed || dt <= 0) return;
    this._time += dt;
    this._frame += 1;
    this._eventCounts.clear();
    this.attackCoordinator.prune();
    this._spatialItems.length = 0;
    for (const actor of this.actors) {
      if (actor.combatant.alive) this._spatialItems.push(actor);
    }
    for (const actor of this.externalActors) {
      if (actor.combatant.alive) this._spatialItems.push(actor);
    }
    this.spatial.rebuild(this._spatialItems);
    const playerPosition =
      this.player?.position ??
      this.player?.object3d?.position ??
      cameraPosition;
    const playerFactionId = this.player?.factionId;

    this._updateLod(cameraPosition ?? playerPosition);
    this._updateSquadPressure();
    this._updateDistantFormations(dt, cameraPosition ?? playerPosition);

    for (const squad of this.squads) {
      const lod = squad.actors.reduce((min, actor) => Math.min(min, actor.lod), 2);
      const interval = lod === 0 ? 1 : lod === 1 ? 2 : 5;
      if (this._frame % interval !== 0) continue;
      squad.update(dt * interval, {
        playerPosition,
        playerFactionId,
        standardPresent: this._reversal.standardsRaised.has(squad.factionId),
        enemyRoutedNearby: this._enemyRoutedNear(squad),
      });
    }
    this._crowdElapsed += dt;
    if (this._crowdDirty || this._crowdElapsed >= 1 / 12) {
      this._updateCrowdVisuals();
      this._crowdElapsed = 0;
      this._crowdDirty = false;
    }
  }

  getBattleState() {
    const factions = new Map();
    for (const squad of this.squads) {
      const entry = factions.get(squad.factionId) ?? {
        alive: 0,
        routed: 0,
        ordered: 0,
        morale: 0,
        squads: 0,
      };
      const snapshot = squad.snapshot();
      entry.alive += snapshot.alive;
      entry.morale += snapshot.cohesion.value;
      entry.squads += 1;
      if (snapshot.cohesion.state === CohesionState.ROUTED) entry.routed += 1;
      if (snapshot.cohesion.state === CohesionState.ORDERED) entry.ordered += 1;
      factions.set(squad.factionId, entry);
    }
    factions.forEach((entry) => {
      entry.morale = entry.squads ? entry.morale / entry.squads : 0;
    });
    return {
      factions,
      squads: this.squads.map((squad) => squad.snapshot()),
      objectives: [...this._reversal.objectives],
    };
  }

  dispose() {
    if (this._disposed) return;
    this.squads.forEach((squad) => squad.dispose());
    this.actors.forEach((actor) => actor.dispose());
    this.crowdVisuals.forEach((visual) => visual.dispose());
    this.squads.length = 0;
    this.actors.length = 0;
    this.externalActors.length = 0;
    this.crowdVisuals.clear();
    this.distantFormations.length = 0;
    this.spatial.clear();
    this.attackCoordinator.clear();
    this.object3d.removeFromParent();
    this._disposed = true;
  }

  _updateLod(cameraPosition) {
    if (!cameraPosition) return;
    const nearSq = this.nearDistance * this.nearDistance;
    const midSq = this.midDistance * this.midDistance;
    for (const actor of this.actors) {
      const distanceSq = actor.object3d.position.distanceToSquared(cameraPosition);
      const lod = distanceSq < nearSq ? 0 : distanceSq < midSq ? 1 : 2;
      if (actor.lod !== lod) this._crowdDirty = true;
      actor.setLod(lod);
      actor.object3d.visible = lod < 2;
    }
  }

  _updateSquadPressure() {
    for (const squad of this.squads) {
      let allies = 0;
      let enemies = 0;
      let flank = 0;
      for (const other of this.squads) {
        if (other === squad || other.center.distanceToSquared(squad.center) > 24 * 24) continue;
        const strength = other.actors.reduce((sum, actor) => sum + (actor.combatant.alive ? 1 : 0), 0);
        if (other.factionId === squad.factionId) {
          allies += strength;
        } else {
          enemies += strength;
          _toOther.copy(other.center).sub(squad.center).setY(0).normalize();
          if (Math.abs(_toOther.dot(squad.forward)) < 0.35) flank += strength;
        }
      }
      squad.enemyPressure = allies + squad.actors.length > 0
        ? Math.max(0, (enemies - allies) / (allies + squad.actors.length))
        : 1;
      squad.observedFlankPressure = enemies > 0 ? flank / enemies : 0;
    }
  }

  _updateCrowdVisuals() {
    if (!this.farVisuals) return;
    const byFaction = this._crowdByFaction;
    byFaction.forEach((instances) => { instances.length = 0; });
    for (const actor of this.actors) {
      if (actor.lod !== 2 || !actor.combatant.alive) continue;
      let instances = byFaction.get(actor.factionId);
      if (!instances) {
        instances = [];
        byFaction.set(actor.factionId, instances);
      }
      let instance = this._crowdActorInstances.get(actor);
      if (!instance) {
        instance = { position: actor.object3d.position, heading: 0, state: CohesionState.ORDERED };
        this._crowdActorInstances.set(actor, instance);
      }
      instance.heading = actor.object3d.rotation.y;
      instance.state = actor.squad?.morale.state;
      instances.push(instance);
    }
    for (const formation of this.distantFormations) {
      let instances = byFaction.get(formation.factionId);
      if (!instances) {
        instances = [];
        byFaction.set(formation.factionId, instances);
      }
      instances.push(...formation.instances);
    }
    byFaction.forEach((instances, factionId) => {
      let visual = this.crowdVisuals.get(factionId);
      if (!visual) {
        visual = createCrowdVisuals({ factionId, capacity: Math.max(150, instances.length) });
        this.crowdVisuals.set(factionId, visual);
        this.object3d.add(visual.object3d);
      }
      visual.setInstances(instances);
      visual.update(this._time);
    });
    this.crowdVisuals.forEach((visual, factionId) => {
      if (!byFaction.has(factionId)) visual.setInstances([]);
    });
  }

  _enemyRoutedNear(squad) {
    return this.squads.some((other) =>
      other.factionId !== squad.factionId &&
      other.morale.state === CohesionState.ROUTED &&
      other.center.distanceToSquared(squad.center) < 35 * 35
    );
  }

  _updateDistantFormations(dt, cameraPosition) {
    for (const formation of this.distantFormations) {
      formation.layoutElapsed += dt;
      if (formation.speed !== 0) {
        formation.anchor.addScaledVector(formation.forward, formation.speed * dt);
        formation.dirty = true;
      }
      const distanceSq = cameraPosition
        ? formation.anchor.distanceToSquared(cameraPosition)
        : 0;
      const interval = distanceSq > this.midDistance * this.midDistance ? 0.2 : 0.08;
      if (!formation.dirty && formation.layoutElapsed < interval) continue;
      if (formation.speed !== 0 && formation.layoutElapsed < interval) continue;
      this._layoutDistantFormation(formation);
      formation.layoutElapsed = 0;
      formation.dirty = false;
      this._crowdDirty = true;
    }
  }

  _layoutDistantFormation(formation) {
    const rightX = formation.forward.z;
    const rightZ = -formation.forward.x;
    const looseness = formation.state === CohesionState.FRACTURED
      ? 1.45
      : formation.state === CohesionState.ROUTED ? 2.2 : 1;
    formation.instances.forEach((instance, index) => {
      const row = Math.floor(index / formation.frontage);
      const column = index % formation.frontage;
      const rowCount = Math.min(formation.frontage, formation.count - row * formation.frontage);
      const localX = (column - (rowCount - 1) * 0.5) * formation.spacing * looseness;
      const scatter = formation.state === CohesionState.FRACTURED
        ? hashSigned(index + formation.count) * 0.8
        : formation.state === CohesionState.ROUTED ? hashSigned(index) * 2.2 : 0;
      const localZ = row * formation.depthSpacing + scatter;
      const x = formation.anchor.x + rightX * (localX + scatter) - formation.forward.x * localZ;
      const z = formation.anchor.z + rightZ * (localX + scatter) - formation.forward.z * localZ;
      instance.position.set(x, this.terrainHeight(x, z), z);
      instance.heading = Math.atan2(formation.forward.x, formation.forward.z);
      instance.state = formation.state;
    });
  }

  _applyRoutMomentum(routedSquad) {
    for (const squad of this.squads) {
      if (squad.center.distanceToSquared(routedSquad.center) > 45 * 45) continue;
      if (squad.factionId === routedSquad.factionId) {
        squad.morale.applyShock(0.08);
      } else {
        squad.applyBattlefieldEvent('enemy-broken', 1);
        if (squad.order === SquadOrder.HOLD) {
          _advanceTarget.copy(routedSquad.center);
          squad.issueOrder(SquadOrder.ADVANCE, { target: _advanceTarget });
        }
      }
    }
  }

  _attachActorEvents(actor) {
    if (actor.brain?._battlefieldEventsAttached) return;
    actor.brain._battlefieldEventsAttached = true;
    actor.brain.combat.addEventListener('attackstart', (event) => {
      this._dispatchSampled('aiattack', {
        actor,
        target: actor.brain.target,
        attack: event.attack,
        weapon: actor.brain.combat.weapon.id,
      }, 6);
    });
    actor.brain.combat.addEventListener('impact', (event) => {
      this._dispatchSampled('aiimpact', {
        actor,
        target: event.target?.actor ?? event.target,
        attack: event.attack,
        result: event.result,
      }, 8);
    });
  }

  _attachSquadEvents(squad) {
    squad.addEventListener('cohesionchange', (event) => {
      this.dispatchEvent({ ...event, type: 'cohesionchange' });
      if (event.state === CohesionState.ROUTED) this._applyRoutMomentum(squad);
    });
    squad.addEventListener('casualty', (event) => {
      this._dispatchSampled('casualty', { squad, actor: event.actor }, 8);
    });
    squad.addEventListener('rout', () => {
      this._dispatchSampled('rout', { squad }, 4);
    });
  }

  _dispatchSampled(type, detail, limit) {
    const count = this._eventCounts.get(type) ?? 0;
    if (count >= limit) return false;
    this._eventCounts.set(type, count + 1);
    this.dispatchEvent({ type, ...detail });
    return true;
  }
}

export function createBattlefieldSimulation(options) {
  return new BattlefieldSimulation(options);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value) {
  let hash = 2166136261;
  const string = String(value);
  for (let i = 0; i < string.length; i += 1) {
    hash ^= string.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashSigned(value) {
  const x = Math.sin(value * 91.735 + 17.13) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const _toOther = new Vector3();
const _advanceTarget = new Vector3();
