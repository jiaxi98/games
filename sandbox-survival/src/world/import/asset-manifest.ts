import type { Vec3 } from '../../contracts/game-state';
import type { TravelKind, TravelLayer } from '../transport-graph';

const MATERIAL_STRATEGIES = ['source', 'flat-shaded', 'unlit-tint', 'fallback-standard'] as const;
const COLLISION_STRATEGIES = ['none', 'aabb-proxy'] as const;

export type MaterialStrategy = (typeof MATERIAL_STRATEGIES)[number];
export type CollisionStrategy = (typeof COLLISION_STRATEGIES)[number];

export interface AssetTransform {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
}

export interface BoxCollisionProxy {
  kind: 'box';
  offset: Vec3;
  size: Vec3;
  blocking: boolean;
}

export interface InteractionMarker {
  id: string;
  label: string;
  offset: Vec3;
  radius: number;
}

export interface MapAssetTravelAnchor {
  id: string;
  label: string;
  kind: TravelKind;
  layer: TravelLayer;
  targetId: string;
  offset: Vec3;
}

export interface ImportedAssetRecord {
  id: string;
  label: string;
  path: string;
  transform: AssetTransform;
  materialStrategy: MaterialStrategy;
  collisionStrategy: CollisionStrategy;
  collisionProxy: BoxCollisionProxy | null;
  interactable: boolean;
  interactionMarkers: InteractionMarker[];
  travelAnchors: MapAssetTravelAnchor[];
}

export interface MapAssetManifest {
  version: 1;
  mapKey: string;
  assets: ImportedAssetRecord[];
}

export interface AssetManifestParseResult {
  manifest: MapAssetManifest | null;
  issues: string[];
}

export function buildMapManifestAssetPath(mapKey: string): string {
  return `assets/maps/${mapKey}/manifest.json`;
}

export function createEmptyAssetManifest(mapKey: string): MapAssetManifest {
  return {
    version: 1,
    mapKey,
    assets: [],
  };
}

export function parseAssetManifest(input: unknown, expectedMapKey?: string): AssetManifestParseResult {
  const issues: string[] = [];

  if (!isRecord(input)) {
    issues.push('manifest payload is not an object');
    return {
      manifest: expectedMapKey ? createEmptyAssetManifest(expectedMapKey) : null,
      issues,
    };
  }

  const rawMapKey = typeof input.mapKey === 'string' ? input.mapKey.trim() : '';
  const mapKey = expectedMapKey ?? rawMapKey;
  if (!rawMapKey) {
    issues.push('manifest.mapKey is required');
  }
  if (!mapKey) {
    issues.push('expected map key is missing');
    return {
      manifest: null,
      issues,
    };
  }

  if (expectedMapKey && rawMapKey && rawMapKey !== expectedMapKey) {
    issues.push(`manifest.mapKey mismatch: expected "${expectedMapKey}", got "${rawMapKey}"`);
  }

  if (input.version !== 1) {
    issues.push(`manifest.version expected 1, got ${String(input.version)}`);
  }

  const rawAssets = Array.isArray(input.assets) ? input.assets : [];
  if (!Array.isArray(input.assets)) {
    issues.push('manifest.assets must be an array');
  }

  const assets: ImportedAssetRecord[] = [];
  for (let index = 0; index < rawAssets.length; index += 1) {
    const parsed = parseAssetRecord(rawAssets[index], index, issues);
    if (parsed) {
      assets.push(parsed);
    }
  }

  if (rawAssets.length === 0) {
    issues.push('manifest.assets is empty');
  }

  return {
    manifest: {
      version: 1,
      mapKey,
      assets,
    },
    issues,
  };
}

