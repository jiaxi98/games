import {
  Box3,
  Group,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { Combatant, DamageType } from '../combat/Combatant.js';
import { WeaponState } from '../combat/MeleeCombatController.js';
import { getFaction } from './Factions.js';
import {
  sharedBox,
  sharedCapsule,
  sharedCone,
  sharedCylinder,
  sharedMaterial,
  sharedSphere,
  sharedTorus,
} from './SoldierAssets.js';

export const SoldierRole = Object.freeze({
  SPEARMAN: 'spearman',
  MAN_AT_ARMS: 'man-at-arms',
  CAPTAIN: 'captain',
  STANDARD_BEARER: 'standard-bearer',
});

export function createSoldierActor(options = {}) {
  return new SoldierActor(options);
}

export function createCaptainActor(options = {}) {
  return new SoldierActor({
    role: SoldierRole.CAPTAIN,
    maxHealth: 112,
    maxStamina: 125,
    armor: {
      [DamageType.CUT]: 0.46,
      [DamageType.PIERCE]: 0.3,
      [DamageType.BLUNT]: 0.16,
    },
    poise: 52,
    ...options,
  });
}

export class SoldierActor {
  constructor({
    id,
    factionId,
    role = SoldierRole.SPEARMAN,
    weapon,
    maxHealth,
    maxStamina,
    armor,
    poise,
    scale = 1,
  } = {}) {
    this.id = id;
    this.factionId = factionId;
    this.role = role;
    this.weapon = weapon ?? (role === SoldierRole.SPEARMAN ? 'spear' : 'armingSword');
    this.object3d = new Group();
    this.object3d.name = `Soldier:${id ?? role}`;
    this.object3d.userData.actor = this;
    this.object3d.scale.setScalar(scale);
    this.velocity = new Vector3();
    this.forward = new Vector3(0, 0, 1);
    this.desiredForward = new Vector3(0, 0, 1);
    this.selected = false;
    this.lod = -1;
    this.radius = role === SoldierRole.CAPTAIN ? 0.48 : 0.42;
    this.height = role === SoldierRole.CAPTAIN ? 2.18 : 2.08;
    this.mass = role === SoldierRole.CAPTAIN ? 1.35 : 1;
    this._time = (hashString(String(id ?? 'soldier')) % 1000) * 0.013;
    this._stridePhase = (
      (hashString(`${String(id ?? role)}:stride`) % 1000) / 1000
    ) * Math.PI * 2;
    this._locomotionWeight = 0;
    this._strideWarp = 1;
    this._lastLocomotionPosition = this.object3d.position.clone();
    this._previousPlanarVelocity = new Vector3();
    this._measuredPlanarVelocity = new Vector3();
    this._planarAcceleration = new Vector3();
    this._accelerationLean = 0;
    this._lateralLean = 0;
    this._turnRate = 0;
    this._turnWeight = 0;
    this._turnInPlaceWeight = 0;
    this._turnPhase = this._stridePhase;
    this._headingDelta = 0;
    this._terrainNormal = new Vector3(0, 1, 0);
    this._terrainHeight = null;
    this._corpseQuery = null;
    this._footState = {
      left: createFootState(),
      right: createFootState(),
    };
    this._corpsePlacementOffset = new Vector3();
    this._corpsePlacementVelocity = new Vector3();
    this._corpsePlacementTarget = new Vector3();
    this._corpseNeighbors = [];
    this._weaponLayerWeight = 0;
    this._animationLayers = {
      locomotion: {
        weight: 0,
        strideWarp: 1,
        accelerationLean: 0,
        turnWeight: 0,
        turnInPlaceWeight: 0,
      },
      weapon: { state: WeaponState.IDLE, weight: 0 },
      reaction: { kind: null, weight: 0 },
    };
    this._deathVariant = hashString(String(id ?? role)) % 3;
    this._materials = [];
    this._geometries = [];
    const faction = getFaction(factionId);
    this.detailedRoot = new Group();
    this.detailedRoot.name = 'DetailedRoot';
    this.object3d.add(this.detailedRoot);
    this._parts = buildSoldierMesh(this.detailedRoot, this, faction);
    this.midRoot = new Group();
    this.midRoot.name = 'MidRoot';
    this.object3d.add(this.midRoot);
    this._midParts = buildMidSoldierMesh(this.midRoot, this, faction);
    this._parts.detailedRoot = this.detailedRoot;
    this._parts.midRoot = this.midRoot;
    this._parts.mid = this._midParts;
    this.object3d.userData.deathVariant = this._deathVariant;

    const roleHealth = role === SoldierRole.CAPTAIN ? 155 : role === SoldierRole.MAN_AT_ARMS ? 112 : 88;
    const roleStamina = role === SoldierRole.CAPTAIN ? 125 : 92;
    this.combatant = new Combatant({
      id,
      factionId,
      maxHealth: maxHealth ?? roleHealth,
      maxStamina: maxStamina ?? roleStamina,
      staminaRegen: role === SoldierRole.CAPTAIN ? 24 : 19,
      armor: armor ?? defaultArmor(role),
      poise: poise ?? (role === SoldierRole.CAPTAIN ? 52 : 31),
      height: this.height,
      radius: this.radius,
      attackOriginHeight: role === SoldierRole.CAPTAIN ? 1.48 : 1.38,
      positionProvider: () => this.object3d.position,
    });
    this.combatant.actor = this;
    this.combatant.addEventListener('impact', (event) => {
      this._lastImpact = event.result;
      this._impactFlash = 0.12;
      this._reaction = createReactionState(this, event.result, event.impact);
    });
    this.combatant.addEventListener('death', () => {
      this._deathTime = 0;
      this._reaction = null;
      this._corpsePlacementOffset.set(0, 0, 0);
      this._corpsePlacementVelocity.set(0, 0, 0);
      this._corpsePlacementTarget.set(0, 0, 0);
      this._footState.left.locked = false;
      this._footState.right.locked = false;
      this._footState.left.lockWeight = 0;
      this._footState.right.lockWeight = 0;
    });
    this.setLod(0);
  }

  setPosition(x, y, z) {
    this.object3d.position.set(x, y, z);
    this._lastLocomotionPosition.copy(this.object3d.position);
    return this;
  }

  setHeading(radians) {
    this.object3d.rotation.y = radians;
    this.forward.set(Math.sin(radians), 0, Math.cos(radians));
    this.desiredForward.copy(this.forward);
    this._turnRate = 0;
    this._turnWeight = 0;
    this._turnInPlaceWeight = 0;
    this._headingDelta = 0;
    return this;
  }

  setAnimationEnvironment({
    terrainHeight,
    queryActors,
  } = {}) {
    if (typeof terrainHeight === 'function') this._terrainHeight = terrainHeight;
    if (typeof queryActors === 'function') this._corpseQuery = queryActors;
    return this;
  }

  getAvoidancePosition(target = new Vector3()) {
    if (this.combatant.alive || !this._parts?.collapseRoot) {
      return target.copy(this.object3d.position);
    }
    this.object3d.updateWorldMatrix(true, true);
    return this._parts.collapseRoot.getWorldPosition(target);
  }

  setLod(level) {
    if (level === this.lod) return this;
    this.lod = level;
    const detailed = level === 0;
    const mid = level === 1;
    this.detailedRoot.visible = detailed;
    this.midRoot.visible = mid;
    this._parts.head.visible = detailed;
    this._parts.leftArm.visible = detailed;
    this._parts.rightArm.visible = detailed;
    this.detailedRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = detailed && object.userData.shadowDetail !== false;
      object.receiveShadow = detailed && object.userData.receiveShadow !== false;
    });
    this.midRoot.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = mid && object.userData.receiveShadow !== false;
    });
    return this;
  }

  update(dt, {
    speed = this.velocity.length(),
    combatPose = null,
    moraleState = 'ordered',
    terrainHeight = this._terrainHeight,
    terrainNormal = null,
  } = {}) {
    this._time += dt;
    this._impactFlash = Math.max(0, (this._impactFlash ?? 0) - dt);

    const previousHeading = Math.atan2(this.forward.x, this.forward.z);
    if (this.desiredForward.lengthSq() > 0.1) {
      const desiredHeading = Math.atan2(this.desiredForward.x, this.desiredForward.z);
      const headingDelta = shortestAngle(desiredHeading - previousHeading);
      const turnBlend = dt > 0 ? 1 - Math.exp(-dt * 8) : 0;
      const nextHeading = previousHeading + headingDelta * turnBlend;
      this.forward.set(Math.sin(nextHeading), 0, Math.cos(nextHeading));
      this.object3d.rotation.y = nextHeading;
      this._headingDelta = shortestAngle(nextHeading - previousHeading);
      this._turnRate = dt > 1e-6 ? this._headingDelta / dt : 0;
    } else {
      this._headingDelta = 0;
      this._turnRate = 0;
    }
    const targetTurnWeight = smoothstep(Math.abs(this._turnRate) / 2.8);
    const turnResponse = dt > 0 ? 1 - Math.exp(-dt * 12) : 1;
    this._turnWeight += (targetTurnWeight - this._turnWeight) * turnResponse;

    if (!this.combatant.alive) {
      this._deathTime = (this._deathTime ?? 0) + dt;
      this._lastLocomotionPosition.copy(this.object3d.position);
      updateCorpsePlacement(this, dt);
      animateDeathCollapse(this, this._parts, this._deathVariant, this._deathTime);
      syncMidDeathPose(this._midParts, this._parts);
      return;
    }

    this.object3d.rotation.x = 0;
    this.object3d.rotation.z = 0;
    this._parts.collapseRoot.position.set(0, 0, 0);
    this._parts.collapseRoot.rotation.set(0, 0, 0);
    this._midParts.collapseRoot.position.set(0, 0, 0);
    this._midParts.collapseRoot.rotation.set(0, 0, 0);
    updateLocomotion(this, dt, speed, terrainHeight, terrainNormal);
    updateWeaponLayer(this, dt, combatPose);
    const locomotionPhase = this._turnInPlaceWeight > this._locomotionWeight
      ? this._turnPhase
      : this._stridePhase;
    const leftStep = sampleLegGait(locomotionPhase);
    const rightStep = sampleLegGait(locomotionPhase + Math.PI);
    const stride = Math.max(this._locomotionWeight, this._turnInPlaceWeight * 0.78);
    const gait = clamp(
      (leftStep.swing - rightStep.swing) / 0.76,
      -1,
      1,
    );
    const pelvisShift = (
      (rightStep.support - leftStep.support) * 0.038
    ) * stride;

    resetLivePose(this._parts);
    applyLegPose(this, 'left', leftStep, terrainHeight, dt);
    applyLegPose(this, 'right', rightStep, terrainHeight, dt);
    this._parts.body.position.y = (
      (leftStep.lift + rightStep.lift) * 0.012
      + Math.abs(pelvisShift) * 0.16
    ) * stride;
    this._parts.body.rotation.set(
      0,
      0,
      moraleState === 'routed' ? gait * 0.09 * stride : -pelvisShift * 0.52,
    );
    this._parts.head.rotation.set(
      0,
      -gait * 0.025 * stride,
      moraleState === 'routed' ? -gait * 0.04 * stride : pelvisShift * 0.32,
    );
    animateCombatBody(
      this._parts,
      combatPose,
      gait,
      stride,
      this.weapon,
      this.role,
      pelvisShift,
      this._weaponLayerWeight,
    );
    applyLocomotionTorsoPose(this, gait, stride);
    animateShieldMount(this._parts, combatPose, this.role, this._weaponLayerWeight);
    advanceReaction(this, dt);
    applyReactionPose(this._parts, this._reaction);
    constrainArticulatedPose(this._parts);
    updateAnimationLayerState(this, combatPose);
    updateMidPose(this, combatPose, gait, stride, moraleState);
  }

  dispose() {
    this.object3d.removeFromParent();
    // Geometry and materials are shared between soldiers and live for the
    // lifetime of the game. Actors only own their Object3D hierarchy.
    this._geometries.length = 0;
    this._materials.length = 0;
  }
}

