import { EventDispatcher, Vector3 } from 'three';
import { getWeaponDefinition } from './WeaponDefinitions.js';

export const WeaponState = Object.freeze({
  IDLE: 'idle',
  WINDUP: 'windup',
  ACTIVE: 'active',
  RECOVERY: 'recovery',
  BLOCKING: 'blocking',
  STAGGERED: 'staggered',
});

const DEFAULT_INPUT_BUFFER = 0.18;
const MIN_SWEEP_STEP = 0.045;

export class MeleeCombatController extends EventDispatcher {
  constructor({
    owner,
    weapon = 'longsword',
    queryTargets = () => [],
    getOrigin,
    getForward,
    friendlyFire = false,
    inputBuffer = DEFAULT_INPUT_BUFFER,
  }) {
    super();
    if (!owner) throw new Error('MeleeCombatController requires an owner Combatant.');
    this.owner = owner;
    this.weapon = typeof weapon === 'string' ? getWeaponDefinition(weapon) : weapon;
    this.queryTargets = queryTargets;
    this.getOrigin = getOrigin ?? (() => owner.position);
    this.getForward = getForward ?? (() => _defaultForward);
    this.friendlyFire = friendlyFire;
    this.inputBuffer = inputBuffer;
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this.attack = null;
    this.comboIndex = 0;
    this.queuedAttack = false;
    this.charge = 0;
    this.clock = 0;
    this._hitTargets = new Set();
    this._blockingSince = -Infinity;
    this._bufferedAttack = null;
    this._bufferRemaining = 0;
    this._activeProgress = 0;
    this._localPauseRemaining = 0;
    this._disposed = false;
  }

  lightAttack() {
    if (this._disposed || !this.owner.alive) return false;
    if (this.state === WeaponState.RECOVERY && this._canQueueCombo()) {
      this.queuedAttack = true;
      return true;
    }
    if (this.state !== WeaponState.IDLE) return this._bufferAttack('light');
    return this._beginAttack(this.weapon.attacks[this.comboIndex % this.weapon.attacks.length]);
  }

  heavyAttack() {
    if (this._disposed || !this.owner.alive) return false;
    if (this.state !== WeaponState.IDLE) return this._bufferAttack('heavy');
    this.comboIndex = 0;
    return this._beginAttack(this.weapon.heavy);
  }

  beginBlock() {
    if (
      this._disposed ||
      !this.owner.alive ||
      this.state === WeaponState.ACTIVE ||
      this.state === WeaponState.WINDUP ||
      this.state === WeaponState.STAGGERED
    ) return false;
    this.queuedAttack = false;
    this._clearAttackBuffer();
    this.state = WeaponState.BLOCKING;
    this.stateTime = 0;
    this._blockingSince = this.clock;
    this._syncGuard();
    this.dispatchEvent({ type: 'statechange', state: this.state });
    return true;
  }

  endBlock() {
    if (this.state !== WeaponState.BLOCKING) return;
    this.owner.clearGuard();
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this.dispatchEvent({ type: 'statechange', state: this.state });
    this._consumeAttackBuffer();
  }

  cancel() {
    this.owner.clearGuard();
    this.attack = null;
    this.queuedAttack = false;
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this._activeProgress = 0;
    this._localPauseRemaining = 0;
    this._clearAttackBuffer();
    this._hitTargets.clear();
  }

  update(dt) {
    if (this._disposed || dt <= 0) return;
    this.clock += dt;
    this.owner.update(dt);
    this._updateAttackBuffer(dt);

    if (!this.owner.alive) {
      this.cancel();
      return;
    }
    if (this.owner.staggerRemaining > 0) {
      this.owner.clearGuard();
      this.state = WeaponState.STAGGERED;
      this.stateTime = this.owner.staggerRemaining;
      return;
    }
    if (this.state === WeaponState.STAGGERED) {
      this.state = WeaponState.IDLE;
      this.stateTime = 0;
      this._consumeAttackBuffer();
    }

    if (this.state === WeaponState.BLOCKING) {
      if (!this.owner.spendStamina(dt * 3.5, 0.35)) {
        this.endBlock();
        return;
      }
      this.stateTime += dt;
      this._syncGuard();
      return;
    }

    if (this._localPauseRemaining > 0) {
      this._localPauseRemaining = Math.max(0, this._localPauseRemaining - dt);
      return;
    }

    if (!this.attack || this.state === WeaponState.IDLE) {
      this._consumeAttackBuffer();
      return;
    }
    this.stateTime += dt;

    if (this.state === WeaponState.WINDUP && this.stateTime >= this.attack.windup) {
      this._transition(WeaponState.ACTIVE);
      this._resolveHits(0, Math.min(1, Math.max(MIN_SWEEP_STEP, dt / this.attack.active)));
    } else if (this.state === WeaponState.ACTIVE) {
      const nextProgress = Math.min(1, this.stateTime / this.attack.active);
      this._resolveHits(this._activeProgress, nextProgress);
      if (this.stateTime >= this.attack.active) this._transition(WeaponState.RECOVERY);
    } else if (this.state === WeaponState.RECOVERY && this.stateTime >= this.attack.recover) {
      if (this.queuedAttack) {
        this.queuedAttack = false;
        this.comboIndex = (this.comboIndex + 1) % this.weapon.attacks.length;
        this._beginAttack(this.weapon.attacks[this.comboIndex]);
      } else if (this._bufferedAttack) {
        this._consumeAttackBuffer();
      } else {
        this.comboIndex = 0;
        this.attack = null;
        this._transition(WeaponState.IDLE);
      }
    }
  }

