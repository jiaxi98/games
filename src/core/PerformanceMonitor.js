const DEFAULT_HISTORY_SIZE = 360;

export class PerformanceMonitor {
  constructor({ historySize = DEFAULT_HISTORY_SIZE } = {}) {
    this.historySize = historySize;
    this.frameTimes = new Float32Array(historySize);
    this.frameCount = 0;
    this.cursor = 0;
    this.lastTime = null;
    this.lastSnapshotAt = 0;
    this.snapshot = null;
  }

  begin(timeMs) {
    if (this.lastTime !== null) {
      const delta = Math.max(0, timeMs - this.lastTime);
      this.frameTimes[this.cursor] = delta;
      this.cursor = (this.cursor + 1) % this.historySize;
      this.frameCount = Math.min(this.frameCount + 1, this.historySize);
    }
    this.lastTime = timeMs;
  }

  sample(renderer, nowMs = performance.now()) {
    if (this.frameCount === 0) {
      return this.#buildSnapshot(renderer, []);
    }
    if (this.snapshot && nowMs - this.lastSnapshotAt < 500) return this.snapshot;
    const values = Array.from(this.frameTimes.slice(0, this.frameCount)).sort((a, b) => a - b);
    this.snapshot = this.#buildSnapshot(renderer, values);
    this.lastSnapshotAt = nowMs;
    return this.snapshot;
  }

  #buildSnapshot(renderer, values) {
    const percentile = (ratio) => {
      if (!values.length) return 0;
      return values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
    };
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    return {
      frames: values.length,
      meanMs: mean,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: values.at(-1) ?? 0,
      over16Ms: values.filter((value) => value > 16.7).length,
      over33Ms: values.filter((value) => value > 33.3).length,
      renderer: renderer ? {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        lines: renderer.info.render.lines,
        points: renderer.info.render.points,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      } : null,
    };
  }
}

