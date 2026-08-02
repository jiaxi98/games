import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { WeaponState } from './MeleeCombatController.js';

const NEUTRAL = Object.freeze({
  weaponPosition: [0.24, -0.28, -0.62],
  weaponRotation: [0.3, 0.17, -0.09],
  rightArmPosition: [0.35, -0.34, -0.4],
  rightArmRotation: [0.25, -0.16, -0.2],
  leftArmPosition: [-0.5, -0.38, -0.4],
  leftArmRotation: [0.25, -0.65, 0.3],
});

export function createFirstPersonWeaponRig({
  weapon = 'longsword',
  skinColor = 0xb98262,
  clothColor = 0x273744,
} = {}) {
  const root = new Group();
  root.name = 'FirstPersonWeaponRig';

  const skin = new MeshStandardMaterial({ color: skinColor, roughness: 0.94 });
  const cloth = new MeshStandardMaterial({ color: clothColor, roughness: 1, flatShading: true });
  const clothTrim = new MeshStandardMaterial({ color: 0x9b8a66, roughness: 0.9, flatShading: true });
  const steel = new MeshStandardMaterial({
    color: 0xaeb6b7,
    metalness: 0.82,
    roughness: 0.3,
    flatShading: true,
  });
  const steelDark = new MeshStandardMaterial({
    color: 0x4a5051,
    metalness: 0.66,
    roughness: 0.42,
    flatShading: true,
  });
  const leather = new MeshStandardMaterial({ color: 0x3c2416, roughness: 0.88, flatShading: true });
  const leatherLight = new MeshStandardMaterial({ color: 0x69442a, roughness: 0.84, flatShading: true });
  const brass = new MeshStandardMaterial({
    color: 0x8f7544,
    metalness: 0.52,
    roughness: 0.45,
    flatShading: true,
  });
  const materials = [
    skin,
    cloth,
    clothTrim,
    steel,
    steelDark,
    leather,
    leatherLight,
    brass,
  ];

  const rightArm = createArm({
    name: 'RightArm',
    skin,
    cloth,
    clothTrim,
    leather,
    steelDark,
    handedness: 1,
  });
  root.add(rightArm);

  const leftArm = createArm({
    name: 'LeftArm',
    skin,
    cloth,
    clothTrim,
    leather,
    steelDark,
    handedness: -1,
  });
  root.add(leftArm);

  const weaponRoot = new Group();
  weaponRoot.name = 'WeaponRoot';
  root.add(weaponRoot);

  if (weapon === 'spear') {
    createSpear(weaponRoot, { wood: leatherLight, leather, steel, steelDark });
  } else {
    createSword(weaponRoot, {
      bladeLength: weapon === 'armingSword' ? 0.9 : 1.12,
      steel,
      steelDark,
      leather,
      brass,
    });
  }
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
    object.renderOrder = 20;
    object.material.depthTest = false;
    object.material.depthWrite = false;
    object.material.toneMapped = true;
  });

  let elapsed = 0;
  applyPose(weaponRoot, rightArm, leftArm, { state: WeaponState.IDLE, progress: 0 });

  return {
    object3d: root,
    update(dt, pose) {
      elapsed += dt;
      const breathe = Math.sin(elapsed * 1.65);
      const settle = Math.sin(elapsed * 0.82 + 0.7);
      root.position.set(settle * 0.004, breathe * 0.006, 0);
      root.rotation.z = settle * 0.003;
      applyPose(weaponRoot, rightArm, leftArm, pose);
    },
    dispose() {
      root.traverse((object) => object.geometry?.dispose());
      materials.forEach((material) => material.dispose());
      root.removeFromParent();
    },
  };
}

function createArm({
  name,
  skin,
  cloth,
  clothTrim,
  leather,
  steelDark,
  handedness,
}) {
  const arm = new Group();
  arm.name = name;

  const sleeve = new Mesh(new CapsuleGeometry(0.078, 0.26, 4, 8), cloth);
  sleeve.name = `${name}:Sleeve`;
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.z = -0.11;
  sleeve.scale.set(1.12, 1, 1);
  arm.add(sleeve);

  const elbow = new Mesh(new SphereGeometry(0.083, 8, 5), cloth);
  elbow.name = `${name}:Elbow`;
  elbow.position.z = -0.28;
  elbow.scale.z = 0.8;
  arm.add(elbow);

  const cuff = new Mesh(new CylinderGeometry(0.078, 0.068, 0.095, 8), clothTrim);
  cuff.name = `${name}:Cuff`;
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.37;
  arm.add(cuff);

  const vambrace = new Mesh(new CylinderGeometry(0.068, 0.056, 0.23, 8), leather);
  vambrace.name = `${name}:Vambrace`;
  vambrace.rotation.x = Math.PI / 2;
  vambrace.position.z = -0.49;
  arm.add(vambrace);

  const wristBand = new Mesh(new TorusGeometry(0.058, 0.009, 4, 9), steelDark);
  wristBand.name = `${name}:WristBand`;
  wristBand.position.z = -0.615;
  arm.add(wristBand);

  const hand = new Mesh(new CapsuleGeometry(0.052, 0.09, 4, 8), skin);
  hand.name = `${name}:Hand`;
  hand.rotation.x = Math.PI / 2;
  hand.rotation.z = handedness * 0.08;
  hand.position.z = -0.69;
  arm.add(hand);

  const gloveBack = new Mesh(new BoxGeometry(0.105, 0.032, 0.1), leather);
  gloveBack.name = `${name}:Glove`;
  gloveBack.position.set(0, 0.035, -0.69);
  gloveBack.rotation.y = handedness * 0.08;
  arm.add(gloveBack);

  arm.userData.hand = hand;
  return arm;
}

