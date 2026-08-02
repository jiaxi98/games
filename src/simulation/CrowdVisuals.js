import {
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Sphere,
  SphereGeometry,
  Vector3,
} from 'three';
import { getFaction } from '../actors/Factions.js';

const MIN_CAPACITY = 1;

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

  const bodyGeometry = new CapsuleGeometry(0.28, 0.72, 2, 5);
  bodyGeometry.scale(1, 1, 0.72);
  bodyGeometry.translate(0, 0.86, 0);
  const headGeometry = new SphereGeometry(0.18, 6, 4);
  headGeometry.scale(0.92, 1.06, 0.9);
  const legGeometry = new BoxGeometry(0.15, 0.72, 0.18);
  legGeometry.translate(0, 0.36, 0);
  const spearGeometry = new CylinderGeometry(0.012, 0.016, 2.65, 5);
  const shieldGeometry = new CylinderGeometry(0.31, 0.31, 0.065, 9);
  const geometries = [
    bodyGeometry,
    headGeometry,
    legGeometry,
    spearGeometry,
    shieldGeometry,
  ];

  const descriptors = [
    { key: 'body', geometry: bodyGeometry, material: cloth },
    { key: 'tunic', geometry: bodyGeometry, material: secondaryCloth },
    { key: 'head', geometry: headGeometry, material: iron },
    { key: 'leftLeg', geometry: legGeometry, material: secondaryCloth },
    { key: 'rightLeg', geometry: legGeometry, material: secondaryCloth },
    { key: 'spear', geometry: spearGeometry, material: wood },
    { key: 'shield', geometry: shieldGeometry, material: cloth },
  ];
  const meshes = {};
  let currentCapacity = nextCapacity(capacity);
  let instances = [];
  let boundsDirty = true;

  const dummy = new Object3D();
  const spearDirection = new Vector3();
  const spearQuaternion = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const min = new Vector3();
  const max = new Vector3();
  const center = new Vector3();
  const size = new Vector3();

  for (const descriptor of descriptors) {
    const mesh = createMesh(descriptor, currentCapacity, castShadow);
    meshes[descriptor.key] = mesh;
    root.add(mesh);
  }

  const api = {
    object3d: root,
    get capacity() {
      return currentCapacity;
    },
    get count() {
      return instances.length;
    },
    setInstances(nextInstances) {
      const required = nextInstances?.length ?? 0;
      if (required > currentCapacity) resize(nextCapacity(required));
      instances = nextInstances ?? [];
      for (const mesh of Object.values(meshes)) mesh.count = instances.length;
      boundsDirty = true;
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
          meshes.body.setMatrixAt(index, HIDDEN_MATRIX);
          meshes.tunic.setMatrixAt(index, dummy.matrix);
        } else {
          meshes.body.setMatrixAt(index, dummy.matrix);
          meshes.tunic.setMatrixAt(index, HIDDEN_MATRIX);
        }

        dummy.position.set(position.x, position.y + 1.72 + bob, position.z);
        dummy.rotation.set(routed ? 0.2 : 0, heading, sway * 0.35);
        dummy.scale.setScalar(0.94 + hash01(index * 13) * 0.12);
        dummy.updateMatrix();
        meshes.head.setMatrixAt(index, dummy.matrix);

        const forwardX = Math.sin(heading);
        const forwardZ = Math.cos(heading);
        const rightX = Math.cos(heading);
        const rightZ = -Math.sin(heading);
        setLegMatrix(
          meshes.leftLeg,
          index,
          -1,
          stride,
          position,
          heading,
          forwardX,
          forwardZ,
          rightX,
          rightZ,
          bob,
          routed,
        );
        setLegMatrix(
          meshes.rightLeg,
          index,
          1,
          -stride,
          position,
          heading,
          forwardX,
          forwardZ,
          rightX,
          rightZ,
          bob,
          routed,
        );

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
        meshes.spear.setMatrixAt(index, dummy.matrix);

        if (routed && index % 3 !== 0) {
          meshes.shield.setMatrixAt(index, HIDDEN_MATRIX);
        } else {
          dummy.position.set(
            position.x - forwardX * 0.18 + rightX * 0.24,
            position.y + 0.86 + bob,
            position.z - forwardZ * 0.18 + rightZ * 0.24,
          );
          dummy.rotation.set(Math.PI * 0.5, heading, routed ? 0.4 : -0.08);
          dummy.scale.set(
            0.92 + hash01(index * 7) * 0.16,
            1,
            0.92 + hash01(index * 11) * 0.16,
          );
          dummy.updateMatrix();
          meshes.shield.setMatrixAt(index, dummy.matrix);
        }
      }
      for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
      if (boundsDirty) updateBounds();
    },
    dispose() {
      root.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };

  return api;

  function resize(next) {
    for (let index = 0; index < descriptors.length; index += 1) {
      const descriptor = descriptors[index];
      const previous = meshes[descriptor.key];
      const replacement = createMesh(descriptor, next, castShadow);
      replacement.count = instances.length;
      meshes[descriptor.key] = replacement;
      root.children[index] = replacement;
      replacement.parent = root;
      previous.parent = null;
      previous.dispose();
    }
    currentCapacity = next;
  }

  function updateBounds() {
    if (instances.length === 0) {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
    } else {
      min.set(Infinity, Infinity, Infinity);
      max.set(-Infinity, -Infinity, -Infinity);
      for (const instance of instances) {
        const position = instance.position;
        min.x = Math.min(min.x, position.x - 1.7);
        min.y = Math.min(min.y, position.y - 0.1);
        min.z = Math.min(min.z, position.z - 1.7);
        max.x = Math.max(max.x, position.x + 1.7);
        max.y = Math.max(max.y, position.y + 2.25);
        max.z = Math.max(max.z, position.z + 1.7);
      }
    }
    center.copy(min).add(max).multiplyScalar(0.5);
    size.copy(max).sub(min);
    const radius = size.length() * 0.5;
    for (const mesh of Object.values(meshes)) {
      mesh.boundingBox ??= new Box3();
      mesh.boundingSphere ??= new Sphere();
      mesh.boundingBox.min.copy(min);
      mesh.boundingBox.max.copy(max);
      mesh.boundingSphere.center.copy(center);
      mesh.boundingSphere.radius = radius;
    }
    boundsDirty = false;
  }

  function setLegMatrix(
    mesh,
    index,
    side,
    phase,
    position,
    heading,
    forwardX,
    forwardZ,
    rightX,
    rightZ,
    bob,
    routed,
  ) {
    const strideOffset = phase * (routed ? 0.1 : 0.055);
    dummy.position.set(
      position.x + rightX * side * 0.16 + forwardX * strideOffset,
      position.y + bob,
      position.z + rightZ * side * 0.16 + forwardZ * strideOffset,
    );
    dummy.rotation.set(phase * (routed ? 0.42 : 0.24), heading, 0);
    dummy.scale.set(0.92, routed ? 0.9 : 1, 0.92);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
}

function createMesh(descriptor, capacity, castShadow) {
  const mesh = new InstancedMesh(descriptor.geometry, descriptor.material, capacity);
  mesh.name = `Crowd:${descriptor.key}`;
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.frustumCulled = true;
  return mesh;
}

function nextCapacity(required) {
  let capacity = MIN_CAPACITY;
  const target = Math.max(MIN_CAPACITY, Math.ceil(required));
  while (capacity < target) capacity *= 2;
  return capacity;
}

function hash01(value) {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

const HIDDEN_MATRIX = new Matrix4().makeScale(0, 0, 0);
