import * as THREE from 'three';
import type { PersistedGameState, PlacedStructureSnapshot, Vec3 } from './contracts/game-state';
import { createSeededRandom } from './core/seed';
import {
  addInventoryItem,
  consumeSelectedItem,
  createInventoryState,
  getSelectedCount,
  selectInventorySlotByDigit,
} from './gameplay/inventory';
import { decideGather, decidePlacement, GATHER_RANGE } from './gameplay/interactions';
import {
  applyLookDelta,
  createInitialPlayerState,
  formatPlayerPosition,
  PLAYER_EYE_HEIGHT,
  stepPlayer,
  type MovementInput,
} from './gameplay/player';
import {
  archiveCorruptedSave,
  DEFAULT_SAVE_KEY,
  inspectGameState,
  saveGameState,
  type SaveLoadIssue,
  type StorageLike,
} from './persistence/save-slot';
import { buildMapScopedSaveKey, parseMapScopedSaveKey } from './persistence/save-keys';
import {
  applyToolWear,
  assessSurvivalState,
  canUseTool,
  createInitialSurvivalState,
  isDowned,
  recoverFromDowned,
  tickSurvival,
  type SurvivalState,
} from './survival/survival';
import { createStructureId, getResourceProfile, type PlacedStructure, type ResourceNode } from './world/resources';
import { resolveMapAssetPalette } from './world/map-assets';
import { DEFAULT_MAP_KEY, getMapPresetByKey, getNextMapPresetKey, resolveMapPreset } from './world/map-presets';
import {
  loadImportedAssetsForMap,
  resolvePositionAgainstImportColliders,
  type ImportedCollisionProxy,
  type ImportedLandmarkMarker,
} from './world/import/asset-loader';
import {
  sampleRiverCenterZ,
  sampleRiverDistance,
  sampleRiverWidth,
  sampleTerrainColor,
  sampleTerrainHeight,
  TERRAIN_MAX_HEIGHT,
  TERRAIN_MIN_HEIGHT,
} from './world/terrain';
import {
  clearTravelRegistry,
  createTravelRegistry,
  findNearestTravelNode,
  getTravelKindColor,
  getTravelTarget,
  registerTravelNode,
  type TravelKind,
  type TravelLayer,
  type TravelNode,
} from './world/transport-graph';
import { computeWorldBounds, createWorldState } from './world/world-state';
import './style.css';

const RENDER_RADIUS = 2;
const HEAT_RADIUS = 3.5;
const TERRAIN_MARGIN = 8;
const TERRAIN_SEGMENTS = 220;
const SPAWN_FLAT_RADIUS = 5.4;
const MAX_VIEW_DISTANCE = 320;
const FALLBACK_SAMPLE_WIDTH = 420;
const FALLBACK_SAMPLE_HEIGHT = 240;
const storage = window.localStorage as StorageLike;
const activeMap = resolveMapPreset(window.location.search, storage);
const mapAssets = resolveMapAssetPalette(activeMap);
const WORLD_SEED = activeMap.seed;
const CITY_DISTRICT_RADIUS = activeMap.cityRadius;

declare global {
  interface Window {
    __sandboxDebug?: {
      setSurvival(next: Partial<SurvivalState>): void;
      setPlayerPosition(next: Partial<Vec3>): void;
      getSnapshot(): {
        health: number;
        hunger: number;
        temperature: number;
        durability: number;
        structures: number;
      };
      getRenderMetrics(): {
        rendererStatus: string;
        drawCalls: number | null;
        triangles: number | null;
        frame: number | null;
        playerLayer: TravelLayer;
      };
      getTravelNodes(): Array<{
        id: string;
        label: string;
        kind: TravelKind;
        layer: TravelLayer;
        position: Vec3;
      }>;
    };
  }
}

const mapSaveKey = buildMapScopedSaveKey(DEFAULT_SAVE_KEY, activeMap.key);
const parsedMapSaveKey = parseMapScopedSaveKey(DEFAULT_SAVE_KEY, mapSaveKey);
if (!parsedMapSaveKey) {
  throw new Error(`Invalid map save key: ${mapSaveKey}`);
}
const root = requireElement<HTMLDivElement>('#app');

const world = createWorldState(WORLD_SEED, RENDER_RADIUS);
const worldBounds = computeWorldBounds(world.chunkQueue);
const terrainExtents = {
  minX: worldBounds.minX - TERRAIN_MARGIN,
  maxX: worldBounds.maxX + TERRAIN_MARGIN,
  minZ: worldBounds.minZ - TERRAIN_MARGIN,
  maxZ: worldBounds.maxZ + TERRAIN_MARGIN,
};
const resourceById = new Map(world.resourceNodes.map((node) => [node.id, node]));

interface OverlayRect {
  x: number;
  z: number;
  width: number;
  depth: number;
}

interface OverlayRiverPoint {
  x: number;
  z: number;
  width: number;
}

interface OverlayImportedLandmark {
  x: number;
  z: number;
  label: string;
  source: 'glb' | 'fallback';
  interactable: boolean;
}

const mapOverlay = {
  river: [] as OverlayRiverPoint[],
  cityRoads: [] as OverlayRect[],
  cityBlocks: [] as OverlayRect[],
  cityCenter: null as { x: number; z: number } | null,
  importedLandmarks: [] as OverlayImportedLandmark[],
};

const travelRegistry = createTravelRegistry();

let player = createInitialPlayerState(world.spawnChunk);
let inventory = createInventoryState();
let survival = createInitialSurvivalState();
let playerLayer: TravelLayer = 'surface';
let forcedPlayerY: number | null = null;

const harvestedResourceIds = new Set<string>();
const placedStructures: PlacedStructure[] = [];

root.innerHTML = `
  <main class="layout">
    <header class="hero">
      <h1>Sandbox Survival Prototype</h1>
      <p>${activeMap.name}: ${activeMap.description}</p>
    </header>

    <section class="controls">
      <p><strong>Move</strong> WASD + Shift | <strong>Look</strong> Mouse (click viewport) or Arrow Keys</p>
      <p><strong>Interact</strong> E gather, Q place, F use elevator/tunnel/metro/cave, 1/2 switch slot</p>
      <p><strong>System</strong> K save, L load, R recover, M next map preset</p>
      <p><strong>Rules</strong> stone placement needs adjacent support when structures exist</p>
      <div class="buttons">
        <button id="save-btn" type="button">Save</button>
        <button id="load-btn" type="button">Load</button>
        <button id="map-next-btn" type="button">Next Map</button>
      </div>
    </section>

    <section class="hud" aria-live="polite">
      <p>Renderer <strong data-testid="renderer-status" id="renderer-status">initializing</strong></p>
      <p>Imports <strong data-testid="import-status" id="import-status">pending</strong></p>
      <p>Position <strong data-testid="player-position" id="player-position">x:0 y:0 z:0</strong></p>
      <p>Resources Left <strong data-testid="resource-count" id="resource-count">0</strong></p>
      <p>Structures <strong data-testid="structure-count" id="structure-count">0</strong></p>

      <p>Health <strong data-testid="health-value" id="health-value">0</strong></p>
      <p>Hunger <strong id="hunger-value">0</strong></p>
      <p>Temperature <strong id="temperature-value">0</strong></p>
      <p>Durability <strong data-testid="durability-value" id="durability-value">0</strong></p>
      <p>Survival <strong data-testid="survival-state" id="survival-state">stable</strong></p>

      <p>Wood <strong data-testid="inventory-wood" id="inventory-wood">0</strong></p>
      <p>Stone <strong data-testid="inventory-stone" id="inventory-stone">0</strong></p>
      <p>Selected <strong id="selected-slot">wood</strong></p>
      <p>Message <strong data-testid="interaction-status" id="interaction-status">ready</strong></p>
    </section>

    <section id="viewport" class="viewport" aria-label="3D viewport"></section>
  </main>
`;

const rendererStatusEl = requireElement<HTMLElement>('#renderer-status');
const importStatusEl = requireElement<HTMLElement>('#import-status');
const positionEl = requireElement<HTMLElement>('#player-position');
const resourceCountEl = requireElement<HTMLElement>('#resource-count');
const structureCountEl = requireElement<HTMLElement>('#structure-count');
const healthEl = requireElement<HTMLElement>('#health-value');
const hungerEl = requireElement<HTMLElement>('#hunger-value');
const temperatureEl = requireElement<HTMLElement>('#temperature-value');
const durabilityEl = requireElement<HTMLElement>('#durability-value');
const survivalStateEl = requireElement<HTMLElement>('#survival-state');
const inventoryWoodEl = requireElement<HTMLElement>('#inventory-wood');
const inventoryStoneEl = requireElement<HTMLElement>('#inventory-stone');
const selectedSlotEl = requireElement<HTMLElement>('#selected-slot');
const interactionStatusEl = requireElement<HTMLElement>('#interaction-status');

const saveButton = requireElement<HTMLButtonElement>('#save-btn');
const loadButton = requireElement<HTMLButtonElement>('#load-btn');
const mapNextButton = requireElement<HTMLButtonElement>('#map-next-btn');
const viewport = requireElement<HTMLDivElement>('#viewport');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8db2c3);
scene.fog = new THREE.Fog(0x8db2c3, 28, MAX_VIEW_DISTANCE);

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
camera.rotation.order = 'YXZ';

const renderSurface = document.createElement('canvas');
viewport.appendChild(renderSurface);

const renderer = createRendererWithFallback(renderSurface);
if (renderer) {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}
const fallbackContext = renderer ? null : renderSurface.getContext('2d');
let fallbackTerrainLayer: HTMLCanvasElement | null = null;

const ambientLight = new THREE.HemisphereLight(0xd9edf3, 0x4f6a3d, 0.84);
const directionalLight = new THREE.DirectionalLight(0xfff1d0, 1.08);
directionalLight.position.set(24, 36, 18);
scene.add(ambientLight, directionalLight);

const terrainWidth = terrainExtents.maxX - terrainExtents.minX;
const terrainDepth = terrainExtents.maxZ - terrainExtents.minZ;
const ground = createTerrainMesh(terrainWidth, terrainDepth, WORLD_SEED);
const cityCenter = findCityAnchor(WORLD_SEED);
mapOverlay.cityCenter = cityCenter;
scene.add(ground);