function buildSoldierMesh(root, actor, faction) {
  const group = new Group();
  group.name = 'Body';
  root.add(group);

  const upperBody = new Group();
  upperBody.name = 'UpperBodyPivot';
  upperBody.position.y = 1.22;
  group.add(upperBody);

  const cloth = material(actor, faction.cloth, 1);
  const clothSecondary = material(actor, faction.clothSecondary, 0.96);
  const heraldry = material(actor, faction.accent, 0.82, 0.05);
  const leather = material(actor, 0x3b291d, 0.9);
  const iron = material(actor, 0x73797a, 0.42, 0.62);
  const brightIron = material(actor, 0xa6acad, 0.32, 0.72);
  const darkIron = material(actor, 0x2c3233, 0.5, 0.54);
  const mail = material(actor, 0x454b4b, 0.58, 0.44);
  const skin = material(actor, 0xa87354, 0.95);
  const wood = material(actor, 0x493522, 0.9);

  const leftLeg = leg(actor, clothSecondary, leather);
  const rightLeg = leg(actor, clothSecondary, leather);
  leftLeg.position.set(-0.17, 0.75, 0);
  rightLeg.position.set(0.17, 0.75, 0);
  group.add(leftLeg, rightLeg);

  const body = new Group();
  upperBody.add(body);
  const torso = mesh(actor, sharedCapsule(0.3, 0.58, 3, 7), cloth);
  torso.scale.set(1, 1, 0.72);
  torso.position.y = 0.18;
  torso.name = 'PaddedTorso';
  body.add(torso);
  const mailSkirt = mesh(actor, sharedCylinder(0.255, 0.32, 0.42, 8), mail);
  mailSkirt.position.y = -0.27;
  mailSkirt.name = 'MailSkirt';
  body.add(mailSkirt);
  const skirt = mesh(actor, sharedCylinder(0.27, 0.35, 0.38, 7), cloth);
  skirt.position.y = -0.31;
  skirt.scale.set(1, 1, 0.76);
  skirt.name = 'SurcoatSkirt';
  body.add(skirt);
  const belt = mesh(actor, sharedCylinder(0.29, 0.29, 0.105, 10), leather);
  belt.position.y = -0.11;
  belt.name = 'SwordBelt';
  body.add(belt);
  const buckle = mesh(actor, sharedBox(0.075, 0.075, 0.035), heraldry);
  buckle.position.set(0, -0.11, 0.29);
  buckle.rotation.z = Math.PI / 4;
  buckle.name = 'BeltBuckle';
  body.add(buckle);

  const tabard = mesh(actor, sharedBox(0.38, 0.64, 0.055), cloth);
  tabard.position.set(0, 0.14, 0.235);
  tabard.name = 'FactionTabard';
  body.add(tabard);
  const tabardStripe = mesh(actor, sharedBox(0.105, 0.62, 0.018), clothSecondary);
  tabardStripe.position.set(0, 0.14, 0.27);
  tabardStripe.name = 'FactionStripe';
  body.add(tabardStripe);
  const chestMark = mesh(actor, sharedBox(0.2, 0.075, 0.02), heraldry);
  chestMark.position.set(0, 0.27, 0.286);
  chestMark.name = 'FactionChestMark';
  body.add(chestMark);
  const shoulderYoke = mesh(
    actor,
    sharedBox(actor.role === SoldierRole.CAPTAIN ? 0.72 : 0.64, 0.12, 0.19),
    actor.role === SoldierRole.CAPTAIN ? heraldry : clothSecondary,
  );
  shoulderYoke.position.set(0, 0.47, 0.075);
  shoulderYoke.name = actor.role === SoldierRole.CAPTAIN ? 'CaptainMantle' : 'ShoulderYoke';
  body.add(shoulderYoke);

  if (actor.role === SoldierRole.MAN_AT_ARMS || actor.role === SoldierRole.CAPTAIN) {
    const breastplate = mesh(actor, sharedCapsule(0.265, 0.36, 2, 8), iron);
    breastplate.position.set(0, 0.24, 0.115);
    breastplate.rotation.x = Math.PI / 2;
    breastplate.scale.set(1, 0.58, 1.08);
    breastplate.name = 'Breastplate';
    body.add(breastplate);
    const plateRidge = mesh(actor, sharedBox(0.045, 0.46, 0.04), brightIron);
    plateRidge.position.set(0, 0.25, 0.31);
    plateRidge.name = 'BreastplateRidge';
    body.add(plateRidge);
    tabard.position.z = 0.305;
    tabard.scale.set(0.82, 0.82, 1);
    tabardStripe.position.z = 0.34;
    tabardStripe.scale.y = 0.82;
    chestMark.position.z = 0.355;
  }

  const head = new Group();
  head.position.set(0, 0.76, 0);
  head.name = 'Head';
  upperBody.add(head);
  const coif = mesh(actor, sharedSphere(0.205, 8, 5), mail);
  coif.position.y = -0.035;
  coif.scale.set(1.03, 1.18, 0.98);
  coif.name = 'MailCoif';
  head.add(coif);
  const face = mesh(actor, sharedSphere(0.185, 7, 5), skin);
  face.position.z = 0.04;
  face.scale.z = 0.88;
  face.name = 'Face';
  head.add(face);
  const helmet = mesh(actor, helmetGeometry(actor.role), darkIron);
  helmet.position.y = actor.role === SoldierRole.CAPTAIN ? 0.145 : 0.08;
  helmet.name = 'Helmet';
  head.add(helmet);
  const helmetBand = mesh(actor, sharedTorus(0.19, 0.022, 4, 9), iron);
  helmetBand.rotation.x = Math.PI / 2;
  helmetBand.position.y = 0.06;
  helmetBand.name = 'HelmetBand';
  head.add(helmetBand);
  const nasal = mesh(actor, sharedBox(0.042, 0.24, 0.035), iron);
  nasal.position.set(0, 0, 0.185);
  nasal.name = 'NasalGuard';
  head.add(nasal);
  if (actor.role === SoldierRole.CAPTAIN) {
    const crest = mesh(actor, sharedBox(0.055, 0.26, 0.22), heraldry);
    crest.position.set(0, 0.35, -0.01);
    crest.name = 'CaptainCrest';
    head.add(crest);
  }

  const armored = actor.role === SoldierRole.MAN_AT_ARMS || actor.role === SoldierRole.CAPTAIN;
  const leftArm = arm(actor, cloth, armored ? iron : leather, skin, armored ? iron : null);
  const rightArm = arm(actor, cloth, armored ? iron : leather, skin, armored ? iron : null);
  leftArm.position.set(-0.38, 0.35, 0);
  rightArm.position.set(0.38, 0.35, 0);
  leftArm.name = 'LeftArm';
  rightArm.name = 'RightArm';
  upperBody.add(leftArm, rightArm);

  const weaponRoot = new Group();
  weaponRoot.name = 'WeaponRoot';
  rightArm.userData.hand.add(weaponRoot);
  weaponRoot.position.set(0, -0.055, 0.015);
  if (actor.weapon === 'spear') {
    const shaft = mesh(actor, sharedCylinder(0.019, 0.024, 2.75, 7), wood);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.62;
    shaft.name = 'SpearShaft';
    weaponRoot.add(shaft);
    const point = mesh(actor, sharedCone(0.062, 0.3, 4), brightIron);
    point.rotation.x = Math.PI / 2;
    point.position.z = 2.14;
    point.name = 'SpearHead';
    weaponRoot.add(point);
    const socket = mesh(actor, sharedCylinder(0.032, 0.026, 0.18, 7), darkIron);
    socket.rotation.x = Math.PI / 2;
    socket.position.z = 1.95;
    socket.name = 'SpearSocket';
    weaponRoot.add(socket);
  } else {
    const grip = mesh(actor, sharedCylinder(0.027, 0.032, 0.22, 8), leather);
    grip.position.y = -0.08;
    grip.name = 'SwordGrip';
    weaponRoot.add(grip);
    const blade = mesh(actor, sharedBox(0.058, 0.68, 0.018), brightIron);
    blade.position.y = -0.52;
    blade.name = 'SwordBlade';
    weaponRoot.add(blade);
    const fuller = mesh(actor, sharedBox(0.016, 0.62, 0.008), darkIron);
    fuller.position.set(0, -0.49, 0.014);
    fuller.name = 'SwordFuller';
    weaponRoot.add(fuller);
    const tip = mesh(actor, sharedCone(0.043, 0.16, 4), brightIron);
    tip.rotation.z = Math.PI;
    tip.position.y = -0.94;
    tip.name = 'SwordPoint';
    weaponRoot.add(tip);
    const guard = mesh(actor, sharedBox(0.29, 0.035, 0.04), darkIron);
    guard.position.y = -0.2;
    guard.name = 'SwordGuard';
    weaponRoot.add(guard);
    const pommel = mesh(actor, sharedSphere(0.052, 6, 4), iron);
    pommel.position.y = 0.075;
    pommel.name = 'SwordPommel';
    weaponRoot.add(pommel);
  }

  const shieldMount = new Group();
  shieldMount.name = 'ShieldMount';
  leftArm.userData.forearm.add(shieldMount);

  let shield = null;
  if (armored) {
    shield = createShield(actor, faction, cloth, clothSecondary, heraldry, leather, iron);
    shieldMount.add(shield);
  }

  if (actor.role === SoldierRole.STANDARD_BEARER || actor.role === SoldierRole.CAPTAIN) {
    createStandard(group, actor, faction, wood, clothSecondary, heraldry);
  }

  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = object.userData.shadowDetail !== false;
      object.receiveShadow = true;
    }
  });
  return {
    collapseRoot: group,
    upperBody,
    body,
    head,
    leftArm,
    rightArm,
    leftForearm: leftArm.userData.forearm,
    rightForearm: rightArm.userData.forearm,
    leftLeg,
    rightLeg,
    leftKnee: leftLeg.userData.knee,
    rightKnee: rightLeg.userData.knee,
    leftAnkle: leftLeg.userData.ankle,
    rightAnkle: rightLeg.userData.ankle,
    leftFoot: leftLeg.userData.boot,
    rightFoot: rightLeg.userData.boot,
    weaponRoot,
    shieldMount,
    shield,
  };
}

