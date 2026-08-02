import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WeaponState } from './MeleeCombatController.js';

const NEUTRAL = Object.freeze({
  weaponPosition: [0.43, -0.5, -0.8],
  weaponRotation: [0.17, 0.21, -0.09],
  rightArmPosition: [0.47, -0.57, -0.5],
  rightArmRotation: [0.15, -0.2, -0.14],
  leftArmPosition: [-0.19, -0.58, -0.55],
  leftArmRotation: [0.14, -0.4, 0.17],
});

const VIEWMODEL_SCALE = 0.79;
const VIEWMODEL_RENDER_ORDER = Object.freeze({
  arm: 20,
  hand: 21,
  weapon: 22,
  blade: 23,
});
const HAND_LOCAL_POSITION = Object.freeze([0, 0, -0.66]);
const ARM_REACH = 0.66;
const MAX_SHOULDER_ADJUSTMENT = 0.58;

export function createFirstPersonWeaponRig({
  weapon = 'longsword',
  skinColor = 0xb98262,
  clothColor = 0x273744,
} = {}) {
  const root = new Group();
  root.name = 'FirstPersonWeaponRig';
  root.scale.setScalar(VIEWMODEL_SCALE);
  root.userData.presentationScale = VIEWMODEL_SCALE;

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
    handedness: 1,
  });
  root.add(rightArm);

  const leftArm = createArm({
    name: 'LeftArm',
    skin,
    cloth,
    clothTrim,
    leather,
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
    object.renderOrder = renderOrderFor(object);
    object.material.depthTest = true;
    object.material.depthWrite = false;
    object.material.toneMapped = true;
  });

  let elapsed = 0;
  let recoil = 0;
  let recoilSide = 0;
  applyPose(weaponRoot, rightArm, leftArm, { state: WeaponState.IDLE, progress: 0 });
  solveGripConstraints(root, weaponRoot, rightArm, leftArm);

  return {
    object3d: root,
    update(dt, pose) {
      elapsed += dt;
      recoil *= Math.exp(-Math.max(0, dt) * 21);
      const breathe = Math.sin(elapsed * 1.65);
      const settle = Math.sin(elapsed * 0.82 + 0.7);
      root.position.set(settle * 0.005 + recoilSide * recoil * 0.02, breathe * 0.006 - 0.015, recoil * 0.075);
      root.rotation.x = recoil * 0.035;
      root.rotation.z = settle * 0.003 - recoilSide * recoil * 0.04;
      applyPose(weaponRoot, rightArm, leftArm, pose);
      solveGripConstraints(root, weaponRoot, rightArm, leftArm);
    },
    applyImpulse({ intensity = 0.5, direction = null } = {}) {
      recoil = Math.max(recoil, Math.max(0, Math.min(1, intensity)));
      recoilSide = direction?.x ? Math.sign(direction.x) : 0;
    },
    getGripErrors() {
      return measureGripErrors(root, rightArm, leftArm);
    },
    getPoseSample() {
      root.updateMatrixWorld(true);
      const primaryGrip = weaponRoot.getObjectByName('PrimaryGripAnchor');
      const secondaryGrip = weaponRoot.getObjectByName('SecondaryGripAnchor');
      return {
        weaponPosition: weaponRoot.position.toArray(),
        weaponRotation: weaponRoot.rotation.toArray().slice(0, 3),
        weaponQuaternion: weaponRoot.quaternion.toArray(),
        primaryGrip: primaryGrip.getWorldPosition(new Vector3()).toArray(),
        secondaryGrip: secondaryGrip.getWorldPosition(new Vector3()).toArray(),
        rightHand: rightArm.userData.hand.getWorldPosition(new Vector3()).toArray(),
        leftHand: leftArm.userData.hand.getWorldPosition(new Vector3()).toArray(),
        gripErrors: measureGripErrors(root, rightArm, leftArm),
      };
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
  handedness,
}) {
  const arm = new Group();
  arm.name = name;

  const sleeve = createMergedMesh([
    geometryPart(new CapsuleGeometry(0.078, 0.26, 4, 8), {
      position: [0, 0, -0.11],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.12, 1, 1],
    }),
    geometryPart(new SphereGeometry(0.083, 8, 5), {
      position: [0, 0, -0.28],
      scale: [1, 1, 0.8],
    }),
  ], cloth);
  sleeve.name = `${name}:Sleeve`;
  arm.add(sleeve);

  addComponentAlias(arm, `${name}:Elbow`, [0, 0, -0.28]);

  const cuff = new Mesh(new CylinderGeometry(0.078, 0.068, 0.095, 8), clothTrim);
  cuff.name = `${name}:Cuff`;
  cuff.rotation.x = Math.PI / 2;
  cuff.position.z = -0.37;
  arm.add(cuff);

  const vambrace = createMergedMesh([
    geometryPart(new CylinderGeometry(0.068, 0.056, 0.23, 8), {
      position: [0, 0, -0.49],
      rotation: [Math.PI / 2, 0, 0],
    }),
    geometryPart(new BoxGeometry(0.105, 0.032, 0.1), {
      position: [0, 0.032, -0.655],
      rotation: [0, handedness * 0.08, 0],
    }),
  ], leather);
  vambrace.name = `${name}:Vambrace`;
  arm.add(vambrace);

  addComponentAlias(arm, `${name}:WristBand`, [0, 0, -0.615]);

  const hand = new Mesh(new CapsuleGeometry(0.052, 0.09, 4, 8), skin);
  hand.name = `${name}:Hand`;
  hand.rotation.x = Math.PI / 2;
  hand.rotation.z = handedness * 0.08;
  hand.position.set(...HAND_LOCAL_POSITION);
  arm.add(hand);

  addComponentAlias(arm, `${name}:Glove`, [0, 0.032, -0.655]);

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
  const grip = createMergedMesh([
    geometryPart(new CylinderGeometry(0.027, 0.032, 0.28, 9), {
      position: [0, 0, -0.08],
      rotation: [Math.PI / 2, 0, 0],
    }),
    geometryPart(new BoxGeometry(0.085, 0.035, 0.08), {
      position: [0, 0, -0.3],
    }),
  ], leather);
  grip.name = 'SwordGrip';
  root.add(grip);
  addComponentAlias(root, 'RainGuard', [0, 0, -0.3]);

  const gripBindingParts = [];
  for (let i = 0; i < 5; i += 1) {
    gripBindingParts.push(geometryPart(new TorusGeometry(0.0325, 0.004, 3, 8), {
      position: [0, 0, 0.02 - i * 0.052],
    }));
  }
  gripBindingParts.push(geometryPart(new SphereGeometry(0.052, 7, 5), {
    position: [0, 0, 0.1],
    scale: [1, 1, 0.78],
  }));
  const gripBinding = createMergedMesh(gripBindingParts, brass);
  gripBinding.name = 'GripBinding';
  root.add(gripBinding);
  addComponentAlias(root, 'SwordPommel', [0, 0, 0.1]);

  const guard = createMergedMesh([
    geometryPart(new CylinderGeometry(0.018, 0.027, 0.4, 7), {
      position: [0, 0, -0.255],
      rotation: [0, 0, Math.PI / 2],
    }),
    geometryPart(new ConeGeometry(0.028, 0.12, 5), {
      position: [-0.255, 0.025, -0.255],
      rotation: [0, 0, Math.PI / 2],
    }),
    geometryPart(new ConeGeometry(0.028, 0.12, 5), {
      position: [0.255, 0.025, -0.255],
      rotation: [0, 0, -Math.PI / 2],
    }),
  ], steelDark);
  guard.name = 'Crossguard';
  root.add(guard);
  addComponentAlias(root, 'LeftQuillon', [-0.255, 0.025, -0.255]);
  addComponentAlias(root, 'RightQuillon', [0.255, 0.025, -0.255]);

  const blade = createMergedMesh([
    geometryPart(new BoxGeometry(0.052, 0.014, bladeLength), {
      position: [0, 0, -0.34 - bladeLength * 0.5],
    }),
    geometryPart(new ConeGeometry(0.038, 0.18, 4), {
      position: [0, 0, -0.34 - bladeLength - 0.09],
      rotation: [Math.PI / 2, Math.PI / 4, 0],
    }),
  ], steel);
  blade.name = 'SwordBlade';
  root.add(blade);
  addComponentAlias(root, 'SwordPoint', [0, 0, -0.34 - bladeLength - 0.09]);

  const fuller = createMergedMesh([
    geometryPart(new BoxGeometry(0.014, 0.006, bladeLength * 0.82), {
      position: [0, 0.011, -0.34 - bladeLength * 0.43],
    }),
    geometryPart(new BoxGeometry(0.072, 0.019, 0.12), {
      position: [0, 0, -0.34],
    }),
  ], steelDark);
  fuller.name = 'BladeFuller';
  root.add(fuller);
  addComponentAlias(root, 'BladeShoulders', [0, 0, -0.34]);

  createGripAnchors(root, {
    primary: [0, 0, 0.015],
    secondary: [0, 0, -0.15],
  });
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

  const socket = createMergedMesh([
    geometryPart(new CylinderGeometry(0.034, 0.024, 0.22, 8), {
      position: [0, 0, -2.12],
      rotation: [Math.PI / 2, 0, 0],
    }),
    geometryPart(new ConeGeometry(0.034, 0.16, 6), {
      position: [0, 0, 0.37],
      rotation: [Math.PI / 2, 0, 0],
    }),
  ], steelDark);
  socket.name = 'SpearSocket';
  root.add(socket);
  addComponentAlias(root, 'SpearButtCap', [0, 0, 0.37]);

  const head = new Mesh(new ConeGeometry(0.062, 0.32, 4), steel);
  head.name = 'SpearHead';
  head.rotation.x = -Math.PI / 2;
  head.rotation.y = Math.PI / 4;
  head.position.z = -2.39;
  root.add(head);

  createGripAnchors(root, {
    primary: [0, 0, 0.1],
    secondary: [0, 0, -0.2],
  });
}

