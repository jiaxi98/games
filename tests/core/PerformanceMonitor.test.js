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
    expect(snapshot.p95Ms).toBeGreaterThanOrEqual(snapshot.p50Ms);
    expect(snapshot.maxMs).toBe(50);
    expect(snapshot.renderer).toMatchObject({
      calls: 12,
      geometries: 9,
      programs: 2,
    });
  });
});

