import * as THREE from 'three';

export function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function bell(value, center, radius) {
  const distance = Math.abs(value - center);
  if (distance >= radius) return 0;
  return 1 - smoothstep(0, radius, distance);
}

export function hash2D(x, z, seed = 0) {
  const value = Math.sin(
    x * 127.1 + z * 311.7 + seed * 74.7,
  ) * 43758.5453123;
  return value - Math.floor(value);
}

export function valueNoise2D(x, z, seed = 0) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smootherstep(0, 1, x - x0);
  const tz = smootherstep(0, 1, z - z0);

  const a = hash2D(x0, z0, seed);
  const b = hash2D(x0 + 1, z0, seed);
  const c = hash2D(x0, z0 + 1, seed);
  const d = hash2D(x0 + 1, z0 + 1, seed);

  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, tx),
    THREE.MathUtils.lerp(c, d, tx),
    tz,
  );
}

export function fbm2D(x, z, {
  seed = 0,
  octaves = 5,
  lacunarity = 2.03,
  gain = 0.5,
} = {}) {
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  let weight = 0;

  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(
      x * frequency,
      z * frequency,
      seed + octave * 19,
    ) * amplitude;
    weight += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return weight > 0 ? total / weight : 0;
}

export function ridgedNoise2D(x, z, options = {}) {
  return 1 - Math.abs(fbm2D(x, z, options) * 2 - 1);
}

export function distanceToSegment2D(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSquared = abx * abx + abz * abz;
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, pz - az);
  }

  const t = clamp01(((px - ax) * abx + (pz - az) * abz) / lengthSquared);
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function distanceToPolyline2D(x, z, points) {
  let distance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    distance = Math.min(
      distance,
      distanceToSegment2D(x, z, a.x, a.y, b.x, b.y),
    );
  }
  return distance;
}

export function createRng(seed = 1) {
  let state = seed >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomRange(random, min, max) {
  return min + (max - min) * random();
}

export function randomSigned(random, magnitude = 1) {
  return (random() * 2 - 1) * magnitude;
}

export function setInstanceTransform(mesh, index, {
  position,
  rotation = null,
  scale = null,
}, scratch = new THREE.Object3D()) {
  scratch.position.copy(position);
  if (rotation) scratch.rotation.copy(rotation);
  else scratch.rotation.set(0, 0, 0);
  if (scale) scratch.scale.copy(scale);
  else scratch.scale.set(1, 1, 1);
  scratch.updateMatrix();
  mesh.setMatrixAt(index, scratch.matrix);
}

export function disposeObject3D(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();

  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