scene.add(createSkyDome());
scene.add(createRiverSystem(WORLD_SEED));
scene.add(createValleyGateway(WORLD_SEED));
scene.add(createMountainRing(terrainWidth, terrainDepth, WORLD_SEED));
scene.add(createForest(terrainWidth, terrainDepth, WORLD_SEED));
scene.add(createRockScatter(terrainWidth, terrainDepth, WORLD_SEED));
scene.add(createGrassPatches(terrainWidth, terrainDepth, WORLD_SEED));
scene.add(createCityDistrict(WORLD_SEED, cityCenter));
clearTravelRegistry(travelRegistry);
scene.add(createInfrastructurePack(WORLD_SEED, cityCenter));
scene.add(createLandmarkPack(cityCenter));
const importedAssetRoot = new THREE.Group();
importedAssetRoot.name = `imported-assets:${activeMap.key}`;
scene.add(importedAssetRoot);

const resourceMeshes = new Map<string, THREE.Mesh>();
const structureMeshes = new Map<string, THREE.Mesh>();
const raycaster = new THREE.Raycaster();
let importedCollisionProxies: ImportedCollisionProxy[] = [];

const pressedKeys = new Set<string>();
const actionQueue: Array<'gather' | 'place' | 'save' | 'load' | 'recover' | 'use' | 'nextMap'> = [];
let lookDeltaX = 0;
let lookDeltaY = 0;
let lastFallbackRenderAt = Number.NEGATIVE_INFINITY;

let statusMessage = 'ready';
let statusExpiresAt = 0;
let statusSticky = false;
let importStatusMessage = 'pending';

function setStatus(message: string, sticky = false): void {
  statusMessage = message;
  statusSticky = sticky;
  statusExpiresAt = performance.now() + 2800;
}

function setImportStatus(message: string): void {
  importStatusMessage = message;
}

function switchToMap(key: string): void {
  const target = getMapPresetByKey(key);
  if (!target) {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('map', target.key);
  window.location.assign(nextUrl.toString());
}

function switchToNextMap(): void {
  switchToMap(getNextMapPresetKey(activeMap.key) ?? DEFAULT_MAP_KEY);
}

function syncImportedOverlayMarkers(markers: ImportedLandmarkMarker[]): void {
  mapOverlay.importedLandmarks = markers.map((marker) => {
    return {
      x: marker.position.x,
      z: marker.position.z,
      label: marker.label,
      source: marker.source,
      interactable: marker.interactable,
    };
  });
}

async function bootImportedAssets(): Promise<void> {
  setImportStatus('imports: loading');

  const summary = await loadImportedAssetsForMap(activeMap, importedAssetRoot, {
    onStatus: (message) => {
      setImportStatus(message);
    },
    onIssue: (issue) => {
      console.warn(`[import] ${issue}`);
    },
  });

  importedCollisionProxies = summary.collisionProxies;
  syncImportedOverlayMarkers(summary.landmarkMarkers);

  let importedTravelNodeCount = 0;
  for (const node of summary.travelNodes) {
    if (travelRegistry.byId.has(node.id)) {
      continue;
    }
    registerTravelNode(travelRegistry, node);
    scene.add(createTravelBeacon(node));
    importedTravelNodeCount += 1;
  }

  if (summary.issues.length > 0) {
    setImportStatus(
      `imports: loaded ${summary.loaded}/${summary.requested} (${summary.issues.length} warnings, ${importedTravelNodeCount} anchors)`,
    );
    return;
  }

  setImportStatus(`imports: loaded ${summary.loaded}/${summary.requested} (${importedTravelNodeCount} anchors)`);
}

function createRendererWithFallback(surface: HTMLCanvasElement): THREE.WebGLRenderer | null {
  const attempts: Array<{
    contextName: 'webgl2' | 'webgl' | 'experimental-webgl';
    attributes: WebGLContextAttributes;
    powerPreference: WebGLPowerPreference;
  }> = [
    {
      contextName: 'webgl2',
      attributes: {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      },
      powerPreference: 'high-performance',
    },
    {
      contextName: 'webgl',
      attributes: {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      },
      powerPreference: 'high-performance',
    },
    {
      contextName: 'webgl',
      attributes: {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false,
      },
      powerPreference: 'low-power',
    },
    {
      contextName: 'experimental-webgl',
      attributes: {
        alpha: false,
        antialias: false,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false,
      },
      powerPreference: 'low-power',
    },
  ];

  for (const attempt of attempts) {
    const context = surface.getContext(attempt.contextName, attempt.attributes);
    if (!context) {
      continue;
    }

    try {
      return new THREE.WebGLRenderer({
        canvas: surface,
        context: context as WebGLRenderingContext,
        antialias: Boolean(attempt.attributes.antialias),
        powerPreference: attempt.powerPreference,
      });
    } catch (error) {
      console.warn(`[renderer] failed to initialize ${attempt.contextName} renderer`, error);
    }
  }

  return null;
}

function terrainHeightAt(x: number, z: number): number {
  return sampleTerrainHeight(x, z, WORLD_SEED);
}

function isNearRiver(x: number, z: number, extra = 0): boolean {
  return sampleRiverDistance(x, z, WORLD_SEED) <= sampleRiverWidth(x, WORLD_SEED) + extra;
}

function isInsideCityBuffer(x: number, z: number, extra = 0): boolean {
  if (!mapOverlay.cityCenter) {
    return false;
  }
  return Math.hypot(x - mapOverlay.cityCenter.x, z - mapOverlay.cityCenter.z) <= CITY_DISTRICT_RADIUS + extra;
}

function findCityAnchor(seed: number): { x: number; z: number } {
  const rng = createSeededRandom(seed ^ 0x40ad13);
  let best = { x: worldBounds.maxX * 0.56, z: 9 };
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = 0; index < 260; index += 1) {
    const x = THREE.MathUtils.lerp(worldBounds.minX + 8, worldBounds.maxX - 8, 0.48 + rng.next() * 0.5);
    const z = THREE.MathUtils.lerp(worldBounds.minZ + 8, worldBounds.maxZ - 8, rng.next());

    if (Math.hypot(x, z) < SPAWN_FLAT_RADIUS + 12) {
      continue;
    }

    const riverDistance = sampleRiverDistance(x, z, seed);
    if (riverDistance < 4 || riverDistance > 12) {
      continue;
    }

    const height = terrainHeightAt(x, z);
    const slopeX = Math.abs(terrainHeightAt(x + 1.2, z) - terrainHeightAt(x - 1.2, z));
    const slopeZ = Math.abs(terrainHeightAt(x, z + 1.2) - terrainHeightAt(x, z - 1.2));
    const score = (slopeX + slopeZ) * 3.8 + Math.abs(riverDistance - 6.5) * 0.45 + Math.abs(height - 0.7) * 0.42;

    if (score < bestScore) {
      bestScore = score;
      best = { x, z };
    }
  }

  return {
    x: Math.round(best.x * 2) / 2,
    z: Math.round(best.z * 2) / 2,
  };
}

function setPlayerLayer(layer: TravelLayer, fixedY?: number): void {
  playerLayer = layer;
  forcedPlayerY = layer === 'underground' ? fixedY ?? player.position.y : null;
}

function inferPlayerLayerFromHeight(position: Vec3): void {
  const surfaceHeight = terrainHeightAt(position.x, position.z) + PLAYER_EYE_HEIGHT;
  if (Math.abs(position.y - surfaceHeight) > 1.4) {
    setPlayerLayer('underground', position.y);
  } else {
    setPlayerLayer('surface');
  }
}

function attemptUseTraversal(): void {
  const source = findNearestTravelNode(travelRegistry, player.position, playerLayer);
  if (!source) {
    setStatus('no tunnel/elevator/metro/cave access nearby');
    return;
  }

  const target = getTravelTarget(travelRegistry, source);
  if (!target) {
    setStatus('access endpoint unavailable');
    return;
  }

  player = {
    ...player,
    position: {
      x: target.position.x,
      y: target.position.y,
      z: target.position.z,
    },
  };
  setPlayerLayer(target.layer, target.position.y);
  setStatus(`${source.kind}: ${source.label} -> ${target.label}`, true);
}

function createTerrainMesh(width: number, depth: number, seed: number): THREE.Mesh {
  const segmentCount = Math.max(TERRAIN_SEGMENTS, Math.round(Math.max(width, depth) * 3.2));
  const geometry = new THREE.PlaneGeometry(width, depth, segmentCount, segmentCount);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors: number[] = [];

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = sampleTerrainHeight(x, z, seed);
    position.setY(index, height);

    const color = sampleTerrainColor(height);
    const riverDistance = sampleRiverDistance(x, z, seed);
    const riverWidth = sampleRiverWidth(x, seed);
    const riverBlend = 1 - THREE.MathUtils.clamp((riverDistance - riverWidth * 0.7) / 2.2, 0, 1);
    const tintedColor = riverBlend > 0
      ? color.clone().lerp(new THREE.Color(0x3b607c), riverBlend * 0.72)
      : color;
    colors.push(tintedColor.r, tintedColor.g, tintedColor.b);
  }

  position.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
}

function createSkyDome(): THREE.Mesh {
  const skyGeometry = new THREE.SphereGeometry(MAX_VIEW_DISTANCE * 0.6, 24, 16);
  return new THREE.Mesh(
    skyGeometry,
    new THREE.MeshBasicMaterial({
      color: 0xbad4e0,
      side: THREE.BackSide,
      fog: false,
    }),
  );
}