  getPose() {
    const attack = this.attack;
    if (this.state === WeaponState.BLOCKING) {
      return { state: this.state, progress: Math.min(1, this.stateTime / 0.18), attack: null };
    }
    if (!attack) return { state: this.state, progress: 0, attack: null };
    const duration = this.state === WeaponState.WINDUP
      ? attack.windup
      : this.state === WeaponState.ACTIVE
        ? attack.active
        : attack.recover;
    return {
      state: this.state,
      progress: Math.min(1, this.stateTime / duration),
      attack,
      hitStop: this._localPauseRemaining,
    };
  }

  getSnapshot() {
    return {
      state: this.state,
      attack: this.attack,
      stateTime: this.stateTime,
      progress: this.getPose().progress,
      windingUp: this.state === WeaponState.WINDUP,
      attacking: this.state === WeaponState.WINDUP || this.state === WeaponState.ACTIVE,
      blocking: this.state === WeaponState.BLOCKING,
      bufferedAttack: this._bufferedAttack,
    };
  }

  dispose() {
    this.cancel();
    this._disposed = true;
  }

  _beginAttack(attack) {
    if (!this.owner.spendStamina(attack.stamina)) {
      this.dispatchEvent({ type: 'exhausted' });
      return false;
    }
    this.owner.clearGuard();
    this.attack = attack;
    this.state = WeaponState.WINDUP;
    this.stateTime = 0;
    this._activeProgress = 0;
    this._hitTargets.clear();
    this.dispatchEvent({ type: 'attackstart', attack });
    this.dispatchEvent({ type: 'statechange', state: this.state });
    return true;
  }

  _transition(next) {
    this.state = next;
    this.stateTime = 0;
    if (next === WeaponState.ACTIVE) this._activeProgress = 0;
    this.dispatchEvent({ type: 'statechange', state: next, attack: this.attack });
  }

  _canQueueCombo() {
    if (!this.attack) return false;
    const [start, end] = this.attack.comboWindow ?? [0, 1];
    const progress = this.stateTime / this.attack.recover;
    return progress >= start && progress <= end;
  }

  _bufferAttack(kind) {
    if (this.state === WeaponState.BLOCKING || this.state === WeaponState.STAGGERED) return false;
    this._bufferedAttack = kind;
    this._bufferRemaining = this.inputBuffer;
    return true;
  }

  _updateAttackBuffer(dt) {
    if (!this._bufferedAttack) return;
    this._bufferRemaining -= dt;
    const completesRecoveryThisUpdate = (
      this.state === WeaponState.RECOVERY
      && this.attack
      && this.stateTime + dt >= this.attack.recover
    );
    if (this._bufferRemaining <= 0 && !completesRecoveryThisUpdate) this._clearAttackBuffer();
  }

  _clearAttackBuffer() {
    this._bufferedAttack = null;
    this._bufferRemaining = 0;
  }

  _consumeAttackBuffer() {
    if (
      !this._bufferedAttack
      || this.state === WeaponState.BLOCKING
      || this.state === WeaponState.STAGGERED
      || (this.state !== WeaponState.IDLE && this.state !== WeaponState.RECOVERY)
    ) {
      return false;
    }
    const kind = this._bufferedAttack;
    this._clearAttackBuffer();
    this.comboIndex = 0;
    return this._beginAttack(kind === 'heavy' ? this.weapon.heavy : this.weapon.attacks[0]);
  }

  _syncGuard() {
    this.owner.setGuard({
      active: true,
      facing: this.getForward(_forward).clone(),
      startedAt: this._blockingSince,
      now: this.clock,
      parryWindow: 0.17,
      riposteWindow: 0.72,
      arc: this.weapon.blockArc,
      stability: this.weapon.blockStability,
    });
  }

