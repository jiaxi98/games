import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { Combatant } from '../../src/combat/Combatant.js';
import { MeleeCombatController, WeaponState } from '../../src/combat/MeleeCombatController.js';

describe('MeleeCombatController', () => {
  it('advances timing states and damages one valid enemy', () => {
    const owner = new Combatant({ id: 'player', factionId: 1 });
    owner.setPosition(0, 0, 0);
    const enemy = new Combatant({ id: 'enemy', factionId: 2 });
    enemy.setPosition(0, 0, -1.3);
    const ally = new Combatant({ id: 'ally', factionId: 1 });
    ally.setPosition(0.2, 0, -1);
    const controller = new MeleeCombatController({
      owner,
      weapon: 'armingSword',
      queryTargets: () => [ally, enemy],
      getForward: () => new Vector3(0, 0, -1),
    });

    expect(controller.lightAttack()).toBe(true);
    expect(controller.state).toBe(WeaponState.WINDUP);
    controller.update(0.19);
    expect(controller.state).toBe(WeaponState.ACTIVE);
    expect(enemy.health).toBeLessThan(enemy.maxHealth);
    expect(ally.health).toBe(ally.maxHealth);
  });

  it('uses spear reach to hit at grounded polearm distance', () => {
    const owner = new Combatant({ factionId: 1 });
    owner.setPosition(0, 0, 0);
    const target = new Combatant({ factionId: 2 });
    target.setPosition(0, 0, -2.75);
    const controller = new MeleeCombatController({
      owner,
      weapon: 'spear',
      queryTargets: () => [target],
      getForward: () => new Vector3(0, 0, -1),
    });
    controller.lightAttack();
    controller.update(0.28);
    expect(target.health).toBeLessThan(target.maxHealth);
  });
});

