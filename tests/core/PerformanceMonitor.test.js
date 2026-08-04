import { describe, expect, it } from 'vitest';
import { PerformanceMonitor } from '../../src/core/PerformanceMonitor.js';

describe('PerformanceMonitor', () => {
  it('reports rolling frame percentiles and renderer counters', () => {
    const monitor = new PerformanceMonitor({ historySize: 5 });
    [0, 10, 30, 45, 95, 111].forEach((time) => monitor.begin(time));
    const snapshot = monitor.sample({
      info: {
        render: { calls: 12, triangles: 300, lines: 4, points: 2 },
        memory: { geometries: 9, textures: 3 },
        programs: [1, 2],
      },
    }, 1000);

    expect(snapshot.frames).toBe(5);
    expect(snapshot.meanFps).toBeGreaterThan(0);
    expect(snapshot.p95Ms).toBeGreaterThanOrEqual(snapshot.p50Ms);
    expect(snapshot.maxMs).toBe(50);
    expect(snapshot.over16Ratio).toBe(2 / 5);
    expect(snapshot.over33Ratio).toBe(1 / 5);
    expect(snapshot.renderer).toMatchObject({
      calls: 12,
      drawCalls: 12,
      triangles: 300,
      geometries: 9,
      programs: 2,
    });
  });

  it('captures stage checkpoints with simulation and visible-sector telemetry', () => {
    const monitor = new PerformanceMonitor({ historySize: 4 });
    monitor.startCheckpoint('spear', {
      timeMs: 100,
      stage: 'break',
      metadata: { seed: 7 },
    });
    [110, 126, 144, 161].forEach((time) => monitor.begin(time));
    const checkpoint = monitor.captureCheckpoint({
      info: {
        render: { calls: 8, triangles: 240, lines: 0, points: 0 },
        memory: { geometries: 6, textures: 2 },
        programs: [1],
      },
    }, 200, {
      simulation: {
        getTelemetrySnapshot: () => ({
          activeSquads: 3,
          lod: { near: 4, mid: 8, far: 12 },
          crowd: { count: 132, capacity: 256, truncated: false },
        }),
      },
      world: {
        getVisibilityState: () => ({
          battlePhase: 'spear_line',
          landmarks: { mill: false, spearLine: true },
          routeSectors: { 'RouteCompositionCell:1': true, 'RouteCompositionCell:2': false },
          horizonSectors: { 'DistantBattleSector:red:0': true },
        }),
      },
    });

    expect(checkpoint).toMatchObject({
      checkpoint: 'spear',
      stage: 'break',
      frames: 4,
      simulation: {
        activeSquads: 3,
        crowd: { count: 132, capacity: 256, truncated: false },
      },
      visibility: {
        battlePhase: 'spear_line',
        visibleSectorCount: 3,
      },
      metadata: { seed: 7 },
    });
    expect(checkpoint.visibility.visibleSectorIds).toEqual([
      'landmark:spearLine',
      'RouteCompositionCell:1',
      'DistantBattleSector:red:0',
    ]);
    expect(monitor.getCheckpoints()).toHaveLength(1);
  });

  it('reports the newest frames in chronological ring-buffer order', () => {
    const monitor = new PerformanceMonitor({ historySize: 3 });
    [0, 10, 30, 60, 100].forEach((time) => monitor.begin(time));
    const snapshot = monitor.sample(null, 100);

    expect(snapshot.frames).toBe(3);
    expect(snapshot.meanMs).toBe(30);
    expect(snapshot.p50Ms).toBe(30);
    expect(snapshot.maxMs).toBe(40);
  });

  it('bounds checkpoint history and returns defensive copies', () => {
    const monitor = new PerformanceMonitor({
      historySize: 2,
      checkpointLimit: 2,
    });
    const renderer = {
      info: {
        render: {},
        memory: {},
        programs: [],
      },
    };

    for (const label of ['recover', 'rally', 'break']) {
      monitor.startCheckpoint(label, { timeMs: 0 });
      monitor.begin(16);
      monitor.captureCheckpoint(renderer, 16);
    }

    const checkpoints = monitor.getCheckpoints();
    expect(checkpoints.map(({ checkpoint }) => checkpoint)).toEqual(['rally', 'break']);
    checkpoints[0].checkpoint = 'mutated';
    expect(monitor.getCheckpoints()[0].checkpoint).toBe('rally');
  });
});
