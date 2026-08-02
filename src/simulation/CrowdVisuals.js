import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { getFaction } from '../actors/Factions.js';

export function createCrowdVisuals({
  capacity = 400,
  factionId,
  castShadow = false,
} = {}) {
  const faction = getFaction(factionId);
  const root = new Group();
  root.name = `CrowdVisuals:${faction.key}`;
  const cloth = new MeshStandardMaterial({ color: faction.cloth, roughness: 1, flatShading: true });
  const iron = new MeshStandardMaterial({ color: 0x454b4c, roughness: 0.5, metalness: 0.45 });
  const wood = new MeshStandardMaterial({ color: 0x45321f, roughness: 0.92 });
  const materials = [cloth, iron, wood];
  const bodyGeometry = new BoxGeometry(0.48, 1.15, 0.32);
  const headGeometry = new ConeGeometry(0.17, 0.35, 5);
  const spearGeometry = new CylinderGeometry(0.012, 0.016, 2.65, 5);
  const geometries = [bodyGeometry, headGeometry, spearGeometry];
  const body = new InstancedMesh(bodyGeometry, cloth, capacity);
  const head = new InstancedMesh(headGeometry, iron, capacity);
  const spear = new InstancedMesh(spearGeometry, wood, capacity);
  [body, head, spear].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    mesh.count = 0;
    root.add(mesh);
  });
  const dummy = new Object3D();
  let instances = [];

  return {
    object3d: root,
    setInstances(nextInstances) {
      instances = nextInstances.slice(0, capacity);
      body.count = instances.length;
      head.count = instances.length;
      spear.count = instances.length;
    },
    update(time = 0) {
      for (let index = 0; index < instances.length; index += 1) {
        const instance = instances[index];
        const sway = Math.sin(time * 2.2 + index * 1.71) * 0.035;
        const position = instance.position;
        const heading = instance.heading ?? 0;
        const routed = instance.state === 'routed';

        dummy.position.set(position.x, position.y + 0.72, position.z);
        dummy.rotation.set(routed ? 0.18 : 0, heading, sway);
        dummy.scale.set(1, routed ? 0.88 : 1, 1);
        dummy.updateMatrix();
        body.setMatrixAt(index, dummy.matrix);

        dummy.position.set(position.x, position.y + 1.48, position.z);
        dummy.rotation.set(0, heading, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        head.setMatrixAt(index, dummy.matrix);

        dummy.position.set(
          position.x + Math.sin(heading) * 0.15,
          position.y + 1.25,
          position.z + Math.cos(heading) * 0.15,
        );
        dummy.rotation.set(routed ? 0.65 : Math.PI * 0.47, heading, routed ? 0.4 : -0.05);
        dummy.updateMatrix();
        spear.setMatrixAt(index, dummy.matrix);
      }
      body.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      spear.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

