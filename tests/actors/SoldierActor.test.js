import { describe, expect, it } from 'vitest';
import {
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
});
