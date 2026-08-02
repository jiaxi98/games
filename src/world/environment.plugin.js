import * as THREE from 'three';
import { createWorld } from './createWorld.js';

export const name = 'ashen-standard-environment';

export function install(context) {
  const world = createWorld(context.scene, context.renderer, {
    quality: selectQuality(context.renderer),
    shadows: true,
    weather: true,
  });
  const disposers = [];

  context.removeFallbackEnvironment();
  context.world = world;
  disposers.push(context.setGroundHeightProvider(world.sampleHeight));

  world.colliders.forEach((box, index) => {
    disposers.push(context.registerCollider(box.min, box.max, {
      id: `world-environment-${index}`,
      kind: 'environment',
    }));
  });

  const spawn = world.landmarks.playerStart.clone();
  spawn.y = world.sampleHeight(spawn.x, spawn.z) + 0.04;
  context.setSpawn(spawn, {
    yaw: 0,
    pitch: THREE.MathUtils.degToRad(-2),
  });

  // Other systems can remain decoupled from implementation details.
  context.events.emit('world:ready', {
    world,
    landmarks: world.landmarks,
    sampleHeight: world.sampleHeight,
  });

  const intensityEvents = [
    context.events.on('battle:status', ({ intensity } = {}) => {
      if (Number.isFinite(intensity)) world.setBattleIntensity(intensity);
    }),
    context.events.on('battle:phase', ({ phase } = {}) => {
      const intensityByPhase = {
        opening: 0.8,
        standard: 0.95,
        rally: 0.82,
        spear_line: 1,
        ford: 0.9,
        victory: 0.35,
      };
      if (phase in intensityByPhase) {
        world.setBattleIntensity(intensityByPhase[phase]);
      }
    }),
    context.events.on('victory', () => {
      world.setWeatherIntensity(0.22);
      world.setBattleIntensity(0.2);
    }),
  ];
  disposers.push(...intensityEvents);

  return {
    name,
    update(delta) {
      world.update(delta, context.camera, {
        battleIntensity: context.battle?.intensity,
      });
    },
    dispose() {
      if (context.world === world) delete context.world;
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      world.dispose();
    },
  };
}

function selectQuality(renderer) {
  const maxTextureSize = renderer.capabilities.maxTextureSize;
  const pixelRatio = renderer.getPixelRatio();
  if (maxTextureSize < 8192) return 'low';
  if (pixelRatio > 1.5) return 'medium';
  return 'high';
}

export default { name, install };
