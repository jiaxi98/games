import { Vector3 } from 'three';
import { MeleeCombatController, WeaponState } from '../combat/MeleeCombatController.js';
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
  }) {
    this.actor = actor;
    this.queryActors = queryActors;
    this.terrainHeight = terrainHeight;
    this.rng = rng;
    this.state = BrainState.FORMATION;
    this.target = null;
    this.slot = new Vector3();
    this.retreatPoint = new Vector3();
    this.focusTarget = null;
    this.aggression = actor.role === 'captain' ? 0.82 : 0.52 + rng() * 0.26;
    this.decisionTimer = rng() * 0.2;
    this.attackDelay = 0.15 + rng() * 0.5;
    this.combat = new MeleeCombatController({
      owner: actor.combatant,
      weapon: actor.weapon,
      queryTargets: (origin, range) => this._queryCombatants(origin, range),
      getOrigin: () => actor.object3d.position,
      getForward: () => actor.forward,
    });
  }

  update(dt, context = {}) {
    this.combat.update(dt);
    const actor = this.actor;
    if (!actor.combatant.alive) {
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
        this._formUp(dt, context);
      }
    }

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
    this.combat.dispose();
  }

  _decide(context) {
    const candidates = this.queryActors(this.actor.object3d.position, context.senseRange ?? 15) ?? [];
    this.target = selectTarget(this.actor, candidates, {
      previousTarget: this.target,
      protectPoint: context.anchor,
      focusTarget: this.focusTarget ?? context.focusTarget,
      maxRange: context.senseRange ?? 15,
    });
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
        this.attackDelay = 0.5 + this.rng() * (1.1 - this.aggression * 0.45);
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
    this.target = null;
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
    return (this.queryActors(origin, range) ?? []).map((candidate) => {
      candidate.combatant.actor = candidate;
      return candidate.combatant;
    });
  }
}

function hashSigned(value) {
  const string = String(value);
  let hash = 0;
  for (let i = 0; i < string.length; i += 1) hash = Math.imul(31, hash) + string.charCodeAt(i);
  const x = Math.sin(hash * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const _delta = new Vector3();
const _desired = new Vector3();
