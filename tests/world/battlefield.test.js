import { describe, expect, it } from 'vitest';
import { Box3, Matrix4, Vector3 } from 'three';
import { createWorldMaterials } from '../../src/world/materials.js';
import {
  createBaggageEmbankment,
  createDistantBattleBelts,
  createFieldDressing,
} from '../../src/world/battlefield.js';

const sampleHeight = () => 0;

describe('battlefield composition', () => {
  it('keeps the baggage opening traversable while framing it with standards', () => {
    const materials = createWorldMaterials();
    const baggage = createBaggageEmbankment({ materials, sampleHeight });
    const standards = baggage.group.children.filter(
      (child) => child.name === 'BaggageGateStandard',
    );
    const opening = new Vector3(0, 2, 224);

    expect(standards).toHaveLength(2);
    expect(baggage.colliders).toHaveLength(2);
    expect(baggage.colliders.some((collider) => collider.containsPoint(opening))).toBe(false);

    const bounds = new Box3().setFromObject(baggage.group);
    expect(bounds.max.y - bounds.min.y).toBeLessThan(14);
  });

  it('uses instanced low-profile casualties instead of blocking geometry', () => {
    const materials = createWorldMaterials();
    const dressing = createFieldDressing({
      materials,
      sampleHeight,
      quality: 'high',
    });
    const casualties = dressing.children.filter((child) =>
      child.name.startsWith('Fallen'),
    );

    expect(casualties).toHaveLength(2);
    expect(casualties.every((mesh) => mesh.isInstancedMesh)).toBe(true);
    const matrix = new Matrix4();
    const scale = new Vector3();
    casualties[0].getMatrixAt(0, matrix);
    scale.setFromMatrixScale(matrix);
    expect(scale.y).toBeLessThan(1.3);
  });

  it('builds readable distant ranks with spear, cavalry, smoke, and standards', () => {
    const materials = createWorldMaterials();
    const distant = createDistantBattleBelts({
      materials,
      sampleHeight,
      quality: 'medium',
    });

    expect(distant.redRanks.count).toBe(125);
    expect(distant.blueRanks.count).toBe(125);
    expect(distant.banners).toHaveLength(18);
    expect(distant.group.getObjectByName('FarRankSpearForest')?.count).toBeGreaterThan(150);
    expect(distant.group.getObjectByName('FarCavalryHorses')?.count).toBe(20);
    expect(distant.group.getObjectByName('FarBattleSmoke')?.count).toBe(14);
  });
});
