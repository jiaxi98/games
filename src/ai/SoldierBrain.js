import { Vector3 } from 'three';
import { MeleeCombatController, WeaponState } from '../combat/MeleeCombatController.js';
import { getWeaponDefinition } from '../combat/WeaponDefinitions.js';
import { selectTarget } from './Targeting.js';

export const BrainState = Object.freeze({
  FORMATION: 'formation',
  ENGAGE: 'engage',
  GUARD: 'guard',
  ROUT: 'rout',
  DEAD: 'dead',
});

export class SoldierBrain {
  constructor({
    actor,
    queryActors,
    terrainHeight = () => 0,
    rng = Math.random,
    attackCoordinator = null,
    attackTelegraphScale = 1.75,
    bodyRadius = null,
  }) {
    this.actor = actor;
    this.queryActors = queryActors;
    this.terrainHeight = terrainHeight;
    this.rng = rng;
    this.attackCoordinator = attackCoordinator;
    this.bodyRadius = bodyRadius ?? (actor.role === 'captain' ? 0.48 : 0.42);
    this.state = BrainState.FORMATION;
    this.target = null;
    this.slot = new Vector3();
    this.retreatPoint = new Vector3();
    this.focusTarget = null;
    this.aggression = actor.role === 'captain' ? 0.82 : 0.52 + rng() * 0.26;
    this.decisionTimer = rng() * 0.2;
    this.attackDelay = 0.15 + rng() * 0.5;
    this._nearbyActors = [];
    this._combatants = [];
    this.combat = new MeleeCombatController({
      owner: actor.combatant,
      weapon: createAiWeaponDefinition(
        actor.weapon,
        attackTelegraphScale,
        actor.role === 'captain' ? 0.72 : 0.86,
      ),
      queryTargets: (origin, range) => this._queryCombatants(origin, range),
      getOrigin: () => actor.object3d.position,
      getForward: () => actor.forward,
    });
  }

  update(dt, context = {}) {
    this.combat.update(dt);
    const actor = this.actor;
    if (!actor.combatant.alive) {
      this._releaseTarget();
      this.state = BrainState.DEAD;
      actor.velocity.set(0, 0, 0);
      actor.update(dt, { combatPose: this.combat.getPose() });
      return;
    }

    this.decisionTimer -= dt;
    this.attackDelay -= dt;
    const routed = context.cohesionState === 'routed';
    if (routed) {
      this._route(dt, context);
    } else {
      if (this.decisionTimer <= 0) {
        this.decisionTimer = (context.lod ?? 0) === 0 ? 0.12 + this.rng() * 0.1 : 0.35 + this.rng() * 0.25;
        this._decide(context);
      }
      if (this.target?.combatant?.alive) {
        this._engage(dt, context);
      } else {
        this._releaseTarget();
        this._formUp(dt, context);
      }
    }

    this._applySeparation(dt, context);
    actor.object3d.position.addScaledVector(actor.velocity, dt);
    actor.object3d.position.y = this.terrainHeight(actor.object3d.position.x, actor.object3d.position.z);
    actor.update(dt, {
      speed: actor.velocity.length(),
      combatPose: this.combat.getPose(),
      moraleState: context.cohesionState,
    });
  }

  setFocusTarget(target) {
    this.focusTarget = target;
  }

  dispose() {
    this._releaseTarget();
    this.combat.dispose();
  }

  _decide(context) {
    const focusTarget = this.focusTarget ?? context.focusTarget;
    const senseRange = context.senseRange ?? 15;
    if (
      this.target?.combatant?.alive &&
      this.attackCoordinator?.has(this.actor, this.target) &&
      this.target.object3d.position.distanceToSquared(this.actor.object3d.position) <=
        senseRange * senseRange * 1.8 &&
      (!focusTarget || focusTarget === this.target)
    ) {
      return;
    }

    const candidates = this.queryActors(
      this.actor.object3d.position,
      senseRange,
      this._nearbyActors,
    ) ?? this._nearbyActors;
    const nextTarget = selectTarget(this.actor, candidates, {
      previousTarget: this.target,
      protectPoint: context.anchor,
      focusTarget,
      maxRange: senseRange,
      canTarget: this.attackCoordinator
        ? (candidate) => this.attackCoordinator.canReserve(this.actor, candidate)
        : null,
    });
    if (nextTarget === this.target) return;
    this._releaseTarget();
    this.target = nextTarget;
    if (this.target && this.attackCoordinator && !this.attackCoordinator.reserve(this.actor, this.target)) {
      this.target = null;
    }
  }

