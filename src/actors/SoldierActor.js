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
    maxHealth: 132,
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
    this._deathVariant = hashString(String(id ?? role)) % 3;
    this._materials = [];
    this._geometries = [];
    this._parts = buildSoldierMesh(this.object3d, this, getFaction(factionId));
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
    });
    this.combatant.addEventListener('death', () => {
      this._deathTime = 0;
    });
    this.setLod(0);
  }

  setPosition(x, y, z) {
    this.object3d.position.set(x, y, z);
    return this;
  }

  setHeading(radians) {
    this.object3d.rotation.y = radians;
    this.forward.set(Math.sin(radians), 0, Math.cos(radians));
    this.desiredForward.copy(this.forward);
    return this;
  }

  setLod(level) {
    if (level === this.lod) return this;
    this.lod = level;
    this._parts.head.visible = level < 2;
    this._parts.leftArm.visible = level < 2;
    this._parts.rightArm.visible = level < 2;
    const detailedShadow = level === 0;
    this.object3d.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = detailedShadow && object.userData.shadowDetail !== false;
      object.receiveShadow = level < 2 && object.userData.receiveShadow !== false;
    });
    return this;
  }

  update(dt, {
    speed = this.velocity.length(),
    combatPose = null,
    moraleState = 'ordered',
  } = {}) {
    this._time += dt;
    this._impactFlash = Math.max(0, (this._impactFlash ?? 0) - dt);

    const turn = Math.min(1, dt * 8);
    if (this.desiredForward.lengthSq() > 0.1) {
      this.forward.lerp(this.desiredForward, turn).normalize();
      this.object3d.rotation.y = Math.atan2(this.forward.x, this.forward.z);
    }

    if (!this.combatant.alive) {
      this._deathTime = (this._deathTime ?? 0) + dt;
      animateDeathCollapse(this.object3d, this._parts, this._deathVariant, this._deathTime);
      return;
    }

    this._parts.collapseRoot.position.set(0, 0, 0);
    this._parts.collapseRoot.rotation.set(0, 0, 0);
    const stride = Math.min(1, speed / 3.4);
    const gait = Math.sin(this._time * (5.5 + speed * 1.3));
    const stepLift = Math.max(0, gait);
    this._parts.leftLeg.rotation.x = gait * 0.48 * stride;
    this._parts.rightLeg.rotation.x = -gait * 0.48 * stride;
    this._parts.leftLeg.position.y = 0.75 + stepLift * 0.035 * stride;
    this._parts.rightLeg.position.y = 0.75 + Math.max(0, -gait) * 0.035 * stride;
    this._parts.body.position.y = Math.abs(gait) * 0.022 * stride;
    this._parts.body.rotation.y = 0;
    this._parts.body.rotation.z = moraleState === 'routed' ? gait * 0.09 : gait * 0.018 * stride;
    this._parts.head.rotation.y = -gait * 0.025 * stride;
    this._parts.head.rotation.z = moraleState === 'routed' ? -gait * 0.04 : 0;
    animateCombatBody(this._parts, combatPose, gait, stride, this.weapon, this.role);

    if (this._impactFlash > 0) {
      this._parts.body.rotation.x = -0.14;
      this._parts.head.rotation.x = 0.09;
    } else {
      this._parts.body.rotation.x *= Math.max(0, 1 - dt * 8);
      this._parts.head.rotation.x *= Math.max(0, 1 - dt * 9);
    }
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

  let shield = null;
  if (armored) {
    shield = createShield(actor, faction, cloth, clothSecondary, heraldry, leather, iron);
    shield.position.set(0, -0.23, 0.12);
    shield.rotation.set(-0.08, 0.04, 0);
    leftArm.add(shield);
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
    weaponRoot,
    shield,
  };
}

