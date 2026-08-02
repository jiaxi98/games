import {
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
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
  const secondaryCloth = new MeshStandardMaterial({
    color: faction.clothSecondary,
    roughness: 1,
    flatShading: true,
  });
  const iron = new MeshStandardMaterial({ color: 0x454b4c, roughness: 0.5, metalness: 0.45 });
  const wood = new MeshStandardMaterial({ color: 0x45321f, roughness: 0.92 });
  const materials = [cloth, secondaryCloth, iron, wood];
  const bodyGeometry = new ConeGeometry(0.34, 1.25, 5);
  bodyGeometry.translate(0, 0.625, 0);
  const headGeometry = new ConeGeometry(0.17, 0.35, 5);
  headGeometry.translate(0, 0.175, 0);
  const spearGeometry = new CylinderGeometry(0.012, 0.016, 2.65, 5);
  const shieldGeometry = new CylinderGeometry(0.31, 0.31, 0.065, 9);
  const geometries = [bodyGeometry, headGeometry, spearGeometry];
  const body = new InstancedMesh(bodyGeometry, cloth, capacity);
  const tunic = new InstancedMesh(bodyGeometry, secondaryCloth, capacity);
  const head = new InstancedMesh(headGeometry, iron, capacity);
  const spear = new InstancedMesh(spearGeometry, wood, capacity);
  const shield = new InstancedMesh(shieldGeometry, cloth, capacity);
  geometries.push(shieldGeometry);
  [body, tunic, head, spear, shield].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    mesh.count = 0;
    root.add(mesh);
  });
  const dummy = new Object3D();
  const spearDirection = new Vector3();
  const spearQuaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let instances = [];

  return {
    object3d: root,
    setInstances(nextInstances) {
      instances = nextInstances.slice(0, capacity);
      body.count = instances.length;
      tunic.count = instances.length;
      head.count = instances.length;
      spear.count = instances.length;
      shield.count = instances.length;
    },
    update(time = 0) {
      for (let index = 0; index < instances.length; index += 1) {
        const instance = instances[index];
        const sway = Math.sin(time * 2.2 + index * 1.71) * 0.035;
        const position = instance.position;
        const heading = instance.heading ?? 0;
        const routed = instance.state === 'routed';
        const fractured = instance.state === 'fractured';
        const pressed = instance.state === 'pressured';
        const stride = Math.sin(time * (routed ? 5.2 : 2.4) + index * 2.17);
        const bob = stride * (routed ? 0.045 : 0.018);
        const colorMix = hash01(index * 29 + faction.id * 101);

        dummy.position.set(position.x, position.y + bob, position.z);
        dummy.rotation.set(routed ? 0.18 : fractured ? 0.06 : 0, heading, sway);
        dummy.scale.set(
          0.94 + hash01(index * 17) * 0.12,
          routed ? 0.88 : 0.96 + hash01(index * 43) * 0.1,
          0.9 + hash01(index * 61) * 0.15,
        );
        dummy.updateMatrix();
        const alternateTunic = colorMix > 0.72;
        if (alternateTunic) {
          body.setMatrixAt(index, HIDDEN_MATRIX);
          tunic.setMatrixAt(index, dummy.matrix);
        } else {
          body.setMatrixAt(index, dummy.matrix);
          tunic.setMatrixAt(index, HIDDEN_MATRIX);
        }

        dummy.position.set(position.x, position.y + 1.34 + bob, position.z);
        dummy.rotation.set(routed ? 0.2 : 0, heading, sway * 0.35);
        dummy.scale.setScalar(0.94 + hash01(index * 13) * 0.12);
        dummy.updateMatrix();
        head.setMatrixAt(index, dummy.matrix);

        const forwardX = Math.sin(heading);
        const forwardZ = Math.cos(heading);
        if (routed) {
          spearDirection.set(forwardX * 0.72, 0.28, forwardZ * 0.72).normalize();
        } else if (pressed || fractured || index % 4 === 0) {
          spearDirection.set(forwardX * 0.9, pressed ? 0.12 : 0.22, forwardZ * 0.9).normalize();
        } else {
          spearDirection.set(forwardX * 0.08, 0.99, forwardZ * 0.08).normalize();
        }
        dummy.position.set(
          position.x + forwardX * 0.16,
          position.y + 1.23 + bob,
          position.z + forwardZ * 0.16,
        );
        spearQuaternion.setFromUnitVectors(up, spearDirection);
        dummy.quaternion.copy(spearQuaternion);
        dummy.scale.set(1, routed ? 0.9 : 1, 1);
        dummy.updateMatrix();
        spear.setMatrixAt(index, dummy.matrix);

        if (routed && index % 3 !== 0) {
          shield.setMatrixAt(index, HIDDEN_MATRIX);
        } else {
          dummy.position.set(
            position.x - forwardX * 0.18 + Math.cos(heading) * 0.24,
            position.y + 0.86 + bob,
            position.z - forwardZ * 0.18 - Math.sin(heading) * 0.24,
          );
          dummy.rotation.set(Math.PI * 0.5, heading, routed ? 0.4 : -0.08);
          dummy.scale.set(
            0.92 + hash01(index * 7) * 0.16,
            1,
            0.92 + hash01(index * 11) * 0.16,
          );
          dummy.updateMatrix();
          shield.setMatrixAt(index, dummy.matrix);
        }
      }
      body.instanceMatrix.needsUpdate = true;
      tunic.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      spear.instanceMatrix.needsUpdate = true;
      shield.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

function hash01(value) {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
