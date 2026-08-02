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

  it('distinguishes a swept contact from a forward-cone miss', () => {
    const owner = combatantAt('owner', 1, 0, 0, 0);
    const sweptTarget = combatantAt('swept', 2, 1.15, 0, -0.95);
    const outsideArc = combatantAt('miss', 2, 1.35, 0, 0.15);
    const controller = controllerFor(owner, 'longsword', [sweptTarget, outsideArc]);

    controller.lightAttack();
    controller.update(0.25);
    controller.update(0.08);

    expect(sweptTarget.health).toBeLessThan(sweptTarget.maxHealth);
    expect(outsideArc.health).toBe(outsideArc.maxHealth);
  });

  it('uses distinct overhead and thrust shapes rather than one shared cone', () => {
    const overheadOwner = combatantAt('overhead-owner', 1, 0, 0, 0);
    const highTarget = combatantAt('high', 2, 0, 0, -1.25, {
      hurtVolumes: [{
        shape: 'sphere',
        offset: [0, 1.65, 0],
        radius: 0.24,
        hitZone: 'head',
        material: 'metal',
        surface: 'helmet',
      }],
    });
    const lowTarget = combatantAt('low', 2, 0, 0, -1.25, {
      hurtVolumes: [{
        shape: 'sphere',
        offset: [0, 0.35, 0],
        radius: 0.18,
        hitZone: 'legs',
        material: 'cloth',
        surface: 'cloth',
      }],
    });
    const overhead = controllerFor(overheadOwner, longswordOverheadOnly, [highTarget, lowTarget]);
    overhead.lightAttack();
    overhead.update(0.32);
    overhead.update(0.12);

    expect(highTarget.health).toBeLessThan(highTarget.maxHealth);
    expect(lowTarget.health).toBe(lowTarget.maxHealth);

    const thrustOwner = combatantAt('thrust-owner', 1, 0, 0, 0);
    const centered = combatantAt('centered', 2, 0, 0, -1.45);
    const side = combatantAt('side', 2, 0.72, 0, -1.35);
    const thrust = controllerFor(thrustOwner, 'armingSword', [side, centered]);
    thrust.comboIndex = 2;
    thrust.lightAttack();
    thrust.update(0.26);
    thrust.update(0.1);

    expect(centered.health).toBeLessThan(centered.maxHealth);
    expect(side.health).toBe(side.maxHealth);
  });

  it('aims default contacts at torso height instead of feet', () => {
    const owner = combatantAt('owner', 1, 0, 0, 0);
    const torso = combatantAt('torso', 2, 0, 0, -1.2);
    const feetOnly = combatantAt('feet', 2, 0, 0, -1.2, {
      hurtVolumes: [{
        shape: 'sphere',
        offset: [0, 0.08, 0],
        radius: 0.08,
        hitZone: 'feet',
        material: 'leather',
        surface: 'boot',
      }],
    });
    const controller = controllerFor(owner, centeredCut, [feetOnly, torso]);

    controller.lightAttack();
    controller.update(0.21);
    controller.update(0.1);

    expect(torso.health).toBeLessThan(torso.maxHealth);
    expect(feetOnly.health).toBe(feetOnly.maxHealth);
  });

  it('bounds broad-cut cleave and keeps thrusts single-target', () => {
    const cutOwner = combatantAt('cut-owner', 1, 0, 0, 0);
    const cutTargets = [
      combatantAt('cut-a', 2, -0.45, 0, -1.15),
      combatantAt('cut-b', 2, 0, 0, -1.25),
      combatantAt('cut-c', 2, 0.45, 0, -1.15),
    ];
    const cut = controllerFor(cutOwner, centeredCut, cutTargets);
    cut.lightAttack();
    cut.update(0.21);
    cut.update(0.12);
    expect(cutTargets.filter((target) => target.health < target.maxHealth)).toHaveLength(2);

    const thrustOwner = combatantAt('thrust-owner', 1, 0, 0, 0);
    const thrustTargets = [
      combatantAt('near', 2, 0, 0, -1.05),
      combatantAt('far', 2, 0, 0, -1.5),
    ];
    const thrust = controllerFor(thrustOwner, 'armingSword', thrustTargets);
    thrust.comboIndex = 2;
    thrust.lightAttack();
    thrust.update(0.26);
    thrust.update(0.1);
    expect(thrustTargets.filter((target) => target.health < target.maxHealth)).toHaveLength(1);
  });

  it('emits real impact metadata from the contacted hurt volume', () => {
    const owner = combatantAt('owner', 1, 0, 0, 0);
    const target = combatantAt('target', 2, 0, 0, -1.3, {
      hurtVolumes: [{
        shape: 'capsule',
        offset: [0, 1.22, 0],
        halfHeight: 0.25,
        radius: 0.32,
        hitZone: 'torso',
        material: 'metal',
        surface: 'plate',
      }],
    });
    const controller = controllerFor(owner, centeredCut, [target]);
    let event;
    controller.addEventListener('impact', (value) => { event = value; });

    controller.lightAttack();
    controller.update(0.21);
    controller.update(0.1);

    expect(event).toBeTruthy();
    expect(event.point).toBeInstanceOf(Vector3);
    expect(event.point.y).toBeGreaterThan(0.8);
    expect(event.point.equals(target.position)).toBe(false);
    expect(event.hitZone).toBe('torso');
    expect(event.surface).toBe('plate');
    expect(event.material).toBe('metal');
    expect(event.severity).toBeGreaterThan(0);
    expect(event.outcome).toBe(event.result.outcome);
  });

  it('buffers an attack near the end of recovery', () => {
    const owner = combatantAt('owner', 1, 0, 0, 0);
    const controller = controllerFor(owner, centeredCut, []);
    let starts = 0;
    controller.addEventListener('attackstart', () => { starts += 1; });

    controller.lightAttack();
    controller.update(0.21);
    controller.update(0.11);
    controller.update(0.23);
    controller.update(0.23);
    expect(controller.state).toBe(WeaponState.RECOVERY);
    expect(controller.lightAttack()).toBe(true);
    expect(controller.getSnapshot().bufferedAttack).toBe('light');
    controller.update(0.08);

    expect(starts).toBe(2);
    expect(controller.state).toBe(WeaponState.WINDUP);
  });
});

