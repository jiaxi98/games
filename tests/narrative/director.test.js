import { describe, expect, it, vi } from 'vitest';
import { CAMPAIGN } from '../../src/narrative/campaign.js';
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

    director.setBattlePhase('assault');
    expect(hud.handleEvent).toHaveBeenCalledWith(
      'battle:phase',
      expect.objectContaining({ phase: 'assault' }),
    );
    expect(hud.handleEvent).toHaveBeenCalledWith(
      'announcement',
      expect.objectContaining({ title: 'COUNTERATTACK' }),
    );

    disconnect();
    director.announce('No longer connected');
    expect(hud.handleEvent).toHaveBeenCalledTimes(2);
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
  });
});