function buildMidSoldierMesh(root, actor, faction) {
  const collapseRoot = new Group();
  collapseRoot.name = 'MidCollapseRoot';
  root.add(collapseRoot);

  const cloth = material(actor, faction.cloth, 1);
  const clothSecondary = material(actor, faction.clothSecondary, 0.96);
  const heraldry = material(actor, faction.accent, 0.82, 0.05);
  const iron = material(actor, 0x73797a, 0.42, 0.62);
  const brightIron = material(actor, 0xa6acad, 0.32, 0.72);
  const darkIron = material(actor, 0x2c3233, 0.5, 0.54);
  const wood = material(actor, 0x493522, 0.9);
  const armored = actor.role === SoldierRole.MAN_AT_ARMS || actor.role === SoldierRole.CAPTAIN;
  const captain = actor.role === SoldierRole.CAPTAIN;

  const leftLeg = new Group();
  const rightLeg = new Group();
  leftLeg.name = 'MidLeftLegPivot';
  rightLeg.name = 'MidRightLegPivot';
  leftLeg.position.set(-0.17, 0.75, 0);
  rightLeg.position.set(0.17, 0.75, 0);
  const leftLegMesh = midMesh(
    sharedCapsule(0.105, 0.67, 3, 6),
    clothSecondary,
    'MidLeftLeg',
  );
  const rightLegMesh = midMesh(
    sharedCapsule(0.105, 0.67, 3, 6),
    clothSecondary,
    'MidRightLeg',
  );
  leftLegMesh.position.y = -0.36;
  rightLegMesh.position.y = -0.36;
  leftLeg.add(leftLegMesh);
  rightLeg.add(rightLegMesh);
  collapseRoot.add(leftLeg, rightLeg);

  const upperBody = new Group();
  upperBody.name = 'MidUpperBodyPivot';
  upperBody.position.y = 1.22;
  collapseRoot.add(upperBody);

  const body = new Group();
  body.name = 'MidBodyPivot';
  upperBody.add(body);
  const torso = midMesh(
    sharedCapsule(0.3, 0.58, 3, 7),
    captain ? heraldry : cloth,
    'MidBody',
  );
  torso.position.y = 0.13;
  torso.scale.set(captain ? 1.12 : 1, captain ? 1.07 : 1, armored ? 0.76 : 0.7);
  body.add(torso);

  const head = new Group();
  head.name = 'MidHeadPivot';
  head.position.set(0, 0.76, 0);
  upperBody.add(head);
  const helmet = midMesh(midHelmetGeometry(actor.role), darkIron, 'MidHelmet');
  helmet.position.y = captain ? 0.12 : 0.04;
  head.add(helmet);

  const arms = new Group();
  arms.name = 'MidArmsPivot';
  arms.position.set(0, 0.35, 0);
  upperBody.add(arms);
  const armsMesh = midMesh(
    sharedCapsule(0.092, 0.25, 3, 7),
    armored ? iron : cloth,
    'MidArms',
  );
  armsMesh.rotation.z = Math.PI / 2;
  armsMesh.scale.y = captain ? 1.8 : 1.65;
  arms.add(armsMesh);

  const weapon = new Group();
  weapon.name = 'MidWeaponPivot';
  upperBody.add(weapon);
  let weaponMesh;
  if (actor.weapon === 'spear') {
    weaponMesh = midMesh(
      sharedCylinder(0.019, 0.024, 2.75, 7),
      wood,
      'MidSpear',
    );
    weaponMesh.rotation.x = Math.PI / 2;
    weaponMesh.position.z = 0.72;
  } else {
    weaponMesh = midMesh(
      sharedBox(0.058, 0.68, 0.018),
      brightIron,
      'MidSword',
    );
    weaponMesh.position.y = -0.36;
  }
  weapon.add(weaponMesh);

  let shield = null;
  if (armored) {
    shield = new Group();
    shield.name = 'MidShieldPivot';
    upperBody.add(shield);
    const shieldMesh = midMesh(
      sharedCylinder(0.29, 0.29, 0.055, 10),
      cloth,
      'MidShield',
    );
    shieldMesh.rotation.x = Math.PI / 2;
    shieldMesh.scale.x = 0.82;
    shield.add(shieldMesh);
  }

  let standard = null;
  if (actor.role === SoldierRole.STANDARD_BEARER || captain) {
    standard = new Group();
    standard.name = 'MidStandardPivot';
    standard.position.x = -0.3;
    collapseRoot.add(standard);
    const pole = midMesh(
      sharedCylinder(0.018, 0.023, 2.8, 7),
      wood,
      'MidStandardPole',
    );
    pole.position.y = 1.52;
    standard.add(pole);
    const banner = midMesh(
      sharedBox(0.68, 0.52, 0.035),
      material(actor, faction.standard, 0.92),
      'MidStandardBanner',
    );
    banner.position.set(-0.36, 2.55, 0);
    standard.add(banner);
  }

  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });

  return {
    collapseRoot,
    upperBody,
    body,
    head,
    arms,
    leftLeg,
    rightLeg,
    weapon,
    shield,
    standard,
  };
}

function leg(actor, clothMaterial, bootMaterial) {
  const pivot = new Group();
  pivot.name = 'ThighPivot';
  const thigh = mesh(actor, sharedCapsule(0.105, 0.3, 3, 6), clothMaterial);
  thigh.position.y = -0.2;
  thigh.name = 'Thigh';
  pivot.add(thigh);

  const knee = new Group();
  knee.position.y = -0.36;
  knee.name = 'KneePivot';
  pivot.add(knee);
  const shin = mesh(actor, sharedCapsule(0.095, 0.3, 3, 6), clothMaterial);
  shin.position.y = -0.2;
  shin.name = 'Shin';
  knee.add(shin);

  const ankle = new Group();
  ankle.position.y = -0.36;
  ankle.name = 'AnklePivot';
  knee.add(ankle);
  const boot = mesh(actor, sharedBox(0.19, 0.18, 0.32), bootMaterial);
  boot.position.set(0, 0.06, 0.07);
  boot.name = 'Boot';
  ankle.add(boot);
  pivot.userData.knee = knee;
  pivot.userData.ankle = ankle;
  pivot.userData.boot = boot;
  return pivot;
}

function arm(actor, sleeveMaterial, bracerMaterial, handMaterial, pauldronMaterial) {
  const pivot = new Group();
  const upper = mesh(actor, sharedCapsule(0.092, 0.25, 3, 7), sleeveMaterial);
  upper.position.y = -0.17;
  upper.name = 'UpperArm';
  pivot.add(upper);

  if (pauldronMaterial) {
    const pauldron = mesh(actor, sharedSphere(0.135, 7, 4), pauldronMaterial);
    pauldron.position.y = -0.04;
    pauldron.scale.set(1.18, 0.72, 1.02);
    pauldron.name = 'Pauldron';
    pivot.add(pauldron);
  }

  const forearm = new Group();
  forearm.position.y = -0.37;
  forearm.name = 'ForearmPivot';
  pivot.add(forearm);
  const bracer = mesh(actor, sharedCapsule(0.078, 0.22, 3, 7), bracerMaterial);
  bracer.position.y = -0.14;
  bracer.name = 'Bracer';
  forearm.add(bracer);
  const hand = mesh(actor, sharedCapsule(0.068, 0.08, 3, 7), handMaterial);
  hand.position.y = -0.32;
  hand.name = 'Hand';
  forearm.add(hand);
  forearm.userData.hand = hand;
  pivot.userData.forearm = forearm;
  pivot.userData.hand = hand;
  return pivot;
}

function helmetGeometry(role) {
  if (role === SoldierRole.CAPTAIN) return sharedCone(0.225, 0.39, 8);
  if (role === SoldierRole.SPEARMAN) return sharedCone(0.225, 0.25, 9);
  return sharedSphere(0.215, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.64);
}

