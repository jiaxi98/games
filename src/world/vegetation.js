import * as THREE from 'three';
import {
  createRng,
  distanceToPolyline2D,
  randomRange,
  randomSigned,
  setInstanceTransform,
} from './math.js';

function isExcluded(x, z, roadPoints) {
  if (distanceToPolyline2D(x, z, roadPoints) < 10) return true;
  if (Math.hypot(x, z - 220) < 75) return true;
  if (Math.hypot(x - 104, z - 18) < 37) return true;
  if (Math.hypot(x + 42, z - 34) < 55) return true;
  if (Math.abs(z + 174) < 16 && Math.abs(x) < 46) return true;
  if (Math.abs(x) < 83 && z > -145 && z < 185) return true;
  return false;
}

function createTreeMeshes(materials, count, quality) {
  const trunkGeometry = new THREE.CylinderGeometry(0.28, 0.48, 5.3, 7);
  trunkGeometry.translate(0, 2.65, 0);
  const crownGeometry = new THREE.IcosahedronGeometry(2.5, quality === 'low' ? 0 : 1);
  crownGeometry.translate(0, 6.1, 0);

  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bark, count);
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.leaf, count);
  trunks.name = 'InstancedTreeTrunks';
  crowns.name = 'InstancedTreeCrowns';
  trunks.castShadow = quality === 'high';
  crowns.castShadow = quality !== 'low';
  trunks.receiveShadow = true;
  crowns.receiveShadow = true;
  return { trunks, crowns };
}

export function createVegetation({
  materials,
  sampleHeight,
  roadPoints,
  seed = 94721,
  quality = 'high',
}) {
  const group = new THREE.Group();
  group.name = 'Vegetation';
  const random = createRng(seed + 2200);
  const treeCount = quality === 'low' ? 70 : quality === 'medium' ? 135 : 220;
  const { trunks, crowns } = createTreeMeshes(materials, treeCount, quality);
  const dummy = new THREE.Object3D();

  let placed = 0;
  let attempts = 0;
  while (placed < treeCount && attempts < treeCount * 30) {
    attempts += 1;
    const x = randomSigned(random, 295);
    const z = randomSigned(random, 295);
    if (isExcluded(x, z, roadPoints)) continue;
    const scale = randomRange(random, 0.65, 1.45);
    const y = sampleHeight(x, z);
    const rotation = new THREE.Euler(
      randomSigned(random, 0.035),
      randomRange(random, 0, Math.PI * 2),
      randomSigned(random, 0.035),
    );
    const treeScale = new THREE.Vector3(
      scale * randomRange(random, 0.82, 1.05),
      scale * randomRange(random, 0.88, 1.22),
      scale * randomRange(random, 0.82, 1.05),
    );
    setInstanceTransform(trunks, placed, {
      position: new THREE.Vector3(x, y, z),
      rotation,
      scale: treeScale,
    }, dummy);
    setInstanceTransform(crowns, placed, {
      position: new THREE.Vector3(x, y, z),
      rotation,
      scale: treeScale,
    }, dummy);
    placed += 1;
  }
  trunks.count = placed;
  crowns.count = placed;
  group.add(trunks, crowns);

  // Trampled grain survives on the flanks, leaving the combat corridor visually clear.
  const grainCount = quality === 'low' ? 450 : quality === 'medium' ? 950 : 1700;
  const bladeGeometry = new THREE.ConeGeometry(0.05, 1.15, 3);
  bladeGeometry.translate(0, 0.55, 0);
  const grain = new THREE.InstancedMesh(bladeGeometry, materials.straw, grainCount);
  grain.name = 'InstancedTrampledGrain';
  grain.receiveShadow = true;
  grain.castShadow = false;
  placed = 0;
  attempts = 0;
  while (placed < grainCount && attempts < grainCount * 12) {
    attempts += 1;
    const side = random() > 0.5 ? 1 : -1;
    const x = side * randomRange(random, 62, 178);
    const z = randomRange(random, -100, 205);
    if (Math.hypot(x - 104, z - 18) < 34) continue;
    const y = sampleHeight(x, z);
    setInstanceTransform(grain, placed, {
      position: new THREE.Vector3(x, y, z),
      rotation: new THREE.Euler(
        randomRange(random, -0.6, 0.6),
        randomRange(random, 0, Math.PI),
        randomSigned(random, 0.65),
      ),
      scale: new THREE.Vector3(
        randomRange(random, 0.7, 1.2),
        randomRange(random, 0.5, 1.3),
        randomRange(random, 0.7, 1.2),
      ),
    }, dummy);
    placed += 1;
  }
  grain.count = placed;
  group.add(grain);

  return group;
}

export function createOldOak({ materials, sampleHeight, position }) {
  const group = new THREE.Group();
  group.name = 'RallyOak';
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.75, 10, 9),
    materials.bark,
  );
  trunk.position.y = 5;
  trunk.rotation.z = 0.08;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const branches = [
    [-2.4, 8.2, 0.7, 5.5, -0.9],
    [2.2, 8.9, -0.4, 6.3, 0.85],
    [0.4, 10.2, 1.8, 5.2, 0.25],
  ];
  branches.forEach(([x, y, z, length, tilt]) => {
    const branch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.68, length, 7),
      materials.bark,
    );
    branch.position.set(x * 0.5, y, z * 0.5);
    branch.rotation.z = tilt;
    branch.rotation.x = z * 0.16;
    branch.castShadow = true;
    group.add(branch);
  });

  const crownGeometry = new THREE.IcosahedronGeometry(3.2, 1);
  [
    [-3.2, 11.4, 0],
    [3.3, 12, -0.4],
    [0.4, 13.3, 2.4],
    [0.2, 12.8, -3],
  ].forEach(([x, y, z], index) => {
    const crown = new THREE.Mesh(
      crownGeometry,
      index % 2 ? materials.leafDry : materials.leaf,
    );
    crown.position.set(x, y, z);
    crown.scale.set(1.1, 0.82, 1);
    crown.castShadow = true;
    group.add(crown);
  });
  return group;
}