  _resolveHits(fromProgress, toProgress) {
    if (!this.attack) return;
    const origin = this._getAttackOrigin(_origin);
    const forward = this.getForward(_forward).normalize();
    buildBasis(forward, _right, _up);
    const queryRadius = this.weapon.reach + 0.85;
    const targets = this.queryTargets(origin, queryRadius, this.owner) ?? [];
    const contacts = [];

    for (const target of targets) {
      if (!target || !target.alive || target === this.owner || this._hitTargets.has(target)) continue;
      if (!this.friendlyFire && target.factionId === this.owner.factionId) continue;
      const contact = findAttackContact({
        attack: this.attack,
        reach: this.weapon.reach,
        origin,
        forward,
        right: _right,
        up: _up,
        target,
        fromProgress,
        toProgress,
      });
      if (contact) contacts.push(contact);
    }

    contacts.sort((a, b) => a.order - b.order || a.distance - b.distance);
    const cleave = Math.max(1, Math.floor(this.attack.cleave ?? defaultCleave(this.attack)));
    for (const contact of contacts.slice(0, cleave)) this._applyContact(contact, origin);
    this._activeProgress = Math.max(this._activeProgress, toProgress);
  }

  _getAttackOrigin(target) {
    const provided = this.getOrigin(target) ?? this.owner.position;
    target.copy(provided);
    const ownerY = this.owner.position.y;
    target.y = ownerY + (this.attack?.contactHeight ?? this.owner.attackOriginHeight ?? 1.34);
    return target;
  }

  _applyContact(contact, origin) {
    const { target, volume, point } = contact;
    this._hitTargets.add(target);
    _direction.copy(point).sub(origin);
    if (_direction.lengthSq() < 1e-8) _direction.copy(this.getForward(_forward));
    _direction.normalize();
    const damage = this.attack.damage * (volume.damageMultiplier ?? 1);
    const severity = severityForImpact(this.attack, volume, damage, target);
    const impact = {
      source: this.owner,
      weapon: this.weapon.id,
      attack: this.attack.id,
      damage,
      damageType: this.attack.damageType,
      poiseDamage: this.attack.poiseDamage,
      guardDamage: this.attack.damage * 0.72,
      staggerDuration: 0.42,
      direction: _direction.clone(),
      point: point.clone(),
      hitZone: volume.hitZone,
      surface: volume.surface,
      material: volume.material,
      severity,
      intensity: severity,
    };
    const result = target.receiveImpact(impact);
    if (result.outcome === 'parried') {
      this.owner.staggerRemaining = Math.max(this.owner.staggerRemaining, result.attackerStagger);
    }
    const hitStop = result.outcome === 'blocked'
      ? (this.attack.hitStop ?? 0) * 0.65
      : (this.attack.hitStop ?? 0);
    this._localPauseRemaining = Math.max(this._localPauseRemaining, hitStop);
    this.dispatchEvent({
      type: 'impact',
      target,
      attack: this.attack,
      impact,
      result,
      point: result.point,
      hitZone: result.hitZone,
      surface: result.surface,
      material: result.material,
      severity: result.severity,
      outcome: result.outcome,
      hitStop,
    });
  }
}

function findAttackContact({
  attack,
  reach,
  origin,
  forward,
  right,
  up,
  target,
  fromProgress,
  toProgress,
}) {
  const volumes = target.getHurtVolumes?.() ?? target.hurtVolumes ?? fallbackHurtVolumes(target);
  const shape = attack.shape ?? (attack.thrust ? 'thrust' : attack.vertical ? 'overhead' : 'sweep');
  const steps = Math.max(2, Math.ceil(Math.abs(toProgress - fromProgress) / MIN_SWEEP_STEP));
  let best = null;

  for (let i = 0; i <= steps; i += 1) {
    const progress = fromProgress + (toProgress - fromProgress) * (i / steps);
    sampleWeaponSegment(shape, attack, reach, origin, forward, right, up, progress, _segmentStart, _segmentEnd);
    for (const volume of volumes) {
      getVolumeSegment(target, volume, _volumeStart, _volumeEnd);
      closestSegmentPoints(
        _segmentStart,
        _segmentEnd,
        _volumeStart,
        _volumeEnd,
        _weaponPoint,
        _hurtPoint,
      );
      const radius = (attack.contactRadius ?? 0.18) + (volume.radius ?? 0.3);
      const distanceSq = _weaponPoint.distanceToSquared(_hurtPoint);
      if (distanceSq > radius * radius) continue;
      const contactPoint = _contactPoint.copy(_weaponPoint).add(_hurtPoint).multiplyScalar(0.5);
      const distance = contactPoint.distanceTo(origin);
      const order = i / steps;
      if (!best || order < best.order || (order === best.order && distance < best.distance)) {
        best = {
          target,
          volume,
          point: contactPoint.clone(),
          order,
          distance,
        };
      }
    }
  }
  return best;
}

