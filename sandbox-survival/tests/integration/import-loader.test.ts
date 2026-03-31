import { describe, expect, test } from 'vitest';
import * as THREE from 'three';
import type { MapPreset } from '../../src/world/map-presets';
import { MAP_PRESETS } from '../../src/world/map-presets';
import { loadImportedAssetsForMap } from '../../src/world/import/asset-loader';

function createStubGlbObject(): THREE.Object3D {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xa0a0a0 }));
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

describe('imported assets integration', () => {
  test('mounts manifest-driven assets from map presets into scene', async () => {
    for (const preset of MAP_PRESETS) {
      const scene = new THREE.Scene();
      const summary = await loadImportedAssetsForMap(preset, scene, {
        glbLoader: async () => createStubGlbObject(),
      });

      expect(summary.requested).toBeGreaterThanOrEqual(1);
      expect(summary.loaded).toBe(summary.requested);
      expect(summary.collisionProxies.length).toBeGreaterThanOrEqual(1);
      expect(summary.landmarkMarkers.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('keeps behavior stable when manifest is not configured', async () => {
    const scene = new THREE.Scene();
    const emptyPreset: MapPreset = {
      key: 'unconfigured-map',
      name: 'Unconfigured',
      description: 'No import manifest',
      seed: 1,
      cityRadius: 3,
    };

    const summary = await loadImportedAssetsForMap(emptyPreset, scene, {
      glbLoader: async () => createStubGlbObject(),
    });

    expect(summary.requested).toBe(0);
    expect(summary.loaded).toBe(0);
    expect(summary.collisionProxies).toHaveLength(0);
    expect(summary.issues.some((issue) => issue.includes('manifest not found'))).toBe(true);
  });

  test('survives missing GLB resources with fallback status', async () => {
    const scene = new THREE.Scene();
    const statusLog: string[] = [];
    const summary = await loadImportedAssetsForMap(MAP_PRESETS[0], scene, {
      glbLoader: async () => {
        throw new Error('missing file');
      },
      onStatus: (status) => {
        statusLog.push(status);
      },
    });

    expect(summary.fallback).toBe(summary.requested);
    expect(summary.issues.some((issue) => issue.includes('GLB load failed'))).toBe(true);
    expect(statusLog[statusLog.length - 1]).toContain('warnings');
  });
});