function createRiverSystem(seed: number): THREE.Group {
  const group = new THREE.Group();
  mapOverlay.river.splice(0, mapOverlay.river.length);

  const sampleCount = 70;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const t = sampleCount <= 1 ? 0 : index / (sampleCount - 1);
    const x = THREE.MathUtils.lerp(terrainExtents.minX + 2, terrainExtents.maxX - 2, t);
    const z = sampleRiverCenterZ(x, seed);
    const width = sampleRiverWidth(x, seed) * 0.96;

    mapOverlay.river.push({ x, z, width });

    const sampleBackX = THREE.MathUtils.lerp(terrainExtents.minX + 2, terrainExtents.maxX - 2, Math.max(0, t - 0.015));
    const sampleFrontX = THREE.MathUtils.lerp(terrainExtents.minX + 2, terrainExtents.maxX - 2, Math.min(1, t + 0.015));
    const backZ = sampleRiverCenterZ(sampleBackX, seed);
    const frontZ = sampleRiverCenterZ(sampleFrontX, seed);
    const tangentX = sampleFrontX - sampleBackX;
    const tangentZ = frontZ - backZ;

    const tangent = new THREE.Vector2(tangentX, tangentZ);
    if (tangent.lengthSq() < 1e-5) {
      tangent.set(1, 0);
    } else {
      tangent.normalize();
    }

    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    const leftX = x + normal.x * width;
    const leftZ = z + normal.y * width;
    const rightX = x - normal.x * width;
    const rightZ = z - normal.y * width;

    const leftY = terrainHeightAt(leftX, leftZ) + 0.07;
    const rightY = terrainHeightAt(rightX, rightZ) + 0.07;

    positions.push(leftX, leftY, leftZ);
    positions.push(rightX, rightY, rightZ);
    uvs.push(t, 0);
    uvs.push(t, 1);
  }

  for (let index = 0; index < sampleCount - 1; index += 1) {
    const base = index * 2;
    indices.push(base, base + 1, base + 2);
    indices.push(base + 1, base + 3, base + 2);
  }

  const waterGeometry = new THREE.BufferGeometry();
  waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  waterGeometry.setIndex(indices);
  waterGeometry.computeVertexNormals();

  const waterMesh = new THREE.Mesh(
    waterGeometry,
    new THREE.MeshStandardMaterial({
      color: mapAssets.riverColor,
      roughness: 0.18,
      metalness: 0.06,
      transparent: true,
      opacity: 0.86,
    }),
  );
  group.add(waterMesh);

  return group;
}

function createValleyGateway(seed: number): THREE.Group {
  const group = new THREE.Group();
  const rng = createSeededRandom(seed ^ 0x7719ad);
  const anchorX = worldBounds.maxX - 10;
  const riverZ = sampleRiverCenterZ(anchorX, seed);
  const riverWidth = sampleRiverWidth(anchorX, seed);

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: 0x6f725f,
    roughness: 0.97,
    metalness: 0.03,
  });

  const leftCliff = new THREE.Mesh(new THREE.ConeGeometry(4.4, 15.5, 7), rockMaterial);
  const rightCliff = new THREE.Mesh(new THREE.ConeGeometry(4.1, 14.8, 7), rockMaterial);
  const leftX = anchorX - 1.8;
  const rightX = anchorX + 2.2;
  const leftZ = riverZ + riverWidth + 3.9;
  const rightZ = riverZ - riverWidth - 3.6;

  leftCliff.position.set(leftX, terrainHeightAt(leftX, leftZ) + 6.8, leftZ);
  rightCliff.position.set(rightX, terrainHeightAt(rightX, rightZ) + 6.6, rightZ);
  leftCliff.rotation.y = rng.next() * Math.PI * 2;
  rightCliff.rotation.y = rng.next() * Math.PI * 2;

  const arch = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 1.5, 2.3),
    new THREE.MeshStandardMaterial({
      color: 0x7e745f,
      roughness: 0.92,
      metalness: 0.02,
    }),
  );
  const archX = (leftX + rightX) / 2;
  const archZ = riverZ + 0.2;
  arch.position.set(archX, terrainHeightAt(archX, archZ) + 10.8, archZ);
  arch.rotation.y = 0.1;

  group.add(leftCliff, rightCliff, arch);
  return group;
}

function createCityDistrict(seed: number, center: { x: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const rng = createSeededRandom(seed ^ 0x9f31d2);
  mapOverlay.cityRoads.splice(0, mapOverlay.cityRoads.length);
  mapOverlay.cityBlocks.splice(0, mapOverlay.cityBlocks.length);

  const districtWidth = 22;
  const districtDepth = 18;
  const roadStepX = 6.4;
  const roadStepZ = 5.6;
  const roadWidth = 2.05;

  const districtBase = new THREE.Mesh(
    new THREE.BoxGeometry(districtWidth, 0.14, districtDepth),
    new THREE.MeshStandardMaterial({
      color: activeMap.key === 'yiheyuan' ? 0x475a4a : 0x4b4f52,
      roughness: 0.92,
      metalness: 0.04,
    }),
  );
  districtBase.position.set(center.x, terrainHeightAt(center.x, center.z) + 0.03, center.z);
  group.add(districtBase);

  const sidewalk = new THREE.Mesh(
    new THREE.BoxGeometry(districtWidth + 1.2, 0.08, districtDepth + 1.2),
    new THREE.MeshStandardMaterial({
      color: activeMap.key === 'tiananmen' ? 0x7e766f : 0x72777b,
      roughness: 0.96,
      metalness: 0.02,
    }),
  );
  sidewalk.position.set(center.x, terrainHeightAt(center.x, center.z) + 0.015, center.z);
  group.add(sidewalk);

  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x3e4245, roughness: 0.92, metalness: 0.03 });
  for (let lane = -1; lane <= 1; lane += 1) {
    const roadX = center.x + lane * roadStepX;
    const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.1, districtDepth + 0.9), roadMaterial);
    road.position.set(roadX, terrainHeightAt(roadX, center.z) + 0.04, center.z);
    group.add(road);
    mapOverlay.cityRoads.push({ x: roadX, z: center.z, width: roadWidth, depth: districtDepth + 0.9 });
  }

  for (let lane = -1; lane <= 1; lane += 1) {
    const roadZ = center.z + lane * roadStepZ;
    const road = new THREE.Mesh(new THREE.BoxGeometry(districtWidth + 0.9, 0.1, roadWidth), roadMaterial);
    road.position.set(center.x, terrainHeightAt(center.x, roadZ) + 0.04, roadZ);
    group.add(road);
    mapOverlay.cityRoads.push({ x: center.x, z: roadZ, width: districtWidth + 0.9, depth: roadWidth });
  }

  const buildingMaterial = new THREE.MeshStandardMaterial({
    color: activeMap.key === 'tiananmen' ? 0xb5ab9a : 0xa3a39d,
    roughness: 0.76,
    metalness: 0.08,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: mapAssets.cityAccentColor,
    roughness: 0.62,
    metalness: 0.16,
  });

  for (const laneX of [-2, -1, 1, 2]) {
    for (const laneZ of [-2, -1, 1, 2]) {
      const bx = center.x + laneX * (roadStepX * 0.52);
      const bz = center.z + laneZ * (roadStepZ * 0.52);
      const footprintW = 1.6 + rng.next() * 1.4;
      const footprintD = 1.4 + rng.next() * 1.3;
      const height = 2.6 + rng.next() * 6.8;

      if (Math.hypot(bx - center.x, bz - center.z) > CITY_DISTRICT_RADIUS - 1.4) {
        continue;
      }

      const building = new THREE.Mesh(new THREE.BoxGeometry(footprintW, height, footprintD), buildingMaterial);
      building.position.set(bx, terrainHeightAt(bx, bz) + height / 2 + 0.07, bz);
      building.rotation.y = (rng.next() - 0.5) * 0.14;
      group.add(building);
      mapOverlay.cityBlocks.push({ x: bx, z: bz, width: footprintW, depth: footprintD });

      if (rng.next() < 0.45) {
        const rooftop = new THREE.Mesh(new THREE.BoxGeometry(footprintW * 0.44, 0.5, footprintD * 0.44), accentMaterial);
        rooftop.position.set(bx, building.position.y + height / 2 + 0.25, bz);
        group.add(rooftop);
      }
    }
  }

  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 0.08, 20),
    new THREE.MeshStandardMaterial({ color: 0xc0b49b, roughness: 0.8 }),
  );
  plaza.position.set(center.x + 0.3, terrainHeightAt(center.x + 0.3, center.z - 0.4) + 0.08, center.z - 0.4);
  group.add(plaza);

  const monument = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.62, 4.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x8f8b83, roughness: 0.72 }),
  );
  monument.position.set(plaza.position.x, plaza.position.y + 2.32, plaza.position.z);
  group.add(monument);

  return group;
}

function createTravelBeacon(node: TravelNode): THREE.Object3D {
  const group = new THREE.Group();
  const color = getTravelKindColor(node.kind);
  const baseY =
    node.layer === 'surface' ? terrainHeightAt(node.position.x, node.position.z) + 0.12 : node.position.y - PLAYER_EYE_HEIGHT;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 0.6, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 }),
  );
  stem.position.set(node.position.x, baseY + 0.3, node.position.z);
  group.add(stem);

  const cap = new THREE.Mesh(
    new THREE.ConeGeometry(0.18, 0.36, 8),
    new THREE.MeshStandardMaterial({ color: 0xf4f4e7, roughness: 0.44, metalness: 0.08 }),
  );
  cap.position.set(node.position.x, baseY + 0.74, node.position.z);
  group.add(cap);

  return group;
}

