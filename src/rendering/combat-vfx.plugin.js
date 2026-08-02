import { createCombatVfx } from './combatVfx.js';
import { polishSceneMaterials } from './materialPolish.js';

export const name = 'pooled-combat-vfx';

export function install(context) {
  const quality = selectQuality(context.renderer);
  const vfx = createCombatVfx({
    scene: context.scene,
    quality,
    pixelRatio: context.renderer.getPixelRatio?.() ?? 1,
    sampleGround(x, z, target) {
      return context.app.world?.sampleGround?.(x, z, target) ?? fallbackGround(x, z, target);
    },
  });
  const disposers = [];
  let previousX = context.player.position.x;
  let previousZ = context.player.position.z;
  let stepDistance = 0;
  let stepSide = 1;
  let elapsed = 0;
  let lastExternalStep = -Infinity;
  let materialPolishQueued = true;

  const onImpact = (event) => vfx.spawnImpact(event);
  const onCasualty = (event) => vfx.spawnCasualty(event);
  const onFootstep = (event = {}) => {
    const position = event.position ?? context.player.position;
    vfx.spawnMudStep(position, {
      yaw: event.yaw ?? context.player.yaw,
      side: stepSide,
      intensity: event.intensity ?? 0.55,
    });
    stepSide *= -1;
    lastExternalStep = elapsed;
  };

  disposers.push(
    context.events.on('combat:impact', onImpact),
    context.events.on('battlefield:ai-impact', onImpact),
    context.events.on('player:damage', onImpact),
    context.events.on('combat:kill', onCasualty),
    context.events.on('battlefield:casualty', onCasualty),
    context.events.on('footstep', onFootstep),
    context.events.on('player:footstep', onFootstep),
    context.events.on('world:ready', () => { materialPolishQueued = true; }),
    context.events.on('battlefield:ready', () => { materialPolishQueued = true; }),
    context.events.on('combat:ready', () => { materialPolishQueued = true; }),
    context.events.on('extension:installed', () => { materialPolishQueued = true; }),
  );

  context.app.combatVfx = vfx;

  return {
    name,
    update(delta) {
      elapsed += Math.min(delta, 0.1);
      if (materialPolishQueued) {
        polishSceneMaterials(context.scene);
        materialPolishQueued = false;
      }
      const { player } = context;
      const dx = player.position.x - previousX;
      const dz = player.position.z - previousZ;
      previousX = player.position.x;
      previousZ = player.position.z;
      const distance = Math.hypot(dx, dz);
      const speed = Math.hypot(player.velocity.x, player.velocity.z);
      if (player.grounded && speed > 0.45) {
        stepDistance += distance;
        const stride = speed > 5.4 ? 1.48 : 1.82;
        if (stepDistance >= stride && elapsed - lastExternalStep > 0.18) {
          stepDistance %= stride;
          vfx.spawnMudStep(player.position, {
            yaw: player.yaw,
            side: stepSide,
            intensity: Math.min(1, speed / Math.max(1, player.config.sprintSpeed)),
          });
          stepSide *= -1;
        }
      } else {
        stepDistance = 0;
      }

      vfx.setWeatherIntensity(context.app.world?.getWeatherIntensity?.() ?? 1);
      vfx.update(delta, {
        camera: context.camera,
        actors: context.app.battlefieldSimulation?.actors ?? [],
        rain: true,
      });
    },
    resize({ pixelRatio }) {
      vfx.resize(pixelRatio);
    },
    dispose() {
      for (const dispose of disposers.splice(0).reverse()) dispose?.();
      if (context.app.combatVfx === vfx) delete context.app.combatVfx;
      vfx.dispose();
    },
  };
}

function fallbackGround(_x, _z, target = {}) {
  target.height = 0;
  target.normal?.set?.(0, 1, 0);
  target.material = 'earth';
  return target;
}

function selectQuality(renderer) {
  const maxTextureSize = renderer?.capabilities?.maxTextureSize ?? 8192;
  const pixelRatio = renderer?.getPixelRatio?.() ?? 1;
  if (maxTextureSize < 8192) return 'low';
  if (pixelRatio > 1.5) return 'medium';
  return 'high';
}

export default { name, install };