function geometryPart(geometry, {
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
} = {}) {
  const transform = new Group();
  transform.position.set(...position);
  transform.rotation.set(...rotation);
  transform.scale.set(...scale);
  transform.updateMatrix();
  geometry.applyMatrix4(transform.matrix);
  return geometry;
}

function createMergedMesh(geometries, material) {
  const geometry = mergeGeometries(geometries, false);
  geometries.forEach((part) => part.dispose());
  if (!geometry) throw new Error('Unable to merge viewmodel geometry');
  return new Mesh(geometry, material);
}

function addComponentAlias(parent, name, position) {
  const alias = new Group();
  alias.name = name;
  alias.position.set(...position);
  alias.userData.mergedComponent = true;
  parent.add(alias);
  return alias;
}

function applyPose(weaponRoot, rightArm, leftArm, pose = {}) {
  const state = pose.state ?? WeaponState.IDLE;
  const t = ease(pose.progress ?? 0);
  const attack = pose.attack ?? {};
  const isSpear = Boolean(weaponRoot.getObjectByName('SpearShaft'));
  const neutral = neutralFrame();
  let frame = neutral;

  if (state === WeaponState.WINDUP) {
    frame = blendFrame(neutral, attackFrames(attack).chamber, t);
  } else if (state === WeaponState.ACTIVE) {
    const frames = attackFrames(attack);
    frame = blendFrame(frames.chamber, frames.strike, t);
    if (!attack.thrust && !attack.vertical) frame.weaponPosition[1] += Math.sin(t * Math.PI) * 0.08;
  } else if (state === WeaponState.RECOVERY) {
    frame = blendFrame(attackFrames(attack).strike, neutral, t);
  } else if (state === WeaponState.BLOCKING) {
    frame = blendFrame(neutral, blockFrame(isSpear), t);
  } else if (state === WeaponState.STAGGERED) {
    frame = staggerFrame();
  }

  applyFrame(weaponRoot, rightArm, leftArm, frame);
}

