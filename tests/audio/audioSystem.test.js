import { describe, expect, it } from 'vitest';
import { createAudioSystem } from '../../src/audio/audioSystem.js';

describe('createAudioSystem', () => {
  it('degrades safely when WebAudio is unavailable', async () => {
    const system = createAudioSystem();
    expect(system.getState()).toMatchObject({
      contextState: 'uninitialised',
      started: false,
      disposed: false,
    });
    expect(await system.start()).toBe(false);
    expect(() => {
      system.footstep({ material: 'mud' });
      system.impact({ material: 'armor' });
      system.handleEvent('battle:phase', { phase: 'climax' });
      system.update(1 / 60);
    }).not.toThrow();
    await system.dispose();
    expect(system.getState().disposed).toBe(true);
  });

  it('tracks intensity and movement without requiring an audio context', () => {
    const system = createAudioSystem();
    system.setBattleIntensity(0.8);
    system.setWeatherIntensity(0.65);
    system.setMovement({ amount: 0.7 });
    expect(system.getState()).toMatchObject({
      battleIntensity: 0.8,
      weatherIntensity: 0.65,
      movementAmount: 0.7,
    });
  });
});
