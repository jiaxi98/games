import { describe, expect, it } from 'vitest';
import { decideGather, decidePlacement } from '../../src/gameplay/interactions';
import type { ResourceNode } from '../../src/world/resources';

const sampleResource: ResourceNode = {
  id: 'sample',
  kind: 'wood',
  position: { x: 0, y: 0.5, z: 0 },
  yieldAmount: 2,
  wearCost: 1.2,
};

describe('interaction rules', () => {
  it('accepts valid gather target with tool and range', () => {
    const decision = decideGather({
      canUseTool: true,
      target: sampleResource,
      distance: 2.1,
      alreadyHarvested: false,
    });

    expect(decision.ok).toBe(true);
    expect(decision.amount).toBe(2);
    expect(decision.kind).toBe('wood');
  });

  it('rejects gather attempts when tool is unavailable', () => {
    const decision = decideGather({
      canUseTool: false,
      target: sampleResource,
      distance: 1,
      alreadyHarvested: false,
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('durability');
  });

  it('enforces stone support placement rule when structures exist', () => {
    const decision = decidePlacement({
      selectedKind: 'stone',
      selectedCount: 1,
      candidate: { x: 6, y: 0.5, z: 6 },
      playerPosition: { x: 0, y: 1.7, z: 0 },
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      placedStructures: [
        {
          id: 'structure:wood:1',
          kind: 'wood',
          position: { x: 0, y: 0.5, z: 0 },
        },
      ],
    });

    expect(decision.ok).toBe(false);
    expect(decision.reason).toContain('adjacent support');
  });

  it('allows supported stone placement', () => {
    const decision = decidePlacement({
      selectedKind: 'stone',
      selectedCount: 1,
      candidate: { x: 1, y: 0.5, z: 0 },
      playerPosition: { x: 4, y: 1.7, z: 0 },
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      placedStructures: [
        {
          id: 'structure:wood:1',
          kind: 'wood',
          position: { x: 0, y: 0.5, z: 0 },
        },
      ],
    });

    expect(decision.ok).toBe(true);
  });
});
