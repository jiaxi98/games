import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = path.resolve(process.cwd(), '..');
const baselinePath = process.argv[2] ?? path.join(repoRoot, 'docs', 'sandbox-survival-baseline-part0.json');
const candidatePath = process.argv[3] ?? path.join(repoRoot, 'docs', 'sandbox-survival-baseline.json');

const FPS_RATIO = 0.85;
const STARTUP_RATIO = 1.2;

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function average(values) {
  if (values.length === 0) {
    return Number.NaN;
  }
  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

function summarize(report) {
  const fpsValues = [];
  const startupValues = [];

  for (const row of report.results ?? []) {
    const fps = toNumber(row?.fps?.avgFps);
    const startup = toNumber(row?.startupMs);
    if (Number.isFinite(fps)) {
      fpsValues.push(fps);
    }
    if (Number.isFinite(startup)) {
      startupValues.push(startup);
    }
  }

  return {
    fps: average(fpsValues),
    startupMs: average(startupValues),
    samples: Math.min(fpsValues.length, startupValues.length),
  };
}

function format(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

async function readJson(filePath) {
  const payload = await readFile(filePath, 'utf8');
  return JSON.parse(payload);
}

async function main() {
  const baseline = await readJson(baselinePath);
  const candidate = await readJson(candidatePath);

  const base = summarize(baseline);
  const next = summarize(candidate);

  if (base.samples === 0 || next.samples === 0) {
    throw new Error('insufficient samples in baseline reports');
  }

  const fpsFloor = base.fps * FPS_RATIO;
  const startupCeiling = base.startupMs * STARTUP_RATIO;

  const fpsPass = next.fps >= fpsFloor;
  const startupPass = next.startupMs <= startupCeiling;

  console.log(`baseline fps avg: ${format(base.fps)} | candidate fps avg: ${format(next.fps)}`);
  console.log(`baseline startup avg: ${format(base.startupMs)}ms | candidate startup avg: ${format(next.startupMs)}ms`);
  console.log(`fps threshold (>= ${format(fpsFloor)}): ${fpsPass ? 'PASS' : 'FAIL'}`);
  console.log(`startup threshold (<= ${format(startupCeiling)}ms): ${startupPass ? 'PASS' : 'FAIL'}`);

  if (!fpsPass || !startupPass) {
    process.exitCode = 1;
  }
}

await main();
