import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { CollisionWorld } from '../../src/physics/CollisionWorld.js';

describe('CollisionWorld', () => {
  it('grounds a falling capsule on the terrain provider', () => {
    const world = new CollisionWorld();
    world.setGroundHeightProvider(() => 2);

    const result = world.moveCapsule(
      new Vector3(0, 2.2, 0),
      new Vector3(0, -0.5, 0),
      0.35,
      1.8,
    );

    expect(result.position.y).toBe(2);
    expect(result.grounded).toBe(true);
  });

  it('blocks horizontal motion through static boxes', () => {
    const world = new CollisionWorld();
    world.addBox(
      new Vector3(2, 1, 0),
      new Vector3(1, 2, 4),
      { id: 'wall' },
    );

    const result = world.moveCapsule(
      new Vector3(0, 0, 0),
      new Vector3(3, 0, 0),
      0.4,
      1.8,
    );

    expect(result.blockedX).toBe(true);
    expect(result.position.x).toBeCloseTo(1.1, 4);
    expect(result.contacts[0].collider.id).toBe('wall');
  });

  it('does not tunnel through a thin wall during a large movement step', () => {
    const world = new CollisionWorld();
    world.addBox(
      new Vector3(5, 1, 0),
      new Vector3(0.2, 2, 4),
      { id: 'thin-wall' },
    );

    const result = world.moveCapsule(
      new Vector3(0, 0, 0),
      new Vector3(10, 0, 0),
      0.4,
      1.8,
    );

    expect(result.blockedX).toBe(true);
    expect(result.position.x).toBeLessThan(4.6);
  });

  it('prevents standing when a low ceiling overlaps the capsule', () => {
    const world = new CollisionWorld();
    world.addAABB(
      new Vector3(-1, 1.3, -1),
      new Vector3(1, 1.6, 1),
    );

    expect(world.canOccupy(new Vector3(0, 0, 0), 0.35, 1.2)).toBe(true);
    expect(world.canOccupy(new Vector3(0, 0, 0), 0.35, 1.8)).toBe(false);
  });
});