function createInfrastructurePack(seed: number, cityCenter: { x: number; z: number }): THREE.Group {
  const group = new THREE.Group();
  const bridgeX = cityCenter.x - 6.2;
  const bridgeZ = sampleRiverCenterZ(bridgeX, seed);
  const bridgeSpan = sampleRiverWidth(bridgeX, seed) * 2 + 7.4;
  const bridgeY = terrainHeightAt(bridgeX, bridgeZ) + 2.2;

  const bridgeMaterial = new THREE.MeshStandardMaterial({
    color: mapAssets.bridgeColor,
    roughness: 0.86,
    metalness: 0.07,
  });
  const bridgeDeck = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.6, bridgeSpan), bridgeMaterial);
  bridgeDeck.position.set(bridgeX, bridgeY, bridgeZ);
  group.add(bridgeDeck);

  const railMaterial = new THREE.MeshStandardMaterial({ color: 0xbbb6af, roughness: 0.52, metalness: 0.21 });
  const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, bridgeSpan - 0.6), railMaterial);
  const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, bridgeSpan - 0.6), railMaterial);
  railLeft.position.set(bridgeX - 1.2, bridgeY + 0.36, bridgeZ);
  railRight.position.set(bridgeX + 1.2, bridgeY + 0.36, bridgeZ);
  group.add(railLeft, railRight);

  for (const side of [-1, 1]) {
    const support = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.46, 4.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x67635c, roughness: 0.9 }),
    );
    const z = bridgeZ + side * (bridgeSpan * 0.28);
    support.position.set(bridgeX, terrainHeightAt(bridgeX, z) + 1.95, z);
    group.add(support);
  }

  const undergroundHubX = cityCenter.x + 4.4;
  const undergroundHubZ = cityCenter.z + 3.2;
  const hubFloorY = terrainHeightAt(undergroundHubX, undergroundHubZ) - 9.6;

  const shaftX = cityCenter.x + 2.3;
  const shaftZ = cityCenter.z - CITY_DISTRICT_RADIUS + 1.1;
  const elevatorTopFloorY = terrainHeightAt(shaftX, shaftZ) + 0.02;

  const shaftHeight = elevatorTopFloorY - hubFloorY + 0.2;
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, shaftHeight, 1.8),
    new THREE.MeshStandardMaterial({ color: 0x5a5f65, roughness: 0.88, metalness: 0.15, transparent: true, opacity: 0.66 }),
  );
  shaft.position.set(shaftX, hubFloorY + shaftHeight / 2, shaftZ);
  group.add(shaft);

  const elevatorCabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.3, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xc8bd9b, roughness: 0.52, metalness: 0.24 }),
  );
  elevatorCabin.position.set(shaftX, hubFloorY + 1.35, shaftZ);
  group.add(elevatorCabin);

  const hub = new THREE.Mesh(
    new THREE.BoxGeometry(9.8, 4.2, 6.4),
    new THREE.MeshStandardMaterial({ color: 0x3f454b, roughness: 0.9, metalness: 0.08 }),
  );
  hub.position.set(undergroundHubX, hubFloorY + 2.1, undergroundHubZ);
  group.add(hub);

  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(8.6, 0.3, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x8b8d8e, roughness: 0.84, metalness: 0.06 }),
  );
  platform.position.set(undergroundHubX, hubFloorY + 0.16, undergroundHubZ + 1.8);
  group.add(platform);

  const metroEndX = worldBounds.minX + 10.5;
  const metroEndZ = sampleRiverCenterZ(metroEndX, seed) - 8.4;
  const metroEndFloorY = terrainHeightAt(metroEndX, metroEndZ) - 10.3;
  const metroSegments = 16;

  for (let segment = 0; segment < metroSegments; segment += 1) {
    const t = metroSegments <= 1 ? 0 : segment / (metroSegments - 1);
    const x = THREE.MathUtils.lerp(undergroundHubX, metroEndX, t);
    const z = THREE.MathUtils.lerp(undergroundHubZ, metroEndZ, t);
    const y = THREE.MathUtils.lerp(hubFloorY + 1.2, metroEndFloorY + 1.2, t);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 3.6, 14, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x4a5058,
        roughness: 0.9,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
    );
    shell.position.set(x, y, z);
    shell.rotation.z = Math.PI / 2;
    group.add(shell);
  }

  const metroOutpost = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 3.5, 4.6),
    new THREE.MeshStandardMaterial({ color: 0x454a52, roughness: 0.9, metalness: 0.08 }),
  );
  metroOutpost.position.set(metroEndX, metroEndFloorY + 1.75, metroEndZ);
  group.add(metroOutpost);

  const caveX = metroEndX + 3.8;
  const caveZ = metroEndZ + 5.8;
  const caveMouthY = terrainHeightAt(caveX, caveZ) + 1.0;
  const caveShell = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.7, 3.4, 11, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x655f58, roughness: 0.98, side: THREE.DoubleSide }),
  );
  caveShell.rotation.z = Math.PI / 2;
  caveShell.position.set(caveX, caveMouthY, caveZ);
  group.add(caveShell);

  const cavePit = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 1.9, 5.1, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 1, side: THREE.DoubleSide }),
  );
  cavePit.position.set(caveX, caveMouthY - 2.7, caveZ + 0.2);
  group.add(cavePit);

  const tunnelEntryX = bridgeX + 3.4;
  const tunnelEntryZ = bridgeZ + bridgeSpan * 0.43;
  const tunnelFloorY = terrainHeightAt(tunnelEntryX, tunnelEntryZ) - 6.7;

  const linkTunnel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 8.2, 14, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x464d55, roughness: 0.94, side: THREE.DoubleSide }),
  );
  linkTunnel.rotation.set(0.38, 0.36, Math.PI / 2);
  linkTunnel.position.set((tunnelEntryX + undergroundHubX) / 2, (tunnelFloorY + hubFloorY) / 2 + 2.4, (tunnelEntryZ + undergroundHubZ) / 2);
  group.add(linkTunnel);

  const elevatorTopNode: TravelNode = {
    id: 'elevator-top',
    label: 'Elevator Upper Lobby',
    kind: 'elevator',
    layer: 'surface',
    targetId: 'elevator-bottom',
    position: { x: shaftX, y: elevatorTopFloorY + PLAYER_EYE_HEIGHT, z: shaftZ },
  };
  const elevatorBottomNode: TravelNode = {
    id: 'elevator-bottom',
    label: 'Metro Elevator Concourse',
    kind: 'elevator',
    layer: 'underground',
    targetId: 'elevator-top',
    position: { x: shaftX, y: hubFloorY + PLAYER_EYE_HEIGHT, z: shaftZ },
  };
  const tunnelSurfaceNode: TravelNode = {
    id: 'tunnel-surface',
    label: 'Bridge Tunnel Entry',
    kind: 'tunnel',
    layer: 'surface',
    targetId: 'tunnel-underground',
    position: { x: tunnelEntryX, y: terrainHeightAt(tunnelEntryX, tunnelEntryZ) + PLAYER_EYE_HEIGHT, z: tunnelEntryZ },
  };
  const tunnelUndergroundNode: TravelNode = {
    id: 'tunnel-underground',
    label: 'Underground Service Link',
    kind: 'tunnel',
    layer: 'underground',
    targetId: 'tunnel-surface',
    position: { x: undergroundHubX - 2.2, y: hubFloorY + PLAYER_EYE_HEIGHT, z: undergroundHubZ - 1.9 },
  };
  const metroHubNode: TravelNode = {
    id: 'metro-hub',
    label: 'Metro Platform',
    kind: 'metro',
    layer: 'underground',
    targetId: 'metro-outpost',
    position: { x: undergroundHubX + 2.7, y: hubFloorY + PLAYER_EYE_HEIGHT, z: undergroundHubZ + 1.2 },
  };
  const metroOutpostNode: TravelNode = {
    id: 'metro-outpost',
    label: 'Metro Outpost',
    kind: 'metro',
    layer: 'underground',
    targetId: 'metro-hub',
    position: { x: metroEndX - 2.0, y: metroEndFloorY + PLAYER_EYE_HEIGHT, z: metroEndZ + 0.8 },
  };
  const caveUndergroundNode: TravelNode = {
    id: 'cave-underground',
    label: 'Cave Transit Chamber',
    kind: 'cave',
    layer: 'underground',
    targetId: 'cave-surface',
    position: { x: caveX - 2.0, y: metroEndFloorY + PLAYER_EYE_HEIGHT, z: caveZ - 0.4 },
  };
  const caveSurfaceNode: TravelNode = {
    id: 'cave-surface',
    label: 'Cave Mouth',
    kind: 'cave',
    layer: 'surface',
    targetId: 'cave-underground',
    position: { x: caveX, y: terrainHeightAt(caveX, caveZ) + PLAYER_EYE_HEIGHT, z: caveZ },
  };

  const nodes = [
    elevatorTopNode,
    elevatorBottomNode,
    tunnelSurfaceNode,
    tunnelUndergroundNode,
    metroHubNode,
    metroOutpostNode,
    caveUndergroundNode,
    caveSurfaceNode,
  ];
  for (const node of nodes) {
    registerTravelNode(travelRegistry, node);
    group.add(createTravelBeacon(node));
  }

  return group;
}

function createLandmarkPack(cityCenter: { x: number; z: number }): THREE.Group {
  const group = new THREE.Group();

  if (activeMap.key === 'tiananmen') {
    const axisLength = 40;
    const axis = new THREE.Mesh(
      new THREE.BoxGeometry(6.6, 0.09, axisLength),
      new THREE.MeshStandardMaterial({ color: 0x7a6a5f, roughness: 0.9 }),
    );
    axis.position.set(cityCenter.x, terrainHeightAt(cityCenter.x, cityCenter.z - 7) + 0.06, cityCenter.z - 7);
    group.add(axis);

    const plaza = new THREE.Mesh(
      new THREE.BoxGeometry(19.5, 0.1, 16.5),
      new THREE.MeshStandardMaterial({ color: 0xb9ad95, roughness: 0.85 }),
    );
    plaza.position.set(cityCenter.x, terrainHeightAt(cityCenter.x, cityCenter.z - 14) + 0.08, cityCenter.z - 14);
    group.add(plaza);

    const gateBody = new THREE.Mesh(
      new THREE.BoxGeometry(14.5, 4.6, 2.4),
      new THREE.MeshStandardMaterial({ color: 0x9d3d2b, roughness: 0.76 }),
    );
    gateBody.position.set(cityCenter.x, terrainHeightAt(cityCenter.x, cityCenter.z - 20) + 2.3, cityCenter.z - 20);
    group.add(gateBody);

    const gateRoof = new THREE.Mesh(
      new THREE.ConeGeometry(8.6, 2.5, 4),
      new THREE.MeshStandardMaterial({ color: 0xc89a4d, roughness: 0.66, metalness: 0.1 }),
    );
    gateRoof.position.set(gateBody.position.x, gateBody.position.y + 3.2, gateBody.position.z);
    gateRoof.rotation.y = Math.PI / 4;
    group.add(gateRoof);

    const flagPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 7.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xc3c5c7, roughness: 0.45, metalness: 0.36 }),
    );
    flagPole.position.set(cityCenter.x, terrainHeightAt(cityCenter.x, cityCenter.z - 12.8) + 3.75, cityCenter.z - 12.8);
    group.add(flagPole);
  } else if (activeMap.key === 'yiheyuan') {
    const lakeX = cityCenter.x - 8.8;
    const lakeZ = cityCenter.z - 7.2;
    const lake = new THREE.Mesh(
      new THREE.CylinderGeometry(8.6, 8.6, 0.22, 36),
      new THREE.MeshStandardMaterial({
        color: 0x4f80aa,
        roughness: 0.22,
        metalness: 0.05,
        transparent: true,
        opacity: 0.85,
      }),
    );
    lake.position.set(lakeX, terrainHeightAt(lakeX, lakeZ) + 0.04, lakeZ);
    group.add(lake);

    const promenade = new THREE.Mesh(
      new THREE.BoxGeometry(17.5, 0.14, 1.1),
      new THREE.MeshStandardMaterial({ color: 0xbba989, roughness: 0.82 }),
    );
    promenade.position.set(lakeX + 8.9, terrainHeightAt(lakeX + 8.9, lakeZ + 4.7) + 0.06, lakeZ + 4.7);
    promenade.rotation.y = 0.2;
    group.add(promenade);

    for (let index = 0; index < 3; index += 1) {
      const px = lakeX + 3.4 + index * 2.9;
      const pz = lakeZ + 6.6 - index * 0.5;
      const pavilion = new THREE.Mesh(
        new THREE.CylinderGeometry(0.72, 0.92, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x8d5a3c, roughness: 0.8 }),
      );
      pavilion.position.set(px, terrainHeightAt(px, pz) + 0.95, pz);
      group.add(pavilion);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 1.1, 8),
        new THREE.MeshStandardMaterial({ color: 0x4f744f, roughness: 0.86 }),
      );
      roof.position.set(px, pavilion.position.y + 1.2, pz);
      group.add(roof);
    }
  } else {
    const towerX = cityCenter.x + 10.4;
    const towerZ = cityCenter.z - 10.1;
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.4, 10.5, 10),
      new THREE.MeshStandardMaterial({ color: 0x7c7f83, roughness: 0.78, metalness: 0.19 }),
    );
    tower.position.set(towerX, terrainHeightAt(towerX, towerZ) + 5.25, towerZ);
    group.add(tower);
  }

  return group;
}