function sampleWeaponSegment(shape, attack, reach, origin, forward, right, up, progress, start, end) {
  if (shape === 'thrust') {
    const extension = reach * (0.38 + progress * 0.62);
    start.copy(origin).addScaledVector(forward, Math.max(0.12, extension - reach * 0.42));
    end.copy(origin).addScaledVector(forward, extension);
    return;
  }

  if (shape === 'overhead') {
    const angle = lerp(1.05, -0.72, progress);
    _sampleDirection.copy(forward).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle)).normalize();
    const centerDistance = reach * (0.56 + progress * 0.25);
    const halfBlade = reach * 0.3;
    start.copy(origin).addScaledVector(_sampleDirection, Math.max(0.15, centerDistance - halfBlade));
    end.copy(origin).addScaledVector(_sampleDirection, Math.min(reach, centerDistance + halfBlade));
    return;
  }

  const [arcStart, arcEnd] = attack.arc ?? [-0.8, 0.7];
  const yaw = lerp(arcStart, arcEnd, progress);
  _sampleDirection.copy(forward).multiplyScalar(Math.cos(yaw)).addScaledVector(right, Math.sin(yaw)).normalize();
  const centerDistance = reach * (0.56 + Math.sin(progress * Math.PI) * 0.08);
  const halfBlade = reach * 0.34;
  start.copy(origin).addScaledVector(_sampleDirection, Math.max(0.12, centerDistance - halfBlade));
  end.copy(origin).addScaledVector(_sampleDirection, Math.min(reach, centerDistance + halfBlade));
}

function getVolumeSegment(target, volume, start, end) {
  const position = target.position;
  _volumeCenter.copy(position).add(volume.offset ?? _zero);
  const halfHeight = volume.shape === 'capsule' ? (volume.halfHeight ?? 0) : 0;
  start.copy(_volumeCenter).addScaledVector(_worldUp, -halfHeight);
  end.copy(_volumeCenter).addScaledVector(_worldUp, halfHeight);
}

function fallbackHurtVolumes(target) {
  return [{
    shape: 'capsule',
    offset: new Vector3(0, target.attackOriginHeight ?? 1.15, 0),
    halfHeight: 0.42,
    radius: target.radius ?? 0.34,
    hitZone: 'torso',
    material: 'flesh',
    surface: 'flesh',
    damageMultiplier: 1,
  }];
}

function closestSegmentPoints(p1, q1, p2, q2, out1, out2) {
  _d1.copy(q1).sub(p1);
  _d2.copy(q2).sub(p2);
  _r.copy(p1).sub(p2);
  const a = _d1.dot(_d1);
  const e = _d2.dot(_d2);
  const f = _d2.dot(_r);
  let s;
  let t;

  if (a <= 1e-8 && e <= 1e-8) {
    s = 0;
    t = 0;
  } else if (a <= 1e-8) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = _d1.dot(_r);
    if (e <= 1e-8) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }

  out1.copy(p1).addScaledVector(_d1, s);
  out2.copy(p2).addScaledVector(_d2, t);
}

function buildBasis(forward, right, up) {
  right.crossVectors(forward, _worldUp);
  if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
  else right.normalize();
  up.crossVectors(right, forward).normalize();
}

function defaultCleave(attack) {
  return attack.thrust || attack.vertical || attack.damageType === 'blunt' ? 1 : 2;
}

function severityForImpact(attack, volume, damage, target) {
  const attackWeight = Math.min(1, damage / 48);
  const poiseWeight = Math.min(1, (attack.poiseDamage ?? 0) / Math.max(1, target.poise ?? 35));
  const zoneWeight = volume.hitZone === 'head' ? 0.16 : volume.hitZone === 'legs' ? -0.08 : 0;
  return clamp01(0.22 + attackWeight * 0.5 + poiseWeight * 0.22 + zoneWeight);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

const _origin = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _direction = new Vector3();
const _segmentStart = new Vector3();
const _segmentEnd = new Vector3();
const _volumeStart = new Vector3();
const _volumeEnd = new Vector3();
const _volumeCenter = new Vector3();
const _weaponPoint = new Vector3();
const _hurtPoint = new Vector3();
const _contactPoint = new Vector3();
const _sampleDirection = new Vector3();
const _d1 = new Vector3();
const _d2 = new Vector3();
const _r = new Vector3();
const _zero = new Vector3();
const _worldUp = new Vector3(0, 1, 0);
const _defaultForward = new Vector3(0, 0, -1);
