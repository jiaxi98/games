import { describe, expect, it } from 'vitest';
import { createWorldMaterials } from '../../src/world/materials.js';

describe('procedural world materials', () => {
  it('separates cloth, metal, wood, and wet ground response', () => {
    const materials = createWorldMaterials();

    expect(materials.redCloth.userData.materialFamily).toBe('cloth');
    expect(materials.timber.userData.materialFamily).toBe('wood');
    expect(materials.iron.userData.materialFamily).toBe('metal');
    expect(materials.soil.userData.materialFamily).toBe('ground');

    expect(materials.iron.metalness).toBeGreaterThan(0.6);
    expect(materials.iron.roughness).toBeLessThan(materials.timber.roughness);
    expect(materials.timber.userData.proceduralSurface.grain).toBeGreaterThan(0.5);
    expect(materials.redCloth.userData.proceduralSurface.fiber).toBeGreaterThan(0.3);
    expect(materials.soil.userData.proceduralSurface.wetness).toBeGreaterThan(0.5);
    expect(materials.soil.userData.proceduralSurface.contactDarkening).toBeGreaterThan(0.08);
    expect(materials.standingWater.roughness).toBeLessThan(0.2);

    const keys = [
      materials.redCloth.customProgramCacheKey(),
      materials.iron.customProgramCacheKey(),
      materials.timber.customProgramCacheKey(),
      materials.soil.customProgramCacheKey(),
    ];
    expect(new Set(keys).size).toBe(4);
  });
});

