import { describe, expect, it } from 'vitest';
import {
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { createAtmosphere } from '../../src/rendering/atmosphere.js';

describe('battlefield atmosphere', () => {
  it('tracks the camera with a tighter key shadow volume and layered mill fire', () => {
    const scene = new Scene();
    const fireSocket = new Vector3(104, 14, 18);
    const atmosphere = createAtmosphere({
      scene,
      quality: 'medium',
      fireSockets: [fireSocket],
    });
    const camera = new PerspectiveCamera();
    camera.position.set(12, 3, 90);

    atmosphere.update(1 / 60, 1.5, camera);

    const key = atmosphere.group.getObjectByName('PostStormKeyLight');
    const hemisphere = atmosphere.group.getObjectByName('SlateHemisphereLight');
    const flames = atmosphere.group.getObjectByName('ProceduralMillFlameCards');
    const smoke = atmosphere.group.getObjectByName('ProceduralBattleSmoke');

    expect(key.shadow.camera.right - key.shadow.camera.left).toBe(132);
    expect(key.position.x).toBeCloseTo(camera.position.x - 82);
    expect(key.target.position.z).toBeCloseTo(camera.position.z - 24);
    expect(hemisphere.intensity).toBeLessThan(1.5);
    expect(flames?.isPoints).toBe(true);
    expect(flames.position.equals(fireSocket)).toBe(true);
    expect(smoke.material.uniforms.opacity.value).toBeGreaterThan(0.4);

    atmosphere.dispose();
  });
});
