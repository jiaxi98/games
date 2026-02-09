import { describe, expect, it } from 'vitest';
import { computeWorldBounds, createWorldState } from '../../src/world/world-state';

describe('world state', () => {
  it('generates deterministic resource nodes from a seed', () => {
    const a = createWorldState(20260207, 1);
    const b = createWorldState(20260207, 1);

    expect(a.resourceNodes).toEqual(b.resourceNodes);
    expect(a.resourceNodes.length).toBeGreaterThan(0);
  });

  it('computes finite world bounds for chunk ring', () => {
    const world = createWorldState(20260207, 1);
    const bounds = computeWorldBounds(world.chunkQueue);

    expect(bounds.minX).toBeLessThan(bounds.maxX);
    expect(bounds.minZ).toBeLessThan(bounds.maxZ);
  });
});
