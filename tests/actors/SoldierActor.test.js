import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
  Vector3,
} from 'three';
import {
  FactionId,
  SoldierRole,
  createCaptainActor,
  createSoldierActor,
} from '../../src/actors/index.js';
import { WeaponState } from '../../src/combat/MeleeCombatController.js';

describe('SoldierActor visuals', () => {
  it('preserves the actor API while layering readable faction heraldry', () => {
    const actor = createSoldierActor({
      id: 'readable-soldier',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });

    expect(actor.id).toBe('readable-soldier');
    expect(actor.weapon).toBe('armingSword');
    expect(actor.object3d.userData.actor).toBe(actor);
    expect(actor._parts.body.getObjectByName('FactionTabard')).toBeTruthy();
    expect(actor._parts.body.getObjectByName('FactionStripe')).toBeTruthy();
    expect(actor._parts.body.getObjectByName('FactionChestMark')).toBeTruthy();
    expect(actor.object3d.getObjectByName('Shield')).toBeTruthy();
    expect(actor.object3d.getObjectByName('saint-orens:ShieldFace')).toBeTruthy();
    expect(actor.object3d.getObjectByName('Breastplate')).toBeTruthy();

    actor.dispose();
  });

  it('gives captains a distinct crest and layered standard without flat giant geometry', () => {
    const actor = createCaptainActor({
      id: 'captain',
      factionId: FactionId.VANGUARD,
    });

    expect(actor.role).toBe(SoldierRole.CAPTAIN);
    expect(actor.object3d.getObjectByName('CaptainCrest')).toBeTruthy();
    expect(actor.object3d.getObjectByName('FactionStandard')).toBeTruthy();
    expect(actor.object3d.getObjectByName('vanguard:Banner')).toBeTruthy();

    const oversizedBoxes = [];
    actor.object3d.traverse((object) => {
      if (!(object.geometry instanceof BoxGeometry)) return;
      const { width = 0, height = 0, depth = 0 } = object.geometry.parameters;
      if (Math.max(width, height, depth) > 0.8) oversizedBoxes.push(object.name);
    });
    expect(oversizedBoxes).toEqual([]);

    actor.dispose();
  });

  it('keeps weapon and articulated limbs available through LOD and combat posing', () => {
    const actor = createSoldierActor({
      id: 'spearman',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.SPEARMAN,
    });

    expect(actor.object3d.getObjectByName('SpearShaft')?.geometry).toBeInstanceOf(CylinderGeometry);
    expect(actor._parts.rightForearm).toBeTruthy();
    expect(actor._parts.leftForearm).toBeTruthy();

    actor.update(1 / 60, {
      speed: 2.8,
      combatPose: {
        state: WeaponState.WINDUP,
        progress: 0.75,
        attack: { thrust: true, arc: [0, 0] },
      },
    });
    expect(Math.abs(actor._parts.rightForearm.rotation.x)).toBeGreaterThan(0.2);
    expect(Math.abs(actor._parts.leftForearm.rotation.x)).toBeGreaterThan(0.2);

    actor.setLod(2);
    expect(actor._parts.head.visible).toBe(false);
    expect(actor._parts.leftArm.visible).toBe(false);
    expect(actor._parts.rightArm.visible).toBe(false);
    actor.setLod(0);
    expect(actor._parts.head.visible).toBe(true);

    actor.dispose();
  });

  it('switches LOD1 to a bounded simplified hierarchy while retaining role silhouettes', () => {
    const actors = [
      createSoldierActor({
        id: 'mid-spearman',
        factionId: FactionId.SAINT_ORENS,
        role: SoldierRole.SPEARMAN,
      }),
      createSoldierActor({
        id: 'mid-man-at-arms',
        factionId: FactionId.SAINT_ORENS,
        role: SoldierRole.MAN_AT_ARMS,
      }),
      createCaptainActor({
        id: 'mid-captain',
        factionId: FactionId.VANGUARD,
      }),
      createSoldierActor({
        id: 'mid-standard',
        factionId: FactionId.VANGUARD,
        role: SoldierRole.STANDARD_BEARER,
      }),
    ];

    for (const actor of actors) {
      expect(actor.midRoot).toBeTruthy();
      expect(actor.detailedRoot).toBeTruthy();
      actor.setLod(1);
      expect(actor.midRoot.visible).toBe(true);
      expect(actor.detailedRoot.visible).toBe(false);
      expect(visibleMeshCount(actor.midRoot)).toBeGreaterThanOrEqual(5);
      expect(visibleMeshCount(actor.midRoot)).toBeLessThanOrEqual(9);
      expect(visibleMeshCount(actor.detailedRoot)).toBe(0);
      expect(actor.midRoot.getObjectByName('MidBody')).toBeTruthy();
      expect(actor.midRoot.getObjectByName('MidHelmet')).toBeTruthy();
      expect(actor.midRoot.getObjectByName('MidArms')).toBeTruthy();
    }

    const [spearman, manAtArms, captain, standardBearer] = actors;
    expect(spearman.midRoot.getObjectByName('MidSpear')).toBeTruthy();
    expect(spearman.midRoot.getObjectByName('MidShield')).toBeFalsy();
    expect(manAtArms.midRoot.getObjectByName('MidSword')).toBeTruthy();
    expect(manAtArms.midRoot.getObjectByName('MidShield')).toBeTruthy();
    expect(captain.midRoot.getObjectByName('MidStandardPole')).toBeTruthy();
    expect(captain.midRoot.getObjectByName('MidStandardBanner')).toBeTruthy();
    expect(captain.midRoot.getObjectByName('MidShield')).toBeTruthy();
    expect(standardBearer.midRoot.getObjectByName('MidStandardPole')).toBeTruthy();
    expect(standardBearer.midRoot.getObjectByName('MidStandardBanner')).toBeTruthy();

    actors.forEach((actor) => actor.dispose());
  });

  it('updates the simplified pose without exposing the detailed hierarchy', () => {
    const actor = createSoldierActor({
      id: 'mid-pose',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });
    actor.setLod(1);
    const initialWeaponRotation = actor._midParts.weapon.rotation.clone();

    actor.object3d.position.z += 0.34;
    actor.update(0.1, {
      speed: 3.4,
      combatPose: {
        state: WeaponState.WINDUP,
        progress: 1,
        attack: { arc: [0.9, -0.6] },
      },
    });

    expect(actor.detailedRoot.visible).toBe(false);
    expect(actor.midRoot.visible).toBe(true);
    expect(Math.abs(actor._midParts.leftLeg.rotation.x)).toBeGreaterThan(0.05);
    expect(Math.abs(actor._midParts.weapon.rotation.z - initialWeaponRotation.z))
      .toBeGreaterThan(0.2);

    actor.setLod(2);
    expect(actor.detailedRoot.visible).toBe(false);
    expect(actor.midRoot.visible).toBe(false);
    actor.dispose();
  });

  it('separates the near silhouette and rotates the torso into weapon-specific anticipation', () => {
    const sword = createSoldierActor({
      id: 'sword-windup',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });
    const spear = createSoldierActor({
      id: 'spear-windup',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.SPEARMAN,
    });

    expect(sword.object3d.getObjectByName('ShoulderYoke')).toBeTruthy();
    expect(sword._parts.upperBody.name).toBe('UpperBodyPivot');

    sword.update(0, {
      combatPose: {
        state: WeaponState.WINDUP,
        progress: 1,
        attack: { arc: [0.9, -0.6] },
      },
    });
    spear.update(0, {
      combatPose: {
        state: WeaponState.WINDUP,
        progress: 1,
        attack: { thrust: true, arc: [0, 0] },
      },
    });

    expect(Math.abs(sword._parts.upperBody.rotation.y)).toBeGreaterThan(0.55);
    expect(Math.abs(sword._parts.upperBody.rotation.y))
      .toBeGreaterThan(Math.abs(spear._parts.upperBody.rotation.y) + 0.15);
    expect(Math.abs(sword._parts.upperBody.rotation.z)).toBeGreaterThan(0.1);

    sword.dispose();
    spear.dispose();
  });

  it('gives captains a distinct asymmetrical command stance and mantle', () => {
    const captain = createCaptainActor({
      id: 'command-stance',
      factionId: FactionId.SAINT_ORENS,
    });

    captain.update(0, { speed: 0 });
    expect(captain.object3d.getObjectByName('CaptainMantle')).toBeTruthy();
    expect(captain._parts.upperBody.rotation.y).toBeLessThan(-0.08);
    expect(Math.abs(captain._parts.leftArm.rotation.x - captain._parts.rightArm.rotation.x))
      .toBeGreaterThan(0.3);
    expect(captain._parts.head.rotation.y).toBeGreaterThan(0.05);

    captain.dispose();
  });

  it('mounts shields to the left forearm and provides attack-specific clearance', () => {
    const actor = createSoldierActor({
      id: 'shield-clearance',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });

    const { shieldMount, shield, leftForearm } = actor._parts;
    expect(shieldMount.name).toBe('ShieldMount');
    expect(shieldMount.parent).toBe(leftForearm);
    expect(shield.parent).toBe(shieldMount);

    actor.update(0, { speed: 0 });
    const idle = shieldMount.position.clone();
    const idleRotation = shieldMount.rotation.clone();

    actor.update(0, {
      combatPose: {
        state: WeaponState.ACTIVE,
        progress: 0.45,
        attack: { arc: [0.9, -0.4] },
      },
    });
    expect(shieldMount.position.x).toBeLessThan(idle.x - 0.09);
    expect(shieldMount.position.z).toBeLessThan(idle.z - 0.04);
    expect(Math.abs(shieldMount.rotation.y - idleRotation.y)).toBeGreaterThan(0.15);

    actor.update(0, {
      combatPose: { state: WeaponState.BLOCKING, progress: 0 },
    });
    expect(shieldMount.position.z).toBeGreaterThan(idle.z + 0.08);
    expect(shieldMount.rotation.x).toBeGreaterThan(idleRotation.x + 0.15);

    actor.dispose();
  });

  it('keeps stationary feet planted and drives stride phase from distance traveled', () => {
    const actor = createSoldierActor({
      id: 'distance-stride',
      factionId: FactionId.VANGUARD,
      role: SoldierRole.SPEARMAN,
    });

    const initialPhase = actor._stridePhase;
    for (let frame = 0; frame < 60; frame += 1) actor.update(1 / 60, { speed: 3 });
    expect(actor._stridePhase).toBeCloseTo(initialPhase, 10);
    expect(actor._locomotionWeight).toBeLessThan(0.001);
    expect(actor._parts.leftLeg.rotation.x).toBeCloseTo(0, 6);
    expect(actor._parts.rightLeg.rotation.x).toBeCloseTo(0, 6);
    expect(actor._parts.leftLeg.position.y).toBeCloseTo(0.75, 6);
    expect(actor._parts.rightLeg.position.y).toBeCloseTo(0.75, 6);

    actor.object3d.position.z += 0.335;
    actor.update(0.1, { speed: 3.35 });
    const quarterPhase = actor._stridePhase;
    const expectedQuarter = Math.PI * 0.5;
    expect(positiveAngleDelta(initialPhase, quarterPhase)).toBeCloseTo(expectedQuarter, 1);
    expect(actor._locomotionWeight).toBeGreaterThan(0.65);
    expect(actor._animationLayers.locomotion.strideWarp).toBeGreaterThan(1.02);
    expect(Math.abs(actor._parts.leftFoot.userData.contact.roll)).toBeGreaterThan(0.01);

    actor.object3d.position.z += 0.335;
    actor.update(0.1, { speed: 3.35 });
    expect(positiveAngleDelta(initialPhase, actor._stridePhase)).toBeCloseTo(Math.PI, 1);

    actor.dispose();
  });

  it('articulates knees and locks a support foot while the body advances', () => {
    const actor = createSoldierActor({
      id: 'knee-foot-lock',
      factionId: FactionId.VANGUARD,
      role: SoldierRole.MAN_AT_ARMS,
    });
    actor._stridePhase = Math.PI * 2 * 0.08;
    actor.object3d.position.z += 0.12;
    actor.update(0.1, { speed: 1.2, terrainHeight: () => 0 });
    actor.object3d.updateWorldMatrix(true, true);
    const planted = actor._parts.leftFoot.getWorldPosition(new Vector3());

    actor.object3d.position.z += 0.06;
    actor.update(0.1, { speed: 0.6, terrainHeight: () => 0 });
    actor.object3d.updateWorldMatrix(true, true);
    const locked = actor._parts.leftFoot.getWorldPosition(new Vector3());

    expect(actor._parts.leftKnee.name).toBe('KneePivot');
    expect(actor._parts.rightKnee.name).toBe('KneePivot');
    expect(actor._parts.leftFoot.userData.contact.locked).toBe(true);
    expect(horizontalLength(locked.clone().sub(planted))).toBeLessThan(0.01);
    expect(actor._parts.leftKnee.rotation.x).toBeLessThanOrEqual(0.08);

    actor._stridePhase = Math.PI * 2 * 0.78;
    actor.object3d.position.z += 0.08;
    actor.update(0.1, { speed: 0.8, terrainHeight: () => 0 });
    expect(actor._parts.leftKnee.rotation.x).toBeLessThan(-0.35);
    expect(actor._parts.leftFoot.userData.contact.lift).toBeGreaterThan(0.4);

    actor.dispose();
  });

  it('adapts torso, ankle, and leg height numerically to sloped terrain', () => {
    const actor = createSoldierActor({
      id: 'slope-pose',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.SPEARMAN,
    });
    const terrainHeight = (_x, z) => z * 0.25;
    actor.object3d.position.set(0, terrainHeight(0, 0.2), 0.2);
    actor._lastLocomotionPosition.set(0, 0, 0);
    actor.update(0.1, { speed: 2, terrainHeight });

    expect(actor._terrainNormal.z).toBeLessThan(-0.1);
    expect(actor._parts.body.rotation.x).toBeGreaterThan(0.04);
    expect(actor._parts.leftAnkle.rotation.x).toBeGreaterThan(0.1);
    expect(actor._parts.leftLeg.position.y).not.toBeCloseTo(0.75, 2);

    actor.dispose();
  });

  it('layers acceleration lean and turn-in-place over the locomotion base', () => {
    const actor = createSoldierActor({
      id: 'turn-lean',
      factionId: FactionId.VANGUARD,
      role: SoldierRole.MAN_AT_ARMS,
    });
    actor.object3d.position.z += 0.25;
    actor.update(0.1, { speed: 2.5 });
    const accelerationLean = actor._parts.upperBody.rotation.x;

    actor.desiredForward.set(1, 0, 0);
    actor.update(0.1, { speed: 0 });

    expect(accelerationLean).toBeGreaterThan(0.1);
    expect(Math.abs(actor._animationLayers.locomotion.accelerationLean)).toBeGreaterThan(0.02);
    expect(actor._animationLayers.locomotion.turnWeight).toBeGreaterThan(0.5);
    expect(actor._animationLayers.locomotion.turnInPlaceWeight).toBeGreaterThan(0.4);
    expect(actor._parts.leftLeg.rotation.y).toBeGreaterThan(0.1);
    expect(actor._parts.rightLeg.rotation.y).toBeLessThan(-0.1);

    actor.update(0.1, { speed: 0 });
    expect(actor._animationLayers.locomotion.accelerationLean).toBeLessThan(0);

    actor.dispose();
  });

  it('routes shield impact recoil through forearm, shoulder, torso, and rear foot', () => {
    const actor = createSoldierActor({
      id: 'shield-recoil-chain',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });
    const blockPose = { state: WeaponState.BLOCKING, progress: 0 };
    actor.update(0, { combatPose: blockPose });
    const baseline = {
      torso: actor._parts.body.rotation.x,
      shoulder: actor._parts.leftArm.rotation.x,
      forearm: actor._parts.leftForearm.rotation.x,
      shield: actor._parts.shieldMount.rotation.x,
      rearLeg: actor._parts.leftLeg.rotation.x,
      rearKnee: actor._parts.leftKnee.rotation.x,
    };
    actor.combatant.setGuard({
      active: true,
      facing: new Vector3(0, 0, 1),
      now: 1,
      startedAt: 0,
      canParry: false,
      stability: 20,
    });
    actor.combatant.receiveImpact({
      damage: 8,
      damageType: 'blunt',
      direction: new Vector3(0, 0, -1),
      hitZone: 'torso',
      severity: 0.9,
    });
    actor.update(1 / 60, { combatPose: blockPose });

    expect(actor._reaction.kind).toBe('block');
    expect(actor._parts.body.rotation.x).toBeLessThan(baseline.torso - 0.05);
    expect(actor._parts.leftArm.rotation.x).toBeLessThan(baseline.shoulder - 0.15);
    expect(actor._parts.leftForearm.rotation.x).toBeLessThan(baseline.forearm - 0.12);
    expect(actor._parts.shieldMount.rotation.x).toBeGreaterThan(baseline.shield + 0.15);
    expect(actor._parts.leftLeg.rotation.x).toBeGreaterThan(baseline.rearLeg + 0.05);
    expect(actor._parts.leftKnee.rotation.x).toBeLessThan(baseline.rearKnee - 0.08);

    actor.dispose();
  });

  it('keeps locomotion and weapon layers intact while applying additive reaction', () => {
    const actor = createSoldierActor({
      id: 'reaction-layering',
      factionId: FactionId.VANGUARD,
      role: SoldierRole.MAN_AT_ARMS,
    });
    const combatPose = {
      state: WeaponState.WINDUP,
      progress: 0.8,
      attack: { arc: [0.9, -0.4] },
    };
    actor.object3d.position.z += 0.22;
    actor.update(0.1, { speed: 2.2, combatPose });
    const weaponYaw = actor._parts.upperBody.rotation.y;
    const gaitAngle = actor._parts.leftLeg.rotation.x;

    actor.combatant.receiveImpact({
      damage: 4,
      damageType: 'blunt',
      direction: new Vector3(1, 0, -0.2),
      hitZone: 'torso',
      severity: 0.7,
    });
    actor.object3d.position.z += 0.08;
    actor.update(0.05, { speed: 1.6, combatPose });

    expect(actor._animationLayers.locomotion.weight).toBeGreaterThan(0.5);
    expect(actor._animationLayers.weapon.state).toBe(WeaponState.WINDUP);
    expect(actor._animationLayers.weapon.weight).toBeGreaterThan(0.9);
    expect(actor._animationLayers.reaction.kind).toBe('body');
    expect(actor._animationLayers.reaction.weight).toBeGreaterThan(0.8);
    expect(Math.abs(actor._parts.upperBody.rotation.y)).toBeGreaterThan(Math.abs(weaponYaw) * 0.7);
    expect(Math.abs(actor._parts.leftLeg.rotation.x)).toBeGreaterThan(Math.abs(gaitAngle) * 0.25);
    expect(actor._parts.upperBody.rotation.z).toBeLessThan(-0.15);

    actor.dispose();
  });

  it('uses impact direction, outcome, severity, and hit zone for distinct recovering reactions', () => {
    const actor = createSoldierActor({
      id: 'impact-reactions',
      factionId: FactionId.SAINT_ORENS,
      role: SoldierRole.MAN_AT_ARMS,
    });
    const front = new Vector3(0, 0, -1);

    actor.combatant.receiveImpact({
      damage: 5,
      damageType: 'blunt',
      direction: new Vector3(1, 0, -0.2),
      hitZone: 'torso',
      severity: 0.7,
    });
    actor.update(1 / 60);
    const rightBodyLean = actor._parts.upperBody.rotation.z;
    expect(actor._reaction.kind).toBe('body');
    expect(rightBodyLean).toBeLessThan(-0.2);

    actor.combatant.receiveImpact({
      damage: 5,
      damageType: 'blunt',
      direction: new Vector3(-1, 0, -0.2),
      hitZone: 'torso',
      severity: 0.7,
    });
    actor.update(1 / 60);
    expect(actor._parts.upperBody.rotation.z).toBeGreaterThan(0.2);

    actor.combatant.receiveImpact({
      damage: 4,
      damageType: 'blunt',
      direction: front,
      hitZone: 'head',
      severity: 0.75,
    });
    actor.update(1 / 60);
    expect(actor._reaction.kind).toBe('head');
    expect(Math.abs(actor._parts.head.rotation.x)).toBeGreaterThan(0.35);
    expect(Math.abs(actor._parts.leftLeg.rotation.x)).toBeLessThan(0.08);

    actor.combatant.receiveImpact({
      damage: 4,
      damageType: 'blunt',
      direction: new Vector3(-0.8, 0, -0.2),
      hitZone: 'legs',
      severity: 0.75,
    });
    actor.update(1 / 60);
    expect(actor._reaction.kind).toBe('leg');
    expect(Math.abs(actor._parts.leftLeg.rotation.z)).toBeGreaterThan(0.15);
    expect(actor._parts.body.position.y).toBeLessThan(-0.05);

    actor.combatant.setGuard({
      active: true,
      facing: new Vector3(0, 0, 1),
      now: 1,
      startedAt: 0,
      canParry: false,
      stability: 20,
    });
    actor.combatant.receiveImpact({
      damage: 8,
      damageType: 'blunt',
      direction: front,
      hitZone: 'torso',
      severity: 0.8,
    });
    actor.update(1 / 60);
    expect(actor._reaction.kind).toBe('block');
    const blockedShieldPitch = actor._parts.shieldMount.rotation.x;

    actor.combatant.setGuard({
      active: true,
      facing: new Vector3(0, 0, 1),
      now: 1.04,
      startedAt: 1,
      canParry: true,
    });
    actor.combatant.receiveImpact({
      damage: 8,
      damageType: 'blunt',
      direction: new Vector3(0.7, 0, -0.7),
      hitZone: 'torso',
      severity: 0.8,
    });
    actor.update(1 / 60);
    expect(actor._reaction.kind).toBe('parry');
    expect(Math.abs(actor._parts.rightArm.rotation.y)).toBeGreaterThan(0.15);
    expect(actor._parts.shieldMount.rotation.x).toBeLessThan(blockedShieldPitch - 0.1);

    actor.combatant.clearGuard();
    actor.combatant.receiveImpact({
      damage: 3,
      damageType: 'blunt',
      poiseDamage: 999,
      direction: front,
      hitZone: 'torso',
      severity: 0.65,
    });
    actor.update(1 / 60);
    expect(actor._reaction.kind).toBe('stagger');
    expect(Math.abs(actor._parts.upperBody.rotation.x)).toBeGreaterThan(0.35);

    for (let frame = 0; frame < 80; frame += 1) actor.update(1 / 60);
    expect(actor._reaction).toBeNull();
    expect(actor._parts.upperBody.rotation.x).toBeCloseTo(0, 4);
    expect(actor._parts.upperBody.rotation.z).toBeCloseTo(0, 4);
    expect(actor._parts.head.rotation.x).toBeCloseTo(0, 4);

    actor.dispose();
  });

  it('selects three deterministic collapse structures and aligns each to ground', () => {
    const actorsByVariant = new Map();
    for (let index = 0; actorsByVariant.size < 3 && index < 40; index += 1) {
      const actor = createSoldierActor({
        id: `collapse:${index}`,
        factionId: FactionId.VANGUARD,
      });
      if (actorsByVariant.has(actor._deathVariant)) actor.dispose();
      else actorsByVariant.set(actor._deathVariant, actor);
    }

    expect([...actorsByVariant.keys()].sort()).toEqual([0, 1, 2]);
    let repeatVariant = null;
    for (const [variant, actor] of actorsByVariant) {
      if (actor.id === 'collapse:0') repeatVariant = variant;
      actor.combatant.receiveImpact({ damage: 999, damageType: 'blunt' });
      actor.update(1 / 120);
      const firstDisplacement = collapseOriginDisplacement(actor);
      expect(firstDisplacement).toBeLessThan(0.002);
      for (let frame = 0; frame < 29; frame += 1) actor.update(1 / 60);
      const midDisplacement = collapseOriginDisplacement(actor);
      expect(midDisplacement).toBeGreaterThan(0.04);
      expect(midDisplacement).toBeLessThan(0.34);
      for (let frame = 0; frame < 90; frame += 1) actor.update(1 / 60);
      const bounds = new Box3().setFromObject(actor._parts.collapseRoot);
      const finalDisplacement = collapseOriginDisplacement(actor);

      expect(actor.object3d.userData.deathVariant).toBe(variant);
      expect(Math.abs(actor._parts.collapseRoot.rotation.z)
        + Math.abs(actor._parts.collapseRoot.rotation.x)).toBeGreaterThan(1.2);
      expect(finalDisplacement).toBeGreaterThan(midDisplacement);
      expect(finalDisplacement).toBeGreaterThan(0.25);
      expect(finalDisplacement).toBeLessThan(0.38);
      expect(bounds.min.y).toBeGreaterThanOrEqual(-0.08);
      expect(bounds.min.y).toBeLessThan(0.02);
      actor.dispose();
    }

    const repeat = createSoldierActor({
      id: 'collapse:0',
      factionId: FactionId.VANGUARD,
    });
    expect(repeat._deathVariant).toBe(repeatVariant);
    repeat.dispose();
  });

  it('smoothly separates overlapping corpses without moving either actor root', () => {
    const first = createSoldierActor({
      id: 'corpse-separation-a',
      factionId: FactionId.VANGUARD,
    });
    const second = createSoldierActor({
      id: 'corpse-separation-b',
      factionId: FactionId.VANGUARD,
    });
    const corpses = [first, second];
    for (const actor of corpses) actor.setAnimationEnvironment({ queryActors: () => corpses });
    first.setPosition(0, 0, 0);
    second.setPosition(0.05, 0, 0.02);
    first.combatant.receiveImpact({ damage: 999, damageType: 'blunt' });
    second.combatant.receiveImpact({ damage: 999, damageType: 'blunt' });

    let previous = first.getAvoidancePosition(new Vector3());
    let maximumStep = 0;
    for (let frame = 0; frame < 90; frame += 1) {
      first.update(1 / 60);
      second.update(1 / 60);
      const current = first.getAvoidancePosition(new Vector3());
      maximumStep = Math.max(maximumStep, current.distanceTo(previous));
      previous = current;
    }
    const firstFinal = first.getAvoidancePosition(new Vector3());
    const secondFinal = second.getAvoidancePosition(new Vector3());

    expect(first.object3d.position.x).toBeCloseTo(0, 8);
    expect(second.object3d.position.x).toBeCloseTo(0.05, 8);
    expect(firstFinal.distanceTo(secondFinal)).toBeGreaterThan(0.75);
    expect(maximumStep).toBeLessThan(0.2);
    expect(horizontalLength(first._corpsePlacementOffset)).toBeLessThanOrEqual(0.341);
    expect(horizontalLength(second._corpsePlacementOffset)).toBeLessThanOrEqual(0.341);

    first.dispose();
    second.dispose();
  });
});

function positiveAngleDelta(start, end) {
  const tau = Math.PI * 2;
  return ((end - start) % tau + tau) % tau;
}

function horizontalLength(vector) {
  return Math.hypot(vector.x, vector.z);
}

function collapseOriginDisplacement(actor) {
  actor.object3d.updateWorldMatrix(true, true);
  const origin = actor._parts.collapseRoot.getWorldPosition(new Vector3());
  return horizontalLength(origin.sub(actor.object3d.position));
}

function visibleMeshCount(root) {
  if (!root.visible) return 0;
  let count = 0;
  root.traverseVisible((object) => {
    if (object.isMesh) count += 1;
  });
  return count;
}
