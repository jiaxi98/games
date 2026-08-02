import { describe, expect, it } from 'vitest';
import { createHUD } from '../../src/ui/hud.js';

describe('createHUD', () => {
  it('offers a safe headless adapter for tests and server rendering', () => {
    const hud = createHUD({ document: null });
    expect(hud.root).toBeNull();
    expect(() => {
      hud.setHealth(20, 100);
      hud.setObjective({ id: 'recover', title: 'Recover the standard' });
      hud.setCaptainEncounter({
        visible: true,
        health: 50,
        maxHealth: 100,
        phase: 'pressed',
      });
      hud.showTutorial({ keys: ['R'], text: 'Brace' });
      hud.clearTutorial();
      hud.handleEvent('damage', { intensity: 1 });
      hud.dispose();
    }).not.toThrow();
    expect(hud.getState().disposed).toBe(true);
  });
});