function midHelmetGeometry(role) {
  if (role === SoldierRole.CAPTAIN) return sharedCone(0.235, 0.44, 6);
  if (role === SoldierRole.SPEARMAN) return sharedCone(0.225, 0.28, 6);
  return sharedSphere(0.22, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.68);
}

function createShield(actor, faction, cloth, clothSecondary, heraldry, leather, iron) {
  const shield = new Group();
  shield.name = 'Shield';
  const rim = mesh(actor, sharedCylinder(0.29, 0.29, 0.055, 10), leather);
  rim.rotation.x = Math.PI / 2;
  rim.scale.x = 0.82;
  shield.add(rim);
  const face = mesh(actor, sharedCylinder(0.26, 0.26, 0.065, 10), cloth);
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.012;
  face.scale.x = 0.82;
  face.name = `${faction.key}:ShieldFace`;
  shield.add(face);
  const pale = mesh(actor, sharedBox(0.095, 0.46, 0.024), clothSecondary);
  pale.position.z = 0.06;
  shield.add(pale);
  const bar = mesh(actor, sharedBox(0.37, 0.075, 0.026), heraldry);
  bar.position.set(0, 0.055, 0.064);
  shield.add(bar);
  const boss = mesh(actor, sharedSphere(0.075, 7, 4), iron);
  boss.position.z = 0.095;
  boss.scale.z = 0.55;
  boss.name = 'ShieldBoss';
  shield.add(boss);
  return shield;
}

function createStandard(group, actor, faction, wood, clothSecondary, heraldry) {
  const standard = new Group();
  standard.name = 'FactionStandard';
  standard.position.set(-0.3, 0, -0.03);
  group.add(standard);
  const pole = mesh(actor, sharedCylinder(0.018, 0.023, 2.8, 7), wood);
  pole.position.y = 1.5;
  pole.name = 'StandardPole';
  standard.add(pole);
  const spearhead = mesh(actor, sharedCone(0.045, 0.2, 4), heraldry);
  spearhead.position.y = 2.99;
  standard.add(spearhead);

  const bannerMaterial = material(actor, faction.standard, 0.92);
  const banner = mesh(actor, sharedBox(0.62, 0.42, 0.028), bannerMaterial);
  banner.position.set(-0.33, 2.58, 0);
  banner.name = `${faction.key}:Banner`;
  standard.add(banner);
  const lowerFly = mesh(actor, sharedBox(0.45, 0.17, 0.027), bannerMaterial);
  lowerFly.position.set(-0.245, 2.31, 0);
  lowerFly.rotation.z = -0.08;
  standard.add(lowerFly);
  const bannerStripe = mesh(actor, sharedBox(0.1, 0.57, 0.012), clothSecondary);
  bannerStripe.position.set(-0.12, 2.47, 0.022);
  standard.add(bannerStripe);
  const bannerMark = mesh(actor, sharedBox(0.29, 0.075, 0.014), heraldry);
  bannerMark.position.set(-0.36, 2.58, 0.024);
  standard.add(bannerMark);
}

function mesh(_actor, geometry, meshMaterial) {
  const result = new Mesh(geometry, meshMaterial);
  const parameters = geometry.parameters ?? {};
  const width = parameters.width ?? parameters.radius ?? parameters.radiusTop ?? 1;
  const height = parameters.height ?? parameters.length ?? parameters.radius ?? 1;
  const largest = Math.max(width, height);
  result.userData.shadowDetail = (
    largest >= 0.3
    && ![
      'BeltBuckle',
      'FactionStripe',
      'FactionChestMark',
      'HelmetBand',
      'NasalGuard',
      'BreastplateRidge',
      'SwordFuller',
      'SwordGuard',
      'SwordPommel',
      'SpearSocket',
      'ShieldBoss',
    ].includes(result.name)
  );
  return result;
}

function midMesh(geometry, meshMaterial, name) {
  const result = new Mesh(geometry, meshMaterial);
  result.name = name;
  result.castShadow = false;
  result.receiveShadow = true;
  result.userData.midLod = true;
  return result;
}

function material(_actor, color, roughness, metalness = 0) {
  return sharedMaterial(color, roughness, metalness);
}

function defaultArmor(role) {
  if (role === SoldierRole.CAPTAIN) {
    return { cut: 0.46, pierce: 0.3, blunt: 0.16 };
  }
  if (role === SoldierRole.MAN_AT_ARMS) {
    return { cut: 0.34, pierce: 0.2, blunt: 0.1 };
  }
  return { cut: 0.12, pierce: 0.06, blunt: 0.03 };
}

function animateCombatBody(
  parts,
  pose,
  gait,
  stride,
  weapon,
  role,
  pelvisShift = 0,
  weaponWeight = 1,
) {
  animateArms(parts, pose, gait, stride, weapon, role, weaponWeight);
  const state = pose?.state ?? WeaponState.IDLE;
  const t = smoothstep(pose?.progress ?? 0);
  const side = pose?.attack?.arc?.[0] < 0 ? -1 : 1;
  const captain = role === SoldierRole.CAPTAIN;
  const layer = state === WeaponState.IDLE ? 0 : weaponWeight;

  parts.upperBody.position.set(0, 0, 0);
  parts.upperBody.rotation.x = 0;
  parts.upperBody.rotation.y = gait * 0.035 * stride;
  parts.upperBody.rotation.z = captain ? -0.035 : 0;
  parts.body.position.x = pelvisShift;
  parts.head.position.x = 0;

  if (state === WeaponState.WINDUP) {
    const thrust = weapon === 'spear' || pose?.attack?.thrust;
    const vertical = pose?.attack?.vertical;
    parts.upperBody.rotation.y += layer * (thrust
      ? side * (0.1 + t * 0.2)
      : side * (0.14 + t * (vertical ? 0.34 : 0.52)));
    parts.upperBody.rotation.z += layer * (thrust
      ? side * -0.035 * t
      : side * (vertical ? -0.08 : -0.14) * t);
    parts.body.position.x += layer * side * (vertical ? 0.025 : 0.055) * t;
    parts.head.rotation.y += layer * -parts.upperBody.rotation.y * 0.62;
  } else if (state === WeaponState.ACTIVE) {
    const thrust = weapon === 'spear' || pose?.attack?.thrust;
    const vertical = pose?.attack?.vertical;
    parts.upperBody.rotation.y += layer * (thrust
      ? side * (0.22 - t * 0.36)
      : side * ((vertical ? 0.28 : 0.48) - t * (vertical ? 0.46 : 0.86)));
    parts.upperBody.rotation.z += layer * (thrust
      ? side * -0.05
      : side * (vertical ? -0.1 + t * 0.16 : -0.14 + t * 0.25));
    parts.body.position.x += layer * side * (1 - t) * (vertical ? 0.03 : 0.06);
    parts.head.rotation.y += layer * -parts.upperBody.rotation.y * 0.48;
  } else if (state === WeaponState.RECOVERY) {
    parts.upperBody.rotation.y += layer * side * 0.2 * (1 - t);
    parts.upperBody.rotation.z += layer * side * 0.08 * (1 - t);
    parts.head.rotation.y += layer * -parts.upperBody.rotation.y * 0.42;
  } else if (state === WeaponState.BLOCKING) {
    parts.upperBody.rotation.y += layer * (captain ? -0.18 : -0.1);
    parts.upperBody.rotation.z += layer * (captain ? -0.08 : -0.035);
    parts.body.position.x += layer * (captain ? -0.04 : -0.02);
    parts.head.rotation.y += layer * (captain ? 0.12 : 0.07);
  } else if (captain) {
    parts.upperBody.rotation.y -= 0.11;
    parts.body.position.x -= 0.025;
    parts.head.rotation.y = 0.09 - gait * 0.02 * stride;
  }
}

function updateMidPose(actor, pose, gait, stride, moraleState) {
  const mid = actor._midParts;
  const detailed = actor._parts;
  mid.upperBody.position.copy(detailed.upperBody.position);
  mid.upperBody.rotation.copy(detailed.upperBody.rotation);
  mid.body.position.set(detailed.body.position.x, detailed.body.position.y, 0);
  mid.body.rotation.copy(detailed.body.rotation);
  mid.head.rotation.copy(detailed.head.rotation);
  mid.leftLeg.position.copy(detailed.leftLeg.position);
  mid.leftLeg.rotation.copy(detailed.leftLeg.rotation);
  mid.leftLeg.rotation.x += detailed.leftKnee.rotation.x * 0.32;
  mid.rightLeg.position.copy(detailed.rightLeg.position);
  mid.rightLeg.rotation.copy(detailed.rightLeg.rotation);
  mid.rightLeg.rotation.x += detailed.rightKnee.rotation.x * 0.32;

  const state = pose?.state ?? WeaponState.IDLE;
  const t = smoothstep(pose?.progress ?? 0);
  const side = pose?.attack?.arc?.[0] < 0 ? -1 : 1;
  const polearm = actor.weapon === 'spear';
  const captain = actor.role === SoldierRole.CAPTAIN;
  const routedLean = moraleState === 'routed' ? gait * 0.12 * stride : 0;
  mid.arms.rotation.set(
    polearm ? -0.2 : gait * 0.08 * stride,
    0,
    (captain ? -0.12 : 0) + routedLean,
  );

  if (polearm) {
    mid.weapon.position.set(0.14, 0.27, 0.02);
    mid.weapon.rotation.set(Math.PI / 2 - 0.12, -0.12, -0.08);
  } else {
    mid.weapon.position.set(0.34, 0.26, 0.03);
    mid.weapon.rotation.set(0.08, 0, captain ? -0.32 : -0.2);
  }

  if (state === WeaponState.WINDUP) {
    mid.arms.rotation.x -= 0.18 + t * 0.28;
    mid.arms.rotation.y += side * t * 0.2;
    mid.weapon.rotation.y += side * t * (polearm ? 0.16 : 0.5);
    mid.weapon.rotation.z += side * t * (polearm ? -0.08 : 0.48);
  } else if (state === WeaponState.ACTIVE) {
    mid.arms.rotation.x -= 0.32 - t * 0.12;
    mid.arms.rotation.y -= side * t * 0.24;
    mid.weapon.rotation.y -= side * t * (polearm ? 0.22 : 0.7);
    mid.weapon.rotation.z -= side * t * (polearm ? 0.1 : 0.65);
  } else if (state === WeaponState.BLOCKING) {
    mid.arms.rotation.x -= 0.38;
    mid.arms.rotation.y = -0.14;
    mid.weapon.rotation.z -= polearm ? 0.08 : 0.4;
  } else if (state === WeaponState.RECOVERY) {
    mid.arms.rotation.x -= (1 - t) * 0.22;
    mid.weapon.rotation.z += side * (1 - t) * (polearm ? 0.06 : 0.34);
  }

  if (mid.shield) {
    mid.shield.position.set(
      captain ? -0.43 : -0.4,
      captain ? 0.31 : 0.25,
      0.16,
    );
    mid.shield.rotation.set(-0.08, captain ? 0.18 : 0.1, -0.04);
    if (state === WeaponState.BLOCKING) {
      mid.shield.position.set(-0.28, 0.39, 0.28);
      mid.shield.rotation.set(0.16, 0.3, -0.12);
    }
  }

  if (mid.standard) {
    mid.standard.rotation.set(
      gait * 0.018 * stride,
      0,
      Math.sin(actor._time * 1.35) * 0.018 + routedLean * 0.35,
    );
  }
}

