import { describe, expect, test } from 'vitest';
import { buildMapManifestAssetPath, parseAssetManifest } from '../../src/world/import/asset-manifest';

describe('asset manifest parser', () => {
  test('parses valid manifest payload', () => {
    const result = parseAssetManifest(
      {
        version: 1,
        mapKey: 'wildlands',
        assets: [
          {
            id: 'tower',
            label: 'Tower',
            path: 'assets/models/landmark-box.glb',
            transform: {
              position: { x: 1, y: 2, z: 3 },
              rotation: { x: 0, y: 0.5, z: 0 },
              scale: { x: 3, y: 4, z: 5 },
            },
            materialStrategy: 'flat-shaded',
            collisionStrategy: 'aabb-proxy',
            collisionProxy: {
              kind: 'box',
              offset: { x: 0, y: 0, z: 0 },
              size: { x: 3, y: 4, z: 5 },
              blocking: true,
            },
            interactable: true,
            interactionMarkers: [
              {
                id: 'tower-entry',
                label: 'Tower Entry',
                offset: { x: 0, y: 0, z: 1 },
                radius: 2,
              },
            ],
          },
        ],
      },
      'wildlands',
    );

    expect(result.manifest).not.toBeNull();
    expect(result.manifest?.mapKey).toBe('wildlands');
    expect(result.manifest?.assets).toHaveLength(1);
    expect(result.manifest?.assets[0]?.collisionProxy?.size.y).toBe(4);
    expect(result.issues).toEqual([]);
  });

  test('drops malformed assets and surfaces issues', () => {
    const result = parseAssetManifest(
      {
        version: 1,
        mapKey: 'wildlands',
        assets: [
          {
            id: 'broken',
            materialStrategy: 'source',
          },
        ],
      },
      'wildlands',
    );

    expect(result.manifest).not.toBeNull();
    expect(result.manifest?.assets).toHaveLength(0);
    expect(result.issues.some((issue) => issue.includes('missing path'))).toBe(true);
  });

  test('builds canonical map manifest path', () => {
    expect(buildMapManifestAssetPath('tiananmen')).toBe('assets/maps/tiananmen/manifest.json');
  });
});
