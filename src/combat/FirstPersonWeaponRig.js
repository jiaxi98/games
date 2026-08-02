import {
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { WeaponState } from './MeleeCombatController.js';

export function createFirstPersonWeaponRig({
  weapon = 'longsword',
  skinColor = 0xb98262,
  clothColor = 0x273744,
} = {}) {
  const root = new Group();
  root.name = 'FirstPersonWeaponRig';

  const skin = new MeshStandardMaterial({ color: skinColor, roughness: 0.92 });
  const cloth = new MeshStandardMaterial({ color: clothColor, roughness: 1 });
  const steel = new MeshStandardMaterial({ color: 0xaeb4b5, metalness: 0.78, roughness: 0.32 });
  const leather = new MeshStandardMaterial({ color: 0x3c2416, roughness: 0.86 });
  const brass = new MeshStandardMaterial({ color: 0x80683f, metalness: 0.48, roughness: 0.48 });
  const materials = [skin, cloth, steel, leather, brass];

  const rightArm = createArm(skin, cloth);
  rightArm.position.set(0.34, -0.34, -0.62);
  rightArm.rotation.set(-0.36, -0.12, -0.22);
  root.add(rightArm);

  const leftArm = createArm(skin, cloth);
  leftArm.position.set(-0.27, -0.4, -0.66);
  leftArm.rotation.set(-0.28, 0.16, 0.28);
  root.add(leftArm);

  const weaponRoot = new Group();
  weaponRoot.position.set(0.14, -0.2, -0.64);
  weaponRoot.rotation.set(-0.24, 0, -0.12);
  root.add(weaponRoot);

  if (weapon === 'spear') {
    const shaft = new Mesh(new CylinderGeometry(0.022, 0.026, 2.6, 8), leather);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = -0.72;
    weaponRoot.add(shaft);
    const head = new Mesh(new CylinderGeometry(0, 0.07, 0.34, 4), steel);
    head.rotation.x = Math.PI / 2;
    head.position.z = -2.17;
    weaponRoot.add(head);
  } else {
    const bladeLength = weapon === 'armingSword' ? 0.92 : 1.2;
    const blade = new Mesh(new BoxGeometry(0.055, 0.012, bladeLength), steel);
    blade.position.z = -0.48 - bladeLength * 0.5;
    weaponRoot.add(blade);
    const tip = new Mesh(new CylinderGeometry(0, 0.04, 0.2, 4), steel);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.48 - bladeLength - 0.1;
    weaponRoot.add(tip);
    const guard = new Mesh(new BoxGeometry(0.42, 0.04, 0.055), brass);
    guard.position.z = -0.43;
    weaponRoot.add(guard);
    const grip = new Mesh(new CylinderGeometry(0.035, 0.04, 0.34, 8), leather);
    grip.rotation.x = Math.PI / 2;
    grip.position.z = -0.22;
    weaponRoot.add(grip);
  }

  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = false;
      object.receiveShadow = false;
      object.frustumCulled = false;
      object.renderOrder = 20;
      object.material.depthTest = false;
      object.material.depthWrite = false;
    }
  });

  let elapsed = 0;
  return {
    object3d: root,
    update(dt, pose) {
      elapsed += dt;
      const breathe = Math.sin(elapsed * 1.7) * 0.008;
      root.position.y = breathe;
      applyPose(weaponRoot, rightArm, leftArm, pose);
    },
    dispose() {
      root.traverse((object) => object.geometry?.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
    },
  };
}

function createArm(skin, cloth) {
  const arm = new Group();
  const sleeve = new Mesh(new CapsuleGeometry(0.095, 0.34, 4, 8), cloth);
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = -0.1;
  arm.add(sleeve);
  const hand = new Mesh(new CapsuleGeometry(0.065, 0.12, 4, 8), skin);
  hand.rotation.x = Math.PI / 2;
  hand.position.z = -0.37;
  arm.add(hand);
  return arm;
}

function applyPose(weaponRoot, rightArm, leftArm, pose = {}) {
  const state = pose.state ?? WeaponState.IDLE;
  const t = ease(pose.progress ?? 0);
  let x = -0.24;
  let y = 0;
  let z = -0.12;
  weaponRoot.position.set(0.14, -0.2, -0.64);

  if (state === WeaponState.WINDUP) {
    const side = pose.attack?.arc?.[0] < 0 ? 1 : -1;
    x = -0.5 + t * -0.18;
    y = side * (0.16 + t * 0.72);
    z = side * -0.45;
  } else if (state === WeaponState.ACTIVE) {
    const [start, end] = pose.attack?.arc ?? [-0.8, 0.7];
    x = pose.attack?.thrust ? -0.8 * t : -0.52 + t * 0.24;
    y = pose.attack?.thrust ? 0 : start + (end - start) * t;
    z = pose.attack?.vertical ? -0.1 : 0.22;
    weaponRoot.position.z = -0.64 - (pose.attack?.thrust ? t * 0.7 : 0);
  } else if (state === WeaponState.RECOVERY) {
    x = -0.42 + t * 0.18;
    y = (1 - t) * 0.28;
    z = -0.08;
    weaponRoot.position.z = -0.64;
  } else if (state === WeaponState.BLOCKING) {
    x = -0.05;
    y = -0.18;
    z = 1.04;
    weaponRoot.position.set(0.02, -0.08, -0.72);
  } else {
    // The neutral transform was restored before evaluating the pose.
  }

  weaponRoot.rotation.set(x, y, z);
  rightArm.rotation.z = -0.22 + y * 0.22;
  leftArm.rotation.z = 0.28 + y * 0.16;
}

function ease(t) {
  return t * t * (3 - 2 * t);
}