function syncMidDeathPose(mid, detailed) {
  mid.collapseRoot.position.copy(detailed.collapseRoot.position);
  mid.collapseRoot.rotation.copy(detailed.collapseRoot.rotation);
  mid.upperBody.rotation.copy(detailed.upperBody.rotation);
  mid.head.rotation.copy(detailed.head.rotation);
  mid.leftLeg.rotation.copy(detailed.leftLeg.rotation);
  mid.rightLeg.rotation.copy(detailed.rightLeg.rotation);
  mid.arms.rotation.x = (detailed.leftArm.rotation.x + detailed.rightArm.rotation.x) * 0.5;
  mid.arms.rotation.y = (detailed.leftArm.rotation.y + detailed.rightArm.rotation.y) * 0.5;
  mid.arms.rotation.z = (detailed.leftArm.rotation.z + detailed.rightArm.rotation.z) * 0.5;
}

function animateShieldMount(parts, pose, role, weaponWeight = 1) {
  const mount = parts.shieldMount;
  if (!mount) return;
  const state = pose?.state ?? WeaponState.IDLE;
  const t = smoothstep(pose?.progress ?? 0);
  const captain = role === SoldierRole.CAPTAIN;
  const side = pose?.attack?.arc?.[0] < 0 ? -1 : 1;
  const thrust = pose?.attack?.thrust;
  const vertical = pose?.attack?.vertical;
  const layer = state === WeaponState.IDLE ? 0 : weaponWeight;

  mount.position.set(
    captain ? -0.035 : -0.02,
    captain ? -0.105 : -0.125,
    captain ? 0.145 : 0.125,
  );
  mount.rotation.set(
    captain ? -0.02 : -0.08,
    captain ? 0.12 : 0.055,
    captain ? -0.075 : -0.025,
  );

  if (state === WeaponState.BLOCKING) {
    mount.position.x -= layer * (captain ? 0.055 : 0.04);
    mount.position.y += layer * (captain ? 0.045 : 0.025);
    mount.position.z += layer * (captain ? 0.11 : 0.095);
    mount.rotation.x += layer * 0.2;
    mount.rotation.y += layer * (captain ? 0.18 : 0.13);
    mount.rotation.z -= layer * (captain ? 0.14 : 0.09);
  } else if (state === WeaponState.WINDUP) {
    const clearance = vertical ? 0.075 : thrust ? 0.04 : 0.095;
    mount.position.x -= layer * clearance * t;
    mount.position.z -= layer * (thrust ? 0.025 : 0.055) * t;
    mount.rotation.y += layer * side * (vertical ? 0.08 : 0.18) * t;
    mount.rotation.z -= layer * side * (vertical ? 0.06 : 0.13) * t;
  } else if (state === WeaponState.ACTIVE) {
    const clearance = vertical ? 0.085 : thrust ? 0.055 : 0.12;
    mount.position.x -= layer * clearance * (0.65 + t * 0.35);
    mount.position.y += layer * (vertical ? 0.045 : 0.015) * (1 - t * 0.35);
    mount.position.z -= layer * (thrust ? 0.01 : 0.07) * (1 - t * 0.45);
    mount.rotation.y += layer * side * (vertical ? 0.1 : 0.22) * (1 - t * 0.25);
    mount.rotation.z -= layer * side * (vertical ? 0.08 : 0.16) * (1 - t * 0.3);
  } else if (state === WeaponState.RECOVERY) {
    const recovery = 1 - t;
    mount.position.x -= layer * (captain ? 0.075 : 0.06) * recovery;
    mount.position.z -= layer * 0.035 * recovery;
    mount.rotation.y += layer * side * 0.12 * recovery;
    mount.rotation.z -= layer * side * 0.09 * recovery;
  } else if (captain) {
    mount.position.x -= 0.025;
    mount.position.z += 0.025;
    mount.rotation.y += 0.08;
  }
}

function animateArms(parts, pose, gait, stride, weapon, role, weaponWeight = 1) {
  setLocomotionArmPose(parts, gait, stride, weapon, role);
  if (!pose || pose.state === WeaponState.IDLE || weaponWeight <= 0) return;
  _baseRightArm.copy(parts.rightArm.rotation);
  _baseLeftArm.copy(parts.leftArm.rotation);
  _baseRightForearm.copy(parts.rightForearm.rotation);
  _baseLeftForearm.copy(parts.leftForearm.rotation);
  const t = smoothstep(pose.progress ?? 0);
  const polearm = weapon === 'spear';
  const side = pose.attack?.arc?.[0] < 0 ? -1 : 1;
  if (pose.state === WeaponState.BLOCKING) {
    parts.rightArm.rotation.set(-1.28, -0.25, -0.34);
    parts.leftArm.rotation.set(-1.14, 0.25, 0.36);
    parts.rightForearm.rotation.set(-0.48, 0.08, -0.12);
    parts.leftForearm.rotation.set(-0.55, -0.08, 0.12);
  } else if (pose.state === WeaponState.WINDUP) {
    if (polearm || pose.attack?.thrust) {
      parts.rightArm.rotation.set(-0.88 - t * 0.22, -0.2, -0.27);
      parts.leftArm.rotation.set(-0.72 - t * 0.18, 0.24, 0.31);
      parts.rightForearm.rotation.set(-0.62 + t * 0.16, 0, 0.08);
      parts.leftForearm.rotation.set(-0.7 + t * 0.12, 0, -0.08);
    } else {
      parts.rightArm.rotation.set(-0.46 - t * 0.72, side * 0.38, side * 0.46);
      parts.leftArm.rotation.set(-0.72 - t * 0.28, side * -0.16, side * -0.28);
      parts.rightForearm.rotation.set(-0.25 - t * 0.48, 0, side * -0.12);
      parts.leftForearm.rotation.set(-0.32 - t * 0.22, 0, side * 0.1);
    }
  } else if (pose.state === WeaponState.ACTIVE) {
    if (polearm || pose.attack?.thrust) {
      parts.rightArm.rotation.set(-1.18 - t * 0.28, -0.1, -0.22);
      parts.leftArm.rotation.set(-1.02 - t * 0.2, 0.18, 0.28);
      parts.rightForearm.rotation.set(-0.5 + t * 0.34, 0, 0.05);
      parts.leftForearm.rotation.set(-0.58 + t * 0.28, 0, -0.05);
    } else if (pose.attack?.vertical) {
      parts.rightArm.rotation.set(-1.5 + t * 0.45, 0.04, -0.12);
      parts.leftArm.rotation.set(-1.24 + t * 0.35, -0.08, 0.14);
      parts.rightForearm.rotation.set(-0.55 + t * 0.28, 0, 0);
      parts.leftForearm.rotation.set(-0.45 + t * 0.22, 0, 0);
    } else {
      parts.rightArm.rotation.set(-1.38 + t * 0.52, side * (-0.32 + t * 0.65), side * -0.3);
      parts.leftArm.rotation.set(-1.12 + t * 0.38, side * (0.2 - t * 0.4), side * 0.24);
      parts.rightForearm.rotation.set(-0.58 + t * 0.25, 0, side * 0.12);
      parts.leftForearm.rotation.set(-0.48 + t * 0.2, 0, side * -0.1);
    }
  } else {
    parts.rightArm.rotation.set(-1.08 + t * 0.86, side * 0.18 * (1 - t), side * -0.18 * (1 - t));
    parts.leftArm.rotation.set(-0.94 + t * 0.72, side * -0.12 * (1 - t), side * 0.14 * (1 - t));
    parts.rightForearm.rotation.set(-0.4 + t * 0.3, 0, 0);
    parts.leftForearm.rotation.set(-0.36 + t * 0.28, 0, 0);
  }
  blendEuler(parts.rightArm.rotation, _baseRightArm, weaponWeight);
  blendEuler(parts.leftArm.rotation, _baseLeftArm, weaponWeight);
  blendEuler(parts.rightForearm.rotation, _baseRightForearm, weaponWeight);
  blendEuler(parts.leftForearm.rotation, _baseLeftForearm, weaponWeight);
}

function setLocomotionArmPose(parts, gait, stride, weapon, role) {
  const polearm = weapon === 'spear';
  const captain = role === SoldierRole.CAPTAIN;
  parts.rightArm.rotation.set(
    polearm ? -1.02 : captain ? -0.42 : gait * 0.2 * stride - 0.08,
    polearm ? -0.15 : captain ? -0.18 : 0,
    polearm ? -0.24 : captain ? -0.16 : 0.08,
  );
  parts.leftArm.rotation.set(
    polearm ? -0.9 : captain ? -0.88 : -gait * 0.2 * stride - 0.04,
    polearm ? 0.2 : captain ? 0.24 : 0,
    polearm ? 0.3 : captain ? 0.3 : -0.08,
  );
  parts.rightForearm.rotation.set(
    polearm ? -0.38 : captain ? -0.5 : -0.1,
    0,
    polearm ? 0.08 : captain ? -0.08 : 0,
  );
  parts.leftForearm.rotation.set(
    polearm ? -0.52 : captain ? -0.62 : -0.08,
    0,
    polearm ? -0.08 : captain ? 0.08 : 0,
  );
}

