import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { Combatant, DamageType } from '../combat/Combatant.js';
import { WeaponState } from '../combat/MeleeCombatController.js';
import { getFaction } from './Factions.js';

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
    maxHealth: 155,
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
    this.lod = 0;
    this._time = (hashString(String(id ?? 'soldier')) % 1000) * 0.013;
    this._materials = [];
    this._geometries = [];
    this._parts = buildSoldierMesh(this.object3d, this, getFaction(factionId));

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
    this.lod = level;
    this._parts.head.visible = level < 2;
    this._parts.leftArm.visible = level < 2;
    this._parts.rightArm.visible = level < 2;
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
      const side = (hashString(String(this.id)) & 1) ? 1 : -1;
      this.object3d.rotation.z += (side * 1.48 - this.object3d.rotation.z) * Math.min(1, dt * 4);
      this.object3d.position.y = Math.max(-0.55, this.object3d.position.y - dt * 0.35);
      return;
    }

    const stride = Math.min(1, speed / 3.4);
    const gait = Math.sin(this._time * (5.5 + speed * 1.3));
    this._parts.leftLeg.rotation.x = gait * 0.52 * stride;
    this._parts.rightLeg.rotation.x = -gait * 0.52 * stride;
    this._parts.body.position.y = Math.abs(gait) * 0.025 * stride;
    this._parts.body.rotation.z = moraleState === 'routed' ? gait * 0.08 : gait * 0.025 * stride;
    animateArms(this._parts, combatPose, gait, stride, this.weapon);

    if (this._impactFlash > 0) {
      this._parts.body.rotation.x = -0.12;
    } else {
      this._parts.body.rotation.x *= Math.max(0, 1 - dt * 8);
    }
  }

  dispose() {
    this.object3d.removeFromParent();
    this._geometries.forEach((geometry) => geometry.dispose());
    this._materials.forEach((material) => material.dispose());
    this._geometries.length = 0;
    this._materials.length = 0;
  }
}

function buildSoldierMesh(root, actor, faction) {
  const group = new Group();
  group.name = 'Body';
  root.add(group);

  const cloth = material(actor, faction.cloth, 1);
  const clothSecondary = material(actor, faction.clothSecondary, 0.96);
  const leather = material(actor, 0x3b291d, 0.9);
  const iron = material(actor, 0x555b5c, 0.43, 0.58);
  const darkIron = material(actor, 0x2b3031, 0.5, 0.52);
  const skin = material(actor, 0xa87354, 0.95);
  const wood = material(actor, 0x493522, 0.9);

  const leftLeg = limb(actor, clothSecondary, 0.105, 0.72);
  const rightLeg = limb(actor, clothSecondary, 0.105, 0.72);
  leftLeg.position.set(-0.17, 0.75, 0);
  rightLeg.position.set(0.17, 0.75, 0);
  group.add(leftLeg, rightLeg);

  const body = new Group();
  body.position.y = 1.22;
  group.add(body);
  const torso = mesh(actor, new CapsuleGeometry(0.3, 0.58, 3, 7), cloth);
  torso.scale.set(1, 1, 0.72);
  torso.position.y = 0.18;
  body.add(torso);
  const belt = mesh(actor, new CylinderGeometry(0.285, 0.285, 0.11, 8), leather);
  belt.position.y = -0.11;
  body.add(belt);
  const skirt = mesh(actor, new CylinderGeometry(0.26, 0.34, 0.42, 7), cloth);
  skirt.position.y = -0.27;
  body.add(skirt);

  if (actor.role === SoldierRole.MAN_AT_ARMS || actor.role === SoldierRole.CAPTAIN) {
    const breastplate = mesh(actor, new BoxGeometry(0.54, 0.62, 0.16), iron);
    breastplate.position.set(0, 0.2, 0.245);
    breastplate.scale.x = 0.92;
    body.add(breastplate);
  }

  const head = new Group();
  head.position.set(0, 1.98, 0);
  group.add(head);
  const face = mesh(actor, new SphereGeometry(0.185, 7, 5), skin);
  face.scale.z = 0.88;
  head.add(face);
  const helmet = mesh(
    actor,
    actor.role === SoldierRole.CAPTAIN
      ? new ConeGeometry(0.235, 0.38, 8)
      : new SphereGeometry(0.21, 7, 4, 0, Math.PI * 2, 0, Math.PI * 0.62),
    darkIron,
  );
  helmet.position.y = actor.role === SoldierRole.CAPTAIN ? 0.12 : 0.06;
  head.add(helmet);

  const leftArm = limb(actor, cloth, 0.095, 0.63);
  const rightArm = limb(actor, cloth, 0.095, 0.63);
  leftArm.position.set(-0.38, 1.57, 0);
  rightArm.position.set(0.38, 1.57, 0);
  group.add(leftArm, rightArm);

  const weaponRoot = new Group();
  rightArm.add(weaponRoot);
  weaponRoot.position.set(0, -0.35, 0.04);
  if (actor.weapon === 'spear') {
    const shaft = mesh(actor, new CylinderGeometry(0.018, 0.022, 2.75, 6), wood);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.75;
    weaponRoot.add(shaft);
    const point = mesh(actor, new ConeGeometry(0.055, 0.26, 4), iron);
    point.rotation.x = -Math.PI / 2;
    point.position.z = -0.75;
    weaponRoot.add(point);
  } else {
    const blade = mesh(actor, new BoxGeometry(0.055, 0.72, 0.018), iron);
    blade.position.y = -0.48;
    weaponRoot.add(blade);
    const guard = mesh(actor, new BoxGeometry(0.26, 0.035, 0.04), darkIron);
    guard.position.y = -0.08;
    weaponRoot.add(guard);
  }

  if (actor.role === SoldierRole.STANDARD_BEARER || actor.role === SoldierRole.CAPTAIN) {
    const pole = mesh(actor, new CylinderGeometry(0.018, 0.022, 2.7, 6), wood);
    pole.position.set(-0.3, 1.55, 0);
    group.add(pole);
    const banner = mesh(actor, new BoxGeometry(0.72, 0.58, 0.025), material(actor, faction.standard, 0.9));
    banner.position.set(-0.64, 2.55, 0);
    group.add(banner);
  }

  root.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { body, head, leftArm, rightArm, leftLeg, rightLeg, weaponRoot };
}