function createMountainRing(width: number, depth: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const rng = createSeededRandom(seed ^ 0x92a1f7);
  const diameter = Math.max(width, depth);
  const mountainCount = 36;

  for (let index = 0; index < mountainCount; index += 1) {
    const angle = (index / mountainCount) * Math.PI * 2 + (rng.next() - 0.5) * 0.18;
    const radius = diameter * 0.56 + 9 + rng.next() * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const height = 8 + rng.next() * 10;
    const baseRadius = 2.3 + rng.next() * 2.7;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(baseRadius, height, 6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.29 + rng.next() * 0.05, 0.1 + rng.next() * 0.12, 0.41 + rng.next() * 0.1),
        roughness: 0.98,
      }),
    );

    mountain.position.set(x, terrainHeightAt(x, z) + height * 0.48 - 0.35, z);
    mountain.rotation.y = rng.next() * Math.PI * 2;
    group.add(mountain);
  }

  return group;
}

function createForest(width: number, depth: number, seed: number): THREE.Group {
  const group = new THREE.Group();
  const rng = createSeededRandom(seed ^ 0x411ca4);
  const treeCount = 360;
  const halfWidth = width / 2 + TERRAIN_MARGIN - 1.2;
  const halfDepth = depth / 2 + TERRAIN_MARGIN - 1.2;

  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.11, 0.15, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x5e4228, roughness: 0.9 }),
    treeCount,
  );
  const canopy = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.62, 1.75, 6),
    new THREE.MeshStandardMaterial({ color: 0x385d30, roughness: 0.95 }),
    treeCount,
  );

  const dummy = new THREE.Object3D();
  let planted = 0;
  let attempts = 0;

  while (planted < treeCount && attempts < treeCount * 8) {
    attempts += 1;
    const x = (rng.next() * 2 - 1) * halfWidth;
    const z = (rng.next() * 2 - 1) * halfDepth;

    if (Math.hypot(x, z) < SPAWN_FLAT_RADIUS + 2.2) {
      continue;
    }
    if (isNearRiver(x, z, 2.4) || isInsideCityBuffer(x, z, 3.1)) {
      continue;
    }

    const y = terrainHeightAt(x, z);
    if (y < -1.8 || y > 3.8) {
      continue;
    }

    const scale = 0.66 + rng.next() * 1.08;

    dummy.position.set(x, y + 0.48 * scale, z);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.08);
    dummy.scale.set(0.5 * scale, scale, 0.5 * scale);
    dummy.updateMatrix();
    trunk.setMatrixAt(planted, dummy.matrix);

    dummy.position.set(x, y + 1.35 * scale, z);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    canopy.setMatrixAt(planted, dummy.matrix);

    planted += 1;
  }

  trunk.count = planted;
  canopy.count = planted;
  trunk.instanceMatrix.needsUpdate = true;
  canopy.instanceMatrix.needsUpdate = true;
  trunk.frustumCulled = false;
  canopy.frustumCulled = false;
  group.add(trunk, canopy);

  return group;
}

function createRockScatter(width: number, depth: number, seed: number): THREE.InstancedMesh {
  const rng = createSeededRandom(seed ^ 0x58f123);
  const count = 220;
  const halfWidth = width / 2 + TERRAIN_MARGIN - 0.8;
  const halfDepth = depth / 2 + TERRAIN_MARGIN - 0.8;
  const rocks = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.55, 0),
    new THREE.MeshStandardMaterial({ color: 0x818772, roughness: 1 }),
    count,
  );

  const dummy = new THREE.Object3D();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const x = (rng.next() * 2 - 1) * halfWidth;
    const z = (rng.next() * 2 - 1) * halfDepth;

    if (Math.hypot(x, z) < SPAWN_FLAT_RADIUS + 1.7) {
      continue;
    }
    if (isNearRiver(x, z, 1.2) || isInsideCityBuffer(x, z, 2.4)) {
      continue;
    }

    const y = terrainHeightAt(x, z);
    const scale = 0.24 + rng.next() * 0.72;

    dummy.position.set(x, y + 0.18 * scale, z);
    dummy.rotation.set(rng.next() * Math.PI, rng.next() * Math.PI, rng.next() * Math.PI);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    rocks.setMatrixAt(placed, dummy.matrix);

    placed += 1;
  }

  rocks.count = placed;
  rocks.instanceMatrix.needsUpdate = true;
  rocks.frustumCulled = false;
  return rocks;
}

function createGrassPatches(width: number, depth: number, seed: number): THREE.InstancedMesh {
  const rng = createSeededRandom(seed ^ 0xc20f77);
  const count = 520;
  const halfWidth = width / 2 + TERRAIN_MARGIN - 0.7;
  const halfDepth = depth / 2 + TERRAIN_MARGIN - 0.7;

  const grass = new THREE.InstancedMesh(
    new THREE.ConeGeometry(0.12, 0.55, 3),
    new THREE.MeshStandardMaterial({ color: 0x5b7d42, roughness: 1 }),
    count,
  );

  const dummy = new THREE.Object3D();
  let placed = 0;

  for (let index = 0; index < count; index += 1) {
    const x = (rng.next() * 2 - 1) * halfWidth;
    const z = (rng.next() * 2 - 1) * halfDepth;
    const y = terrainHeightAt(x, z);

    if (Math.hypot(x, z) < SPAWN_FLAT_RADIUS + 1.2 || y < -1.2 || y > 2.4) {
      continue;
    }
    if (isNearRiver(x, z, 0.9) || isInsideCityBuffer(x, z, 2.1)) {
      continue;
    }

    const scale = 0.56 + rng.next() * 1.05;
    dummy.position.set(x, y + 0.2 * scale, z);
    dummy.rotation.set(0, rng.next() * Math.PI * 2, (rng.next() - 0.5) * 0.35);
    dummy.scale.set(1, scale, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix);
    placed += 1;
  }

  grass.count = placed;
  grass.instanceMatrix.needsUpdate = true;
  grass.frustumCulled = false;
  return grass;
}

function toFallbackPoint(x: number, z: number, width: number, height: number): { x: number; y: number } {
  const spanX = terrainExtents.maxX - terrainExtents.minX;
  const spanZ = terrainExtents.maxZ - terrainExtents.minZ;
  const normalizedX = (x - terrainExtents.minX) / spanX;
  const normalizedZ = (z - terrainExtents.minZ) / spanZ;
  return {
    x: THREE.MathUtils.clamp(normalizedX, 0, 1) * width,
    y: THREE.MathUtils.clamp(normalizedZ, 0, 1) * height,
  };
}

function toFallbackSize(worldWidth: number, worldDepth: number, width: number, height: number): { w: number; h: number } {
  const spanX = terrainExtents.maxX - terrainExtents.minX;
  const spanZ = terrainExtents.maxZ - terrainExtents.minZ;
  return {
    w: Math.max(1, (worldWidth / spanX) * width),
    h: Math.max(1, (worldDepth / spanZ) * height),
  };
}