  _engage(dt, context) {
    const actor = this.actor;
    const target = this.target;
    _delta.copy(target.object3d.position).sub(actor.object3d.position);
    _delta.y = 0;
    const distance = _delta.length();
    if (distance < 0.01) return;
    _delta.multiplyScalar(1 / distance);
    actor.desiredForward.copy(_delta);

    const reach = this.combat.weapon.reach;
    const holdRange = actor.weapon === 'spear' ? reach * 0.76 : reach * 0.62;
    if (distance > holdRange) {
      this.state = BrainState.ENGAGE;
      const speed = context.cohesionState === 'fractured' ? 3.2 : 2.55;
      actor.velocity.lerp(_desired.copy(_delta).multiplyScalar(speed), Math.min(1, dt * 6));
      if (this.combat.state === WeaponState.BLOCKING) this.combat.endBlock();
      return;
    }

    if (this._isPlantedAttack()) {
      actor.velocity.set(0, 0, 0);
      return;
    }

    actor.velocity.multiplyScalar(Math.max(0, 1 - dt * 10));
    const targetAttacking =
      target.brain?.combat?.state === WeaponState.WINDUP ||
      target.brain?.combat?.state === WeaponState.ACTIVE;
    if (targetAttacking && this.combat.state === WeaponState.IDLE && this.rng() > this.aggression) {
      this.state = BrainState.GUARD;
      this.combat.beginBlock();
      return;
    }
    if (this.combat.state === WeaponState.BLOCKING && !targetAttacking) {
      this.combat.endBlock();
    }
    if (this.attackDelay <= 0 && this.combat.state === WeaponState.IDLE) {
      const heavy = this.actor.role === 'captain' && this.rng() < 0.22;
      if (heavy ? this.combat.heavyAttack() : this.combat.lightAttack()) {
        const baseDelay = this.actor.role === 'captain' ? 1.05 : 0.62;
        this.attackDelay = baseDelay + this.rng() * (1.35 - this.aggression * 0.35);
      }
    }
  }

  _formUp(dt, context) {
    this.state = BrainState.FORMATION;
    _delta.copy(context.slot ?? this.slot).sub(this.actor.object3d.position);
    _delta.y = 0;
    const distance = _delta.length();
    if (distance > 0.08) {
      _delta.multiplyScalar(1 / distance);
      this.actor.desiredForward.copy(context.forward ?? _delta);
      const speed = context.advance ? 2.4 : Math.min(2.25, distance * 1.7);
      this.actor.velocity.lerp(_desired.copy(_delta).multiplyScalar(speed), Math.min(1, dt * 5));
    } else {
      this.actor.velocity.multiplyScalar(Math.max(0, 1 - dt * 8));
      if (context.forward) this.actor.desiredForward.copy(context.forward);
    }
  }

  _route(dt, context) {
    this.state = BrainState.ROUT;
    this._releaseTarget();
    this.combat.endBlock();
    const retreat = context.retreatPoint ?? this.retreatPoint;
    _delta.copy(retreat).sub(this.actor.object3d.position);
    _delta.y = 0;
    if (_delta.lengthSq() < 1) {
      _delta.set(
        hashSigned(this.actor.id) * 0.8,
        0,
        hashSigned(`${this.actor.id}:z`),
      );
    } else {
      _delta.normalize();
    }
    this.actor.desiredForward.copy(_delta);
    this.actor.velocity.lerp(_desired.copy(_delta).multiplyScalar(4.4), Math.min(1, dt * 7));
  }

