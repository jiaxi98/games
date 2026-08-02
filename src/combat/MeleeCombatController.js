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

export class MeleeCombatController extends EventDispatcher {
  constructor({
    owner,
    weapon = 'longsword',
    queryTargets = () => [],
    getOrigin,
    getForward,
    friendlyFire = false,
  }) {
    super();
    if (!owner) throw new Error('MeleeCombatController requires an owner Combatant.');
    this.owner = owner;
    this.weapon = typeof weapon === 'string' ? getWeaponDefinition(weapon) : weapon;
    this.queryTargets = queryTargets;
    this.getOrigin = getOrigin ?? (() => owner.position);
    this.getForward = getForward ?? (() => _defaultForward);
    this.friendlyFire = friendlyFire;
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this.attack = null;
    this.comboIndex = 0;
    this.queuedAttack = false;
    this.charge = 0;
    this.clock = 0;
    this._hitTargets = new Set();
    this._blockingSince = -Infinity;
    this._disposed = false;
  }

  lightAttack() {
    if (this._disposed || !this.owner.alive) return false;
    if (this.state === WeaponState.RECOVERY && this._canQueueCombo()) {
      this.queuedAttack = true;
      return true;
    }
    if (this.state !== WeaponState.IDLE) return false;
    return this._beginAttack(this.weapon.attacks[this.comboIndex % this.weapon.attacks.length]);
  }

  heavyAttack() {
    if (this._disposed || !this.owner.alive || this.state !== WeaponState.IDLE) return false;
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
  }

  cancel() {
    this.owner.clearGuard();
    this.attack = null;
    this.queuedAttack = false;
    this.state = WeaponState.IDLE;
    this.stateTime = 0;
    this._hitTargets.clear();
  }

  update(dt) {
    if (this._disposed || dt <= 0) return;
    this.clock += dt;
    this.owner.update(dt);

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

    if (!this.attack || this.state === WeaponState.IDLE) return;
    this.stateTime += dt;

    if (this.state === WeaponState.WINDUP && this.stateTime >= this.attack.windup) {
      this._transition(WeaponState.ACTIVE);
      this._resolveHits();
    } else if (this.state === WeaponState.ACTIVE) {
      this._resolveHits();
      if (this.stateTime >= this.attack.active) this._transition(WeaponState.RECOVERY);
    } else if (this.state === WeaponState.RECOVERY && this.stateTime >= this.attack.recover) {
      if (this.queuedAttack) {
        this.queuedAttack = false;
        this.comboIndex = (this.comboIndex + 1) % this.weapon.attacks.length;
        this._beginAttack(this.weapon.attacks[this.comboIndex]);
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
    return { state: this.state, progress: Math.min(1, this.stateTime / duration), attack };
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
    this._hitTargets.clear();
    this.dispatchEvent({ type: 'attackstart', attack });
    this.dispatchEvent({ type: 'statechange', state: this.state });
    return true;
  }

  _transition(next) {
    this.state = next;
    this.stateTime = 0;
    this.dispatchEvent({ type: 'statechange', state: next, attack: this.attack });
  }

  _canQueueCombo() {
    if (!this.attack) return false;
    const [start, end] = this.attack.comboWindow ?? [0, 1];
    const progress = this.stateTime / this.attack.recover;
    return progress >= start && progress <= end;
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

  _resolveHits() {
    const origin = this.getOrigin(_origin) ?? this.owner.position;
    const forward = this.getForward(_forward).normalize();
    const targets = this.queryTargets(origin, this.weapon.reach, this.owner) ?? [];
    let best = null;
    let bestScore = Infinity;

    for (const target of targets) {
      if (!target || !target.alive || target === this.owner || this._hitTargets.has(target)) continue;
      if (!this.friendlyFire && target.factionId === this.owner.factionId) continue;

      _toTarget.copy(target.position).sub(origin);
      const distance = _toTarget.length();
      if (distance > this.weapon.reach || distance < 0.01) continue;
      _toTarget.multiplyScalar(1 / distance);
      const alignment = forward.dot(_toTarget);
      const minAlignment = this.attack.thrust ? 0.8 : 0.42;
      if (alignment < minAlignment) continue;
      const score = distance - alignment * 0.45;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    }

    if (!best) return;
    this._hitTargets.add(best);
    _direction.copy(best.position).sub(origin).normalize();
    const result = best.receiveImpact({
      source: this.owner,
      weapon: this.weapon.id,
      attack: this.attack.id,
      damage: this.attack.damage,
      damageType: this.attack.damageType,
      poiseDamage: this.attack.poiseDamage,
      guardDamage: this.attack.damage * 0.72,
      staggerDuration: 0.42,
      direction: _direction.clone(),
      point: best.position.clone(),
    });
    if (result.outcome === 'parried') {
      this.owner.staggerRemaining = Math.max(this.owner.staggerRemaining, result.attackerStagger);
    }
    this.dispatchEvent({ type: 'impact', target: best, attack: this.attack, result });
  }
}

const _origin = new Vector3();
const _forward = new Vector3();
const _toTarget = new Vector3();
const _direction = new Vector3();
const _defaultForward = new Vector3(0, 0, -1);
