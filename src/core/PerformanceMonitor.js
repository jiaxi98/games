const DEFAULT_HISTORY_SIZE = 360;
const DEFAULT_CHECKPOINT_LIMIT = 32;

export class PerformanceMonitor {
  constructor({
    historySize = DEFAULT_HISTORY_SIZE,
    checkpointLimit = DEFAULT_CHECKPOINT_LIMIT,
  } = {}) {
    this.historySize = Math.max(1, Math.floor(historySize));
    this.checkpointLimit = Math.max(1, Math.floor(checkpointLimit));
    this.frameTimes = new Float32Array(this.historySize);
    this.frameCount = 0;
    this.cursor = 0;
    this.lastTime = null;
    this.snapshot = null;
    this.activeCheckpoint = null;
    this.checkpoints = [];
  }

  begin(timeMs) {
    if (!Number.isFinite(timeMs)) return;
    if (this.lastTime !== null) {
      const delta = Math.max(0, timeMs - this.lastTime);
      this.frameTimes[this.cursor] = delta;
      this.cursor = (this.cursor + 1) % this.historySize;
      this.frameCount = Math.min(this.frameCount + 1, this.historySize);
    }
    this.lastTime = timeMs;
  }

  reset(timeMs = null) {
    this.frameTimes.fill(0);
    this.frameCount = 0;
    this.cursor = 0;
    this.lastTime = Number.isFinite(timeMs) ? timeMs : null;
    this.snapshot = null;
  }

  startCheckpoint(label, {
    timeMs = null,
    stage = null,
    metadata = null,
  } = {}) {
    this.activeCheckpoint = {
      label: String(label ?? 'checkpoint'),
      stage: stage ?? null,
      metadata: metadata ? { ...metadata } : null,
      startedAtMs: Number.isFinite(timeMs) ? timeMs : null,
    };
    this.reset(timeMs);
    return { ...this.activeCheckpoint };
  }

  sample(renderer, nowMs = defaultNow(), telemetry = {}) {
    if (nowMs && typeof nowMs === 'object') {
      telemetry = nowMs;
      nowMs = defaultNow();
    }
    const values = this.#orderedFrameTimes().sort((a, b) => a - b);
    this.snapshot = this.#buildSnapshot(renderer, values, nowMs, telemetry);
    return this.snapshot;
  }

  captureCheckpoint(renderer, nowMs = defaultNow(), telemetry = {}) {
    const snapshot = this.sample(renderer, nowMs, telemetry);
    const checkpoint = structuredCloneSafe(snapshot);
    this.checkpoints.push(checkpoint);
    if (this.checkpoints.length > this.checkpointLimit) this.checkpoints.shift();
    return checkpoint;
  }

  getCheckpoints() {
    return this.checkpoints.map((checkpoint) => structuredCloneSafe(checkpoint));
  }

  clearCheckpoints() {
    this.checkpoints.length = 0;
  }

  #orderedFrameTimes() {
    if (this.frameCount === 0) return [];
    if (this.frameCount < this.historySize) {
      return Array.from(this.frameTimes.slice(0, this.frameCount));
    }
    const values = new Array(this.frameCount);
    for (let index = 0; index < this.frameCount; index += 1) {
      values[index] = this.frameTimes[(this.cursor + index) % this.historySize];
    }
    return values;
  }

  #buildSnapshot(renderer, values, nowMs, telemetry) {
    const percentile = (ratio) => {
      if (!values.length) return 0;
      return values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))];
    };
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const over16Ms = values.filter((value) => value > 16.7).length;
    const over33Ms = values.filter((value) => value > 33.3).length;
    const simulation = resolveSimulationTelemetry(telemetry);
    const visibility = resolveVisibilityTelemetry(telemetry);
    const stage = telemetry.stage
      ?? telemetry.gameplay?.getState?.().stage
      ?? this.activeCheckpoint?.stage
      ?? null;
    const checkpoint = telemetry.checkpoint
      ?? this.activeCheckpoint?.label
      ?? null;

    return {
      checkpoint,
      stage,
      sampledAtMs: Number.isFinite(nowMs) ? nowMs : null,
      frames: values.length,
      meanMs: mean,
      meanFps: mean > 0 ? 1000 / mean : 0,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: values.at(-1) ?? 0,
      over16Ms,
      over33Ms,
      over16Ratio: values.length ? over16Ms / values.length : 0,
      over33Ratio: values.length ? over33Ms / values.length : 0,
      renderer: renderer ? rendererSnapshot(renderer) : null,
      simulation,
      visibility,
      metadata: telemetry.metadata
        ?? this.activeCheckpoint?.metadata
        ?? null,
    };
  }
}

function rendererSnapshot(renderer) {
  const render = renderer.info?.render ?? {};
  const memory = renderer.info?.memory ?? {};
  const calls = finiteCounter(render.calls);
  return {
    calls,
    drawCalls: calls,
    triangles: finiteCounter(render.triangles),
    lines: finiteCounter(render.lines),
    points: finiteCounter(render.points),
    geometries: finiteCounter(memory.geometries),
    textures: finiteCounter(memory.textures),
    programs: Array.isArray(renderer.info?.programs)
      ? renderer.info.programs.length
      : finiteCounter(renderer.info?.programs?.length),
  };
}

function resolveSimulationTelemetry(telemetry) {
  const source = telemetry.simulation
    ?? telemetry.battlefield?.simulation
    ?? telemetry.battlefield
    ?? null;
  const snapshot = source?.getTelemetrySnapshot?.(telemetry.cameraPosition)
    ?? source?.getTelemetry?.(telemetry.cameraPosition)
    ?? telemetry.simulationTelemetry
    ?? null;
  if (!snapshot) return null;
  return structuredCloneSafe(snapshot);
}

function resolveVisibilityTelemetry(telemetry) {
  const raw = telemetry.visibility
    ?? telemetry.world?.getVisibilityState?.()
    ?? telemetry.visibilityState
    ?? null;
  if (!raw) return null;

  const landmarks = visibleKeys(raw.landmarks);
  const routeSectors = visibleKeys(raw.routeSectors);
  const horizonSectors = visibleKeys(raw.horizonSectors);
  const sectorIds = [
    ...landmarks.map((id) => `landmark:${id}`),
    ...routeSectors,
    ...horizonSectors,
  ];
  return {
    battlePhase: raw.battlePhase ?? null,
    visibleSectorIds: sectorIds,
    visibleSectorCount: sectorIds.length,
    landmarks,
    routeSectors,
    horizonSectors,
  };
}

function visibleKeys(entries) {
  if (!entries) return [];
  if (entries instanceof Map) {
    return [...entries.entries()]
      .filter(([, visible]) => Boolean(visible))
      .map(([id]) => String(id))
      .sort();
  }
  return Object.entries(entries)
    .filter(([, visible]) => Boolean(visible))
    .map(([id]) => id)
    .sort();
}

function finiteCounter(value) {
  return Number.isFinite(value) ? value : 0;
}

function defaultNow() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
