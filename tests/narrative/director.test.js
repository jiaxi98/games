import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN } from '../../src/narrative/campaign.js';
import { BattlePhase } from '../../src/narrative/battlePhases.js';
import { createNarrativeDirector } from '../../src/narrative/director.js';

describe('createNarrativeDirector', () => {
  it('runs the Saint-Orens objective flow in order', () => {
    const director = createNarrativeDirector();
    const observed = [];
    director.on('*', (event) => observed.push(event));

    director.startMission({ objectiveDelay: 1, barkDelay: 99 });
    expect(director.getState().missionState).toBe('active');
    expect(observed[0].type).toBe('mission:start');
    expect(observed[1]).toMatchObject({
      type: 'announcement',
      title: 'Recover the Ashen Standard',
    });

    director.update(1);
    expect(director.getState().objective.id).toBe('recover');
    director.completeObjective('recover', { delay: 0.5 });
    director.update(0.5);
    expect(director.getState().objective.id).toBe('rally');
  });

  it('connects all director events to a HUD adapter', () => {
    const director = createNarrativeDirector();
    const hud = { handleEvent: vi.fn() };
    const disconnect = director.connectHUD(hud);

    director.setBattlePhase(BattlePhase.SPEAR_LINE);
    expect(hud.handleEvent).toHaveBeenCalledWith(
      'battle:phase',
      expect.objectContaining({
        phase: BattlePhase.SPEAR_LINE,
        intensity: 1,
      }),
    );
    expect(hud.handleEvent).toHaveBeenCalledWith(
      'announcement',
      expect.objectContaining({ title: 'THE SPEARS ADVANCE' }),
    );

    disconnect();
    director.announce('No longer connected');
    expect(hud.handleEvent).toHaveBeenCalledTimes(2);
  });

  it('forwards mission-owned objectives without scheduling an automatic replacement', () => {
    const director = createNarrativeDirector();
    const observed = [];
    director.on('*', (event) => observed.push(event));

    director.startMission({
      announce: false,
      setObjective: false,
      barkDelay: 99,
    });
    director.handleEvent('objective:set', {
      authority: 'mission',
      objective: {
        id: 'break',
        title: 'Break the spear line',
        detail: 'Brace, then advance.',
      },
    });
    director.update(10);

    expect(director.getState().objective).toMatchObject({
      id: 'break',
      detail: 'Brace, then advance.',
    });
    expect(observed.filter(({ type }) => type === 'objective:set')).toHaveLength(1);
  });

  it('uses grounded 1356 campaign framing', () => {
    expect(CAMPAIGN).toMatchObject({
      title: 'THE ASHEN STANDARD',
      subtitle: 'Battle of Saint-Orens Ford',
      date: 'Autumn 1356',
      place: 'Gascony',
    });
    expect(CAMPAIGN.mission.objectives.map(({ id }) => id)).toEqual([
      'recover',
      'rally',
      'break',
      'captain',
      'victory',
    ]);
    expect(CAMPAIGN.endings.failureByStage.break.title).toBe('The Assault Is Repulsed');
  });
});
