import { describe, expect, test } from 'vitest';
import { resolvePositionAgainstImportColliders, type ImportedCollisionProxy } from '../../src/world/import/asset-loader';

describe('import collision proxy resolution', () => {
  test('pushes player outside blocking aabb core', () => {
    const collider: ImportedCollisionProxy = {
      id: 'test-box',
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 3, z: 2 },
      blocking: true,
    };

    const previous = { x: -1, y: 1.7, z: 1 };
    const next = { x: 0.8, y: 1.7, z: 1 };

    const resolved = resolvePositionAgainstImportColliders(previous, next, [collider], 0.4);

    expect(resolved.x).toBeCloseTo(-0.4, 5);
    expect(resolved.z).toBeCloseTo(1, 5);
  });
});
