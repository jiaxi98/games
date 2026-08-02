import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';

const geometries = new Map();
const materials = new Map();

function geometryKey(type, values) {
  return `${type}:${values.map((value) => Number(value).toFixed(4)).join(':')}`;
}

function cachedGeometry(key, create) {
  if (!geometries.has(key)) geometries.set(key, create());
  return geometries.get(key);
}

export function sharedBox(width, height, depth) {
  return cachedGeometry(
    geometryKey('box', [width, height, depth]),
    () => new BoxGeometry(width, height, depth),
  );
}

export function sharedCapsule(radius, length, capSegments = 3, radialSegments = 7) {
  return cachedGeometry(
    geometryKey('capsule', [radius, length, capSegments, radialSegments]),
    () => new CapsuleGeometry(radius, length, capSegments, radialSegments),
  );
}

export function sharedCone(radius, height, radialSegments = 8) {
  return cachedGeometry(
    geometryKey('cone', [radius, height, radialSegments]),
    () => new ConeGeometry(radius, height, radialSegments),
  );
}

export function sharedCylinder(radiusTop, radiusBottom, height, radialSegments = 8) {
  return cachedGeometry(
    geometryKey('cylinder', [radiusTop, radiusBottom, height, radialSegments]),
    () => new CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
  );
}

export function sharedSphere(
  radius,
  widthSegments = 8,
  heightSegments = 6,
  phiStart = 0,
  phiLength = Math.PI * 2,
  thetaStart = 0,
  thetaLength = Math.PI,
) {
  return cachedGeometry(
    geometryKey('sphere', [
      radius,
      widthSegments,
      heightSegments,
      phiStart,
      phiLength,
      thetaStart,
      thetaLength,
    ]),
    () => new SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
      phiStart,
      phiLength,
      thetaStart,
      thetaLength,
    ),
  );
}

export function sharedTorus(radius, tube, radialSegments = 6, tubularSegments = 12) {
  return cachedGeometry(
    geometryKey('torus', [radius, tube, radialSegments, tubularSegments]),
    () => new TorusGeometry(radius, tube, radialSegments, tubularSegments),
  );
}

export function sharedMaterial(color, roughness, metalness = 0) {
  const key = `${color}:${roughness.toFixed(3)}:${metalness.toFixed(3)}`;
  if (!materials.has(key)) {
    materials.set(key, new MeshStandardMaterial({
      color,
      roughness,
      metalness,
      flatShading: true,
    }));
  }
  return materials.get(key);
}

export function getSoldierAssetStats() {
  return { geometries: geometries.size, materials: materials.size };
}