function blendEuler(target, base, weight) {
  target.x = lerp(base.x, target.x, weight);
  target.y = lerp(base.y, target.y, weight);
  target.z = lerp(base.z, target.z, weight);
}

function updateWeaponLayer(actor, dt, combatPose) {
  const state = combatPose?.state ?? WeaponState.IDLE;
  const target = state === WeaponState.IDLE ? 0 : 1;
  const response = target > actor._weaponLayerWeight ? 18 : 11;
  const blend = dt > 0 ? 1 - Math.exp(-dt * response) : 1;
  actor._weaponLayerWeight += (target - actor._weaponLayerWeight) * blend;
  if (target === 0 && actor._weaponLayerWeight < 0.001) actor._weaponLayerWeight = 0;
}

function updateLocomotion(actor, dt, requestedSpeed, terrainHeight, explicitTerrainNormal) {
  _locomotionDelta.copy(actor.object3d.position).sub(actor._lastLocomotionPosition);
  _locomotionDelta.y = 0;
  actor._lastLocomotionPosition.copy(actor.object3d.position);

  const rawDistance = _locomotionDelta.length();
  const distance = rawDistance > 1.25 ? 0 : rawDistance;
  const direction = distance > 1e-6
    ? Math.sign(_locomotionDelta.dot(actor.forward)) || 1
    : 0;
  const measuredSpeed = dt > 1e-6 ? distance / dt : 0;
  const requested = Math.max(0, requestedSpeed);
  const effectiveSpeed = distance > 0
    ? Math.max(measuredSpeed, Math.min(requested, measuredSpeed * 1.35))
    : 0;
  const targetStrideWarp = clamp(0.78 + effectiveSpeed * 0.11, 0.78, 1.22);
  actor._strideWarp = targetStrideWarp;
  const strideLength = 1.34;
  if (distance > 0) {
    actor._stridePhase = wrapAngle(
      actor._stridePhase + direction * (distance / strideLength) * Math.PI * 2,
    );
  }

  // Requested speed only widens the response once real displacement exists;
  // a stationary actor never "walks in place" because a velocity was stale.
  const targetWeight = smoothstep(effectiveSpeed / 1.15);
  const response = targetWeight > actor._locomotionWeight ? 14 : 9;
  const blend = dt > 0 ? 1 - Math.exp(-dt * response) : 0;
  actor._locomotionWeight += (targetWeight - actor._locomotionWeight) * blend;
  if (targetWeight === 0 && actor._locomotionWeight < 0.001) actor._locomotionWeight = 0;

  const targetTurnInPlace = distance < 0.018
    ? smoothstep((Math.abs(actor._turnRate) - 0.12) / 1.65)
    : 0;
  actor._turnInPlaceWeight += (
    targetTurnInPlace - actor._turnInPlaceWeight
  ) * (dt > 0 ? 1 - Math.exp(-dt * 10) : 1);
  if (dt > 0 && actor._turnInPlaceWeight > 0.01) {
    actor._turnPhase = wrapAngle(
      actor._turnPhase + Math.sign(actor._turnRate || 1) * Math.abs(actor._headingDelta) * 3.25,
    );
  }

  if (dt > 1e-6) {
    actor._measuredPlanarVelocity.copy(_locomotionDelta).multiplyScalar(1 / dt);
    actor._planarAcceleration.copy(actor._measuredPlanarVelocity)
      .sub(actor._previousPlanarVelocity)
      .multiplyScalar(1 / dt);
    actor._previousPlanarVelocity.copy(actor._measuredPlanarVelocity);
  } else {
    actor._planarAcceleration.set(0, 0, 0);
  }
  const targetForwardLean = clamp(
    actor._planarAcceleration.dot(actor.forward) * 0.018,
    -0.18,
    0.24,
  );
  _locomotionRight.set(actor.forward.z, 0, -actor.forward.x);
  const targetLateralLean = clamp(
    -actor._planarAcceleration.dot(_locomotionRight) * 0.014,
    -0.14,
    0.14,
  );
  const leanBlend = dt > 0 ? 1 - Math.exp(-dt * 8) : 1;
  actor._accelerationLean += (targetForwardLean - actor._accelerationLean) * leanBlend;
  actor._lateralLean += (targetLateralLean - actor._lateralLean) * leanBlend;
  updateTerrainFrame(actor, terrainHeight, explicitTerrainNormal, leanBlend);
}

function resetLivePose(parts) {
  parts.leftLeg.position.set(-0.17, 0.75, 0);
  parts.rightLeg.position.set(0.17, 0.75, 0);
  parts.leftLeg.rotation.set(0, 0, 0);
  parts.rightLeg.rotation.set(0, 0, 0);
  parts.leftKnee.rotation.set(0, 0, 0);
  parts.rightKnee.rotation.set(0, 0, 0);
  parts.leftAnkle.rotation.set(0, 0, 0);
  parts.rightAnkle.rotation.set(0, 0, 0);
}

function applyLegPose(actor, side, step, terrainHeight, dt) {
  const parts = actor._parts;
  const leg = side === 'left' ? parts.leftLeg : parts.rightLeg;
  const knee = side === 'left' ? parts.leftKnee : parts.rightKnee;
  const ankle = side === 'left' ? parts.leftAnkle : parts.rightAnkle;
  const foot = side === 'left' ? parts.leftFoot : parts.rightFoot;
  const state = actor._footState[side];
  const stride = Math.max(actor._locomotionWeight, actor._turnInPlaceWeight * 0.78);
  const strideWarp = actor._turnInPlaceWeight > actor._locomotionWeight
    ? 0.64
    : actor._strideWarp;
  const swing = step.swing * 0.56 * stride * strideWarp;
  const kneeBend = clamp(
    step.lift * 0.82 * stride + Math.max(0, -step.swing) * 0.2 * stride,
    0,
    1.05,
  );
  leg.rotation.x = swing;
  knee.rotation.x = -kneeBend;
  ankle.rotation.x = kneeBend * 0.62 - swing * 0.28;
  leg.position.y += step.lift * 0.055 * stride;

  const sideSign = side === 'left' ? -1 : 1;
  sampleFootWorld(actor, sideSign, swing, kneeBend, step.lift, _footDesiredWorld);
  const support = stride > 0.05 && step.lift < 0.08 && step.support > 0.08;
  state.lockWeight += (
    (support ? 1 : 0) - state.lockWeight
  ) * (dt > 0 ? 1 - Math.exp(-dt * (support ? 24 : 14)) : 1);
  if (support) {
    if (!state.locked) {
      state.locked = true;
      state.world.copy(_footDesiredWorld);
      state.world.y = sampleTerrainHeight(terrainHeight, state.world.x, state.world.z, actor.object3d.position.y);
    }
    const localLock = worldToActorLocal(actor, state.world, _footLockLocal);
    const correction = clamp(localLock.z - _footDesiredLocalZ, -0.17, 0.17);
    leg.position.z += correction;
  } else if (state.lockWeight < 0.02) {
    state.locked = false;
  }

  const hasTerrain = typeof terrainHeight === 'function';
  const terrainY = sampleTerrainHeight(
    terrainHeight,
    state.locked ? state.world.x : _footDesiredWorld.x,
    state.locked ? state.world.z : _footDesiredWorld.z,
    actor.object3d.position.y,
  );
  if (hasTerrain) {
    const localHeight = terrainY - actor.object3d.position.y;
    const predictedSole = 0.75 - 0.72 + 0.06 - 0.09
      + step.lift * 0.055 * stride;
    leg.position.y += clamp(localHeight - predictedSole, -0.1, 0.12);
  }

  const forwardSlope = slopeAlong(actor._terrainNormal, actor.forward);
  const sideSlope = slopeAlong(actor._terrainNormal, _locomotionRight);
  const cyclePhase = actor._turnInPlaceWeight > actor._locomotionWeight
    ? actor._turnPhase
    : actor._stridePhase;
  const cycle = wrapAngle(cyclePhase + (side === 'left' ? 0 : Math.PI)) / (Math.PI * 2);
  const footRoll = (
    -gaussianPulse(cycle, 0.02, 0.075) * 0.28
    + gaussianPulse(cycle, 0.58, 0.085) * 0.42
  ) * stride;
  ankle.rotation.x += forwardSlope + footRoll;
  ankle.rotation.z -= sideSlope * 0.72;
  foot.userData.contact = {
    locked: state.locked,
    lockWeight: state.lockWeight,
    terrainY,
    lift: step.lift,
    roll: footRoll,
  };
}

function sampleFootWorld(actor, sideSign, hipSwing, kneeBend, lift, target) {
  const thighLength = 0.36;
  const shinLength = 0.36;
  const kneeAngle = hipSwing - kneeBend;
  const localX = sideSign * 0.17;
  const localY = 0.75
    - Math.cos(hipSwing) * thighLength
    - Math.cos(kneeAngle) * shinLength
    + lift * 0.055 * Math.max(actor._locomotionWeight, actor._turnInPlaceWeight * 0.78);
  const localZ = Math.sin(hipSwing) * thighLength + Math.sin(kneeAngle) * shinLength + 0.07;
  _footDesiredLocalZ = localZ;
  target.set(localX, localY, localZ);
  actor.object3d.localToWorld(target);
  actor.object3d.updateWorldMatrix(true, true);
  const footWorld = actor._parts[sideSign < 0 ? 'leftFoot' : 'rightFoot']
    .getWorldPosition(_footActualWorld);
  const currentLocal = worldToActorLocal(actor, footWorld, _footCurrentLocal);
  _footDesiredLocalZ = currentLocal.z;
  target.copy(footWorld);
  return target;
}