  _queryCombatants(origin, range) {
    const actors = this.queryActors(origin, range, this._nearbyActors) ?? this._nearbyActors;
    this._combatants.length = 0;
    for (const candidate of actors) {
      candidate.combatant.actor = candidate;
      this._combatants.push(candidate.combatant);
    }
    return this._combatants;
  }

  _applySeparation(dt, context) {
    if ((context.lod ?? 0) !== 0 || !this.actor.combatant.alive) return;
    const planted = this._isPlantedAttack();
    const playerTarget = this.target?.role === 'player' || this.target?.id === 'player';
    const radius = this.bodyRadius + (playerTarget ? 1.35 : 0.72);
    const neighbors = this.queryActors(
      this.actor.object3d.position,
      radius,
      this._nearbyActors,
    ) ?? this._nearbyActors;
    let pushX = 0;
    let pushZ = 0;
    let overlaps = 0;
    const position = this.actor.object3d.position;
    for (const other of neighbors) {
      if (other === this.actor || !other?.combatant?.alive) continue;
      const otherPosition = other.object3d?.position;
      if (!otherPosition) continue;
      const otherRadius = other.role === 'player'
        ? 0.78
        : other.brain?.bodyRadius ?? 0.42;
      const minDistance = this.bodyRadius + otherRadius + (other.role === 'player' ? 0.42 : 0.08);
      let dx = position.x - otherPosition.x;
      let dz = position.z - otherPosition.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) continue;
      let distance = Math.sqrt(distanceSq);
      if (distance < 0.0001) {
        const angle = hash01(`${this.actor.id}:${other.id}`) * Math.PI * 2;
        dx = Math.cos(angle);
        dz = Math.sin(angle);
        distance = 1;
      } else {
        dx /= distance;
        dz /= distance;
      }
      const penetration = minDistance - (distanceSq < 0.0001 ? 0 : distance);
      pushX += dx * penetration;
      pushZ += dz * penetration;
      overlaps += 1;
    }
    if (overlaps === 0) return;
    const strength = planted && !playerTarget
      ? 0
      : Math.min(playerTarget ? 13 : 8.5, (playerTarget ? 7.2 : 4.2) + overlaps * 0.8);
    this.actor.velocity.x += pushX * strength * Math.min(1, dt * 12);
    this.actor.velocity.z += pushZ * strength * Math.min(1, dt * 12);
  }

  _isPlantedAttack() {
    if (this.combat.state === WeaponState.ACTIVE) return true;
    return this.combat.state === WeaponState.WINDUP &&
      this.combat.attack &&
      this.combat.stateTime >= this.combat.attack.windup * 0.48;
  }

  _releaseTarget() {
    this.attackCoordinator?.release(this.actor);
    this.target = null;
  }
}

function hashSigned(value) {
  const string = String(value);
  let hash = 0;
  for (let i = 0; i < string.length; i += 1) hash = Math.imul(31, hash) + string.charCodeAt(i);
  const x = Math.sin(hash * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function hash01(value) {
  return (hashSigned(value) + 1) * 0.5;
}

function createAiWeaponDefinition(weapon, telegraphScale, damageScale = 1) {
  const definition = typeof weapon === 'string' ? getWeaponDefinition(weapon) : weapon;
  const scale = Math.max(1, telegraphScale);
  return {
    ...definition,
    attacks: definition.attacks.map((attack) => ({
      ...attack,
      windup: attack.windup * scale,
      recover: attack.recover * 1.08,
      damage: attack.damage * damageScale,
      poiseDamage: (attack.poiseDamage ?? attack.damage * 0.62) * damageScale,
    })),
    heavy: {
      ...definition.heavy,
      windup: definition.heavy.windup * Math.max(1.2, scale * 0.92),
      recover: definition.heavy.recover * 1.1,
      damage: definition.heavy.damage * damageScale,
      poiseDamage: (definition.heavy.poiseDamage ?? definition.heavy.damage * 0.62) * damageScale,
    },
  };
}

const _delta = new Vector3();
const _desired = new Vector3();