function createSword(root, {
  bladeLength,
  steel,
  steelDark,
  leather,
  brass,
}) {
  const grip = new Mesh(new CylinderGeometry(0.027, 0.032, 0.28, 9), leather);
  grip.name = 'SwordGrip';
  grip.rotation.x = Math.PI / 2;
  grip.position.z = -0.08;
  root.add(grip);

  for (let i = 0; i < 5; i += 1) {
    const wrap = new Mesh(new TorusGeometry(0.0325, 0.004, 3, 8), brass);
    wrap.name = 'GripBinding';
    wrap.position.z = 0.02 - i * 0.052;
    root.add(wrap);
  }

  const guard = new Mesh(new CylinderGeometry(0.018, 0.027, 0.4, 7), steelDark);
  guard.name = 'Crossguard';
  guard.rotation.z = Math.PI / 2;
  guard.position.z = -0.255;
  root.add(guard);

  const leftQuillon = new Mesh(new ConeGeometry(0.028, 0.12, 5), steelDark);
  leftQuillon.name = 'LeftQuillon';
  leftQuillon.rotation.z = Math.PI / 2;
  leftQuillon.position.set(-0.255, 0.025, -0.255);
  root.add(leftQuillon);
  const rightQuillon = leftQuillon.clone();
  rightQuillon.name = 'RightQuillon';
  rightQuillon.rotation.z = -Math.PI / 2;
  rightQuillon.position.x = 0.255;
  root.add(rightQuillon);

  const rainGuard = new Mesh(new BoxGeometry(0.085, 0.035, 0.08), leather);
  rainGuard.name = 'RainGuard';
  rainGuard.position.z = -0.3;
  root.add(rainGuard);

  const blade = new Mesh(new BoxGeometry(0.052, 0.014, bladeLength), steel);
  blade.name = 'SwordBlade';
  blade.position.z = -0.34 - bladeLength * 0.5;
  root.add(blade);

  const fuller = new Mesh(new BoxGeometry(0.014, 0.006, bladeLength * 0.82), steelDark);
  fuller.name = 'BladeFuller';
  fuller.position.set(0, 0.011, -0.34 - bladeLength * 0.43);
  root.add(fuller);

  const shoulders = new Mesh(new BoxGeometry(0.072, 0.019, 0.12), steelDark);
  shoulders.name = 'BladeShoulders';
  shoulders.position.z = -0.34;
  root.add(shoulders);

  const tip = new Mesh(new ConeGeometry(0.038, 0.18, 4), steel);
  tip.name = 'SwordPoint';
  tip.rotation.x = Math.PI / 2;
  tip.rotation.y = Math.PI / 4;
  tip.position.z = -0.34 - bladeLength - 0.09;
  root.add(tip);

  const pommel = new Mesh(new SphereGeometry(0.052, 7, 5), brass);
  pommel.name = 'SwordPommel';
  pommel.position.z = 0.1;
  pommel.scale.z = 0.78;
  root.add(pommel);
}

function createSpear(root, { wood, leather, steel, steelDark }) {
  const shaft = new Mesh(new CylinderGeometry(0.018, 0.023, 2.35, 8), wood);
  shaft.name = 'SpearShaft';
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.88;
  root.add(shaft);

  const grip = new Mesh(new CylinderGeometry(0.026, 0.026, 0.42, 8), leather);
  grip.name = 'SpearGrip';
  grip.rotation.x = Math.PI / 2;
  grip.position.z = -0.06;
  root.add(grip);

  const socket = new Mesh(new CylinderGeometry(0.034, 0.024, 0.22, 8), steelDark);
  socket.name = 'SpearSocket';
  socket.rotation.x = Math.PI / 2;
  socket.position.z = -2.12;
  root.add(socket);

  const head = new Mesh(new ConeGeometry(0.062, 0.32, 4), steel);
  head.name = 'SpearHead';
  head.rotation.x = -Math.PI / 2;
  head.rotation.y = Math.PI / 4;
  head.position.z = -2.39;
  root.add(head);

  const buttCap = new Mesh(new ConeGeometry(0.034, 0.16, 6), steelDark);
  buttCap.name = 'SpearButtCap';
  buttCap.rotation.x = Math.PI / 2;
  buttCap.position.z = 0.37;
  root.add(buttCap);
}