function updateTerrainFrame(actor, terrainHeight, explicitTerrainNormal, blend) {
  if (explicitTerrainNormal?.isVector3) {
    _terrainSampleNormal.copy(explicitTerrainNormal).normalize();
  } else if (typeof terrainHeight === 'function') {
    const x = actor.object3d.position.x;
    const z = actor.object3d.position.z;
    const spacing = 0.32;
    const left = sampleTerrainHeight(terrainHeight, x - spacing, z, actor.object3d.position.y);
    const right = sampleTerrainHeight(terrainHeight, x + spacing, z, actor.object3d.position.y);
    const back = sampleTerrainHeight(terrainHeight, x, z - spacing, actor.object3d.position.y);
    const front = sampleTerrainHeight(terrainHeight, x, z + spacing, actor.object3d.position.y);
    _terrainSampleNormal.set(left - right, spacing * 2, back - front).normalize();
  } else {
    _terrainSampleNormal.set(0, 1, 0);
  }
  actor._terrainNormal.lerp(_terrainSampleNormal, blend).normalize();
}

function applyLocomotionTorsoPose(actor, gait, stride) {
  const parts = actor._parts;
  const forwardSlope = slopeAlong(actor._terrainNormal, actor.forward);
  _locomotionRight.set(actor.forward.z, 0, -actor.forward.x);
  const sideSlope = slopeAlong(actor._terrainNormal, _locomotionRight);
  const turnSign = Math.sign(actor._turnRate);
  const turnAmount = actor._turnWeight * turnSign;
  const turnInPlace = actor._turnInPlaceWeight * turnSign;
  parts.upperBody.rotation.x += actor._accelerationLean + forwardSlope * 0.34;
  parts.upperBody.rotation.z += actor._lateralLean - sideSlope * 0.28 - turnAmount * 0.085;
  parts.body.rotation.x += forwardSlope * 0.46;
  parts.body.rotation.z += -sideSlope * 0.36 - turnAmount * 0.05;
  parts.leftLeg.rotation.y += turnAmount * (0.2 + stride * 0.08) + turnInPlace * 0.18;
  parts.rightLeg.rotation.y -= turnAmount * (0.2 + stride * 0.08) + turnInPlace * 0.18;
  parts.leftLeg.position.z += turnInPlace * gait * 0.045;
  parts.rightLeg.position.z -= turnInPlace * gait * 0.045;
  parts.leftAnkle.rotation.y -= turnAmount * 0.22 + turnInPlace * 0.28;
  parts.rightAnkle.rotation.y += turnAmount * 0.22 + turnInPlace * 0.28;
  parts.head.rotation.y -= turnAmount * 0.18 + gait * stride * 0.01;
}

function updateAnimationLayerState(actor, combatPose) {
  const state = combatPose?.state ?? WeaponState.IDLE;
  actor._animationLayers.locomotion.weight = actor._locomotionWeight;
  actor._animationLayers.locomotion.strideWarp = actor._strideWarp;
  actor._animationLayers.locomotion.accelerationLean = actor._accelerationLean;
  actor._animationLayers.locomotion.turnWeight = actor._turnWeight;
  actor._animationLayers.locomotion.turnInPlaceWeight = actor._turnInPlaceWeight;
  actor._animationLayers.weapon.state = state;
  actor._animationLayers.weapon.weight = actor._weaponLayerWeight;
  actor._animationLayers.reaction.kind = actor._reaction?.kind ?? null;
  actor._animationLayers.reaction.weight = actor._reaction?.weight ?? 0;
}

function constrainArticulatedPose(parts) {
  parts.leftKnee.rotation.x = clamp(parts.leftKnee.rotation.x, -1.15, 0.08);
  parts.rightKnee.rotation.x = clamp(parts.rightKnee.rotation.x, -1.15, 0.08);
  parts.leftAnkle.rotation.x = clamp(parts.leftAnkle.rotation.x, -0.72, 0.72);
  parts.rightAnkle.rotation.x = clamp(parts.rightAnkle.rotation.x, -0.72, 0.72);
  constrainArm(parts.leftArm, parts.leftForearm);
  constrainArm(parts.rightArm, parts.rightForearm);
}

function constrainArm(upperArm, forearm) {
  upperArm.rotation.x = clamp(upperArm.rotation.x, -1.72, 0.48);
  upperArm.rotation.y = clamp(upperArm.rotation.y, -0.82, 0.82);
  upperArm.rotation.z = clamp(upperArm.rotation.z, -0.88, 0.88);
  forearm.rotation.x = clamp(forearm.rotation.x, -1.35, 0.12);
  forearm.rotation.y = clamp(forearm.rotation.y, -0.46, 0.46);
  forearm.rotation.z = clamp(forearm.rotation.z, -0.58, 0.58);
}

function sampleTerrainHeight(terrainHeight, x, z, fallback) {
  if (typeof terrainHeight !== 'function') return fallback;
  const height = terrainHeight(x, z);
  return Number.isFinite(height) ? height : fallback;
}

function slopeAlong(normal, direction) {
  return Math.atan2(
    -(normal.x * direction.x + normal.z * direction.z),
    Math.max(0.35, normal.y),
  );
}

function worldToActorLocal(actor, world, target) {
  target.copy(world);
  actor.object3d.worldToLocal(target);
  return target;
}

function sampleLegGait(phase) {
  const cycle = wrapAngle(phase) / (Math.PI * 2);
  const stanceEnd = 0.62;
  if (cycle < stanceEnd) {
    const t = smoothstep(cycle / stanceEnd);
    return {
      swing: lerp(0.38, -0.34, t),
      lift: 0,
      support: Math.sin(Math.PI * Math.min(1, cycle / stanceEnd)),
    };
  }
  const t = smoothstep((cycle - stanceEnd) / (1 - stanceEnd));
  return {
    swing: lerp(-0.34, 0.38, t),
    lift: Math.sin(Math.PI * t),
    support: 0,
  };
}

function createReactionState(actor, result = {}, impact = {}) {
  const outcome = result.outcome ?? 'hit';
  const hitZone = result.hitZone ?? impact.hitZone ?? 'torso';
  const severity = clamp(
    result.severity ?? result.intensity ?? impact.severity ?? impact.intensity ?? 0.45,
    0.08,
    1,
  );
  const direction = result.direction ?? impact.direction;
  let worldX = direction?.x ?? direction?.[0] ?? 0;
  let worldZ = direction?.z ?? direction?.[2] ?? -1;
  const length = Math.hypot(worldX, worldZ);
  if (length > 1e-5) {
    worldX /= length;
    worldZ /= length;
  } else {
    worldX = 0;
    worldZ = -1;
  }
  const localX = worldX * actor.forward.z - worldZ * actor.forward.x;
  const localZ = worldX * actor.forward.x + worldZ * actor.forward.z;

  let kind = hitZone === 'head' ? 'head' : hitZone === 'legs' ? 'leg' : 'body';
  if (outcome === 'blocked') kind = 'block';
  else if (outcome === 'parried') kind = 'parry';
  else if (outcome === 'stagger' || outcome === 'guard-broken') kind = 'stagger';

  const duration = kind === 'parry'
    ? 0.3
    : kind === 'block' ? 0.38
      : kind === 'stagger' ? 0.72 + severity * 0.2
        : kind === 'head' ? 0.58
          : kind === 'leg' ? 0.64 : 0.48;
  return {
    kind,
    outcome,
    hitZone,
    severity,
    localX,
    localZ,
    elapsed: 0,
    duration,
    weight: 1,
  };
}

function applyReactionPose(parts, reaction) {
  if (!reaction) return;
  const amount = reaction.severity * reaction.weight;
  const side = reaction.localX;
  const push = reaction.localZ;

  if (reaction.kind === 'block') {
    const force = 0.12 + amount * 0.22;
    parts.upperBody.rotation.x += push * force;
    parts.upperBody.rotation.y += side * force * 0.65;
    parts.upperBody.rotation.z -= side * force * 0.5;
    parts.body.rotation.x += push * force * 0.36;
    parts.body.rotation.z -= side * force * 0.24;
    parts.leftArm.rotation.x -= force * 0.92;
    parts.leftArm.rotation.y += side * force * 0.36;
    parts.leftForearm.rotation.x -= force * 0.76;
    parts.leftForearm.rotation.z -= side * force * 0.28;
    parts.shieldMount.rotation.x += force * 0.9;
    parts.shieldMount.position.z -= force * 0.12;
    const rearIsLeft = push <= 0;
    const rearLeg = rearIsLeft ? parts.leftLeg : parts.rightLeg;
    const rearKnee = rearIsLeft ? parts.leftKnee : parts.rightKnee;
    const rearAnkle = rearIsLeft ? parts.leftAnkle : parts.rightAnkle;
    rearLeg.rotation.x += force * 0.38;
    rearKnee.rotation.x -= force * 0.52;
    rearAnkle.rotation.x += force * 0.25;
    rearLeg.position.z -= force * 0.15;
  } else if (reaction.kind === 'parry') {
    const snap = (0.16 + amount * 0.2) * (0.65 + reaction.weight * 0.35);
    parts.upperBody.rotation.y -= (side || 0.65) * snap;
    parts.upperBody.rotation.z += (side || 0.65) * snap * 0.42;
    parts.rightArm.rotation.y += (side || 1) * snap * 1.15;
    parts.rightForearm.rotation.z -= (side || 1) * snap * 0.72;
    parts.head.rotation.y += (side || 0.65) * snap * 0.38;
  } else if (reaction.kind === 'stagger') {
    const force = 0.24 + amount * 0.44;
    parts.upperBody.rotation.x += push * force;
    parts.upperBody.rotation.y += side * force * 0.52;
    parts.upperBody.rotation.z -= side * force * 0.78;
    parts.body.position.x += side * force * 0.11;
    parts.body.position.y -= force * 0.08;
    parts.leftLeg.rotation.x += 0.13 * reaction.weight;
    parts.rightLeg.rotation.x -= 0.16 * reaction.weight;
    parts.head.rotation.x -= push * force * 0.35;
  } else if (reaction.kind === 'head') {
    const force = 0.2 + amount * 0.42;
    parts.head.rotation.x += push * force;
    parts.head.rotation.y -= side * force * 0.42;
    parts.head.rotation.z -= (side || 0.45) * force * 0.82;
    parts.upperBody.rotation.x += push * force * 0.28;
    parts.upperBody.rotation.z -= side * force * 0.24;
  } else if (reaction.kind === 'leg') {
    const force = 0.14 + amount * 0.3;
    const hitLeft = side <= 0;
    const hitLeg = hitLeft ? parts.leftLeg : parts.rightLeg;
    const hitKnee = hitLeft ? parts.leftKnee : parts.rightKnee;
    hitLeg.rotation.x += force * 0.9;
    hitLeg.rotation.z += (hitLeft ? -1 : 1) * force * 0.48;
    hitKnee.rotation.x -= force * 0.7;
    parts.body.position.y -= force * 0.2;
    parts.body.position.x += (hitLeft ? 1 : -1) * force * 0.1;
    parts.upperBody.rotation.z += (hitLeft ? 1 : -1) * force * 0.42;
  } else {
    const force = 0.16 + amount * 0.34;
    parts.upperBody.rotation.x += push * force;
    parts.upperBody.rotation.y += side * force * 0.38;
    parts.upperBody.rotation.z -= side * force * 0.7;
    parts.body.position.x += side * force * 0.07;
    parts.head.rotation.x -= push * force * 0.18;
  }
}