function buildFallbackTerrainLayer(width: number, height: number): HTMLCanvasElement | null {
  const sampleAspect = width / Math.max(height, 1);
  let sampleWidth = FALLBACK_SAMPLE_WIDTH;
  let sampleHeight = FALLBACK_SAMPLE_HEIGHT;

  if (sampleAspect > FALLBACK_SAMPLE_WIDTH / FALLBACK_SAMPLE_HEIGHT) {
    sampleWidth = Math.max(FALLBACK_SAMPLE_WIDTH, Math.floor(FALLBACK_SAMPLE_HEIGHT * sampleAspect));
  } else {
    sampleHeight = Math.max(FALLBACK_SAMPLE_HEIGHT, Math.floor(FALLBACK_SAMPLE_WIDTH / Math.max(sampleAspect, 0.01)));
  }

  const layer = document.createElement('canvas');
  layer.width = sampleWidth;
  layer.height = sampleHeight;
  const context = layer.getContext('2d');

  if (!context) {
    return null;
  }

  const imageData = context.createImageData(sampleWidth, sampleHeight);
  const data = imageData.data;
  const terrainRange = Math.max(TERRAIN_MAX_HEIGHT - TERRAIN_MIN_HEIGHT, 0.001);
  const worldSpanX = terrainExtents.maxX - terrainExtents.minX;
  const worldSpanZ = terrainExtents.maxZ - terrainExtents.minZ;

  for (let y = 0; y < sampleHeight; y += 1) {
    const normalizedZ = y / Math.max(sampleHeight - 1, 1);
    const worldZ = terrainExtents.minZ + worldSpanZ * normalizedZ;

    for (let x = 0; x < sampleWidth; x += 1) {
      const normalizedX = x / Math.max(sampleWidth - 1, 1);
      const worldX = terrainExtents.minX + worldSpanX * normalizedX;
      const heightValue = terrainHeightAt(worldX, worldZ);
      const baseColor = sampleTerrainColor(heightValue);
      const gradientX = terrainHeightAt(worldX + 0.45, worldZ) - terrainHeightAt(worldX - 0.45, worldZ);
      const gradientZ = terrainHeightAt(worldX, worldZ + 0.45) - terrainHeightAt(worldX, worldZ - 0.45);
      const slope = THREE.MathUtils.clamp(Math.hypot(gradientX, gradientZ) * 0.37, 0, 1);
      const altitude = THREE.MathUtils.clamp((heightValue - TERRAIN_MIN_HEIGHT) / terrainRange, 0, 1);
      const directionalLight = THREE.MathUtils.clamp(0.78 - gradientX * 0.24 - gradientZ * 0.16, 0.45, 1.08);

      let red = baseColor.r * 255 * directionalLight * (0.92 + altitude * 0.2);
      let green = baseColor.g * 255 * directionalLight * (0.94 + altitude * 0.12);
      let blue = baseColor.b * 255 * directionalLight * (0.88 + altitude * 0.26);

      if (heightValue < -0.95) {
        red = red * 0.44 + 20;
        green = green * 0.62 + 35;
        blue = blue * 0.75 + 50;
      }

      const contourBand = Math.abs(((heightValue - TERRAIN_MIN_HEIGHT) * 1.18) % 1 - 0.5);
      const contourStrength = contourBand < 0.058 ? (0.058 - contourBand) / 0.058 : 0;
      const contourDim = 1 - contourStrength * 0.22;
      red *= contourDim;
      green *= contourDim;
      blue *= contourDim;

      const mist = 0.05 + slope * 0.06;
      red += 255 * mist;
      green += 255 * mist;
      blue += 255 * (mist + 0.01);

      const index = (y * sampleWidth + x) * 4;
      data[index] = Math.round(THREE.MathUtils.clamp(red, 0, 255));
      data[index + 1] = Math.round(THREE.MathUtils.clamp(green, 0, 255));
      data[index + 2] = Math.round(THREE.MathUtils.clamp(blue, 0, 255));
      data[index + 3] = 255;
    }
  }

  context.putImageData(imageData, 0, 0);

  const riverScale = Math.min(sampleWidth / worldSpanX, sampleHeight / worldSpanZ);
  for (let index = 1; index < mapOverlay.river.length; index += 1) {
    const previous = mapOverlay.river[index - 1];
    const current = mapOverlay.river[index];
    const p1 = toFallbackPoint(previous.x, previous.z, sampleWidth, sampleHeight);
    const p2 = toFallbackPoint(current.x, current.z, sampleWidth, sampleHeight);
    const widthPx = Math.max(2.2, ((previous.width + current.width) * 0.98) * riverScale * 1.9);

    context.beginPath();
    context.strokeStyle = 'rgba(83, 146, 202, 0.58)';
    context.lineWidth = widthPx + 1.3;
    context.lineCap = 'round';
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    context.stroke();

    context.beginPath();
    context.strokeStyle = 'rgba(186, 219, 241, 0.34)';
    context.lineWidth = Math.max(1.2, widthPx * 0.32);
    context.moveTo(p1.x, p1.y);
    context.lineTo(p2.x, p2.y);
    context.stroke();
  }

  context.fillStyle = 'rgba(58, 65, 72, 0.9)';
  for (const road of mapOverlay.cityRoads) {
    const point = toFallbackPoint(road.x, road.z, sampleWidth, sampleHeight);
    const size = toFallbackSize(road.width, road.depth, sampleWidth, sampleHeight);
    context.fillRect(point.x - size.w / 2, point.y - size.h / 2, size.w, size.h);
  }

  context.fillStyle = 'rgba(178, 180, 174, 0.82)';
  context.strokeStyle = 'rgba(112, 120, 126, 0.82)';
  context.lineWidth = 1;
  for (const block of mapOverlay.cityBlocks) {
    const point = toFallbackPoint(block.x, block.z, sampleWidth, sampleHeight);
    const size = toFallbackSize(block.width, block.depth, sampleWidth, sampleHeight);
    context.fillRect(point.x - size.w / 2, point.y - size.h / 2, size.w, size.h);
    context.strokeRect(point.x - size.w / 2, point.y - size.h / 2, size.w, size.h);
  }

  if (mapOverlay.cityCenter) {
    const center = toFallbackPoint(mapOverlay.cityCenter.x, mapOverlay.cityCenter.z, sampleWidth, sampleHeight);
    context.beginPath();
    context.strokeStyle = 'rgba(245, 229, 181, 0.8)';
    context.lineWidth = 1.6;
    context.arc(center.x, center.y, 7.2, 0, Math.PI * 2);
    context.stroke();
  }

  return layer;
}

function renderFallbackScene(): void {
  if (!fallbackContext) {
    return;
  }

  const context = fallbackContext;
  const width = renderSurface.width;
  const height = renderSurface.height;

  if (!fallbackTerrainLayer || fallbackTerrainLayer.width === 0 || fallbackTerrainLayer.height === 0) {
    fallbackTerrainLayer = buildFallbackTerrainLayer(width, height);
  }

  if (fallbackTerrainLayer) {
    context.imageSmoothingEnabled = true;
    context.drawImage(fallbackTerrainLayer, 0, 0, width, height);
  } else {
    context.fillStyle = '#163126';
    context.fillRect(0, 0, width, height);
  }

  const atmosphere = context.createLinearGradient(0, 0, 0, height);
  atmosphere.addColorStop(0, 'rgba(176, 205, 222, 0.08)');
  atmosphere.addColorStop(0.55, 'rgba(68, 98, 77, 0.08)');
  atmosphere.addColorStop(1, 'rgba(12, 23, 18, 0.22)');
  context.fillStyle = atmosphere;
  context.fillRect(0, 0, width, height);

  for (const node of world.resourceNodes) {
    if (harvestedResourceIds.has(node.id)) {
      continue;
    }

    const point = toFallbackPoint(node.position.x, node.position.z, width, height);
    context.beginPath();
    context.fillStyle = node.kind === 'wood' ? 'rgba(222, 146, 74, 0.88)' : 'rgba(174, 184, 193, 0.9)';
    context.arc(point.x, point.y, node.kind === 'wood' ? 2.8 : 3.2, 0, Math.PI * 2);
    context.fill();
  }

  for (const structure of placedStructures) {
    const point = toFallbackPoint(structure.position.x, structure.position.z, width, height);
    context.fillStyle = structure.kind === 'wood' ? 'rgba(128, 77, 44, 0.92)' : 'rgba(111, 117, 123, 0.94)';
    context.fillRect(point.x - 3, point.y - 3, 6, 6);
  }

  for (const node of travelRegistry.nodes) {
    const point = toFallbackPoint(node.position.x, node.position.z, width, height);
    const baseColor = new THREE.Color(getTravelKindColor(node.kind));
    const red = Math.round(baseColor.r * 255);
    const green = Math.round(baseColor.g * 255);
    const blue = Math.round(baseColor.b * 255);
    const alpha = node.layer === 'surface' ? 0.92 : 0.45;

    context.beginPath();
    context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    context.arc(point.x, point.y, node.layer === 'surface' ? 4 : 3.2, 0, Math.PI * 2);
    context.fill();
    if (node.layer === 'surface') {
      context.beginPath();
      context.strokeStyle = 'rgba(255, 245, 220, 0.7)';
      context.lineWidth = 1.1;
      context.arc(point.x, point.y, 6.3, 0, Math.PI * 2);
      context.stroke();
    }
  }

  for (const landmark of mapOverlay.importedLandmarks) {
    const point = toFallbackPoint(landmark.x, landmark.z, width, height);
    context.beginPath();
    context.fillStyle =
      landmark.source === 'glb'
        ? landmark.interactable
          ? 'rgba(233, 196, 112, 0.9)'
          : 'rgba(200, 200, 180, 0.82)'
        : 'rgba(176, 148, 124, 0.82)';
    context.arc(point.x, point.y, landmark.interactable ? 5.5 : 4.3, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.strokeStyle = 'rgba(253, 245, 216, 0.62)';
    context.lineWidth = 1;
    context.arc(point.x, point.y, landmark.interactable ? 7.6 : 6.2, 0, Math.PI * 2);
    context.stroke();
  }

  const playerPoint = toFallbackPoint(player.position.x, player.position.z, width, height);
  const headingX = -Math.sin(player.yaw);
  const headingY = -Math.cos(player.yaw);
  const headingLength = Math.min(width, height) * 0.09;
  const coneAngle = 0.42;
  const leftX = headingX * Math.cos(coneAngle) - headingY * Math.sin(coneAngle);
  const leftY = headingX * Math.sin(coneAngle) + headingY * Math.cos(coneAngle);
  const rightX = headingX * Math.cos(-coneAngle) - headingY * Math.sin(-coneAngle);
  const rightY = headingX * Math.sin(-coneAngle) + headingY * Math.cos(-coneAngle);

  context.beginPath();
  context.fillStyle = 'rgba(242, 240, 186, 0.16)';
  context.moveTo(playerPoint.x, playerPoint.y);
  context.lineTo(playerPoint.x + leftX * headingLength, playerPoint.y + leftY * headingLength);
  context.lineTo(playerPoint.x + rightX * headingLength, playerPoint.y + rightY * headingLength);
  context.closePath();
  context.fill();

  context.beginPath();
  context.strokeStyle = 'rgba(255, 248, 210, 0.9)';
  context.lineWidth = 2.1;
  context.moveTo(playerPoint.x, playerPoint.y);
  context.lineTo(playerPoint.x + headingX * 14, playerPoint.y + headingY * 14);
  context.stroke();

  context.beginPath();
  context.fillStyle = 'rgba(255, 248, 210, 0.95)';
  context.arc(playerPoint.x, playerPoint.y, 4.2, 0, Math.PI * 2);
  context.fill();

  const panelWidth = Math.min(width * 0.72, 510);
  context.fillStyle = 'rgba(9, 18, 13, 0.54)';
  context.fillRect(12, 12, panelWidth, 56);
  context.strokeStyle = 'rgba(166, 188, 158, 0.48)';
  context.lineWidth = 1;
  context.strokeRect(12.5, 12.5, panelWidth - 1, 55);

  context.fillStyle = '#ecf4df';
  context.font = `${Math.round(Math.max(12, width * 0.012))}px "Trebuchet MS", sans-serif`;
  context.fillText(`WebGL unavailable: tactical fallback (${activeMap.key}) with transport hubs.`, 24, 35);
  context.fillStyle = '#d8e2cc';
  context.font = `${Math.round(Math.max(11, width * 0.01))}px "Trebuchet MS", sans-serif`;
  context.fillText(
    `seed ${WORLD_SEED} | resources ${world.resourceNodes.length - harvestedResourceIds.size} | imports ${importStatusMessage}`,
    24,
    54,
  );
}

function removeMesh(mesh: THREE.Mesh): void {
  scene.remove(mesh);
  mesh.geometry.dispose();
  const material = mesh.material;
  if (Array.isArray(material)) {
    for (const item of material) {
      item.dispose();
    }
  } else {
    material.dispose();
  }
}

function createResourceMesh(node: ResourceNode): THREE.Mesh {
  const profile = getResourceProfile(node.kind);
  const geometry =
    node.kind === 'wood'
      ? new THREE.CylinderGeometry(0.38, 0.46, 1.05, 6)
      : new THREE.DodecahedronGeometry(0.55, 0);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: profile.nodeColor,
      roughness: 0.75,
      metalness: node.kind === 'stone' ? 0.08 : 0.02,
    }),
  );
  mesh.position.set(node.position.x, node.position.y, node.position.z);
  mesh.rotation.y = (node.position.x * 0.13 + node.position.z * 0.09) % (Math.PI * 2);
  mesh.userData = {
    resourceId: node.id,
    kind: node.kind,
  };
  return mesh;
}

