import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { FactionId } from '../../src/actors/Factions.js';
import { createCrowdVisuals } from '../../src/simulation/CrowdVisuals.js';

describe('CrowdVisuals', () => {
  it('blends bodies, shields, and directional spears within the requested capacity', () => {
    const visual = createCrowdVisuals({
      capacity: 3,
      factionId: FactionId.VANGUARD,
    });
    visual.setInstances([
      { position: new Vector3(0, 0, 0), heading: 0, state: 'ordered' },
      { position: new Vector3(2, 0, 0), heading: Math.PI * 0.5, state: 'pressured' },
      { position: new Vector3(4, 0, 0), heading: Math.PI, state: 'routed' },
      { position: new Vector3(6, 0, 0), heading: 0, state: 'ordered' },
    ]);
    visual.update(1.25);

    const meshes = visual.object3d.children;
    expect(meshes).toHaveLength(5);
    expect(meshes.every((mesh) => mesh.count === 3)).toBe(true);

    const spearMatrix = new Matrix4();
    meshes[3].getMatrixAt(1, spearMatrix);
    const spearDirection = new Vector3(0, 1, 0).transformDirection(spearMatrix);
    expect(Math.abs(spearDirection.x)).toBeGreaterThan(0.6);

    visual.dispose();
  });
});
