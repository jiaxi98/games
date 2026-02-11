import planck from 'planck';
import { describe, expect, it } from 'vitest';
import { hasMeaningfulMotion, phaseLabel, phaseMessage, shouldCountStationaryFrame } from '../../src/core/round';
import { createPhysicsScene } from '../../src/core/scene';

describe('round helpers', () => {
  it('does not count stationary frame while structure is still moving', () => {
    expect(shouldCountStationaryFrame(0.05, 0.06, true)).toBe(false);
  });

  it('counts stationary frame only when bird is still and scene is calm', () => {
    expect(shouldCountStationaryFrame(0.05, 0.06, false)).toBe(true);
    expect(shouldCountStationaryFrame(0.8, 0.06, false)).toBe(false);
  });

  it('detects meaningful motion for non-bird entities', () => {
    const scene = createPhysicsScene();
    const movingWood = [...scene.entities.values()].find((entity) => entity.kind === 'wood');
    if (!movingWood) {
      throw new Error('Expected at least one wood entity in default scene.');
    }

    movingWood.body.setLinearVelocity(planck.Vec2(0.45, 0));
    expect(hasMeaningfulMotion(scene, { excludeEntityIds: [scene.bird.id] })).toBe(true);
  });

  it('returns false when all tracked entities are below motion thresholds', () => {
    const scene = createPhysicsScene();
    for (const entity of scene.entities.values()) {
      entity.body.setLinearVelocity(planck.Vec2(0, 0));
      entity.body.setAngularVelocity(0);
    }
    expect(hasMeaningfulMotion(scene, { excludeEntityIds: [scene.bird.id] })).toBe(false);
  });

  it('formats phase labels and messages consistently', () => {
    expect(phaseLabel('resolved', 'victory')).toBe('Resolved (Victory)');
    expect(phaseMessage('resolved', 'defeat')).toBe('No more effective motion.');
  });
});
