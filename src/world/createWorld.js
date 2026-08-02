import * as THREE from 'three';
import {
  LANDMARKS,
  WORLD_HALF_SIZE,
  createTerrain,
  createWatercourse,
} from './terrain.js';
import { createWorldMaterials } from './materials.js';
import {
  createBaggageEmbankment,
  createBurningMill,
  createDistantBattleBelts,
  createFieldDressing,
  createHedgerowPocket,
  createRouteCompositionCells,
  createStandard,
  createStoneBridgeAndFord,
} from './battlefield.js';
import { createOldOak, createVegetation } from './vegetation.js';
import { createAtmosphere } from '../rendering/atmosphere.js';
import { disposeObject3D } from './math.js';

const DEFAULT_OPTIONS = Object.freeze({
  seed: 94721,
  quality: 'high',
  weather: true,
  shadows: true,
  terrainSegments: undefined,
});

function getTerrainSegments(quality, requested) {
  if (requested) return requested;
  if (quality === 'low') return 96;
  if (quality === 'medium') return 144;
  return 192;
}

function animateBanners(banners, elapsed, windStrength) {
  banners.forEach((cloth) => {
    const position = cloth.geometry.attributes.position;
    const base = cloth.geometry.userData.basePositions;
    const phase = cloth.userData.bannerPhase || 0;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const x = base[offset];
      const y = base[offset + 1];
      const pinned = Math.min(1, Math.max(0, x / 1.6));
      const wave = (
        Math.sin(elapsed * 4.2 + phase + x * 3.3 - y * 0.7) * 0.115
        + Math.sin(elapsed * 2.1 + phase * 1.7 + x * 6.5) * 0.045
      ) * pinned * windStrength;
      position.setXYZ(index, x, y + wave * 0.24, wave);
    }
    position.needsUpdate = true;
  });
}

function createPuddles({ materials, sampleHeight, quality }) {
  const group = new THREE.Group();
  group.name = 'StandingWater';
  const count = quality === 'low' ? 12 : quality === 'medium' ? 22 : 36;
  const geometry = new THREE.CircleGeometry(1, 18);
  geometry.rotateX(-Math.PI * 0.5);
  const material = materials.standingWater;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = 'InstancedLanePuddles';
  mesh.renderOrder = 2;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    const z = THREE.MathUtils.lerp(180, -130, t);
    const x = Math.sin(index * 4.31) * (2.2 + (index % 4));
    dummy.position.set(x, sampleHeight(x, z) + 0.055, z);
    dummy.rotation.y = index * 1.7;
    dummy.scale.set(1.4 + (index % 5) * 0.55, 1, 0.55 + (index % 3) * 0.3);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  group.add(mesh);
  return group;
}

function createSpearLineMarkers({ materials, sampleHeight }) {
  const group = new THREE.Group();
  group.name = 'EnemySpearLineEnvironmentalMarkers';
  for (let index = 0; index < 4; index += 1) {
    const banner = createStandard({
      materials,
      sampleHeight,
      position: new THREE.Vector3(-24 + index * 16, 0, -92 - (index % 2) * 4),
      color: index % 2 ? 'ochre' : 'red',
      height: 7.2 + (index % 2) * 0.6,
      name: 'SpearLineBanner',
    });
    group.add(banner);
  }
  return group;
}

function setLandmarkHeights(landmarks, sampleHeight, bridgeSurfaceHeight) {
  const result = {};
  Object.entries(landmarks).forEach(([name, value]) => {
    result[name] = value.clone();
    result[name].y = name === 'bridge'
      ? bridgeSurfaceHeight
      : sampleHeight(value.x, value.z);
  });
  return Object.freeze(result);
}

/**
 * Creates the complete environmental layer for The Ashen Standard vertical slice.
 *
 * The caller owns its scene and renderer. This module only configures renderer
 * shadow/color defaults that are safe to share and exposes enough helpers for
 * player physics and encounter scripting to query the procedural ground.
 */
