import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Vec3 } from '../../contracts/game-state';
import type { MapPreset } from '../map-presets';
import type { TravelNode } from '../transport-graph';
import {
  buildMapManifestAssetPath,
  createEmptyAssetManifest,
  parseAssetManifest,
  type ImportedAssetRecord,
  type MapAssetManifest,
} from './asset-manifest';

const manifestModules = import.meta.glob('../../../assets/maps/*/manifest.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const glbModules = import.meta.glob('../../../assets/**/*.glb?url', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const manifestByPath = new Map<string, unknown>();
for (const [modulePath, moduleValue] of Object.entries(manifestModules)) {
  manifestByPath.set(normalizeAssetModulePath(modulePath), moduleValue);
}

const glbUrlByPath = new Map<string, string>();
for (const [modulePath, moduleValue] of Object.entries(glbModules)) {
  glbUrlByPath.set(normalizeAssetModulePath(modulePath), moduleValue);
}

export interface ImportedCollisionProxy {
  id: string;
  min: Vec3;
  max: Vec3;
  blocking: boolean;
}

export interface ImportedLandmarkMarker {
  id: string;
  label: string;
  position: Vec3;
  interactable: boolean;
  source: 'glb' | 'fallback';
}

export interface ImportBudget {
  maxTriangles: number;
  maxMaterials: number;
  maxTextureEdge: number;
}

export interface ImportBudgetSnapshot {
  triangles: number;
  materials: number;
  maxTextureEdge: number;
  downgraded: boolean;
  reasons: string[];
}

export interface ImportedAssetLoadSummary {
  mapKey: string;
  manifestPath: string;
  requested: number;
  loaded: number;
  fallback: number;
  skipped: number;
  issues: string[];
  collisionProxies: ImportedCollisionProxy[];
  travelNodes: TravelNode[];
  landmarkMarkers: ImportedLandmarkMarker[];
  budget: ImportBudgetSnapshot;
}

export interface ImportedAssetLoadOptions {
  budget?: ImportBudget;
  onStatus?: (message: string) => void;
  onIssue?: (issue: string) => void;
  glbLoader?: (url: string) => Promise<THREE.Object3D>;
}

export const DEFAULT_IMPORT_BUDGET: ImportBudget = {
  maxTriangles: 120_000,
  maxMaterials: 18,
  maxTextureEdge: 2_048,
};

export async function loadImportedAssetsForMap(
  mapPreset: MapPreset,
  parent: THREE.Object3D,
  options: ImportedAssetLoadOptions = {},
): Promise<ImportedAssetLoadSummary> {
  const budget = options.budget ?? DEFAULT_IMPORT_BUDGET;
  const loader = options.glbLoader ?? createDefaultGlbLoader();

  const manifestPath = mapPreset.importManifestPath ?? buildMapManifestAssetPath(mapPreset.key);
  const manifestLoad = loadManifestForMap(mapPreset.key, manifestPath);

  const issues = [...manifestLoad.issues];
  if (issues.length > 0) {
    for (const issue of issues) {
      options.onIssue?.(issue);
    }
  }

  const manifest = manifestLoad.manifest ?? createEmptyAssetManifest(mapPreset.key);
  const group = new THREE.Group();
  group.name = `imported-assets:${mapPreset.key}`;
  parent.add(group);

  const summary: ImportedAssetLoadSummary = {
    mapKey: mapPreset.key,
    manifestPath,
    requested: manifest.assets.length,
    loaded: 0,
    fallback: 0,
    skipped: 0,
    issues,
    collisionProxies: [],
    travelNodes: [],
    landmarkMarkers: [],
    budget: {
      triangles: 0,
      materials: 0,
      maxTextureEdge: 0,
      downgraded: false,
      reasons: [],
    },
  };

  if (manifest.assets.length === 0) {
    options.onStatus?.('imports: no assets configured');
    return summary;
  }

  options.onStatus?.(`imports: loading 0/${manifest.assets.length}`);

  const loadResults = await Promise.all(
    manifest.assets.map(async (record, index) => {
      const outcome = await loadRecord(record, mapPreset.key, loader);
      const landmarkMarkers = buildLandmarkMarkers(record, outcome.source);
      const collisionProxy = buildCollisionProxy(record);
      const travelNodes = buildTravelNodes(record);
      return {
        index,
        record,
        outcome,
        landmarkMarkers,
        collisionProxy,
        travelNodes,
      };
    }),
  );

  for (const result of loadResults) {
    group.add(result.outcome.object);

    if (result.outcome.source === 'glb') {
      summary.loaded += 1;
    } else {
      summary.fallback += 1;
    }

    if (result.collisionProxy) {
      summary.collisionProxies.push(result.collisionProxy);
    }

    summary.travelNodes.push(...result.travelNodes);
    summary.landmarkMarkers.push(...result.landmarkMarkers);

    for (const issue of result.outcome.issues) {
      const namespacedIssue = `[${result.record.id}] ${issue}`;
      summary.issues.push(namespacedIssue);
      options.onIssue?.(namespacedIssue);
    }

    options.onStatus?.(`imports: loading ${result.index + 1}/${manifest.assets.length}`);
  }

  summary.budget = applyBudgetGuardrails(group, budget);
  if (summary.budget.downgraded) {
    for (const reason of summary.budget.reasons) {
      const message = `[budget] ${reason}`;
      summary.issues.push(message);
      options.onIssue?.(message);
    }
  }

  options.onStatus?.(
    summary.issues.length > 0
      ? `imports: loaded ${summary.loaded}/${summary.requested} (${summary.issues.length} warnings)`
      : `imports: loaded ${summary.loaded}/${summary.requested}`,
  );

  return summary;
}

export function resolvePositionAgainstImportColliders(
  previous: Vec3,
  next: Vec3,
  colliders: readonly ImportedCollisionProxy[],
  radius = 0.48,
): Vec3 {
  if (colliders.length === 0) {
    return next;
  }

  const resolved = { ...next };

  for (let pass = 0; pass < 2; pass += 1) {
    for (const collider of colliders) {
      if (!collider.blocking) {
        continue;
      }

      const minX = collider.min.x - radius;
      const maxX = collider.max.x + radius;
      const minZ = collider.min.z - radius;
      const maxZ = collider.max.z + radius;

      if (resolved.y < collider.min.y - 0.8 || resolved.y > collider.max.y + 0.8) {
        continue;
      }

      if (resolved.x <= minX || resolved.x >= maxX || resolved.z <= minZ || resolved.z >= maxZ) {
        continue;
      }

      const candidates: Array<{ axis: 'x' | 'z'; value: number; distance: number }> = [];
      if (previous.x <= minX) {
        candidates.push({ axis: 'x', value: minX, distance: Math.abs(resolved.x - minX) });
      }
      if (previous.x >= maxX) {
        candidates.push({ axis: 'x', value: maxX, distance: Math.abs(resolved.x - maxX) });
      }
      if (previous.z <= minZ) {
        candidates.push({ axis: 'z', value: minZ, distance: Math.abs(resolved.z - minZ) });
      }
      if (previous.z >= maxZ) {
        candidates.push({ axis: 'z', value: maxZ, distance: Math.abs(resolved.z - maxZ) });
      }

      if (candidates.length === 0) {
        candidates.push({ axis: 'x', value: minX, distance: Math.abs(resolved.x - minX) });
        candidates.push({ axis: 'x', value: maxX, distance: Math.abs(resolved.x - maxX) });
        candidates.push({ axis: 'z', value: minZ, distance: Math.abs(resolved.z - minZ) });
        candidates.push({ axis: 'z', value: maxZ, distance: Math.abs(resolved.z - maxZ) });
      }

      let best = candidates[0];
      for (let index = 1; index < candidates.length; index += 1) {
        if (candidates[index].distance < best.distance) {
          best = candidates[index];
        }
      }

      if (best.axis === 'x') {
        resolved.x = best.value;
      } else {
        resolved.z = best.value;
      }
    }
  }

  return resolved;
}

function loadManifestForMap(mapKey: string, manifestPath: string): { manifest: MapAssetManifest | null; issues: string[] } {
  const rawManifest = readManifestSource(manifestPath);
  if (!rawManifest) {
    return {
      manifest: createEmptyAssetManifest(mapKey),
      issues: [`manifest not found: ${manifestPath}`],
    };
  }

  return parseAssetManifest(rawManifest, mapKey);
}

function readManifestSource(manifestPath: string): unknown | null {
  const normalized = normalizeAssetPath(manifestPath);
  return manifestByPath.get(normalized) ?? null;
}

function resolveAssetUrl(path: string, mapKey: string): string | null {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const normalized = normalizeAssetPath(path);
  const direct = glbUrlByPath.get(normalized);
  if (direct) {
    return direct;
  }

  const mapRelative = normalizeAssetPath(`assets/maps/${mapKey}/${normalized}`);
  const relative = glbUrlByPath.get(mapRelative);
  if (relative) {
    return relative;
  }

  if (path.startsWith('/')) {
    return path;
  }

  if (normalized.endsWith('.glb')) {
    return `/${normalized}`;
  }

  return null;
}

function normalizeAssetModulePath(modulePath: string): string {
  const normalized = modulePath.replace(/\\/g, '/').split('?')[0];
  const marker = '/assets/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalized.slice(markerIndex + 1);
  }
  const fallbackIndex = normalized.indexOf('assets/');
  if (fallbackIndex >= 0) {
    return normalized.slice(fallbackIndex);
  }
  return normalized;
}

