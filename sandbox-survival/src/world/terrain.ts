import * as THREE from 'three';

const DEFAULT_TERRAIN_SEED = 20260207;
export const TERRAIN_MIN_HEIGHT = -2.6;
export const TERRAIN_MAX_HEIGHT = 5.8;
export const RIVER_MIN_WIDTH = 1.35;
export const RIVER_MAX_WIDTH = 2.35;

const SPAWN_FLAT_INNER_RADIUS = 3.2;
const SPAWN_FLAT_OUTER_RADIUS = 8.4;

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function octave(x: number, z: number, frequency: number, phase: number): number {
  return Math.sin((x + phase) * frequency) * Math.cos((z - phase * 0.7) * frequency * 0.84);
}

function ridged(x: number, z: number, frequency: number, phase: number): number {
  const ridge = Math.abs(octave(x, z, frequency, phase));
  return Math.pow(ridge, 1.4);
}

export function sampleRiverCenterZ(x: number, seed = DEFAULT_TERRAIN_SEED): number {
  const basePhase = (seed % 104729) * 0.00089 + 1.3;
  return 6 + Math.sin((x + basePhase * 37) * 0.039) * 8.3 + Math.sin((x - basePhase * 13.2) * 0.083) * 2.4;
}

export function sampleRiverWidth(x: number, seed = DEFAULT_TERRAIN_SEED): number {
  const basePhase = (seed % 104729) * 0.00089 + 1.3;
  const wave = 0.5 + 0.5 * Math.sin((x + basePhase * 21.4) * 0.051);
  return THREE.MathUtils.lerp(RIVER_MIN_WIDTH, RIVER_MAX_WIDTH, wave);
}

export function sampleRiverDistance(x: number, z: number, seed = DEFAULT_TERRAIN_SEED): number {
  return Math.abs(z - sampleRiverCenterZ(x, seed));
}

export function sampleTerrainHeight(x: number, z: number, seed = DEFAULT_TERRAIN_SEED): number {
  const basePhase = (seed % 104729) * 0.00089 + 1.3;
  const warpX = octave(x, z, 0.041, basePhase) * 3.1 + octave(x, z, 0.088, basePhase * 1.9) * 1.2;
  const warpZ = octave(x, z, 0.038, basePhase * 2.1) * 3.2 - octave(x, z, 0.071, basePhase * 2.8) * 1.3;
  const nx = x + warpX;
  const nz = z + warpZ;

  const macro = octave(nx, nz, 0.02, basePhase * 0.7) * 2.7;
  const hills = octave(nx, nz, 0.061, basePhase * 1.3) * 1.35;
  const detail = octave(nx, nz, 0.14, basePhase * 3.8) * 0.42;
  const ridgeBand = ridged(nx, nz, 0.081, basePhase * 2.7) * 1.7;
  const cliffNoise = ridged(nx, nz, 0.161, basePhase * 5.4) * 0.55;

  const riverWidth = sampleRiverWidth(x, seed);
  const valleyDistance = sampleRiverDistance(x, z, seed);
  const valleyCarve = (1 - smoothstep(0.2, riverWidth + 2.7, valleyDistance)) * 1.95;
  const riverCore = (1 - smoothstep(0.08, riverWidth, valleyDistance)) * 2.35;
  const valleyShoulder = smoothstep(riverWidth + 1.8, riverWidth + 5.8, valleyDistance) * 0.64;

  let raw = macro + hills + detail + ridgeBand + cliffNoise - valleyCarve - riverCore + valleyShoulder;
  raw += smoothstep(6.5, 18.5, Math.hypot(x, z)) * 0.7;

  // Keep spawn surroundings flatter for predictable early gameplay.
  const radialDistance = Math.hypot(x, z);
  const terrainBlend = smoothstep(SPAWN_FLAT_INNER_RADIUS, SPAWN_FLAT_OUTER_RADIUS, radialDistance);
  raw = raw * terrainBlend + (1 - terrainBlend) * -0.04;

  return THREE.MathUtils.clamp(raw, TERRAIN_MIN_HEIGHT, TERRAIN_MAX_HEIGHT);
}

export function sampleTerrainColor(height: number): THREE.Color {
  if (height < -1.75) {
    return new THREE.Color(0x31526a);
  }
  if (height < -1.1) {
    return new THREE.Color(0x364e3f);
  }
  if (height < -0.3) {
    return new THREE.Color(0x4a6b45);
  }
  if (height < 1.2) {
    return new THREE.Color(0x628449);
  }
  if (height < 2.8) {
    return new THREE.Color(0x70794d);
  }
  if (height < 4.2) {
    return new THREE.Color(0x7f7c66);
  }
  return new THREE.Color(0x8f8a78);
}