function advanceReaction(actor, dt) {
  const reaction = actor._reaction;
  if (!reaction) return;
  reaction.elapsed += Math.max(0, dt);
  const progress = clamp(reaction.elapsed / reaction.duration, 0, 1);
  reaction.weight = 1 - smoothstep(progress);
  if (progress >= 1) actor._reaction = null;
}

function animateDeathCollapse(actor, parts, variant, deathTime) {
  const object3d = actor.object3d;
  const t = smoothstep(Math.min(1, deathTime / 0.92));
  const settle = smoothstep(Math.max(0, Math.min(1, (deathTime - 0.32) / 0.68)));
  const displacementT = smoothstep(Math.max(0, Math.min(1, (deathTime - 0.06) / 0.86)));
  parts.upperBody.rotation.set(0, 0, 0);

  if (variant === 0) {
    parts.collapseRoot.rotation.set(-0.08 * settle, 0.08 * settle, -1.46 * t);
    parts.upperBody.rotation.y = -0.18 * settle;
    parts.rightArm.rotation.x = -0.45 - settle * 0.72;
    parts.leftArm.rotation.x = -0.36 - settle * 0.48;
    parts.rightLeg.rotation.x = settle * 0.2;
    parts.leftLeg.rotation.x = -settle * 0.14;
  } else if (variant === 1) {
    parts.collapseRoot.rotation.set(1.38 * t, -0.12 * settle, 0.18 * t);
    parts.upperBody.rotation.y = 0.22 * settle;
    parts.rightArm.rotation.set(-0.76 - settle * 0.35, 0.2, -0.34);
    parts.leftArm.rotation.set(-0.58 - settle * 0.42, -0.18, 0.3);
    parts.rightLeg.rotation.x = -settle * 0.25;
    parts.leftLeg.rotation.x = settle * 0.3;
  } else {
    parts.collapseRoot.rotation.set(-1.28 * t, 0.18 * settle, 0.42 * t);
    parts.upperBody.rotation.y = -0.28 * settle;
    parts.rightArm.rotation.set(-0.5 - settle * 0.42, -0.22, -0.44);
    parts.leftArm.rotation.set(-0.82 - settle * 0.3, 0.2, 0.38);
    parts.rightLeg.rotation.x = settle * 0.34;
    parts.leftLeg.rotation.x = -settle * 0.28;
  }

  parts.head.rotation.x = variant === 1 ? -0.16 * settle : 0.2 * settle;
  parts.head.rotation.y = (variant - 1) * 0.26 * settle;
  object3d.rotation.z = variant === 1 ? 1.02 * t : -1.02 * t;
  const displacement = DEATH_DISPLACEMENTS[variant] ?? DEATH_DISPLACEMENTS[0];
  _collapseDisplacement.set(
    (displacement[0] * displacementT + actor._corpsePlacementOffset.x) * object3d.scale.x,
    0,
    (displacement[1] * displacementT + actor._corpsePlacementOffset.z) * object3d.scale.z,
  );
  _collapseDisplacement.applyAxisAngle(_worldUp, object3d.rotation.y);
  alignCollapseToGround(object3d, parts.collapseRoot, _collapseDisplacement);
}

function updateCorpsePlacement(actor, dt) {
  if (typeof actor._corpseQuery !== 'function' || dt <= 0) return;
  const neighbors = actor._corpseQuery(
    actor.object3d.position,
    1.35,
    actor._corpseNeighbors,
  ) ?? actor._corpseNeighbors;
  actor.getAvoidancePosition(_corpseCenter);
  let pushX = 0;
  let pushZ = 0;
  let overlaps = 0;
  for (const other of neighbors) {
    if (other === actor || other?.combatant?.alive !== false) continue;
    const otherPosition = typeof other.getAvoidancePosition === 'function'
      ? other.getAvoidancePosition(_otherCorpseCenter)
      : _otherCorpseCenter.copy(other.object3d?.position ?? _corpseCenter);
    let dx = _corpseCenter.x - otherPosition.x;
    let dz = _corpseCenter.z - otherPosition.z;
    const minimum = actor.radius + (other.radius ?? 0.42) + 0.18;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= minimum * minimum) continue;
    let distance = Math.sqrt(distanceSq);
    if (distance < 1e-4) {
      const angle = (hashString(`${actor.id}:${other.id}`) % 6283) / 1000;
      dx = Math.cos(angle);
      dz = Math.sin(angle);
      distance = 0;
    } else {
      dx /= distance;
      dz /= distance;
    }
    const penetration = minimum - distance;
    pushX += dx * penetration;
    pushZ += dz * penetration;
    overlaps += 1;
  }
  if (overlaps > 0) {
    actor._corpsePlacementTarget.set(
      clamp(pushX / overlaps, -0.32, 0.32),
      0,
      clamp(pushZ / overlaps, -0.32, 0.32),
    );
  } else {
    actor._corpsePlacementTarget.multiplyScalar(Math.exp(-dt * 2.4));
  }
  springVector(
    actor._corpsePlacementOffset,
    actor._corpsePlacementVelocity,
    actor._corpsePlacementTarget,
    dt,
    28,
    10.5,
  );
  const length = Math.hypot(actor._corpsePlacementOffset.x, actor._corpsePlacementOffset.z);
  if (length > 0.34) {
    actor._corpsePlacementOffset.multiplyScalar(0.34 / length);
    actor._corpsePlacementVelocity.multiplyScalar(0.35);
  }
}

function springVector(position, velocity, target, dt, stiffness, damping) {
  const step = Math.min(dt, 1 / 20);
  velocity.x += (target.x - position.x) * stiffness * step;
  velocity.z += (target.z - position.z) * stiffness * step;
  const decay = Math.exp(-damping * step);
  velocity.x *= decay;
  velocity.z *= decay;
  position.x += velocity.x * step;
  position.z += velocity.z * step;
}

function alignCollapseToGround(object3d, collapseRoot, displacement) {
  _collapseAnchor.copy(object3d.position);
  object3d.position.set(0, 0, 0);
  _collapseQuaternion.copy(object3d.quaternion).invert();
  collapseRoot.position.copy(displacement)
    .applyQuaternion(_collapseQuaternion)
    .divide(object3d.scale);
  object3d.updateWorldMatrix(true, true);
  _collapseBounds.setFromObject(collapseRoot);
  const allowedSink = 0.065 * object3d.scale.y;
  const lift = -allowedSink - _collapseBounds.min.y;
  if (lift > 0) {
    _collapseLift.set(0, lift, 0);
    _collapseLift.applyQuaternion(_collapseQuaternion);
    _collapseLift.divide(object3d.scale);
    collapseRoot.position.add(_collapseLift);
  }
  object3d.position.copy(_collapseAnchor);
  object3d.updateWorldMatrix(true, true);
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function gaussianPulse(cycle, center, width) {
  const distance = Math.min(
    Math.abs(cycle - center),
    1 - Math.abs(cycle - center),
  );
  const normalized = distance / Math.max(1e-4, width);
  return Math.exp(-0.5 * normalized * normalized);
}

function shortestAngle(value) {
  const tau = Math.PI * 2;
  return ((value + Math.PI) % tau + tau) % tau - Math.PI;
}

function wrapAngle(value) {
  const tau = Math.PI * 2;
  return ((value % tau) + tau) % tau;
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createFootState() {
  return {
    locked: false,
    lockWeight: 0,
    world: new Vector3(),
  };
}

const _collapseBounds = new Box3();
const _collapseAnchor = new Vector3();
const _collapseLift = new Vector3();
const _collapseQuaternion = new Quaternion();
const _collapseDisplacement = new Vector3();
const _locomotionDelta = new Vector3();
const _locomotionRight = new Vector3(1, 0, 0);
const _terrainSampleNormal = new Vector3(0, 1, 0);
const _footDesiredWorld = new Vector3();
const _footActualWorld = new Vector3();
const _footCurrentLocal = new Vector3();
const _footLockLocal = new Vector3();
let _footDesiredLocalZ = 0;
const _corpseCenter = new Vector3();
const _otherCorpseCenter = new Vector3();
const _baseRightArm = new Vector3();
const _baseLeftArm = new Vector3();
const _baseRightForearm = new Vector3();
const _baseLeftForearm = new Vector3();
const _worldUp = new Vector3(0, 1, 0);
const DEATH_DISPLACEMENTS = Object.freeze([
  Object.freeze([-0.28, 0.08]),
  Object.freeze([0.07, 0.34]),
  Object.freeze([0.2, -0.27]),
]);