function rebuildResourceMeshes(): void {
  for (const mesh of resourceMeshes.values()) {
    removeMesh(mesh);
  }
  resourceMeshes.clear();

  for (const node of world.resourceNodes) {
    if (harvestedResourceIds.has(node.id)) {
      continue;
    }
    const mesh = createResourceMesh(node);
    resourceMeshes.set(node.id, mesh);
    scene.add(mesh);
  }
}

function createStructureMesh(structure: PlacedStructure): THREE.Mesh {
  const profile = getResourceProfile(structure.kind);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: profile.structureColor,
      roughness: 0.66,
      metalness: structure.kind === 'stone' ? 0.05 : 0.01,
    }),
  );
  mesh.position.set(structure.position.x, structure.position.y, structure.position.z);
  mesh.userData = {
    structureId: structure.id,
    kind: structure.kind,
  };
  return mesh;
}

function rebuildStructureMeshes(): void {
  for (const mesh of structureMeshes.values()) {
    removeMesh(mesh);
  }
  structureMeshes.clear();

  for (const structure of placedStructures) {
    const mesh = createStructureMesh(structure);
    structureMeshes.set(structure.id, mesh);
    scene.add(mesh);
  }
}

function syncCameraPose(): void {
  camera.position.set(player.position.x, player.position.y, player.position.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
}

function calculateMovementInput(): MovementInput {
  const forward = (pressedKeys.has('w') ? 1 : 0) + (pressedKeys.has('s') ? -1 : 0);
  const strafe = (pressedKeys.has('d') ? 1 : 0) + (pressedKeys.has('a') ? -1 : 0);

  return {
    forward,
    strafe,
    sprint: pressedKeys.has('shift'),
  };
}

function calculatePlacementPosition(): Vec3 | null {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  direction.y = 0;

  if (direction.lengthSq() === 0) {
    direction.set(0, 0, -1);
  }
  direction.normalize();

  const rawX = player.position.x + direction.x * 2.6;
  const rawZ = player.position.z + direction.z * 2.6;

  const x = Math.round(rawX * 2) / 2;
  const z = Math.round(rawZ * 2) / 2;

  if (x < worldBounds.minX || x > worldBounds.maxX || z < worldBounds.minZ || z > worldBounds.maxZ) {
    return null;
  }

  return { x, y: terrainHeightAt(x, z) + 0.5, z };
}

function resolveGatherTarget(): { target: ResourceNode | null; distance: number } {
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersections = raycaster.intersectObjects([...resourceMeshes.values()], false);
  const nearest = intersections[0];

  if (!nearest) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-5) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }

    let candidate: ResourceNode | null = null;
    let candidateDistance = Number.POSITIVE_INFINITY;

    for (const node of world.resourceNodes) {
      if (harvestedResourceIds.has(node.id)) {
        continue;
      }

      const toNode = new THREE.Vector3(node.position.x - player.position.x, 0, node.position.z - player.position.z);
      const planarDistance = toNode.length();

      if (!Number.isFinite(planarDistance) || planarDistance > GATHER_RANGE || planarDistance < 0.05) {
        continue;
      }

      const facing = toNode.normalize().dot(forward);
      if (facing < 0.4) {
        continue;
      }

      if (planarDistance < candidateDistance) {
        candidate = node;
        candidateDistance = planarDistance;
      }
    }

    return {
      target: candidate,
      distance: candidateDistance,
    };
  }

  const resourceId = nearest.object.userData.resourceId as string | undefined;
  if (!resourceId) {
    return {
      target: null,
      distance: Number.POSITIVE_INFINITY,
    };
  }

  return {
    target: resourceById.get(resourceId) ?? null,
    distance: nearest.distance,
  };
}

function attemptGather(): void {
  const candidate = resolveGatherTarget();
  const decision = decideGather({
    canUseTool: canUseTool(survival),
    target: candidate.target,
    distance: candidate.distance,
    alreadyHarvested: candidate.target ? harvestedResourceIds.has(candidate.target.id) : false,
  });

  if (!decision.ok || !candidate.target || !decision.kind || !decision.amount || !decision.wearCost) {
    setStatus(decision.reason ?? 'cannot gather now');
    return;
  }

  harvestedResourceIds.add(candidate.target.id);

  const mesh = resourceMeshes.get(candidate.target.id);
  if (mesh) {
    removeMesh(mesh);
    resourceMeshes.delete(candidate.target.id);
  }

  inventory = addInventoryItem(inventory, decision.kind, decision.amount);
  survival = applyToolWear(survival, decision.wearCost);
  setStatus(`gathered ${decision.amount} ${decision.kind}`);
}

function attemptPlace(): void {
  const placement = calculatePlacementPosition();
  const decision = decidePlacement({
    selectedKind: inventory.selected,
    selectedCount: getSelectedCount(inventory),
    candidate: placement,
    playerPosition: player.position,
    bounds: worldBounds,
    placedStructures,
  });

  if (!decision.ok || !placement) {
    setStatus(decision.reason ?? 'cannot place here');
    return;
  }

  const consumed = consumeSelectedItem(inventory, 1);
  if (!consumed.consumed) {
    setStatus(`no ${inventory.selected} left`);
    return;
  }

  const nextIndex = placedStructures.length + 1;
  const structure: PlacedStructure = {
    id: createStructureId(inventory.selected, nextIndex),
    kind: inventory.selected,
    position: placement,
  };

  inventory = consumed.state;
  placedStructures.push(structure);

  const mesh = createStructureMesh(structure);
  structureMeshes.set(structure.id, mesh);
  scene.add(mesh);

  setStatus(`placed ${structure.kind}`);
}

function attemptRecover(): void {
  if (!isDowned(survival)) {
    setStatus('you are not downed');
    return;
  }

  survival = recoverFromDowned(survival);
  player = createInitialPlayerState(world.spawnChunk);
  setPlayerLayer('surface');
  syncCameraPose();
  setStatus('recovered at spawn', true);
}

function toPlacedStructureSnapshots(items: PlacedStructure[]): PlacedStructureSnapshot[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.kind,
    position: {
      x: item.position.x,
      y: item.position.y,
      z: item.position.z,
    },
  }));
}

function buildSaveSnapshot(): PersistedGameState {
  return {
    version: 1,
    seed: WORLD_SEED,
    savedAt: Date.now(),
    player: {
      position: {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      },
      yaw: player.yaw,
      pitch: player.pitch,
    },
    inventory: {
      selected: inventory.selected,
      items: {
        wood: inventory.items.wood,
        stone: inventory.items.stone,
      },
    },
    survival: {
      health: survival.health,
      hunger: survival.hunger,
      temperature: survival.temperature,
      durability: survival.durability,
      clockMinutes: survival.clockMinutes,
    },
    harvestedResourceIds: [...harvestedResourceIds],
    placedStructures: toPlacedStructureSnapshots(placedStructures),
  };
}

function applyLoadedGameState(saved: PersistedGameState): void {
  player = {
    position: {
      x: saved.player.position.x,
      y: saved.player.position.y,
      z: saved.player.position.z,
    },
    yaw: saved.player.yaw,
    pitch: saved.player.pitch,
  };
  inferPlayerLayerFromHeight(player.position);

  inventory = {
    selected: saved.inventory.selected,
    items: {
      wood: saved.inventory.items.wood,
      stone: saved.inventory.items.stone,
    },
  };

  survival = {
    health: saved.survival.health,
    hunger: saved.survival.hunger,
    temperature: saved.survival.temperature,
    durability: saved.survival.durability,
    clockMinutes: saved.survival.clockMinutes,
  };

  harvestedResourceIds.clear();
  for (const resourceId of saved.harvestedResourceIds) {
    harvestedResourceIds.add(resourceId);
  }

  placedStructures.splice(
    0,
    placedStructures.length,
    ...saved.placedStructures.map((item) => ({
      id: item.id,
      kind: item.kind,
      position: {
        x: item.position.x,
        y: item.position.y,
        z: item.position.z,
      },
    })),
  );

  rebuildResourceMeshes();
  rebuildStructureMeshes();
  syncCameraPose();
}

function resetToDefaultGameState(): void {
  player = createInitialPlayerState(world.spawnChunk);
  inventory = createInventoryState();
  survival = createInitialSurvivalState();
  setPlayerLayer('surface');

  harvestedResourceIds.clear();
  placedStructures.splice(0, placedStructures.length);

  rebuildResourceMeshes();
  rebuildStructureMeshes();
  syncCameraPose();
}

