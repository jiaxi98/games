import { describe, expect, it } from 'vitest';
import { Vector2 } from 'three';
import { createWorldMaterials } from '../../src/world/materials.js';
import { createVegetation } from '../../src/world/vegetation.js';

describe('battlefield vegetation', () => {
  it('adds instanced edge framing while preserving the central opening', () => {
    const vegetation = createVegetation({
      materials: createWorldMaterials(),
      sampleHeight: () => 0,
      roadPoints: [new Vector2(0, -300), new Vector2(0, 300)],
      quality: 'low',
    });

    const trunks = vegetation.getObjectByName('InstancedTreeTrunks');
    const scrub = vegetation.getObjectByName('InstancedBattlefieldEdgeScrub');
    expect(trunks?.count).toBe(90);
    expect(scrub?.count).toBe(90);
    expect(scrub?.isInstancedMesh).toBe(true);
  });
});