function neutralFrame() {
  return {
    weaponPosition: [...NEUTRAL.weaponPosition],
    weaponRotation: [...NEUTRAL.weaponRotation],
    rightArmPosition: [...NEUTRAL.rightArmPosition],
    rightArmRotation: [...NEUTRAL.rightArmRotation],
    leftArmPosition: [...NEUTRAL.leftArmPosition],
    leftArmRotation: [...NEUTRAL.leftArmRotation],
  };
}

function attackFrames(attack) {
  const side = attack.arc?.[0] < 0 ? -1 : 1;
  if (attack.thrust) {
    return {
      chamber: frame(
        [0.45, -0.36, -0.4], [0.06, -0.2, -0.025],
        [0.48, -0.53, -0.36], [-0.48, -0.2, -0.22],
        [-0.08, -0.51, -0.63], [-0.4, 0.15, 0.17],
      ),
      strike: frame(
        [0.29, -0.36, -1.44], [0.04, 0.015, -0.015],
        [0.37, -0.45, -0.63], [-0.67, -0.11, -0.17],
        [-0.03, -0.48, -0.72], [-0.57, 0.08, 0.13],
      ),
    };
  }
  if (attack.vertical) {
    return {
      chamber: frame(
        [0.36, -0.04, -0.69], [0.88, 0.02, -0.1],
        [0.43, -0.37, -0.48], [-0.76, -0.1, -0.22],
        [-0.12, -0.41, -0.55], [-0.65, 0.1, 0.15],
      ),
      strike: frame(
        [0.32, -0.4, -0.79], [-0.3, 0.02, -0.07],
        [0.42, -0.5, -0.48], [-0.36, -0.07, -0.2],
        [-0.13, -0.51, -0.55], [-0.31, 0.07, 0.15],
      ),
    };
  }

  const [start, end] = attack.arc ?? [-0.8, 0.7];
  return {
    chamber: frame(
      [0.4 + side * 0.2, -0.29, -0.64], [0.35, start * 0.96, -side * 0.28],
      [0.48 + side * 0.08, -0.47, -0.48], [-0.53, -0.1 + side * 0.36, -0.16 - side * 0.23],
      [-0.16 + side * 0.08, -0.51, -0.56], [-0.43, 0.13 - side * 0.2, 0.18 + side * 0.16],
    ),
    strike: frame(
      [0.38 - side * 0.22, -0.38, -0.78], [0.2, end * 0.96, -side * 0.14],
      [0.49 - side * 0.1, -0.52, -0.49], [-0.38, end * 0.28, -0.22 + side * 0.18],
      [-0.15 - side * 0.08, -0.54, -0.56], [-0.29, end * 0.2, 0.2 - side * 0.12],
    ),
  };
}

