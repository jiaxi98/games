import { describe, expect, it } from 'vitest';
import {
  Box3,
  Matrix4,
  Vector2,
  Vector3,
} from 'three';
import { createWorldMaterials } from '../../src/world/materials.js';
import {
  createBaggageEmbankment,
  createBurningMill,
  createDistantBattleBelts,
  createFieldDressing,
  createRouteCompositionCells,
  createStoneBridgeAndFord,
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

  it('authors six layered route cells while keeping dense framing outside the lane', () => {
    const composition = createRouteCompositionCells({
      materials: createWorldMaterials(),
      sampleHeight,
      quality: 'medium',
    });
    const cells = composition.children.filter((child) =>
      child.name.startsWith('RouteCompositionCell:'),
    );
    const hedgeBanks = composition.getObjectByName('CompositionHedgeBanks');
    const arrows = composition.getObjectByName('InstancedBattlefieldArrows');
    const footprints = composition.getObjectByName('InstancedRouteFootprints');
    const ruts = composition.getObjectByName('InstancedWagonRuts');

    expect(cells).toHaveLength(6);
    expect(cells.every((cell) => cell.userData.routeComposition.backgroundObjective)).toBe(true);
    expect(hedgeBanks?.count).toBe(12);
    expect(arrows?.count).toBe(120);
    expect(footprints?.count).toBe(90);
    expect(ruts?.count).toBe(36);

    const matrix = new Matrix4();
    const position = new Vector3();
    for (let index = 0; index < hedgeBanks.count; index += 1) {
      hedgeBanks.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      expect(Math.abs(position.x)).toBeGreaterThan(8.5);
    }
  });

  it('scales landmark silhouettes and keeps bridge traversal metadata aligned', () => {
    const materials = createWorldMaterials();
    const mill = createBurningMill({ materials, sampleHeight });
    const bridge = createStoneBridgeAndFord({ materials, sampleHeight });

    expect(mill.group.scale.x).toBeCloseTo(1.3);
    expect(mill.fireSockets[0].y).toBeCloseTo(11.8 * 1.3);
    expect(bridge.group.scale.x).toBeCloseTo(1.28);
    expect(bridge.bridgeSurfaceHeight).toBeCloseTo(3.95 * 1.28);
    expect(bridge.walkableBounds.containsPoint(new Vector2(-7, -174))).toBe(true);
  });
});