function parseAssetRecord(value: unknown, index: number, issues: string[]): ImportedAssetRecord | null {
  if (!isRecord(value)) {
    issues.push(`assets[${index}] is not an object`);
    return null;
  }

  const generatedId = `asset-${index + 1}`;
  const id = typeof value.id === 'string' && value.id.trim().length > 0 ? value.id.trim() : generatedId;
  if (id === generatedId) {
    issues.push(`assets[${index}].id missing, generated ${id}`);
  }

  const label = typeof value.label === 'string' && value.label.trim().length > 0 ? value.label.trim() : id;
  const path = typeof value.path === 'string' ? value.path.trim() : '';
  if (!path) {
    issues.push(`assets[${index}] (${id}) missing path`);
    return null;
  }

  const transform = parseAssetTransform(value.transform, `assets[${index}] (${id})`, issues);

  const materialStrategy = parseMaterialStrategy(value.materialStrategy, index, id, issues);
  const collisionStrategy = parseCollisionStrategy(value.collisionStrategy, index, id, issues);
  const collisionProxy = parseCollisionProxy(value.collisionProxy, collisionStrategy, transform.scale, index, id, issues);

  const interactable = typeof value.interactable === 'boolean' ? value.interactable : false;
  const interactionMarkers = parseInteractionMarkers(value.interactionMarkers, index, id, issues);
  const travelAnchors = parseTravelAnchors(value.travelAnchors, index, id, issues);

  return {
    id,
    label,
    path,
    transform,
    materialStrategy,
    collisionStrategy,
    collisionProxy,
    interactable,
    interactionMarkers,
    travelAnchors,
  };
}

function parseAssetTransform(value: unknown, context: string, issues: string[]): AssetTransform {
  const object = isRecord(value) ? value : {};
  if (!isRecord(value)) {
    issues.push(`${context}.transform missing, using defaults`);
  }

  const position = parseVec3(object.position, { x: 0, y: 0, z: 0 }, `${context}.transform.position`, issues);
  const rotation = parseVec3(object.rotation, { x: 0, y: 0, z: 0 }, `${context}.transform.rotation`, issues);
  const rawScale = parseVec3(object.scale, { x: 1, y: 1, z: 1 }, `${context}.transform.scale`, issues);

  return {
    position,
    rotation,
    scale: {
      x: Math.max(0.01, Math.abs(rawScale.x)),
      y: Math.max(0.01, Math.abs(rawScale.y)),
      z: Math.max(0.01, Math.abs(rawScale.z)),
    },
  };
}

function parseMaterialStrategy(value: unknown, index: number, id: string, issues: string[]): MaterialStrategy {
  if (typeof value === 'string' && isMaterialStrategy(value)) {
    return value;
  }
  if (value !== undefined) {
    issues.push(`assets[${index}] (${id}).materialStrategy invalid, using fallback-standard`);
  }
  return 'fallback-standard';
}

function parseCollisionStrategy(value: unknown, index: number, id: string, issues: string[]): CollisionStrategy {
  if (typeof value === 'string' && isCollisionStrategy(value)) {
    return value;
  }
  if (value !== undefined) {
    issues.push(`assets[${index}] (${id}).collisionStrategy invalid, using none`);
  }
  return 'none';
}

function parseCollisionProxy(
  value: unknown,
  strategy: CollisionStrategy,
  fallbackScale: Vec3,
  index: number,
  id: string,
  issues: string[],
): BoxCollisionProxy | null {
  if (strategy !== 'aabb-proxy') {
    return null;
  }

  if (!isRecord(value)) {
    issues.push(`assets[${index}] (${id}).collisionProxy missing, generating from scale`);
    return {
      kind: 'box',
      offset: { x: 0, y: 0, z: 0 },
      size: {
        x: Math.max(1, fallbackScale.x),
        y: Math.max(1, fallbackScale.y),
        z: Math.max(1, fallbackScale.z),
      },
      blocking: true,
    };
  }

  const offset = parseVec3(value.offset, { x: 0, y: 0, z: 0 }, `assets[${index}] (${id}).collisionProxy.offset`, issues);
  const rawSize = parseVec3(
    value.size,
    {
      x: Math.max(1, fallbackScale.x),
      y: Math.max(1, fallbackScale.y),
      z: Math.max(1, fallbackScale.z),
    },
    `assets[${index}] (${id}).collisionProxy.size`,
    issues,
  );

  return {
    kind: 'box',
    offset,
    size: {
      x: Math.max(0.2, Math.abs(rawSize.x)),
      y: Math.max(0.2, Math.abs(rawSize.y)),
      z: Math.max(0.2, Math.abs(rawSize.z)),
    },
    blocking: typeof value.blocking === 'boolean' ? value.blocking : true,
  };
}

