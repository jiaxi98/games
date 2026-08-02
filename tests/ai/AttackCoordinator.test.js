import { describe, expect, it } from 'vitest';
import { AttackCoordinator } from '../../src/ai/AttackCoordinator.js';

function actor(id) {
  return { id, combatant: { alive: true } };
}

describe('AttackCoordinator', () => {
  it('supports a single committed attacker around a vulnerable player target', () => {
    const coordinator = new AttackCoordinator({ maxAttackersPerTarget: 1 });
    const target = actor('player');
    const first = actor('first');
    const second = actor('second');

    expect(coordinator.reserve(first, target)).toBe(true);
    expect(coordinator.reserve(second, target)).toBe(false);
    expect(coordinator.countFor(target)).toBe(1);
  });

  it('bounds attackers per target while preserving an existing commitment', () => {
    const coordinator = new AttackCoordinator({ maxAttackersPerTarget: 2 });
    const target = actor('target');
    const attackers = [actor('a'), actor('b'), actor('c')];

    expect(coordinator.reserve(attackers[0], target)).toBe(true);
    expect(coordinator.reserve(attackers[1], target)).toBe(true);
    expect(coordinator.reserve(attackers[2], target)).toBe(false);
    expect(coordinator.reserve(attackers[0], target)).toBe(true);
    expect(coordinator.countFor(target)).toBe(2);

    coordinator.release(attackers[0]);
    expect(coordinator.reserve(attackers[2], target)).toBe(true);
    expect(coordinator.countFor(target)).toBe(2);
  });

  it('releases reservations whose actor or target is no longer alive', () => {
    const coordinator = new AttackCoordinator();
    const attacker = actor('attacker');
    const target = actor('target');
    coordinator.reserve(attacker, target);
    target.combatant.alive = false;

    coordinator.prune();

    expect(coordinator.has(attacker)).toBe(false);
    expect(coordinator.countFor(target)).toBe(0);
  });
});
