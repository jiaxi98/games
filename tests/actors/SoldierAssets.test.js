import { describe, expect, it } from 'vitest';
import {
  createCaptainActor,
  createSoldierActor,
} from '../../src/actors/SoldierActor.js';
import { getSoldierAssetStats } from '../../src/actors/SoldierAssets.js';

describe('shared soldier render assets', () => {
  it('shares immutable geometry and materials across a large group', () => {
    const before = getSoldierAssetStats();
    const actors = [];
    for (let index = 0; index < 40; index += 1) {
      actors.push(createSoldierActor({
        id: `shared:${index}`,
        factionId: index % 2 ? 1 : 2,
        role: index % 3 === 0 ? 'man-at-arms' : 'spearman',
      }));
    }
    actors.push(createCaptainActor({ id: 'shared:captain', factionId: 2 }));
    const after = getSoldierAssetStats();

    expect(after.geometries - before.geometries).toBeLessThan(55);
    expect(after.materials - before.materials).toBeLessThan(24);
    actors.forEach((actor) => actor.dispose());
  });

  it('provides shoulder-height hurt volumes with material metadata', () => {
    const actor = createCaptainActor({ id: 'hurt-volume', factionId: 2 });
    actor.setPosition(3, 4, 5);
    const volumes = actor.combatant.getHurtVolumes();

    expect(volumes.map((volume) => volume.hitZone)).toEqual(['head', 'torso', 'legs']);
    expect(volumes[1].offset.y).toBeGreaterThan(0.5);
    expect(volumes.some((volume) => ['metal', 'armor'].includes(volume.material))).toBe(true);
    actor.dispose();
  });
});
