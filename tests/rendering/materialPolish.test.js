import { describe, expect, it } from 'vitest';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
} from 'three';
import { polishSceneMaterials } from '../../src/rendering/materialPolish.js';

describe('scene material polish', () => {
  it('separates generated cloth, skin, metal, and wood without reapplying', () => {
    const root = new Group();
    const definitions = [
      ['Face', new MeshStandardMaterial({ color: 0x9f6f50, roughness: 0.98 })],
      ['FactionTabard', new MeshStandardMaterial({ color: 0x742321, roughness: 1 })],
      ['SwordBlade', new MeshStandardMaterial({ color: 0x777777, roughness: 0.5, metalness: 0.5 })],
      ['SpearShaft', new MeshStandardMaterial({ color: 0x493522, roughness: 0.92 })],
    ];
    for (const [name, material] of definitions) {
      const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
      mesh.name = name;
      root.add(mesh);
    }

    expect(polishSceneMaterials(root)).toBe(4);
    expect(definitions[0][1].userData.renderingMaterialFamily).toBe('skin');
    expect(definitions[1][1].userData.renderingMaterialFamily).toBe('cloth');
    expect(definitions[2][1].userData.renderingMaterialFamily).toBe('metal');
    expect(definitions[3][1].userData.renderingMaterialFamily).toBe('wood');
    expect(definitions[2][1].roughness).toBeLessThan(definitions[1][1].roughness);
    expect(definitions[2][1].metalness).toBeGreaterThan(0.55);
    expect(polishSceneMaterials(root)).toBe(0);
  });
});