export function createWorld(scene, renderer, options = {}) {
  if (!scene?.isScene) {
    throw new TypeError('createWorld(scene, renderer): scene must be a THREE.Scene');
  }

  const config = { ...DEFAULT_OPTIONS, ...options };
  const root = new THREE.Group();
  root.name = 'TheAshenStandardWorld';
  scene.add(root);

  if (renderer) {
    renderer.shadowMap.enabled = config.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
  }

  const materials = createWorldMaterials();
  const terrain = createTerrain({
    seed: config.seed,
    segments: getTerrainSegments(config.quality, config.terrainSegments),
    receiveShadow: config.shadows,
  });
  root.add(terrain.mesh);

  const watercourse = createWatercourse(terrain.sampleHeight, config.quality);
  root.add(watercourse);

  const puddles = createPuddles({
    materials,
    sampleHeight: terrain.sampleHeight,
    quality: config.quality,
  });
  root.add(puddles);

  const baggage = createBaggageEmbankment({
    materials,
    sampleHeight: terrain.sampleHeight,
  });
  root.add(baggage.group);

  const hedgerow = createHedgerowPocket({
    materials,
    sampleHeight: terrain.sampleHeight,
  });
  root.add(hedgerow.group);

  const mill = createBurningMill({
    materials,
    sampleHeight: terrain.sampleHeight,
  });
  root.add(mill.group);

  const bridge = createStoneBridgeAndFord({
    materials,
    sampleHeight: terrain.sampleHeight,
  });
  root.add(bridge.group);

  const routeComposition = createRouteCompositionCells({
    materials,
    sampleHeight: terrain.sampleHeight,
    seed: config.seed,
    quality: config.quality,
  });
  root.add(routeComposition);

  const vegetation = createVegetation({
    materials,
    sampleHeight: terrain.sampleHeight,
    roadPoints: terrain.roadPoints,
    seed: config.seed,
    quality: config.quality,
  });
  root.add(vegetation);

  const oak = createOldOak({
    materials,
    sampleHeight: terrain.sampleHeight,
    position: new THREE.Vector3(-71, 0, 45),
  });
  root.add(oak);

  const dressing = createFieldDressing({
    materials,
    sampleHeight: terrain.sampleHeight,
    seed: config.seed,
    quality: config.quality,
  });
  root.add(dressing);

  const fallenStandard = createStandard({
    materials,
    sampleHeight: terrain.sampleHeight,
    position: new THREE.Vector3(15, 0, 91),
    color: 'blue',
    height: 6.8,
    fallen: true,
    name: 'FallenAngloGasconStandard',
  });
  root.add(fallenStandard);

  const spearLineMarkers = createSpearLineMarkers({
    materials,
    sampleHeight: terrain.sampleHeight,
  });
  root.add(spearLineMarkers);

  const distantBattle = createDistantBattleBelts({
    materials,
    sampleHeight: terrain.sampleHeight,
    seed: config.seed,
    quality: config.quality,
  });
  root.add(distantBattle.group);

  const bannerCloths = [];
  root.traverse((object) => {
    if (object.name === 'AnimatedBannerCloth') bannerCloths.push(object);
  });

  const atmosphere = createAtmosphere({
    scene,
    quality: config.quality,
    seed: config.seed,
    fireSockets: mill.fireSockets,
  });
  if (!config.weather) atmosphere.setWeatherIntensity(0);

  const colliders = [
    ...baggage.colliders,
    ...hedgerow.colliders,
    ...mill.colliders,
    ...bridge.colliders,
  ];
  const landmarks = setLandmarkHeights(
    LANDMARKS,
    terrain.sampleHeight,
    bridge.bridgeSurfaceHeight,
  );
  let elapsed = 0;
  let windStrength = 1;
  let battleIntensity = 1;
  let bannerAnimationElapsed = 0;
  const bannerAnimationInterval = config.quality === 'low' ? 1 / 12 : 1 / 20;
  const wind = new THREE.Vector3(1, 0, 0.15).normalize();

  function sampleHeight(x, z) {
    if (bridge.walkableBounds.containsPoint(new THREE.Vector2(x, z))) {
      return Math.max(terrain.sampleHeight(x, z), bridge.bridgeSurfaceHeight);
    }
    return terrain.sampleHeight(x, z);
  }

  function sampleGround(x, z, target = {}) {
    target.height = sampleHeight(x, z);
    target.normal = terrain.sampleNormal(
      x,
      z,
      target.normal?.isVector3 ? target.normal : new THREE.Vector3(),
    );
    target.material = Math.abs(z + 174) < 14
      ? 'wet-stone'
      : Math.abs(x) < 10 && z > -145 && z < 200
        ? 'mud'
        : 'earth';
    return target;
  }

  function isBlocked(position, radius = 0.45) {
    const sphere = new THREE.Sphere(position, radius);
    return colliders.some((collider) => collider.intersectsSphere(sphere));
  }

  function constrainPosition(position, radius = 0.45) {
    position.x = THREE.MathUtils.clamp(
      position.x,
      -WORLD_HALF_SIZE + radius,
      WORLD_HALF_SIZE - radius,
    );
    position.z = THREE.MathUtils.clamp(
      position.z,
      -WORLD_HALF_SIZE + radius,
      WORLD_HALF_SIZE - radius,
    );

    // Minimal push-out helper for environmental static boxes.
    colliders.forEach((collider) => {
      if (
        position.x + radius < collider.min.x
        || position.x - radius > collider.max.x
        || position.z + radius < collider.min.z
        || position.z - radius > collider.max.z
      ) return;

      const left = Math.abs(position.x - (collider.min.x - radius));
      const right = Math.abs((collider.max.x + radius) - position.x);
      const near = Math.abs(position.z - (collider.min.z - radius));
      const far = Math.abs((collider.max.z + radius) - position.z);
      const smallest = Math.min(left, right, near, far);
      if (smallest === left) position.x = collider.min.x - radius;
      else if (smallest === right) position.x = collider.max.x + radius;
      else if (smallest === near) position.z = collider.min.z - radius;
      else position.z = collider.max.z + radius;
    });
    return position;
  }

  return {
    root,
    landmarks,
    colliders,
    roadPoints: terrain.roadPoints,
    sampleHeight,
    sampleNormal: terrain.sampleNormal,
    sampleGround,
    isBlocked,
    constrainPosition,
    getWind(target = new THREE.Vector3()) {
      return target.copy(wind).multiplyScalar(windStrength);
    },
    setWeatherIntensity(value) {
      atmosphere.setWeatherIntensity(value);
    },
    setBattleIntensity(value) {
      battleIntensity = THREE.MathUtils.clamp(value, 0, 1);
      atmosphere.setFireIntensity(0.45 + battleIntensity * 0.55);
    },
    update(delta, camera, state = {}) {
      if (!camera?.isCamera) return;
      elapsed += Math.min(delta, 0.1);
      windStrength = state.windStrength ?? (
        0.82 + Math.sin(elapsed * 0.14) * 0.12 + Math.sin(elapsed * 0.71) * 0.08
      );
      battleIntensity = state.battleIntensity ?? battleIntensity;
      bannerAnimationElapsed += Math.min(delta, 0.1);
      if (bannerAnimationElapsed >= bannerAnimationInterval) {
        animateBanners(bannerCloths, elapsed, windStrength);
        bannerAnimationElapsed %= bannerAnimationInterval;
      }
      atmosphere.update(delta, elapsed, camera);

      // Honest far simulation: the ranks subtly surge rather than remaining a static card.
      const farMeshes = [distantBattle.redRanks, distantBattle.blueRanks];
      farMeshes.forEach((mesh, sideIndex) => {
        mesh.position.z = Math.sin(elapsed * 0.48 + sideIndex * Math.PI) * battleIntensity * 1.15;
        mesh.rotation.y = Math.sin(elapsed * 0.21 + sideIndex) * 0.004;
      });
    },
    dispose() {
      atmosphere.dispose();
      root.removeFromParent();
      disposeObject3D(root);
    },
  };
}

export default createWorld;