function limb(actor, limbMaterial, radius, length) {
  const pivot = new Group();
  const part = mesh(actor, new CapsuleGeometry(radius, length, 3, 6), limbMaterial);
  part.position.y = -length * 0.45;
  pivot.add(part);
  return pivot;
}

function mesh(actor, geometry, meshMaterial) {
  actor._geometries.push(geometry);
  const result = new Mesh(geometry, meshMaterial);
  return result;
}

function material(actor, color, roughness, metalness = 0) {
  const result = new MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
  actor._materials.push(result);
  return result;
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

function animateArms(parts, pose, gait, stride, weapon) {
  if (!pose || pose.state === WeaponState.IDLE) {
    const polearm = weapon === 'spear';
    parts.rightArm.rotation.set(
      polearm ? -1.05 : gait * 0.22 * stride,
      polearm ? -0.12 : 0,
      polearm ? -0.22 : 0.08,
    );
    parts.leftArm.rotation.set(
      polearm ? -0.82 : -gait * 0.22 * stride,
      polearm ? 0.18 : 0,
      polearm ? 0.28 : -0.08,
    );
    return;
  }
  const t = pose.progress ?? 0;
  if (pose.state === WeaponState.BLOCKING) {
    parts.rightArm.rotation.set(-1.35, -0.2, -0.35);
    parts.leftArm.rotation.set(-1.2, 0.22, 0.4);
  } else if (pose.state === WeaponState.WINDUP) {
    parts.rightArm.rotation.set(-0.6 - t, -0.45, -0.5);
    parts.leftArm.rotation.set(-0.75 - t * 0.35, 0.25, 0.35);
  } else if (pose.state === WeaponState.ACTIVE) {
    parts.rightArm.rotation.set(-1.6 + t * 0.7, 0.5 * t, 0.35);
    parts.leftArm.rotation.set(-1.3 + t * 0.45, -0.2, -0.25);
  } else {
    parts.rightArm.rotation.x = -0.9 + t * 0.5;
    parts.leftArm.rotation.x = -0.8 + t * 0.45;
  }
}

function hashString(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