function applyPose(weaponRoot, rightArm, leftArm, pose = {}) {
  const state = pose.state ?? WeaponState.IDLE;
  const t = ease(pose.progress ?? 0);
  const attack = pose.attack ?? {};
  const side = attack.arc?.[0] < 0 ? -1 : 1;

  setTransform(
    weaponRoot,
    NEUTRAL.weaponPosition,
    NEUTRAL.weaponRotation,
  );
  setTransform(
    rightArm,
    NEUTRAL.rightArmPosition,
    NEUTRAL.rightArmRotation,
  );
  setTransform(
    leftArm,
    NEUTRAL.leftArmPosition,
    NEUTRAL.leftArmRotation,
  );

  if (state === WeaponState.WINDUP) {
    if (attack.thrust) {
      weaponRoot.position.set(0.3, -0.23, -0.38 + t * 0.08);
      weaponRoot.rotation.set(0.08, 0.08, -0.04);
      rightArm.rotation.set(-0.35, -0.22, -0.28);
      leftArm.rotation.set(-0.27, 0.2, 0.2);
    } else if (attack.vertical) {
      weaponRoot.position.set(0.2, -0.12 + t * 0.16, -0.56);
      weaponRoot.rotation.set(0.18 + t * 0.58, 0.05, -0.08);
      rightArm.rotation.set(-0.42 - t * 0.28, -0.12, -0.25);
      leftArm.rotation.set(-0.32 - t * 0.25, 0.12, 0.18);
    } else {
      weaponRoot.position.set(0.22 + side * t * 0.13, -0.25 + t * 0.08, -0.56);
      weaponRoot.rotation.set(0.25 + t * 0.16, 0.16 + side * t * 0.66, -side * t * 0.22);
      rightArm.rotation.set(-0.28 - t * 0.24, -0.12 + side * t * 0.32, -0.2 - side * t * 0.22);
      leftArm.rotation.set(-0.22 - t * 0.2, 0.16 - side * t * 0.18, 0.22 + side * t * 0.16);
    }
  } else if (state === WeaponState.ACTIVE) {
    if (attack.thrust) {
      weaponRoot.position.set(0.16, -0.19, -0.58 - t * 0.66);
      weaponRoot.rotation.set(0.055, 0.025, -0.025);
      rightArm.rotation.set(-0.38 - t * 0.23, -0.12, -0.21);
      leftArm.rotation.set(-0.3 - t * 0.2, 0.1, 0.16);
    } else if (attack.vertical) {
      weaponRoot.position.set(0.12, -0.1 - t * 0.18, -0.62);
      weaponRoot.rotation.set(0.78 - t * 1.02, 0.03, -0.06);
      rightArm.rotation.set(-0.74 + t * 0.34, -0.08, -0.22);
      leftArm.rotation.set(-0.62 + t * 0.3, 0.08, 0.17);
    } else {
      const [start, end] = attack.arc ?? [-0.8, 0.7];
      const yaw = start + (end - start) * t;
      weaponRoot.position.set(0.18 - side * t * 0.11, -0.22 + Math.sin(t * Math.PI) * 0.06, -0.62);
      weaponRoot.rotation.set(0.32 - t * 0.12, yaw * 0.72, side * (0.18 - t * 0.32));
      rightArm.rotation.set(-0.54 + t * 0.16, yaw * 0.28, -0.22 + side * t * 0.18);
      leftArm.rotation.set(-0.43 + t * 0.14, yaw * 0.2, 0.2 - side * t * 0.12);
    }
  } else if (state === WeaponState.RECOVERY) {
    const settle = 1 - t;
    weaponRoot.position.set(0.21, -0.27, -0.61);
    weaponRoot.rotation.set(
      NEUTRAL.weaponRotation[0] - settle * 0.2,
      NEUTRAL.weaponRotation[1] + side * settle * 0.24,
      NEUTRAL.weaponRotation[2] - side * settle * 0.1,
    );
    rightArm.rotation.set(-0.2 - settle * 0.25, -0.16, -0.2 + side * settle * 0.1);
    leftArm.rotation.set(-0.16 - settle * 0.2, 0.19, 0.25 - side * settle * 0.08);
  } else if (state === WeaponState.BLOCKING) {
    weaponRoot.position.set(0.03, -0.06, -0.72);
    weaponRoot.rotation.set(0.13, -0.08, 0.8);
    rightArm.position.set(0.35, -0.35, -0.42);
    rightArm.rotation.set(0.2, -0.18, -0.26);
    leftArm.position.set(-0.49, -0.39, -0.42);
    leftArm.rotation.set(0.22, -0.58, 0.32);
  } else if (state === WeaponState.STAGGERED) {
    weaponRoot.position.set(0.31, -0.38, -0.48);
    weaponRoot.rotation.set(0.12, 0.34, -0.24);
    rightArm.rotation.set(-0.04, -0.24, -0.32);
    leftArm.rotation.set(-0.03, 0.2, 0.34);
  }
}

function setTransform(object, position, rotation) {
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
}

function ease(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
