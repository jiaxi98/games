export class AttackCoordinator {
  constructor({ maxAttackersPerTarget = 2 } = {}) {
    this.maxAttackersPerTarget = Math.max(1, Math.floor(maxAttackersPerTarget));
    this._byTarget = new Map();
    this._byAttacker = new Map();
  }

  reserve(attacker, target) {
    if (!attacker || !target || attacker === target) return false;
    const current = this._byAttacker.get(attacker);
    if (current === target) return true;

    let attackers = this._byTarget.get(target);
    if (attackers?.size >= this.maxAttackersPerTarget) return false;

    if (current) this.release(attacker);
    if (!attackers) {
      attackers = new Set();
      this._byTarget.set(target, attackers);
    }
    attackers.add(attacker);
    this._byAttacker.set(attacker, target);
    return true;
  }

  release(attacker) {
    const target = this._byAttacker.get(attacker);
    if (!target) return false;
    this._byAttacker.delete(attacker);
    const attackers = this._byTarget.get(target);
    attackers?.delete(attacker);
    if (attackers?.size === 0) this._byTarget.delete(target);
    return true;
  }

  releaseTarget(target) {
    const attackers = this._byTarget.get(target);
    if (!attackers) return false;
    for (const attacker of attackers) this._byAttacker.delete(attacker);
    this._byTarget.delete(target);
    return true;
  }

  canReserve(attacker, target) {
    if (!attacker || !target || attacker === target) return false;
    if (this._byAttacker.get(attacker) === target) return true;
    return (this._byTarget.get(target)?.size ?? 0) < this.maxAttackersPerTarget;
  }

  has(attacker, target = undefined) {
    const reservedTarget = this._byAttacker.get(attacker);
    return target === undefined ? Boolean(reservedTarget) : reservedTarget === target;
  }

  targetFor(attacker) {
    return this._byAttacker.get(attacker) ?? null;
  }

  countFor(target) {
    return this._byTarget.get(target)?.size ?? 0;
  }

  prune(isValid = defaultValidity) {
    for (const [attacker, target] of this._byAttacker) {
      if (!isValid(attacker) || !isValid(target)) this.release(attacker);
    }
  }

  clear() {
    this._byTarget.clear();
    this._byAttacker.clear();
  }
}

function defaultValidity(actor) {
  return actor?.combatant?.alive === true;
}
