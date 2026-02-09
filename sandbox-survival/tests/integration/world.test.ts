import { describe, expect, it } from 'vitest';
import { bootstrapWorld, generateInitialChunkRing } from '../../src/core/world';

describe('world bootstrap', () => {
  it('creates square chunk queue from render radius', () => {
    const chunks = generateInitialChunkRing(1);
    expect(chunks).toHaveLength(9);
    expect(chunks).toContainEqual({ x: 0, z: 0 });
    expect(chunks).toContainEqual({ x: -1, z: -1 });
    expect(chunks).toContainEqual({ x: 1, z: 1 });
  });

  it('is deterministic for the same seed', () => {
    const a = bootstrapWorld(2026, 2);
    const b = bootstrapWorld(2026, 2);
    expect(a).toEqual(b);
  });
});