function leg(actor, clothMaterial, bootMaterial) {
  const pivot = new Group();
  const hose = mesh(actor, sharedCapsule(0.105, 0.67, 3, 6), clothMaterial);
  hose.position.y = -0.31;
  hose.name = 'Leg';
  pivot.add(hose);
  const boot = mesh(actor, sharedBox(0.19, 0.18, 0.32), bootMaterial);
  boot.position.set(0, -0.75, 0.07);
  boot.name = 'Boot';
  pivot.add(boot);
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

function animateCombatBody(parts, pose, gait, stride, weapon, role) {
  animateArms(parts, pose, gait, stride, weapon, role);
  const state = pose?.state ?? WeaponState.IDLE;
  const t = smoothstep(pose?.progress ?? 0);
  const side = pose?.attack?.arc?.[0] < 0 ? -1 : 1;
  const captain = role === SoldierRole.CAPTAIN;

  parts.upperBody.position.set(0, 0, 0);
  parts.upperBody.rotation.x = 0;
  parts.upperBody.rotation.y = gait * 0.035 * stride;
  parts.upperBody.rotation.z = captain ? -0.035 : 0;
  parts.body.position.x = 0;
  parts.head.position.x = 0;

  if (state === WeaponState.WINDUP) {
    const thrust = weapon === 'spear' || pose?.attack?.thrust;
    const vertical = pose?.attack?.vertical;
    parts.upperBody.rotation.y += thrust
      ? side * (0.1 + t * 0.2)
      : side * (0.14 + t * (vertical ? 0.34 : 0.52));
    parts.upperBody.rotation.z += thrust
      ? side * -0.035 * t
      : side * (vertical ? -0.08 : -0.14) * t;
    parts.body.position.x = side * (vertical ? 0.025 : 0.055) * t;
    parts.head.rotation.y = -parts.upperBody.rotation.y * 0.62;
  } else if (state === WeaponState.ACTIVE) {
    const thrust = weapon === 'spear' || pose?.attack?.thrust;
    const vertical = pose?.attack?.vertical;
    parts.upperBody.rotation.y += thrust
      ? side * (0.22 - t * 0.36)
      : side * ((vertical ? 0.28 : 0.48) - t * (vertical ? 0.46 : 0.86));
    parts.upperBody.rotation.z += thrust
      ? side * -0.05
      : side * (vertical ? -0.1 + t * 0.16 : -0.14 + t * 0.25);
    parts.body.position.x = side * (1 - t) * (vertical ? 0.03 : 0.06);
    parts.head.rotation.y = -parts.upperBody.rotation.y * 0.48;
  } else if (state === WeaponState.RECOVERY) {
    parts.upperBody.rotation.y += side * 0.2 * (1 - t);
    parts.upperBody.rotation.z += side * 0.08 * (1 - t);
    parts.head.rotation.y = -parts.upperBody.rotation.y * 0.42;
  } else if (state === WeaponState.BLOCKING) {
    parts.upperBody.rotation.y += captain ? -0.18 : -0.1;
    parts.upperBody.rotation.z += captain ? -0.08 : -0.035;
    parts.body.position.x = captain ? -0.04 : -0.02;
    parts.head.rotation.y = captain ? 0.12 : 0.07;
  } else if (captain) {
    parts.upperBody.rotation.y -= 0.11;
    parts.body.position.x = -0.025;
    parts.head.rotation.y = 0.09 - gait * 0.02 * stride;
  }
}

function animateArms(parts, pose, gait, stride, weapon, role) {
  if (!pose || pose.state === WeaponState.IDLE) {
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
    parts.rightForearm.rotation.set(polearm ? -0.38 : captain ? -0.5 : -0.1, 0, polearm ? 0.08 : captain ? -0.08 : 0);
    parts.leftForearm.rotation.set(polearm ? -0.52 : captain ? -0.62 : -0.08, 0, polearm ? -0.08 : captain ? 0.08 : 0);
    return;
  }
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
}

function animateDeathCollapse(object3d, parts, variant, deathTime) {
  const t = smoothstep(Math.min(1, deathTime / 0.92));
  const settle = smoothstep(Math.max(0, Math.min(1, (deathTime - 0.32) / 0.68)));
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
  alignCollapseToGround(object3d, parts.collapseRoot, t);
}

function alignCollapseToGround(object3d, collapseRoot, amount) {
  _collapseAnchor.copy(object3d.position);
  object3d.position.set(0, 0, 0);
  collapseRoot.position.set(0, 0, 0);
  object3d.updateWorldMatrix(true, true);
  _collapseBounds.setFromObject(collapseRoot);
  const allowedSink = 0.065 * object3d.scale.y;
  const lift = -allowedSink - _collapseBounds.min.y;
  if (lift > 0) {
    _collapseLift.set(0, lift * amount, 0);
    _collapseLift.applyQuaternion(_collapseQuaternion.copy(object3d.quaternion).invert());
    _collapseLift.divide(object3d.scale);
    collapseRoot.position.copy(_collapseLift);
  }
  object3d.position.copy(_collapseAnchor);
  object3d.updateWorldMatrix(true, true);
}

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const _collapseBounds = new Box3();
const _collapseAnchor = new Vector3();
const _collapseLift = new Vector3();
const _collapseQuaternion = new Quaternion();
