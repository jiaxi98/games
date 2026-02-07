import { describe, expect, it } from 'vitest';
import { POSITION_ITERATIONS, TIME_STEP, VELOCITY_ITERATIONS } from '../../src/core/constants';
import { createPhysicsScene } from '../../src/core/scene';

describe('scene stability', () => {
  it('keeps initial structure stable before any bird launch', () => {
    const scene = createPhysicsScene();
    const tracked = [...scene.entities.values()]
      .filter((entity) => entity.kind !== 'bird')
      .map((entity) => ({
        id: entity.id,
        x: entity.body.getPosition().x,
        y: entity.body.getPosition().y,
      }));

    for (let step = 0; step < 240; step += 1) {
      scene.world.step(TIME_STEP, VELOCITY_ITERATIONS, POSITION_ITERATIONS);
    }

    for (const item of tracked) {
      const entity = scene.entities.get(item.id);
      expect(entity).toBeDefined();
      if (!entity) {
        continue;
      }
      const position = entity.body.getPosition();
      const displacement = Math.hypot(position.x - item.x, position.y - item.y);
      expect(displacement).toBeLessThan(0.12);
      expect(Math.abs(entity.body.getAngle())).toBeLessThan(0.14);
      expect(position.y).toBeLessThan(scene.groundY + 0.5);
    }
  });
});
