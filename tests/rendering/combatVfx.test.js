import { describe, expect, it, vi } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { EventBus } from '../../src/core/EventBus.js';
import { createCombatVfx } from '../../src/rendering/combatVfx.js';
import { install as installCombatVfxPlugin } from '../../src/rendering/combat-vfx.plugin.js';

function createGroundSampler() {
  return (x, z, target = {}) => {
    target.height = Math.sin(x * 0.1) * 0.05 + Math.cos(z * 0.1) * 0.05;
    target.normal ??= new Vector3();
    target.normal.set(0, 1, 0);
    target.material = 'mud';
    return target;
  };
}

describe('pooled combat VFX', () => {
  it('caps particles, decals, flashes, and keeps a fixed scene object count', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 6);
    const vfx = createCombatVfx({
      scene,
      quality: 'low',
      sampleGround: createGroundSampler(),
      seed: 12,
    });
    const initialChildren = vfx.root.children.length;
    const point = new Vector3(0, 1.2, 0);

    for (let index = 0; index < 180; index += 1) {
      vfx.spawnImpact({
        point,
        direction: new Vector3(0.2, 0.1, 1),
        material: index % 2 ? 'steel' : 'flesh',
        severity: 1,
        outcome: index % 3 ? 'hit' : 'parried',
      });
      vfx.spawnCasualty({
        position: new Vector3(index * 1.1, 0, index % 5),
      });
      vfx.spawnMudStep(new Vector3(index * 0.2, 0, 0), {
        yaw: index * 0.1,
        side: index % 2 ? 1 : -1,
        intensity: 1,
      });
    }
    vfx.update(1 / 60, { camera, actors: [] });

    const stats = vfx.getStats();
    expect(stats.particles).toBeLessThanOrEqual(stats.caps.particles);
    expect(stats.sparks).toBeLessThanOrEqual(stats.caps.sparks);
    expect(stats.decals).toBeLessThanOrEqual(stats.caps.decals);
    expect(stats.flashes).toBeLessThanOrEqual(stats.caps.flashes);
    expect(vfx.root.children).toHaveLength(initialChildren);
    expect(vfx.root.getObjectByName('PooledGroundImpactDecals')?.isInstancedMesh).toBe(true);
    expect(vfx.root.getObjectByName('PooledMetalSparkPoints')?.isPoints).toBe(true);

    vfx.dispose();
    expect(scene.getObjectByName('CombatAndWeatherVFX')).toBeUndefined();
  });

  it('creates bounded nearby contact grounding and rain splashes', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(0, 2, 0);
    const vfx = createCombatVfx({
      scene,
      quality: 'low',
      sampleGround: createGroundSampler(),
      seed: 88,
    });
    const actors = Array.from({ length: 50 }, (_, index) => ({
      radius: 0.42,
      combatant: { alive: true },
      object3d: {
        visible: true,
        position: new Vector3((index % 8) - 4, 0, Math.floor(index / 8) - 3),
        rotation: { y: index * 0.1 },
      },
    }));

    vfx.update(0.1, { camera, actors, rain: true });
    vfx.update(0.2, { camera, actors, rain: true });

    const contacts = vfx.root.getObjectByName('NearbyActorContactGrounding');
    expect(contacts.count).toBeLessThanOrEqual(vfx.caps.contacts);
    expect(vfx.getStats().decals).toBeGreaterThan(0);
    vfx.dispose();
  });

  it('auto-discovered plugin consumes existing combat, casualty, and movement state', () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    const events = new EventBus();
    const player = {
      position: new Vector3(),
      velocity: new Vector3(6, 0, 0),
      yaw: 0,
      grounded: true,
      config: { sprintSpeed: 7.4 },
    };
    const renderer = {
      capabilities: { maxTextureSize: 4096 },
      getPixelRatio: () => 1,
    };
    const app = {
      world: {
        sampleGround: createGroundSampler(),
        getWeatherIntensity: () => 0,
      },
      battlefieldSimulation: { actors: [] },
    };
    const context = {
      scene,
      camera,
      events,
      player,
      renderer,
      app,
    };
    const system = installCombatVfxPlugin(context);
    const impactSpy = vi.spyOn(app.combatVfx, 'spawnImpact');
    const casualtySpy = vi.spyOn(app.combatVfx, 'spawnCasualty');

    events.emit('battlefield:ai-impact', {
      result: {
        point: new Vector3(1, 1, 1),
        material: 'metal',
        outcome: 'blocked',
        severity: 0.7,
      },
    });
    events.emit('battlefield:casualty', { position: new Vector3(2, 0, 2) });
    player.position.x = 2;
    system.update(0.25);

    expect(impactSpy).toHaveBeenCalledTimes(1);
    expect(casualtySpy).toHaveBeenCalledTimes(1);
    expect(app.combatVfx.getStats().decals).toBeGreaterThan(0);

    system.dispose();
    expect(app.combatVfx).toBeUndefined();
  });
});

