import * as THREE from 'three';
import {
  createRng,
  distanceToPolyline2D,
  randomRange,
  randomSigned,
  setInstanceTransform,
} from './math.js';

function isExcluded(x, z, roadPoints) {
  // Keep trunks out of the actual travel line and landmark footprints, but no
  // longer sterilize the entire combat valley. Authored edge clusters can now
  // frame each route cell at useful first-person distances.
  if (distanceToPolyline2D(x, z, roadPoints) < 8.5) return true;
  if (Math.abs(x) < 48 && z > 202 && z < 242) return true;
  if (Math.hypot(x - 104, z - 18) < 30) return true;
  if (Math.hypot(x + 42, z - 34) < 35) return true;
  if (Math.abs(z + 174) < 15 && Math.abs(x + 7) < 28) return true;
  if (Math.abs(x) < 15 && z > -145 && z < 190) return true;
  return false;
}

function createRouteTreeClusters({
  trunks,
  crowns,
  sampleHeight,
  dummy,
  startIndex,
  maxCount,
}) {
  const clusters = [
    { x: -37, z: 169, count: 3, spread: 5.5, scale: 0.74 },
    { x: 39, z: 139, count: 3, spread: 5.2, scale: 0.7 },
    { x: -50, z: 84, count: 4, spread: 6.8, scale: 0.78 },
    { x: 48, z: 34, count: 3, spread: 5.8, scale: 0.72 },
    { x: -42, z: -50, count: 3, spread: 5.6, scale: 0.69 },
    { x: 45, z: -101, count: 4, spread: 6.2, scale: 0.75 },
    { x: -39, z: -145, count: 3, spread: 5.4, scale: 0.66 },
    { x: 39, z: -214, count: 3, spread: 5.8, scale: 0.7 },
  ];
  let placed = startIndex;
  clusters.forEach((cluster, clusterIndex) => {
    for (let index = 0; index < cluster.count && placed < maxCount; index += 1) {
      const angle = index * 2.27 + clusterIndex * 0.71;
      const distance = 1.5 + (index % 3) * cluster.spread * 0.36;
      const x = cluster.x + Math.cos(angle) * distance;
      const z = cluster.z + Math.sin(angle) * distance;
      const scale = cluster.scale * (0.88 + (index % 3) * 0.12);
      const y = sampleHeight(x, z);
      const rotation = new THREE.Euler(
        (index % 2 ? 1 : -1) * 0.025,
        angle * 1.7,
        (index % 3 - 1) * 0.02,
      );
      const treeScale = new THREE.Vector3(
        scale * (index % 2 ? 0.88 : 1.05),
        scale * (1.05 + (index % 3) * 0.12),
        scale,
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
  });
  return placed;
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

function createEdgeScrub({ materials, sampleHeight, random, quality }) {
  const count = quality === 'low' ? 90 : quality === 'medium' ? 180 : 320;
  const geometry = new THREE.IcosahedronGeometry(0.72, 0);
  const scrub = new THREE.InstancedMesh(geometry, materials.leafDry, count);
  scrub.name = 'InstancedBattlefieldEdgeScrub';
  scrub.castShadow = quality === 'high';
  scrub.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index += 1) {
    const side = index % 2 ? 1 : -1;
    const nearOpening = index < Math.min(count, 48);
    const x = side * (
      nearOpening
        ? randomRange(random, 66, 92)
        : randomRange(random, 48, 235)
    );
    const z = nearOpening
      ? randomRange(random, 205, 286)
      : randomRange(random, -235, 210);
    const y = sampleHeight(x, z);
    setInstanceTransform(scrub, index, {
      position: new THREE.Vector3(x, y + 0.45, z),
      rotation: new THREE.Euler(
        randomSigned(random, 0.12),
        randomRange(random, 0, Math.PI * 2),
        randomSigned(random, 0.12),
      ),
      scale: new THREE.Vector3(
        randomRange(random, 0.7, 1.65),
        randomRange(random, 0.55, 1.18),
        randomRange(random, 0.72, 1.55),
      ),
    }, dummy);
  }
  scrub.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return scrub;
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
  const treeCount = quality === 'low' ? 90 : quality === 'medium' ? 170 : 280;
  const { trunks, crowns } = createTreeMeshes(materials, treeCount, quality);
  const dummy = new THREE.Object3D();
  const openingFrames = [
    [-78, 257], [-70, 275], [-89, 230], [-105, 248],
    [78, 257], [70, 275], [89, 230], [105, 248],
    [-96, 188], [-118, 168], [96, 188], [118, 168],
  ];

  let placed = 0;
  let attempts = 0;
  openingFrames.forEach(([x, z], index) => {
    if (placed >= treeCount) return;
    const scale = 0.8 + (index % 4) * 0.11;
    const y = sampleHeight(x, z);
    const rotation = new THREE.Euler(
      (index % 3 - 1) * 0.02,
      index * 1.73,
      (index % 2 ? 1 : -1) * 0.025,
    );
    const treeScale = new THREE.Vector3(
      scale * (index % 2 ? 0.92 : 1.04),
      scale * (1.08 + (index % 3) * 0.09),
      scale,
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
  });
  placed = createRouteTreeClusters({
    trunks,
    crowns,
    sampleHeight,
    dummy,
    startIndex: placed,
    maxCount: treeCount,
  });
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
  group.add(createEdgeScrub({
    materials,
    sampleHeight,
    random,
    quality,
  }));

  // Trampled grain survives on the flanks, leaving the combat corridor visually clear.
  const grainCount = quality === 'low' ? 550 : quality === 'medium' ? 1150 : 2050;
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

  const rootGeometry = new THREE.ConeGeometry(0.62, 4.2, 6);
  for (let index = 0; index < 6; index += 1) {
    const root = new THREE.Mesh(rootGeometry, materials.bark);
    root.name = 'OakRootFlare';
    const angle = (index / 6) * Math.PI * 2;
    root.position.set(Math.cos(angle) * 1.25, 0.38, Math.sin(angle) * 1.25);
    root.rotation.set(Math.PI * 0.5, 0, -angle);
    root.scale.set(0.7, 1, 0.55);
    root.castShadow = true;
    group.add(root);
  }

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

  const deadBranch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.38, 6.4, 6),
    materials.bark,
  );
  deadBranch.name = 'OakDeadBranch';
  deadBranch.position.set(-2.1, 10.4, -1.8);
  deadBranch.rotation.set(-0.28, 0.22, -1.02);
  deadBranch.castShadow = true;
  group.add(deadBranch);
  return group;
}
