import { describe, expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { createWorld } from '../../src/world/createWorld.js';

function createTestWorld() {
  return createWorld(new Scene(), null, {
    quality: 'low',
    weather: false,
    shadows: false,
    terrainSegments: 12,
  });
}

function updateAt(world, camera, landmark, state = {}) {
  camera.position.copy(world.landmarks[landmark]);
  camera.position.y += 1.7;
  camera.updateMatrixWorld(true);
  world.update(1 / 60, camera, state);
  return world.getVisibilityState();
}

describe('world-sector visibility', () => {
  it('keeps the opening landmark and adjacent route cells at player start', () => {
    const world = createTestWorld();
    const camera = new PerspectiveCamera();

    const visibility = updateAt(world, camera, 'playerStart', {
      battlePhase: 'opening',
      battleIntensity: 0.8,
    });

    expect(visibility.landmarks.baggage).toBe(true);
    expect(visibility.landmarks.fallenStandard).toBe(true);
    expect(visibility.landmarks.hedgerow).toBe(false);
    expect(visibility.landmarks.mill).toBe(false);
    expect(visibility.landmarks.bridge).toBe(false);
    expect(visibility.routeSectors['RouteCompositionCell:BaggageGate']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:CollapsedCentre']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:RallyCrossroads']).toBe(false);

    const visibleHorizonSectors = Object.values(visibility.horizonSectors)
      .filter(Boolean).length;
    expect(visibleHorizonSectors).toBeGreaterThan(0);
    expect(visibleHorizonSectors).toBeLessThan(6);

    world.dispose();
  });

  it('shows nearby melee landmarks and can retain the signaled crossing objective', () => {
    const world = createTestWorld();
    const camera = new PerspectiveCamera();

    let visibility = updateAt(world, camera, 'meleeLane', {
      battlePhase: 'opening',
      battleIntensity: 0.8,
    });

    expect(visibility.landmarks.baggage).toBe(true);
    expect(visibility.landmarks.hedgerow).toBe(true);
    expect(visibility.landmarks.mill).toBe(true);
    expect(visibility.landmarks.bridge).toBe(false);
    expect(visibility.routeSectors['RouteCompositionCell:BaggageGate']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:CollapsedCentre']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:RallyCrossroads']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:SpearLineApproach']).toBe(false);

    world.update(1 / 60, camera, {
      battlePhase: 'spear_line',
      battleIntensity: 1,
    });
    visibility = world.getVisibilityState();
    expect(visibility.landmarks.bridge).toBe(true);
    expect(visibility.landmarks.spearLine).toBe(true);

    world.dispose();
  });

  it('switches to the crossing sectors and full nearby battle horizon at the bridge', () => {
    const world = createTestWorld();
    const camera = new PerspectiveCamera();

    const visibility = updateAt(world, camera, 'bridge', {
      battlePhase: 'ford',
      battleIntensity: 0.9,
    });

    expect(visibility.landmarks.bridge).toBe(true);
    expect(visibility.landmarks.baggage).toBe(false);
    expect(visibility.landmarks.hedgerow).toBe(false);
    expect(visibility.landmarks.mill).toBe(false);
    expect(visibility.routeSectors['RouteCompositionCell:SpearLineApproach']).toBe(false);
    expect(visibility.routeSectors['RouteCompositionCell:BrookApproach']).toBe(true);
    expect(visibility.routeSectors['RouteCompositionCell:SaintOrensCrossing']).toBe(true);
    expect(Object.values(visibility.horizonSectors).every(Boolean)).toBe(true);

    world.dispose();
  });

  it('uses exit distances to avoid landmark visibility chatter', () => {
    const world = createTestWorld();
    const camera = new PerspectiveCamera();

    camera.position.set(0, world.landmarks.baggageLine.y + 1.7, 65);
    camera.updateMatrixWorld(true);
    world.update(1 / 60, camera, { battlePhase: 'rally', battleIntensity: 0.82 });
    expect(world.getVisibilityState().landmarks.baggage).toBe(true);

    camera.position.z = 50;
    camera.updateMatrixWorld(true);
    world.update(1 / 60, camera, { battlePhase: 'rally', battleIntensity: 0.82 });
    expect(world.getVisibilityState().landmarks.baggage).toBe(true);

    camera.position.z = 35;
    camera.updateMatrixWorld(true);
    world.update(1 / 60, camera, { battlePhase: 'rally', battleIntensity: 0.82 });
    expect(world.getVisibilityState().landmarks.baggage).toBe(false);

    world.dispose();
  });

  it('keeps straight climax routes collision-free and all authored landmarks in bounds', () => {
    const world = createTestWorld();

    expectStraightPathClear(world, world.landmarks.spearLine, world.landmarks.duelPoint);
    expectStraightPathClear(world, world.landmarks.duelPoint, world.landmarks.standardRaise);
    expect(world.duelArenaBounds.containsPoint(new Vector2(
      world.landmarks.duelPoint.x,
      world.landmarks.duelPoint.z,
    ))).toBe(true);
    expect(world.duelArenaBounds.containsPoint(new Vector2(
      world.landmarks.captainFall.x,
      world.landmarks.captainFall.z,
    ))).toBe(true);
    expect(world.bridgeWalkableBounds.containsPoint(new Vector2(
      world.landmarks.standardRaise.x,
      world.landmarks.standardRaise.z,
    ))).toBe(true);
    expect(world.isBlocked(
      world.landmarks.captainFall.clone().add(new Vector3(0, 0.9, 0)),
      0.55,
    )).toBe(false);

    world.dispose();
  });
});

function expectStraightPathClear(world, start, end) {
  const point = new Vector3();
  for (let step = 0; step <= 80; step += 1) {
    point.lerpVectors(start, end, step / 80);
    point.y = world.sampleHeight(point.x, point.z) + 0.9;
    expect(world.isBlocked(point, 0.55)).toBe(false);
  }
}