function parseInteractionMarkers(value: unknown, index: number, id: string, issues: string[]): InteractionMarker[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const markers: InteractionMarker[] = [];
  for (let markerIndex = 0; markerIndex < value.length; markerIndex += 1) {
    const entry = value[markerIndex];
    if (!isRecord(entry)) {
      issues.push(`assets[${index}] (${id}).interactionMarkers[${markerIndex}] invalid`);
      continue;
    }

    const markerId =
      typeof entry.id === 'string' && entry.id.trim().length > 0
        ? entry.id.trim()
        : `${id}-marker-${markerIndex + 1}`;
    const label = typeof entry.label === 'string' && entry.label.trim().length > 0 ? entry.label.trim() : markerId;
    const offset = parseVec3(
      entry.offset,
      { x: 0, y: 0, z: 0 },
      `assets[${index}] (${id}).interactionMarkers[${markerIndex}].offset`,
      issues,
    );
    const radius =
      typeof entry.radius === 'number' && Number.isFinite(entry.radius) ? Math.max(0.4, Math.abs(entry.radius)) : 2;

    markers.push({
      id: markerId,
      label,
      offset,
      radius,
    });
  }

  return markers;
}

function parseTravelAnchors(value: unknown, index: number, id: string, issues: string[]): MapAssetTravelAnchor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const anchors: MapAssetTravelAnchor[] = [];
  for (let anchorIndex = 0; anchorIndex < value.length; anchorIndex += 1) {
    const entry = value[anchorIndex];
    if (!isRecord(entry)) {
      issues.push(`assets[${index}] (${id}).travelAnchors[${anchorIndex}] invalid`);
      continue;
    }

    const anchorId =
      typeof entry.id === 'string' && entry.id.trim().length > 0
        ? entry.id.trim()
        : `${id}-anchor-${anchorIndex + 1}`;
    const label = typeof entry.label === 'string' && entry.label.trim().length > 0 ? entry.label.trim() : anchorId;

    const kind = parseTravelKind(entry.kind);
    if (!kind) {
      issues.push(`assets[${index}] (${id}).travelAnchors[${anchorIndex}].kind invalid`);
      continue;
    }

    const layer = parseTravelLayer(entry.layer);
    if (!layer) {
      issues.push(`assets[${index}] (${id}).travelAnchors[${anchorIndex}].layer invalid`);
      continue;
    }

    const targetId = typeof entry.targetId === 'string' && entry.targetId.trim().length > 0 ? entry.targetId.trim() : '';
    if (!targetId) {
      issues.push(`assets[${index}] (${id}).travelAnchors[${anchorIndex}].targetId missing`);
      continue;
    }

    const offset = parseVec3(
      entry.offset,
      { x: 0, y: 0, z: 0 },
      `assets[${index}] (${id}).travelAnchors[${anchorIndex}].offset`,
      issues,
    );

    anchors.push({
      id: anchorId,
      label,
      kind,
      layer,
      targetId,
      offset,
    });
  }

  return anchors;
}

function parseVec3(value: unknown, fallback: Vec3, context: string, issues: string[]): Vec3 {
  if (!isRecord(value)) {
    return fallback;
  }

  const x = toFiniteNumber(value.x, fallback.x);
  const y = toFiniteNumber(value.y, fallback.y);
  const z = toFiniteNumber(value.z, fallback.z);

  if (!Number.isFinite(toMaybeNumber(value.x)) || !Number.isFinite(toMaybeNumber(value.y)) || !Number.isFinite(toMaybeNumber(value.z))) {
    issues.push(`${context} contains non-finite values; fallback applied`);
  }

  return { x, y, z };
}

function toMaybeNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isMaterialStrategy(value: string): value is MaterialStrategy {
  return (MATERIAL_STRATEGIES as readonly string[]).includes(value);
}

function isCollisionStrategy(value: string): value is CollisionStrategy {
  return (COLLISION_STRATEGIES as readonly string[]).includes(value);
}

function parseTravelKind(value: unknown): TravelKind | null {
  if (value === 'elevator' || value === 'tunnel' || value === 'metro' || value === 'cave') {
    return value;
  }
  return null;
}

function parseTravelLayer(value: unknown): TravelLayer | null {
  if (value === 'surface' || value === 'underground') {
    return value;
  }
  return null;
}
