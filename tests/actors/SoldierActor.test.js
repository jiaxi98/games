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

    actor.object3d.position.z += 0.335;
    actor.update(0.1, { speed: 3.35 });
    expect(positiveAngleDelta(initialPhase, actor._stridePhase)).toBeCloseTo(Math.PI, 1);

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