function normalizeAssetPath(value: string): string {
  let normalized = value.trim().replace(/\\/g, '/');
  normalized = normalized.replace(/^\/+/, '');
  normalized = normalized.replace(/^\.\//, '');
  return normalized;
}

function createDefaultGlbLoader(): (url: string) => Promise<THREE.Object3D> {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(dracoLoader);
  return async (url: string): Promise<THREE.Object3D> => {
    return await new Promise<THREE.Object3D>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          resolve(gltf.scene.clone(true));
        },
        undefined,
        (error) => {
          reject(error);
        },
      );
    });
  };
}

async function loadRecord(
  record: ImportedAssetRecord,
  mapKey: string,
  loader: (url: string) => Promise<THREE.Object3D>,
): Promise<{ object: THREE.Object3D; source: 'glb' | 'fallback'; issues: string[] }> {
  const issues: string[] = [];

  let object: THREE.Object3D;
  let source: 'glb' | 'fallback' = 'glb';

  const resolvedUrl = resolveAssetUrl(record.path, mapKey);
  if (!resolvedUrl) {
    source = 'fallback';
    issues.push(`unable to resolve asset path: ${record.path}`);
    object = createFallbackObject(record);
  } else {
    try {
      object = await loader(resolvedUrl);
    } catch (error) {
      source = 'fallback';
      issues.push(`GLB load failed from ${resolvedUrl}: ${formatError(error)}`);
      object = createFallbackObject(record);
    }
  }

  applyRecordTransform(object, record);
  applyMaterialStrategy(object, record, source);

  return {
    object,
    source,
    issues,
  };
}

