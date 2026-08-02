import { describe, expect, it } from 'vitest';
import { PerspectiveCamera } from 'three';
import { FirstPersonController } from '../../src/player/FirstPersonController.js';
import { CollisionWorld } from '../../src/physics/CollisionWorld.js';

describe('FirstPersonController evade', () => {
  it('performs a bounded backward evade on Alt with no movement input', () => {
    const input = {
      wasPressed: (action) => action === 'evade',
      isDown: () => false,
      getMovementAxes: () => ({ x: 0, y: 0 }),
      consumeLookDelta: () => ({ x: 0, y: 0 }),
    };
    const controller = new FirstPersonController({
      camera: new PerspectiveCamera(),
      input,
      collisionWorld: new CollisionWorld(),
    });
    controller.grounded = true;
    controller.fixedUpdate(1 / 60, { state: { isPlaying: true } });

    expect(controller.evadeRemaining).toBeGreaterThan(0);
    expect(controller.velocity.z).toBeGreaterThan(0);
    expect(controller.evadeCooldownRemaining).toBeGreaterThan(0);
  });
});
