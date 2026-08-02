import { describe, expect, it } from 'vitest';
import {
  Box3,
  BoxGeometry,
  CylinderGeometry,
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
      for (let frame = 0; frame < 90; frame += 1) actor.update(1 / 60);
      const bounds = new Box3().setFromObject(actor._parts.collapseRoot);

      expect(actor.object3d.userData.deathVariant).toBe(variant);
      expect(Math.abs(actor._parts.collapseRoot.rotation.z)
        + Math.abs(actor._parts.collapseRoot.rotation.x)).toBeGreaterThan(1.2);
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