function createFallbackObject(record: ImportedAssetRecord): THREE.Object3D {
  const size = record.collisionProxy?.size ?? {
    x: Math.max(1, record.transform.scale.x),
    y: Math.max(1, record.transform.scale.y),
    z: Math.max(1, record.transform.scale.z),
  };

  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x8f9a92,
    roughness: 0.88,
    metalness: 0.06,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `fallback:${record.id}`;

  return mesh;
}

function applyRecordTransform(object: THREE.Object3D, record: ImportedAssetRecord): void {
  object.name = record.id;
  object.position.set(record.transform.position.x, record.transform.position.y, record.transform.position.z);
  object.rotation.set(record.transform.rotation.x, record.transform.rotation.y, record.transform.rotation.z);
  object.scale.set(record.transform.scale.x, record.transform.scale.y, record.transform.scale.z);
}

function applyMaterialStrategy(object: THREE.Object3D, record: ImportedAssetRecord, source: 'glb' | 'fallback'): void {
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }

    const mesh = child as THREE.Mesh;
    mesh.castShadow = false;
    mesh.receiveShadow = true;

    if (source === 'fallback') {
      return;
    }

    if (record.materialStrategy === 'source') {
      return;
    }

    const color = chooseStrategyColor(record.materialStrategy);
    const nextMaterial =
      record.materialStrategy === 'unlit-tint'
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshStandardMaterial({
            color,
            roughness: 0.86,
            metalness: 0.08,
            flatShading: record.materialStrategy === 'flat-shaded',
          });

    const current = mesh.material;
    if (Array.isArray(current)) {
      for (const material of current) {
        material.dispose();
      }
    } else {
      current.dispose();
    }

    mesh.material = nextMaterial;
  });
}

function chooseStrategyColor(strategy: ImportedAssetRecord['materialStrategy']): number {
  switch (strategy) {
    case 'flat-shaded':
      return 0x9ca68e;
    case 'unlit-tint':
      return 0xb9a792;
    case 'fallback-standard':
      return 0x97a08f;
    case 'source':
    default:
      return 0xa0a0a0;
  }
}

function buildCollisionProxy(record: ImportedAssetRecord): ImportedCollisionProxy | null {
  if (record.collisionStrategy !== 'aabb-proxy' || !record.collisionProxy) {
    return null;
  }

  const center = {
    x: record.transform.position.x + record.collisionProxy.offset.x,
    y: record.transform.position.y + record.collisionProxy.offset.y,
    z: record.transform.position.z + record.collisionProxy.offset.z,
  };

  const half = {
    x: Math.max(0.1, record.collisionProxy.size.x * 0.5),
    y: Math.max(0.1, record.collisionProxy.size.y * 0.5),
    z: Math.max(0.1, record.collisionProxy.size.z * 0.5),
  };

  return {
    id: record.id,
    min: {
      x: center.x - half.x,
      y: center.y - half.y,
      z: center.z - half.z,
    },
    max: {
      x: center.x + half.x,
      y: center.y + half.y,
      z: center.z + half.z,
    },
    blocking: record.collisionProxy.blocking,
  };
}

