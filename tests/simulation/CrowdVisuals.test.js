import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { FactionId } from '../../src/actors/Factions.js';
import { createCrowdVisuals } from '../../src/simulation/CrowdVisuals.js';

describe('CrowdVisuals', () => {
  it('blends humanoid bodies, shields, and directional spears', () => {
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
    expect(meshes.map((mesh) => mesh.name)).toEqual([
      'Crowd:body',
      'Crowd:tunic',
      'Crowd:head',
      'Crowd:leftLeg',
      'Crowd:rightLeg',
      'Crowd:spear',
      'Crowd:shield',
    ]);
    expect(meshes.every((mesh) => mesh.count === 4)).toBe(true);

    const spearMatrix = new Matrix4();
    meshes.find((mesh) => mesh.name === 'Crowd:spear').getMatrixAt(1, spearMatrix);
    const spearDirection = new Vector3(0, 1, 0).transformDirection(spearMatrix);
    expect(Math.abs(spearDirection.x)).toBeGreaterThan(0.6);

    visual.dispose();
  });

  it('grows past its initial capacity and maintains dynamic culling bounds for 500+ soldiers', () => {
    const visual = createCrowdVisuals({
      capacity: 8,
      factionId: FactionId.SAINT_ORENS,
    });
    const instances = Array.from({ length: 640 }, (_, index) => ({
      position: new Vector3(index % 40, 0, Math.floor(index / 40) * -1.2),
      heading: 0,
      state: 'ordered',
    }));

    visual.setInstances(instances);
    visual.update(0.5);

    expect(visual.count).toBe(640);
    expect(visual.capacity).toBeGreaterThanOrEqual(640);
    expect(visual.object3d.children.every((mesh) => mesh.count === 640)).toBe(true);
    expect(visual.object3d.children.every((mesh) => mesh.frustumCulled)).toBe(true);
    expect(visual.object3d.children.every((mesh) => mesh.boundingSphere.radius > 20)).toBe(true);
    expect(visual.object3d.children.every((mesh) => mesh.boundingBox.max.x > 38)).toBe(true);

    visual.dispose();
  });
});