function blockFrame(isSpear) {
  return frame(
    [isSpear ? 0.05 : 0.08, -0.27, -0.88],
    [isSpear ? 0.04 : 0.1, -0.05, isSpear ? 0.58 : 0.72],
    [0.34, -0.43, -0.53], [0.13, -0.16, -0.22],
    [-0.34, -0.45, -0.58], [0.16, -0.48, 0.27],
  );
}

function staggerFrame() {
  return frame(
    [0.43, -0.49, -0.61], [0.12, 0.34, -0.24],
    NEUTRAL.rightArmPosition, [-0.04, -0.24, -0.32],
    NEUTRAL.leftArmPosition, [-0.03, 0.2, 0.34],
  );
}

function frame(
  weaponPosition,
  weaponRotation,
  rightArmPosition,
  rightArmRotation,
  leftArmPosition,
  leftArmRotation,
) {
  return {
    weaponPosition: [...weaponPosition],
    weaponRotation: [...weaponRotation],
    rightArmPosition: [...rightArmPosition],
    rightArmRotation: [...rightArmRotation],
    leftArmPosition: [...leftArmPosition],
    leftArmRotation: [...leftArmRotation],
  };
}

function blendFrame(from, to, t) {
  return {
    weaponPosition: blendArray(from.weaponPosition, to.weaponPosition, t),
    weaponRotation: blendArray(from.weaponRotation, to.weaponRotation, t),
    rightArmPosition: blendArray(from.rightArmPosition, to.rightArmPosition, t),
    rightArmRotation: blendArray(from.rightArmRotation, to.rightArmRotation, t),
    leftArmPosition: blendArray(from.leftArmPosition, to.leftArmPosition, t),
    leftArmRotation: blendArray(from.leftArmRotation, to.leftArmRotation, t),
  };
}

function blendArray(from, to, t) {
  return from.map((value, index) => value + (to[index] - value) * t);
}

function applyFrame(weaponRoot, rightArm, leftArm, poseFrame) {
  setTransform(weaponRoot, poseFrame.weaponPosition, poseFrame.weaponRotation);
  setTransform(rightArm, poseFrame.rightArmPosition, poseFrame.rightArmRotation);
  setTransform(leftArm, poseFrame.leftArmPosition, poseFrame.leftArmRotation);
}