function combatantAt(id, factionId, x, y, z, options = {}) {
  const combatant = new Combatant({ id, factionId, ...options });
  combatant.setPosition(x, y, z);
  return combatant;
}

function controllerFor(owner, weapon, targets) {
  return new MeleeCombatController({
    owner,
    weapon,
    queryTargets: () => targets,
    getForward: () => new Vector3(0, 0, -1),
  });
}

const centeredCut = {
  id: 'test-sword',
  reach: 2,
  blockStability: 0,
  blockArc: Math.PI,
  attacks: [{
    id: 'centered-cut',
    windup: 0.2,
    active: 0.12,
    recover: 0.3,
    comboWindow: [0.2, 0.7],
    damage: 20,
    stamina: 1,
    damageType: 'cut',
    poiseDamage: 10,
    arc: [-0.65, 0.65],
    cleave: 2,
    contactHeight: 1.3,
    contactRadius: 0.18,
    hitStop: 0.04,
  }],
  heavy: {
    id: 'test-heavy',
    windup: 0.3,
    active: 0.12,
    recover: 0.4,
    damage: 30,
    stamina: 1,
    damageType: 'blunt',
    poiseDamage: 20,
    arc: [-0.2, 0.2],
    cleave: 1,
  },
};

const longswordOverheadOnly = {
  ...centeredCut,
  id: 'test-overhead-sword',
  attacks: [{
    ...centeredCut.attacks[0],
    id: 'overhead',
    windup: 0.31,
    active: 0.14,
    vertical: true,
    shape: 'overhead',
    contactHeight: 1.45,
    cleave: 1,
  }],
};