function buildTravelNodes(record: ImportedAssetRecord): TravelNode[] {
  return record.travelAnchors.map((anchor) => {
    return {
      id: anchor.id,
      label: anchor.label,
      kind: anchor.kind,
      layer: anchor.layer,
      targetId: anchor.targetId,
      position: {
        x: record.transform.position.x + anchor.offset.x,
        y: record.transform.position.y + anchor.offset.y,
        z: record.transform.position.z + anchor.offset.z,
      },
    };
  });
}

function buildLandmarkMarkers(record: ImportedAssetRecord, source: 'glb' | 'fallback'): ImportedLandmarkMarker[] {
  if (record.interactionMarkers.length === 0) {
    return [
      {
        id: `${record.id}:center`,
        label: record.label,
        position: {
          x: record.transform.position.x,
          y: record.transform.position.y,
          z: record.transform.position.z,
        },
        interactable: record.interactable,
        source,
      },
    ];
  }

  return record.interactionMarkers.map((marker) => {
    return {
      id: marker.id,
      label: marker.label,
      position: {
        x: record.transform.position.x + marker.offset.x,
        y: record.transform.position.y + marker.offset.y,
        z: record.transform.position.z + marker.offset.z,
      },
      interactable: record.interactable,
      source,
    };
  });
}

function applyBudgetGuardrails(root: THREE.Object3D, budget: ImportBudget): ImportBudgetSnapshot {
  const complexity = collectComplexity(root);
  const reasons: string[] = [];

  if (complexity.triangles > budget.maxTriangles) {
    reasons.push(`triangles ${complexity.triangles} > ${budget.maxTriangles}`);
  }
  if (complexity.materials > budget.maxMaterials) {
    reasons.push(`materials ${complexity.materials} > ${budget.maxMaterials}`);
  }
  if (complexity.maxTextureEdge > budget.maxTextureEdge) {
    reasons.push(`texture edge ${complexity.maxTextureEdge} > ${budget.maxTextureEdge}`);
  }

  if (reasons.length === 0) {
    return {
      ...complexity,
      downgraded: false,
      reasons: [],
    };
  }

  const sharedFallbackMaterial = new THREE.MeshStandardMaterial({
    color: 0x949d8b,
    roughness: 0.92,
    metalness: 0.02,
    flatShading: true,
  });

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }

    const mesh = child as THREE.Mesh;
    const current = mesh.material;
    if (Array.isArray(current)) {
      for (const material of current) {
        material.dispose();
      }
    } else {
      current.dispose();
    }

    mesh.material = sharedFallbackMaterial;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = true;
  });

  const downgradedComplexity = collectComplexity(root);
  return {
    ...downgradedComplexity,
    downgraded: true,
    reasons,
  };
}

function collectComplexity(root: THREE.Object3D): {
  triangles: number;
  materials: number;
  maxTextureEdge: number;
} {
  let triangles = 0;
  const materialIds = new Set<string>();
  let maxTextureEdge = 0;

  root.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) {
      return;
    }

    const mesh = child as THREE.Mesh;
    triangles += countTriangles(mesh.geometry);

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      materialIds.add(material.uuid);
      maxTextureEdge = Math.max(maxTextureEdge, findMaterialTextureEdge(material));
    }
  });

  return {
    triangles,
    materials: materialIds.size,
    maxTextureEdge,
  };
}

function countTriangles(geometry: THREE.BufferGeometry): number {
  if (geometry.index) {
    return Math.floor(geometry.index.count / 3);
  }

  const position = geometry.getAttribute('position');
  if (!position) {
    return 0;
  }

  return Math.floor(position.count / 3);
}

function findMaterialTextureEdge(material: THREE.Material): number {
  const textureBearing = material as THREE.Material & {
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    metalnessMap?: THREE.Texture;
    emissiveMap?: THREE.Texture;
    aoMap?: THREE.Texture;
    alphaMap?: THREE.Texture;
  };

  const textures = [
    textureBearing.map,
    textureBearing.normalMap,
    textureBearing.roughnessMap,
    textureBearing.metalnessMap,
    textureBearing.emissiveMap,
    textureBearing.aoMap,
    textureBearing.alphaMap,
  ];

  let maxEdge = 0;
  for (const texture of textures) {
    if (!texture || !texture.image) {
      continue;
    }

    const image = texture.image as { width?: number; height?: number };
    const width = typeof image.width === 'number' ? image.width : 0;
    const height = typeof image.height === 'number' ? image.height : 0;
    maxEdge = Math.max(maxEdge, width, height);
  }

  return maxEdge;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
