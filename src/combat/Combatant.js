import { EventDispatcher, Vector3 } from 'three';

const DEFAULT_STAMINA_REGEN_DELAY = 0.65;

export const DamageType = Object.freeze({
  CUT: 'cut',
  BLUNT: 'blunt',
  PIERCE: 'pierce',
});

export class Combatant extends EventDispatcher {
  constructor({
    id,
    factionId = 0,
    maxHealth = 100,
    maxStamina = 100,
    staminaRegen = 24,
    armor = {},
    poise = 35,
    positionProvider = null,
    height = 1.82,
    radius = 0.34,
    attackOriginHeight = 1.34,
    hurtVolumes = null,
    targetable = true,
  } = {}) {
    super();
    this.id = id;
    this.factionId = factionId;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.maxStamina = maxStamina;
    this.stamina = maxStamina;
    this.staminaRegen = staminaRegen;
    this.armor = {
      [DamageType.CUT]: 0,
      [DamageType.BLUNT]: 0,
      [DamageType.PIERCE]: 0,
      ...armor,
    };
    this.poise = poise;
    this.height = height;
    this.radius = radius;
    this.attackOriginHeight = attackOriginHeight;
    this.hurtVolumes = normalizeHurtVolumes(
      hurtVolumes ?? createDefaultHurtVolumes(this.armor, height, radius),
    );
    this.targetable = targetable;
    this.guard = null;
    this.alive = true;
    this.staggerRemaining = 0;
    this._regenDelay = 0;
    this._positionProvider = positionProvider;
    this._position = new Vector3();
  }

  get position() {
    if (this._positionProvider) {
      const value = this._positionProvider();
      if (value) this._position.copy(value);
    }
    return this._position;
  }

  setPosition(x, y, z) {
    this._position.set(x, y, z);
    return this;
  }

  spendStamina(amount, regenDelay = DEFAULT_STAMINA_REGEN_DELAY) {
    if (!this.alive || amount < 0 || this.stamina + 1e-6 < amount) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this._regenDelay = Math.max(this._regenDelay, regenDelay);
    return true;
  }

  restoreStamina(amount) {
    this.stamina = Math.min(this.maxStamina, this.stamina + Math.max(0, amount));
  }

  setGuard(guard) {
    this.guard = guard;
  }

  clearGuard() {
    this.guard = null;
  }

  getHurtVolumes() {
    return this.hurtVolumes;
  }

  update(dt) {
    if (!this.alive) return;
    this.staggerRemaining = Math.max(0, this.staggerRemaining - dt);
    this._regenDelay = Math.max(0, this._regenDelay - dt);
    if (this._regenDelay === 0 && !this.guard) {
      this.restoreStamina(this.staminaRegen * dt);
    }
  }

  receiveImpact(impact) {
    if (!this.alive) return { outcome: 'dead', damage: 0, killed: true };
    if (!this.targetable) {
      return withImpactMetadata({
        outcome: 'invulnerable',
        damage: 0,
        killed: false,
        staggered: false,
      }, impact, this.maxHealth);
    }

    const guardResult = this._resolveGuard(impact);
    if (guardResult) {
      this.dispatchEvent({ type: 'impact', impact, result: guardResult });
      return guardResult;
    }

    const mitigation = Math.min(0.85, Math.max(0, this.armor[impact.damageType] ?? 0));
    const damage = Math.max(0, impact.damage * (1 - mitigation));
    this.health = Math.max(0, this.health - damage);

    const effectivePoiseDamage = impact.poiseDamage ?? impact.damage * 0.55;
    const staggered = effectivePoiseDamage >= this.poise || this.health === 0;
    if (staggered) {
      this.staggerRemaining = Math.max(this.staggerRemaining, impact.staggerDuration ?? 0.38);
    }

    if (this.health === 0) {
      this.alive = false;
      this.guard = null;
    }

    const result = withImpactMetadata({
      outcome: this.alive ? (staggered ? 'stagger' : 'hit') : 'killed',
      damage,
      killed: !this.alive,
      staggered,
    }, impact, this.maxHealth);
    this.dispatchEvent({ type: 'impact', impact, result });
    if (!this.alive) this.dispatchEvent({ type: 'death', impact });
    return result;
  }

  reset() {
    this.health = this.maxHealth;
    this.stamina = this.maxStamina;
    this.alive = true;
    this.guard = null;
    this.staggerRemaining = 0;
    this._regenDelay = 0;
  }

