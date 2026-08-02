import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Vector3,
} from 'three';
import { createFirstPersonWeaponRig } from '../../src/combat/FirstPersonWeaponRig.js';
import { WeaponState } from '../../src/combat/MeleeCombatController.js';

describe('FirstPersonWeaponRig', () => {
  it('builds a compact layered sword and grounded arm equipment', () => {
    const rig = createFirstPersonWeaponRig();
    const weaponRoot = rig.object3d.getObjectByName('WeaponRoot');

    expect(rig.object3d.name).toBe('FirstPersonWeaponRig');
    expect(weaponRoot).toBeTruthy();
    expect(rig.object3d.getObjectByName('SwordBlade')).toBeTruthy();
    expect(rig.object3d.getObjectByName('BladeFuller')).toBeTruthy();
    expect(rig.object3d.getObjectByName('Crossguard')).toBeTruthy();
    expect(rig.object3d.getObjectByName('RightArm:Vambrace')).toBeTruthy();
    expect(rig.object3d.getObjectByName('LeftArm:Cuff')).toBeTruthy();

    const oversizedFlatMeshes = [];
    rig.object3d.traverse((object) => {
      if (!(object.geometry instanceof BoxGeometry)) return;
      const { width = 0, height = 0, depth = 0 } = object.geometry.parameters;
      const dimensions = [width, height, depth].sort((a, b) => b - a);
      if (dimensions[0] > 1.25 && dimensions[1] > 0.25) oversizedFlatMeshes.push(object.name);
    });
    expect(oversizedFlatMeshes).toEqual([]);

    rig.dispose();
  });

  it('keeps neutral, block, cut, and thrust poses distinct and legible', () => {
    const rig = createFirstPersonWeaponRig();
    const weaponRoot = rig.object3d.getObjectByName('WeaponRoot');

    rig.update(0, { state: WeaponState.IDLE, progress: 0 });
    const neutral = {
      x: weaponRoot.rotation.x,
      y: weaponRoot.rotation.y,
      z: weaponRoot.rotation.z,
      depth: weaponRoot.position.z,
    };

    rig.update(0, { state: WeaponState.BLOCKING, progress: 1 });
    expect(Math.abs(weaponRoot.rotation.z - neutral.z)).toBeGreaterThan(0.6);
    expect(Math.abs(weaponRoot.position.x)).toBeLessThan(0.1);

    rig.update(0, {
      state: WeaponState.ACTIVE,
      progress: 0.8,
      attack: { arc: [-1.05, 0.62] },
    });
    expect(Math.abs(weaponRoot.rotation.y - neutral.y)).toBeGreaterThan(0.15);

    rig.update(0, {
      state: WeaponState.ACTIVE,
      progress: 1,
      attack: { thrust: true, arc: [0, 0] },
    });
    expect(weaponRoot.position.z).toBeLessThan(neutral.depth - 0.5);
    expect(Math.abs(weaponRoot.rotation.z)).toBeLessThan(0.08);

    rig.dispose();
  });

  it('builds a tapered spear with grip, socket, and head', () => {
    const rig = createFirstPersonWeaponRig({ weapon: 'spear' });

    expect(rig.object3d.getObjectByName('SpearShaft')?.geometry).toBeInstanceOf(CylinderGeometry);
    expect(rig.object3d.getObjectByName('SpearGrip')).toBeTruthy();
    expect(rig.object3d.getObjectByName('SpearSocket')).toBeTruthy();
    expect(rig.object3d.getObjectByName('SpearHead')).toBeTruthy();
    expect(rig.object3d.getObjectByName('SwordBlade')).toBeFalsy();

    rig.dispose();
  });

  it('supports a bounded local weapon recoil impulse', () => {
    const rig = createFirstPersonWeaponRig();
    rig.applyImpulse({ intensity: 0.8, direction: { x: 1 } });
    rig.update(0.016, { state: WeaponState.IDLE, progress: 0 });

    expect(rig.object3d.position.z).toBeGreaterThan(0);
    expect(Math.abs(rig.object3d.rotation.z)).toBeGreaterThan(0);

    rig.dispose();
  });

  it('reduces viewmodel coverage and uses ordered depth-tested layers', () => {
    const rig = createFirstPersonWeaponRig();
    const blade = rig.object3d.getObjectByName('SwordBlade');
    const rightHand = rig.object3d.getObjectByName('RightArm:Hand');
    const sleeve = rig.object3d.getObjectByName('RightArm:Sleeve');
    const bounds = new Box3().setFromObject(rig.object3d).getSize(new Vector3());

    expect(rig.object3d.userData.presentationScale).toBeCloseTo(0.79);
    expect(bounds.x).toBeLessThan(0.9);
    expect(bounds.y).toBeLessThan(0.5);
    expect(blade.material.depthTest).toBe(true);
    expect(rightHand.material.depthTest).toBe(true);
    expect(sleeve.material.depthTest).toBe(true);
    expect(blade.material.depthWrite).toBe(false);
    expect(blade.renderOrder).toBeGreaterThan(rightHand.renderOrder);
    expect(rightHand.renderOrder).toBeGreaterThan(sleeve.renderOrder);

    rig.dispose();
  });

  it('keeps hands close to the grip while moving attacks away from center', () => {
    const rig = createFirstPersonWeaponRig();
    const weaponRoot = rig.object3d.getObjectByName('WeaponRoot');
    const grip = rig.object3d.getObjectByName('SwordGrip');
    const rightHand = rig.object3d.getObjectByName('RightArm:Hand');
    const leftHand = rig.object3d.getObjectByName('LeftArm:Hand');
    const world = new Vector3();
    const right = new Vector3();
    const left = new Vector3();

    rig.update(0, { state: WeaponState.IDLE, progress: 0 });
    rig.object3d.updateMatrixWorld(true);
    grip.getWorldPosition(world);
    rightHand.getWorldPosition(right);
    leftHand.getWorldPosition(left);
    expect(right.distanceTo(world)).toBeLessThan(0.32);
    expect(left.distanceTo(world)).toBeLessThan(0.4);

    rig.update(0, {
      state: WeaponState.WINDUP,
      progress: 1,
      attack: { arc: [0.9, -0.6] },
    });
    expect(Math.abs(weaponRoot.position.x)).toBeGreaterThan(0.5);
    expect(weaponRoot.position.y).toBeLessThan(-0.25);

    rig.update(0, { state: WeaponState.BLOCKING, progress: 1 });
    expect(Math.abs(weaponRoot.position.x)).toBeLessThan(0.1);
    expect(weaponRoot.position.y).toBeLessThan(-0.2);

    rig.dispose();
  });
});