function createGripAnchors(root, { primary, secondary }) {
  const primaryAnchor = new Group();
  primaryAnchor.name = 'PrimaryGripAnchor';
  primaryAnchor.position.set(...primary);
  primaryAnchor.userData.gripRole = 'primary';
  root.add(primaryAnchor);

  const secondaryAnchor = new Group();
  secondaryAnchor.name = 'SecondaryGripAnchor';
  secondaryAnchor.position.set(...secondary);
  secondaryAnchor.userData.gripRole = 'secondary';
  root.add(secondaryAnchor);

  root.userData.primaryGripAnchor = primaryAnchor;
  root.userData.secondaryGripAnchor = secondaryAnchor;
}

function solveGripConstraints(root, weaponRoot, rightArm, leftArm) {
  weaponRoot.updateMatrix();
  solveArmToGrip(rightArm, weaponRoot.getObjectByName('PrimaryGripAnchor'));
  solveArmToGrip(leftArm, weaponRoot.getObjectByName('SecondaryGripAnchor'));
  root.updateMatrixWorld(true);
}

function solveArmToGrip(arm, anchor) {
  const authoredShoulder = _authoredShoulder.copy(arm.position);
  const target = _gripTarget.copy(anchor.position).applyMatrix4(anchor.parent.matrix);
  const direction = _gripDirection.copy(target).sub(authoredShoulder);
  if (direction.lengthSq() < 1e-8) direction.set(0, 0, -1);
  direction.normalize();

  _solvedShoulder.copy(target).addScaledVector(direction, -ARM_REACH);
  _shoulderDelta.copy(_solvedShoulder).sub(authoredShoulder);
  if (_shoulderDelta.length() > MAX_SHOULDER_ADJUSTMENT) {
    _shoulderDelta.setLength(MAX_SHOULDER_ADJUSTMENT);
    _solvedShoulder.copy(authoredShoulder).add(_shoulderDelta);
  }
  arm.position.copy(_solvedShoulder);

  const desiredDirection = _desiredDirection.copy(target).sub(arm.position).normalize();
  const authoredDirection = _authoredDirection
    .set(...HAND_LOCAL_POSITION)
    .normalize()
    .applyQuaternion(arm.quaternion);
  _armCorrection.setFromUnitVectors(authoredDirection, desiredDirection);
  arm.quaternion.premultiply(_armCorrection);
}

function measureGripErrors(root, rightArm, leftArm) {
  root.updateMatrixWorld(true);
  const weaponRoot = root.getObjectByName('WeaponRoot');
  const primary = weaponRoot.getObjectByName('PrimaryGripAnchor').getWorldPosition(_primaryGripWorld);
  const secondary = weaponRoot.getObjectByName('SecondaryGripAnchor').getWorldPosition(_secondaryGripWorld);
  const rightHand = rightArm.userData.hand.getWorldPosition(_rightHandWorld);
  const leftHand = leftArm.userData.hand.getWorldPosition(_leftHandWorld);
  return {
    primary: rightHand.distanceTo(primary),
    secondary: leftHand.distanceTo(secondary),
  };
}

function renderOrderFor(object) {
  if (/Blade|Point|SpearHead|SpearSocket/.test(object.name)) {
    return VIEWMODEL_RENDER_ORDER.blade;
  }
  if (/Grip|Crossguard|Quillon|Guard|Pommel|Shaft|ButtCap/.test(object.name)) {
    return VIEWMODEL_RENDER_ORDER.weapon;
  }
  if (/Hand|Glove/.test(object.name)) return VIEWMODEL_RENDER_ORDER.hand;
  return VIEWMODEL_RENDER_ORDER.arm;
}

function setTransform(object, position, rotation) {
  object.position.set(position[0], position[1], position[2]);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
}

function ease(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

const _authoredShoulder = new Vector3();
const _gripTarget = new Vector3();
const _gripDirection = new Vector3();
const _solvedShoulder = new Vector3();
const _shoulderDelta = new Vector3();
const _desiredDirection = new Vector3();
const _authoredDirection = new Vector3();
const _armCorrection = new Quaternion();
const _primaryGripWorld = new Vector3();
const _secondaryGripWorld = new Vector3();
const _rightHandWorld = new Vector3();
const _leftHandWorld = new Vector3();