  _resolveGuard(impact) {
    const guard = this.guard;
    if (!guard || !guard.active || !impact.direction) return null;

    const incoming = _incoming.copy(impact.direction).normalize().multiplyScalar(-1);
    const facing = _facing.copy(guard.facing).normalize();
    const withinArc = facing.dot(incoming) >= Math.cos((guard.arc ?? Math.PI * 0.75) * 0.5);
    if (!withinArc) return null;

    const elapsed = Math.max(0, (guard.now ?? 0) - (guard.startedAt ?? -Infinity));
    const parryWindow = guard.parryWindow ?? 0.16;
    const isParry = elapsed <= parryWindow && (guard.canParry ?? true);
    const staminaCost = isParry
      ? (guard.parryStaminaCost ?? 5)
      : Math.max(1, (impact.guardDamage ?? impact.damage * 0.62) - (guard.stability ?? 0));

    const staminaBefore = this.stamina;
    if (this.spendStamina(staminaCost, 0.85)) {
      return withImpactMetadata({
        outcome: isParry ? 'parried' : 'blocked',
        damage: 0,
        staminaDamage: staminaCost,
        killed: false,
        attackerStagger: isParry ? (guard.riposteWindow ?? 0.7) : 0,
      }, {
        ...impact,
        material: guard.material ?? 'metal',
        surface: isParry ? 'weapon' : (guard.surface ?? 'guard'),
      }, this.maxHealth);
    }

    this.clearGuard();
    this.staggerRemaining = Math.max(this.staggerRemaining, guard.breakStagger ?? 0.72);
    const overflow = Math.max(0, staminaCost - staminaBefore);
    this.stamina = 0;
    const chipDamage = Math.max(impact.damage * 0.18, overflow * 0.25);
    this.health = Math.max(0, this.health - chipDamage);
    if (this.health === 0) this.alive = false;
    return withImpactMetadata({
      outcome: this.alive ? 'guard-broken' : 'killed',
      damage: chipDamage,
      staminaDamage: staminaCost,
      killed: !this.alive,
      staggered: true,
    }, {
      ...impact,
      material: guard.material ?? 'metal',
      surface: guard.surface ?? 'guard',
    }, this.maxHealth);
  }
}

function createDefaultHurtVolumes(armor, height, radius) {
  const armorStrength = Math.max(
    armor[DamageType.CUT] ?? 0,
    armor[DamageType.BLUNT] ?? 0,
    armor[DamageType.PIERCE] ?? 0,
  );
  const torsoMaterial = armorStrength >= 0.28
    ? 'metal'
    : armorStrength >= 0.1 ? 'armor' : 'cloth';
  const torsoSurface = armorStrength >= 0.28
    ? 'plate'
    : armorStrength >= 0.1 ? 'mail' : 'cloth';
  const bodyScale = height / 1.82;
  return [
    {
      shape: 'sphere',
      offset: [0, 1.62 * bodyScale, 0],
      radius: Math.min(radius, 0.23 * bodyScale),
      hitZone: 'head',
      material: 'flesh',
      surface: 'skin',
      damageMultiplier: 1.18,
    },
    {
      shape: 'capsule',
      offset: [0, 1.14 * bodyScale, 0],
      halfHeight: 0.31 * bodyScale,
      radius,
      hitZone: 'torso',
      material: torsoMaterial,
      surface: torsoSurface,
      damageMultiplier: 1,
    },
    {
      shape: 'capsule',
      offset: [0, 0.48 * bodyScale, 0],
      halfHeight: 0.25 * bodyScale,
      radius: Math.max(0.2, radius * 0.72),
      hitZone: 'legs',
      material: 'cloth',
      surface: 'cloth',
      damageMultiplier: 0.86,
    },
  ];
}

function normalizeHurtVolumes(volumes) {
  return (volumes ?? []).map((volume) => {
    const offset = volume.offset?.isVector3
      ? volume.offset.clone()
      : new Vector3(
        volume.offset?.[0] ?? volume.offset?.x ?? 0,
        volume.offset?.[1] ?? volume.offset?.y ?? 0,
        volume.offset?.[2] ?? volume.offset?.z ?? 0,
      );
    return {
      shape: volume.shape ?? (volume.halfHeight ? 'capsule' : 'sphere'),
      radius: Math.max(0.01, Number(volume.radius) || 0.3),
      halfHeight: Math.max(0, Number(volume.halfHeight) || 0),
      hitZone: volume.hitZone ?? volume.zone ?? 'torso',
      material: volume.material ?? 'flesh',
      surface: volume.surface ?? volume.material ?? 'flesh',
      damageMultiplier: Math.max(0, Number(volume.damageMultiplier) || 1),
      offset,
    };
  });
}

function withImpactMetadata(result, impact = {}, maxHealth = 100) {
  const outcomeScale = result.outcome === 'killed'
    ? 1
    : result.outcome === 'parried' ? 0.72
      : result.outcome === 'blocked' ? 0.48 : 1;
  const rawSeverity = impact.severity ?? impact.intensity
    ?? ((result.damage ?? impact.damage ?? 0) / Math.max(1, maxHealth)) * 2.4;
  const severity = Math.min(1, Math.max(0, rawSeverity * outcomeScale));
  return {
    ...result,
    point: impact.point,
    position: impact.point,
    direction: impact.direction,
    hitZone: impact.hitZone ?? 'torso',
    surface: impact.surface ?? 'flesh',
    material: impact.material ?? 'flesh',
    severity,
    intensity: severity,
    attack: impact.attack,
    weapon: impact.weapon,
  };
}

const _incoming = new Vector3();
const _facing = new Vector3();
