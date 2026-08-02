import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Combatant, DamageType } from '../../src/combat/Combatant.js';

describe('Combatant', () => {
  it('applies armor mitigation and death through the shared impact interface', () => {
    const target = new Combatant({
      maxHealth: 40,
      armor: { [DamageType.CUT]: 0.25 },
    });
    const first = target.receiveImpact({
      damage: 20,
      damageType: DamageType.CUT,
      direction: new Vector3(0, 0, 1),
    });
    expect(first.damage).toBe(15);
    expect(target.health).toBe(25);

    const second = target.receiveImpact({
      damage: 40,
      damageType: DamageType.BLUNT,
      direction: new Vector3(0, 0, 1),
    });
    expect(second.killed).toBe(true);
    expect(target.alive).toBe(false);
  });

  it('parries during the opening guard window', () => {
    const target = new Combatant({ maxStamina: 50 });
    target.setGuard({
      active: true,
      facing: new Vector3(0, 0, 1),
      startedAt: 1,
      now: 1.1,
      parryWindow: 0.16,
      parryStaminaCost: 4,
      arc: Math.PI,
    });
    const result = target.receiveImpact({
      damage: 30,
      guardDamage: 20,
      damageType: DamageType.CUT,
      direction: new Vector3(0, 0, -1),
    });
    expect(result.outcome).toBe('parried');
    expect(result.attackerStagger).toBeGreaterThan(0);
    expect(target.health).toBe(target.maxHealth);
    expect(target.stamina).toBe(46);
  });

  it('breaks a depleted guard and deals chip damage', () => {
    const target = new Combatant({ maxHealth: 50, maxStamina: 5 });
    target.setGuard({
      active: true,
      facing: new Vector3(0, 0, 1),
      startedAt: 0,
      now: 1,
      parryWindow: 0.1,
      stability: 0,
      arc: Math.PI,
    });
    const result = target.receiveImpact({
      damage: 30,
      guardDamage: 20,
      damageType: DamageType.BLUNT,
      direction: new Vector3(0, 0, -1),
    });
    expect(result.outcome).toBe('guard-broken');
    expect(result.damage).toBeGreaterThan(0);
    expect(target.staggerRemaining).toBeGreaterThan(0);
  });

  it('preserves contact metadata on resolved impacts', () => {
    const target = new Combatant({ maxHealth: 100 });
    const point = new Vector3(0.1, 1.3, -0.2);
    const result = target.receiveImpact({
      damage: 25,
      damageType: DamageType.CUT,
      direction: new Vector3(0, 0, -1),
      point,
      hitZone: 'torso',
      material: 'metal',
      surface: 'plate',
      severity: 0.7,
    });

    expect(result.point).toBe(point);
    expect(result.hitZone).toBe('torso');
    expect(result.material).toBe('metal');
    expect(result.surface).toBe('plate');
    expect(result.severity).toBeCloseTo(0.7);
    expect(result.outcome).toBe('hit');
  });
});
