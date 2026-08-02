import { describe, expect, it } from 'vitest';
import { MissionStage, MissionState } from '../../src/gameplay/MissionState.js';

describe('MissionState', () => {
  it('runs the complete recover, rally, break, captain, and bridge flow', () => {
    const mission = new MissionState({
      rallyRequired: 2,
      breakRequired: 3,
    });

    expect(mission.stage).toBe(MissionStage.RECOVER);
    expect(mission.recoverStandard()).toMatchObject({
      previous: MissionStage.RECOVER,
      current: MissionStage.RALLY,
    });

    expect(mission.command('rally', {
      nearRally: true,
      affected: 1,
    })).toBeNull();
    expect(mission.recordKill({ nearRally: true })).toMatchObject({
      current: MissionStage.BREAK,
    });

    mission.command('brace', { nearSpearLine: true, affected: 1 });
    expect(mission.command('advance', {
      nearSpearLine: true,
      affected: 1,
    })).toBeNull();
    expect(mission.recordKill({ nearSpearLine: true })).toMatchObject({
      current: MissionStage.CAPTAIN,
    });

    expect(mission.defeatCaptain()).toMatchObject({
      current: MissionStage.VICTORY,
    });
    expect(mission.secureBridge({ nearBridge: true, interacted: true })).toMatchObject({
      current: MissionStage.WON,
    });
    expect(mission.progress).toBe(1);
  });

  it('does not advance from commands given in the wrong place or with no retinue', () => {
    const mission = new MissionState({ rallyRequired: 1 });
    mission.recoverStandard();

    expect(mission.command('rally', {
      nearRally: false,
      affected: 2,
    })).toBeNull();
    expect(mission.command('rally', {
      nearRally: true,
      affected: 0,
    })).toBeNull();
    expect(mission.stage).toBe(MissionStage.RALLY);

    expect(mission.command('rally', {
      nearRally: true,
      affected: 1,
    })).toMatchObject({ current: MissionStage.BREAK });
  });

  it('provides skill-based morale and rout fallbacks rather than timer-only progress', () => {
    const mission = new MissionState({
      rallyStableSeconds: 2,
      routedBreakSeconds: 1,
    });
    mission.recoverStandard();

    mission.update({
      delta: 3,
      nearRally: false,
      alliedMorale: 0.9,
      alliedAlive: 8,
    });
    expect(mission.stage).toBe(MissionStage.RALLY);

    expect(mission.update({
      delta: 2,
      nearRally: true,
      alliedMorale: 0.6,
      alliedAlive: 8,
    })).toMatchObject({ current: MissionStage.BREAK });

    mission.update({
      delta: 2,
      enemyMorale: 0.8,
      enemyAlive: 10,
      enemyRouted: false,
    });
    expect(mission.stage).toBe(MissionStage.BREAK);

    expect(mission.update({
      delta: 1,
      enemyMorale: 0.25,
      enemyAlive: 7,
      enemyRouted: false,
    })).toMatchObject({ current: MissionStage.CAPTAIN });
  });

  it('requires the captain to be defeated and an explicit bridge interaction', () => {
    const mission = new MissionState({
      rallyRequired: 1,
      breakRequired: 1,
    });
    mission.recoverStandard();
    mission.command('rally', { nearRally: true, affected: 1 });
    mission.recordKill({ nearSpearLine: true });

    expect(mission.stage).toBe(MissionStage.CAPTAIN);
    expect(mission.secureBridge({ nearBridge: true, interacted: true })).toBeNull();
    expect(mission.update({ captainAlive: true })).toBeNull();
    expect(mission.update({ captainAlive: false })).toMatchObject({
      current: MissionStage.VICTORY,
    });
    expect(mission.secureBridge({ nearBridge: true, interacted: false })).toBeNull();
    expect(mission.secureBridge({ nearBridge: false, interacted: true })).toBeNull();
    expect(mission.secureBridge({ nearBridge: true, interacted: true })).toMatchObject({
      current: MissionStage.WON,
    });
  });

  it('enters a coherent terminal death state and records the failed objective', () => {
    const mission = new MissionState();
    mission.recoverStandard();

    expect(mission.die()).toMatchObject({
      previous: MissionStage.RALLY,
      current: MissionStage.DEAD,
    });
    expect(mission.snapshot()).toMatchObject({
      stage: MissionStage.DEAD,
      failedAt: MissionStage.RALLY,
    });
    expect(mission.recoverStandard()).toBeNull();
    expect(mission.die()).toBeNull();
  });
});
