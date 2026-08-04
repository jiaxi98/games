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

  it('authors a clear south bridgehead arena with bounded landmarks and low center framing', () => {
    const bridge = createStoneBridgeAndFord({
      materials: createWorldMaterials(),
      sampleHeight,
      quality: 'medium',
    });
    const {
      duelPoint,
      captainFall,
      bridgeGuardPoint,
      southApproach,
      standardRaise,
      postKillRoute,
    } = bridge.landmarks;

    expect(bridge.duelArenaBounds.containsPoint(new Vector2(
      duelPoint.x,
      duelPoint.z,
    ))).toBe(true);
    expect(bridge.duelArenaBounds.containsPoint(new Vector2(
      captainFall.x,
      captainFall.z,
    ))).toBe(true);
    expect(bridge.walkableBounds.containsPoint(new Vector2(
      standardRaise.x,
      standardRaise.z,
    ))).toBe(true);
    expect(southApproach.z).toBeGreaterThan(duelPoint.z);
    expect(postKillRoute.z).toBeLessThan(bridgeGuardPoint.z);

    const centreRay = new Box3().setFromCenterAndSize(
      new Vector3(-7, 3.1, -151),
      new Vector3(10, 4.2, 30),
    );
    const blockingStone = [];
    bridge.group.traverse((object) => {
      if (
        !object.isMesh
        || !['BridgeParapet', 'BridgeApproachWall'].includes(object.name)
      ) return;
      const bounds = new Box3().setFromObject(object);
      if (bounds.intersectsBox(centreRay)) blockingStone.push(bounds);
    });
    expect(blockingStone).toHaveLength(0);

    const parapets = [];
    bridge.group.traverse((object) => {
      if (object.name === 'BridgeParapet') parapets.push(object);
    });
    const largestParapet = Math.max(...parapets.map((parapet) => (
      new Box3().setFromObject(parapet).getSize(new Vector3()).z
    )));
    expect(largestParapet).toBeLessThan(22);
    expect(bridge.group.getObjectByName('BridgeheadSmoke')?.count).toBe(5);
    expect(bridge.group.getObjectByName('BridgeheadCaptainBanner')).toBeTruthy();
    expect(bridge.group.getObjectByName('AshenStandardRaiseSocket')).toBeTruthy();
  });

  it('keeps the south approach, duel floor, and post-kill bridge route collision-free', () => {
    const bridge = createStoneBridgeAndFord({
      materials: createWorldMaterials(),
      sampleHeight,
    });
    const route = [
      bridge.landmarks.southApproach,
      bridge.landmarks.duelPoint,
      bridge.landmarks.bridgeGuardPoint,
      bridge.landmarks.postKillRoute,
      new Vector3(-7, bridge.bridgeSurfaceHeight, -174),
    ];

    for (let segment = 0; segment < route.length - 1; segment += 1) {
      for (let step = 0; step <= 24; step += 1) {
        const point = route[segment].clone().lerp(route[segment + 1], step / 24);
        expect(bridge.colliders.some(
          (collider) => horizontalCircleIntersectsBox(point, 0.38, collider),
        )).toBe(false);
      }
    }
  });

  it('places the captain fall landmark beside the clear lane and outside stone blockers', () => {
    const bridge = createStoneBridgeAndFord({
      materials: createWorldMaterials(),
      sampleHeight,
    });
    const { captainFall, duelPoint, bridgeGuardPoint } = bridge.landmarks;

    expect(distanceToSegment2D(captainFall, duelPoint, bridgeGuardPoint)).toBeGreaterThan(4);
    expect(bridge.colliders.some(
      (collider) => horizontalCircleIntersectsBox(captainFall, 1.15, collider),
    )).toBe(false);
  });
});

function horizontalCircleIntersectsBox(point, radius, box) {
  const closestX = Math.max(box.min.x, Math.min(point.x, box.max.x));
  const closestZ = Math.max(box.min.z, Math.min(point.z, box.max.z));
  return Math.hypot(point.x - closestX, point.z - closestZ) < radius;
}

function distanceToSegment2D(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, (
      (point.x - start.x) * dx + (point.z - start.z) * dz
    ) / lengthSquared))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * t),
    point.z - (start.z + dz * t),
  );
}
