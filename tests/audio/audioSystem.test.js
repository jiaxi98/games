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
    system.handleEvent('battle:phase', { phase: 'spear_line' });
    system.setWeatherIntensity(0.65);
    system.setMovement({ amount: 0.7 });
    expect(system.getState()).toMatchObject({
      battleIntensity: 1,
      weatherIntensity: 0.65,
      movementAmount: 0.7,
    });
  });

  it('tracks terminal mix states and accepts differentiated combat semantics headlessly', () => {
    const system = createAudioSystem();
    expect(() => {
      system.handleEvent('combat:impact', { result: { outcome: 'parried' } });
      system.handleEvent('combat:impact', { result: { outcome: 'blocked' } });
      system.handleEvent('combat:impact', { result: { outcome: 'guard-broken' } });
      system.handleEvent('combat:exhausted');
      system.handleEvent('command:issued', { command: 'advance', success: true });
      system.handleEvent('battlefield:cohesion', { state: 'routed' });
      system.handleEvent('battlefield:reversal', { id: 'standard-recovered' });
      system.handleEvent('mission:fail');
    }).not.toThrow();
    expect(system.getState().mixState).toBe('death');

    system.handleEvent('resume');
    expect(system.getState().mixState).toBe('playing');
    system.handleEvent('victory');
    expect(system.getState().mixState).toBe('victory');
  });
});