function formatLoadIssue(issue: Exclude<SaveLoadIssue, 'missing'>): string {
  switch (issue) {
    case 'invalid_json':
      return 'broken json';
    case 'invalid_schema':
      return 'schema mismatch';
    case 'unsupported_version':
      return 'unsupported version';
    default:
      return 'unknown';
  }
}

function recoverBrokenSave(raw: string, issue: Exclude<SaveLoadIssue, 'missing'>): void {
  const backupKey = archiveCorruptedSave(storage, mapSaveKey, raw);
  resetToDefaultGameState();
  setStatus(`save reset (${formatLoadIssue(issue)})`, true);
  console.warn(`[save] invalid slot archived to ${backupKey}`);
}

function recoverIncompatibleSave(raw: string, reason: string): void {
  const backupKey = archiveCorruptedSave(storage, mapSaveKey, raw);
  resetToDefaultGameState();
  setStatus(reason, true);
  console.warn(`[save] incompatible slot archived to ${backupKey}`);
}

function saveCurrentGame(): void {
  const snapshot = buildSaveSnapshot();
  saveGameState(storage, mapSaveKey, snapshot);
  setStatus('saved');
}

function loadCurrentGame(showNotFound = true, showFreshOnMissing = false): boolean {
  const report = inspectGameState(storage, mapSaveKey);
  const loaded = report.state;

  if (!loaded) {
    if (report.issue === 'missing') {
      if (showNotFound) {
        setStatus('no save found');
      } else if (showFreshOnMissing) {
        setStatus('new world loaded', true);
      }
      return false;
    }

    if (report.raw && report.issue) {
      recoverBrokenSave(report.raw, report.issue);
    } else {
      resetToDefaultGameState();
      setStatus('no save found');
    }

    return false;
  }

  if (loaded.seed !== WORLD_SEED) {
    if (report.raw) {
      recoverIncompatibleSave(report.raw, 'save seed mismatch, started fresh');
    } else {
      resetToDefaultGameState();
      setStatus('save seed mismatch, started fresh', true);
    }
    return false;
  }

  applyLoadedGameState(loaded);
  setStatus('loaded save');
  return true;
}

function hasNearbyHeatSource(position: Vec3): boolean {
  return placedStructures.some((structure) => {
    return (
      structure.kind === 'wood' &&
      Math.hypot(structure.position.x - position.x, structure.position.z - position.z) <= HEAT_RADIUS
    );
  });
}

function updateHud(now: number): void {
  const assessment = assessSurvivalState(survival);

  if (!statusSticky && now > statusExpiresAt) {
    statusMessage = assessment.message ?? 'ready';
  }

  positionEl.textContent = formatPlayerPosition(player.position);
  resourceCountEl.textContent = String(world.resourceNodes.length - harvestedResourceIds.size);
  structureCountEl.textContent = String(placedStructures.length);

  healthEl.textContent = survival.health.toFixed(1);
  hungerEl.textContent = survival.hunger.toFixed(1);
  temperatureEl.textContent = survival.temperature.toFixed(1);
  durabilityEl.textContent = survival.durability.toFixed(1);
  survivalStateEl.textContent = assessment.condition;

  inventoryWoodEl.textContent = String(inventory.items.wood);
  inventoryStoneEl.textContent = String(inventory.items.stone);
  selectedSlotEl.textContent = `${inventory.selected} (${getSelectedCount(inventory)})`;
  interactionStatusEl.textContent = statusMessage;
  importStatusEl.textContent = importStatusMessage;
}

function runActionQueue(downed: boolean): void {
  const actions = actionQueue.splice(0, actionQueue.length);

  for (const action of actions) {
    switch (action) {
      case 'gather':
        if (downed) {
          setStatus('cannot gather while downed');
        } else {
          attemptGather();
        }
        break;
      case 'place':
        if (downed) {
          setStatus('cannot place while downed');
        } else {
          attemptPlace();
        }
        break;
      case 'recover':
        attemptRecover();
        break;
      case 'save':
        saveCurrentGame();
        break;
      case 'load':
        loadCurrentGame();
        break;
      case 'use':
        if (downed) {
          setStatus('cannot use transit while downed');
        } else {
          attemptUseTraversal();
        }
        break;
      case 'nextMap':
        switchToNextMap();
        break;
      default:
        break;
    }
  }
}

function handleKeyboardDown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  pressedKeys.add(key);

  if (key === '1' || key === '2') {
    inventory = selectInventorySlotByDigit(inventory, Number(key));
    setStatus(`selected ${inventory.selected}`);
    return;
  }

  if (event.repeat) {
    return;
  }

  if (key === 'e') {
    actionQueue.push('gather');
    event.preventDefault();
  } else if (key === 'q') {
    actionQueue.push('place');
    event.preventDefault();
  } else if (key === 'f') {
    actionQueue.push('use');
    event.preventDefault();
  } else if (key === 'k') {
    actionQueue.push('save');
    event.preventDefault();
  } else if (key === 'l') {
    actionQueue.push('load');
    event.preventDefault();
  } else if (key === 'r') {
    actionQueue.push('recover');
    event.preventDefault();
  } else if (key === 'm') {
    actionQueue.push('nextMap');
    event.preventDefault();
  }
}

function handleKeyboardUp(event: KeyboardEvent): void {
  pressedKeys.delete(event.key.toLowerCase());
}

window.addEventListener('keydown', handleKeyboardDown);
window.addEventListener('keyup', handleKeyboardUp);

renderSurface.addEventListener('click', () => {
  renderSurface.requestPointerLock();
});

renderSurface.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderSurface) {
    return;
  }

  lookDeltaX += event.movementX;
  lookDeltaY += event.movementY;
});

saveButton.addEventListener('click', saveCurrentGame);
loadButton.addEventListener('click', () => {
  loadCurrentGame();
});
mapNextButton.addEventListener('click', switchToNextMap);

const resize = (): void => {
  const width = Math.max(viewport.clientWidth, 320);
  const height = Math.max(viewport.clientHeight, 180);
  if (renderer) {
    renderer.setSize(width, height, false);
  } else {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderSurface.width = Math.floor(width * dpr);
    renderSurface.height = Math.floor(height * dpr);
    fallbackTerrainLayer = buildFallbackTerrainLayer(renderSurface.width, renderSurface.height);
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

window.addEventListener('resize', resize);
resize();

rebuildResourceMeshes();
rebuildStructureMeshes();
syncCameraPose();

rendererStatusEl.textContent = renderer ? 'ready (webgl1)' : 'ready (fallback)';
void bootImportedAssets();

loadCurrentGame(false, true);

if (import.meta.env.DEV) {
  window.__sandboxDebug = {
    setSurvival(next) {
      survival = { ...survival, ...next };
      setStatus('debug survival updated');
    },
    setPlayerPosition(next) {
      const previousPosition = { ...player.position };
      const surfaceY = terrainHeightAt(next.x ?? player.position.x, next.z ?? player.position.z) + PLAYER_EYE_HEIGHT;
      const nextPosition = {
        x: next.x ?? player.position.x,
        y: next.y ?? surfaceY,
        z: next.z ?? player.position.z,
      };
      const resolvedPosition = resolvePositionAgainstImportColliders(
        previousPosition,
        nextPosition,
        importedCollisionProxies,
      );
      player = {
        ...player,
        position: resolvedPosition,
      };
      inferPlayerLayerFromHeight(player.position);
      setStatus('debug player moved');
    },
    getSnapshot() {
      return {
        health: survival.health,
        hunger: survival.hunger,
        temperature: survival.temperature,
        durability: survival.durability,
        structures: placedStructures.length,
      };
    },
    getRenderMetrics() {
      return {
        rendererStatus: rendererStatusEl.textContent ?? 'unknown',
        drawCalls: renderer ? renderer.info.render.calls : null,
        triangles: renderer ? renderer.info.render.triangles : null,
        frame: renderer ? renderer.info.render.frame : null,
        playerLayer,
      };
    },
    getTravelNodes() {
      return travelRegistry.nodes.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        layer: node.layer,
        position: {
          x: node.position.x,
          y: node.position.y,
          z: node.position.z,
        },
      }));
    },
  };
}

let lastFrameTime = performance.now();

const loop = (now: number): void => {
  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 0.05);
  lastFrameTime = now;

  if (pressedKeys.has('arrowleft')) {
    lookDeltaX += 2.4;
  }
  if (pressedKeys.has('arrowright')) {
    lookDeltaX -= 2.4;
  }
  if (pressedKeys.has('arrowup')) {
    lookDeltaY += 2.4;
  }
  if (pressedKeys.has('arrowdown')) {
    lookDeltaY -= 2.4;
  }

  const downed = isDowned(survival);

  if (!downed) {
    player = applyLookDelta(player, lookDeltaX, lookDeltaY);
  }

  lookDeltaX = 0;
  lookDeltaY = 0;
  const previousPosition = { ...player.position };

  if (!downed) {
    const movement = calculateMovementInput();
    player = stepPlayer(player, movement, deltaSeconds, worldBounds);
  }

  const surfaceY = terrainHeightAt(player.position.x, player.position.z) + PLAYER_EYE_HEIGHT;
  const targetY = playerLayer === 'underground' && forcedPlayerY !== null ? forcedPlayerY : surfaceY;
  const withHeight = {
    ...player.position,
    y: targetY,
  };
  const resolvedPosition = resolvePositionAgainstImportColliders(previousPosition, withHeight, importedCollisionProxies);
  player = {
    ...player,
    position: resolvedPosition,
  };

  runActionQueue(downed);

  const nearHeatSource = hasNearbyHeatSource(player.position);
  survival = tickSurvival(survival, deltaSeconds, nearHeatSource);

  syncCameraPose();
  updateHud(now);
  if (renderer) {
    renderer.render(scene, camera);
  } else {
    if (now - lastFallbackRenderAt >= 84) {
      renderFallbackScene();
      lastFallbackRenderAt = now;
    }
  }

  window.requestAnimationFrame(loop);
};

window.requestAnimationFrame(loop);

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Required element missing: ${selector}`);
  }
  return element;
}
