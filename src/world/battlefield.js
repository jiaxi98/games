import * as THREE from 'three';
import {
  createRng,
  randomRange,
  randomSigned,
  setInstanceTransform,
} from './math.js';

function box(width, height, depth, material, name) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, segments, material, name) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createCart(materials, loaded = true) {
  const group = new THREE.Group();
  group.name = 'BaggageCart';
  const bed = box(4.6, 0.65, 2.25, materials.timberLight, 'CartBed');
  bed.position.y = 1.6;
  group.add(bed);

  [-1, 1].forEach((side) => {
    const rail = box(4.7, 0.75, 0.16, materials.timber, 'CartRail');
    rail.position.set(0, 2.2, side * 1.03);
    group.add(rail);
  });
  [-1.45, 1.45].forEach((x) => {
    [-1, 1].forEach((side) => {
      const wheel = new THREE.Mesh(
        new THREE.TorusGeometry(0.82, 0.12, 6, 12),
        materials.timber,
      );
      wheel.name = 'CartWheel';
      wheel.position.set(x, 0.95, side * 1.24);
      wheel.rotation.x = Math.PI * 0.5;
      wheel.castShadow = true;
      group.add(wheel);
    });
  });
  const shaft = box(4.2, 0.12, 0.12, materials.timber, 'CartShaft');
  shaft.position.set(4.2, 1.15, 0);
  group.add(shaft);

  if (loaded) {
    const load = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.65, 2.3, 3, 8),
      materials.canvasDark,
    );
    load.name = 'CoveredBaggage';
    load.rotation.z = Math.PI * 0.5;
    load.position.set(-0.3, 2.45, 0);
    load.scale.z = 1.1;
    load.castShadow = true;
    group.add(load);
  }
  return group;
}

function createMantlet(materials) {
  const group = new THREE.Group();
  group.name = 'BaggageMantlet';
  const board = box(3.3, 2.6, 0.28, materials.timberLight, 'MantletBoards');
  board.position.y = 1.6;
  board.rotation.z = -0.08;
  group.add(board);
  [-1, 1].forEach((side) => {
    const brace = box(0.18, 2.8, 0.18, materials.timber, 'MantletBrace');
    brace.position.set(side * 1.3, 1.45, -0.55);
    brace.rotation.x = side * 0.25;
    group.add(brace);
  });
  return group;
}

export function createBaggageEmbankment({
  materials,
  sampleHeight,
  position = new THREE.Vector3(0, 0, 224),
}) {
  const group = new THREE.Group();
  group.name = 'AngloGasconBaggageLine';
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);

  [-1, 1].forEach((side) => {
    const earthwork = new THREE.Mesh(
      new THREE.CylinderGeometry(18, 21, 4.6, 5),
      materials.soil,
    );
    earthwork.name = 'BaggageEmbankment';
    earthwork.position.set(side * 34, 0.25, 4);
    earthwork.scale.set(1.45, 1, 0.62);
    earthwork.rotation.y = Math.PI * 0.5;
    earthwork.receiveShadow = true;
    group.add(earthwork);
  });

  const placements = [
    [-44, 2, -0.05, true],
    [-29, -1, 0.08, true],
    [-13, 1, -0.04, false],
    [17, 1, 0.04, true],
    [33, -2, -0.08, true],
    [47, 2, 0.06, false],
  ];
  placements.forEach(([x, z, yaw, loaded], index) => {
    const cart = createCart(materials, loaded);
    const worldX = position.x + x;
    const worldZ = position.z + z;
    cart.position.set(x, sampleHeight(worldX, worldZ) - group.position.y + 1.8, z);
    cart.rotation.y = yaw + (index % 2 ? 0.03 : -0.03);
    group.add(cart);
  });

  for (let index = 0; index < 12; index += 1) {
    const x = -53 + index * 9.6;
    if (Math.abs(x) < 9) continue;
    const mantlet = createMantlet(materials);
    mantlet.position.set(
      x,
      sampleHeight(position.x + x, position.z - 8) - group.position.y,
      -9,
    );
    mantlet.rotation.y = randomSigned(createRng(index + 77), 0.12);
    group.add(mantlet);
  }

  for (let index = 0; index < 8; index += 1) {
    const barrel = cylinder(0.7, 0.82, 1.35, 10, materials.timberLight, 'SupplyBarrel');
    const x = -30 + (index % 5) * 7;
    const z = 7 + Math.floor(index / 5) * 4;
    barrel.position.set(
      x,
      sampleHeight(position.x + x, position.z + z) - group.position.y + 0.68,
      z,
    );
    barrel.rotation.z = index % 3 === 0 ? Math.PI * 0.5 : 0;
    group.add(barrel);
  }

  return {
    group,
    colliders: [
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(position.x - 35, group.position.y + 2, position.z + 4),
        new THREE.Vector3(54, 5, 14),
      ),
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(position.x + 35, group.position.y + 2, position.z + 4),
        new THREE.Vector3(54, 5, 14),
      ),
    ],
  };
}

function createHedgeSection(materials, length = 9) {
  const group = new THREE.Group();
  group.name = 'HedgerowSection';
  const bank = box(length, 0.75, 1.9, materials.soil, 'HedgeBank');
  bank.position.y = 0.28;
  group.add(bank);

  const stems = Math.max(4, Math.floor(length / 1.4));
  for (let index = 0; index < stems; index += 1) {
    const x = THREE.MathUtils.lerp(-length * 0.48, length * 0.48, index / (stems - 1));
    const stem = cylinder(0.08, 0.13, 2.5 + (index % 3) * 0.45, 5, materials.bark, 'HedgeStem');
    stem.position.set(x, 1.35, randomSigned(createRng(index + 10), 0.35));
    stem.rotation.z = randomSigned(createRng(index + 20), 0.2);
    group.add(stem);
  }

  const foliage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 0),
    materials.leaf,
  );
  for (let index = 0; index < Math.ceil(length / 2.7); index += 1) {
    const clump = foliage.clone();
    clump.name = 'HedgeFoliage';
    clump.position.set(-length * 0.4 + index * 2.65, 1.65, index % 2 ? 0.2 : -0.15);
    clump.scale.set(1.2, 0.8 + (index % 3) * 0.08, 0.72);
    clump.castShadow = true;
    group.add(clump);
  }
  return group;
}

export function createHedgerowPocket({
  materials,
  sampleHeight,
  position = new THREE.Vector3(-42, 0, 34),
}) {
  const group = new THREE.Group();
  group.name = 'HedgerowRallyPocket';
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);

  const placements = [
    [-31, 0, 0, 22],
    [-11, -2, 0.08, 16],
    [18, -2, -0.04, 19],
    [31, 7, Math.PI * 0.5, 18],
    [-31, 8, Math.PI * 0.5, 17],
  ];
  placements.forEach(([x, z, yaw, length]) => {
    const hedge = createHedgeSection(materials, length);
    hedge.position.set(
      x,
      sampleHeight(position.x + x, position.z + z) - group.position.y,
      z,
    );
    hedge.rotation.y = yaw;
    group.add(hedge);
  });

  // Intentional gaps make the rally pocket tactically readable and traversable.
  return {
    group,
    colliders: placements.map(([x, z, yaw, length]) => {
      const alongX = Math.abs(Math.cos(yaw)) > 0.5;
      return new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(
          position.x + x,
          sampleHeight(position.x + x, position.z + z) + 1.1,
          position.z + z,
        ),
        new THREE.Vector3(
          alongX ? length : 2.2,
          2.2,
          alongX ? 2.2 : length,
        ),
      );
    }),
  };
}

function createMillWheel(materials) {
  const group = new THREE.Group();
  group.name = 'MillWheel';
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(4.1, 0.24, 6, 20),
    materials.timber,
  );
  rim.castShadow = true;
  group.add(rim);
  for (let index = 0; index < 10; index += 1) {
    const spoke = box(7.8, 0.13, 0.18, materials.timberLight, 'MillWheelSpoke');
    spoke.rotation.z = (index / 10) * Math.PI;
    group.add(spoke);
  }
  return group;
}

export function createBurningMill({
  materials,
  sampleHeight,
  position = new THREE.Vector3(104, 0, 18),
}) {
  const group = new THREE.Group();
  group.name = 'BurningMillFlank';
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);

  const stoneBase = box(13, 5.2, 11, materials.limestoneDark, 'MillStoneBase');
  stoneBase.position.y = 2.6;
  group.add(stoneBase);
  const upper = box(12.5, 6.2, 10.5, materials.timberLight, 'MillTimberUpper');
  upper.position.y = 8.2;
  group.add(upper);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(9.2, 5.7, 4),
    materials.oldThatch,
  );
  roof.name = 'BurningMillRoof';
  roof.position.y = 14;
  roof.rotation.y = Math.PI * 0.25;
  roof.scale.z = 0.85;
  roof.castShadow = true;
  group.add(roof);

  const wheel = createMillWheel(materials);
  wheel.position.set(-6.75, 4.9, 0);
  wheel.rotation.y = Math.PI * 0.5;
  group.add(wheel);

  const door = box(2.2, 3.3, 0.25, materials.charcoal, 'MillDoorShadow');
  door.position.set(1.8, 1.65, 5.58);
  group.add(door);

  const charredBeam = box(14, 0.42, 0.42, materials.charcoal, 'CollapsedMillBeam');
  charredBeam.position.set(5, 6, 7);
  charredBeam.rotation.z = -0.65;
  charredBeam.rotation.y = 0.2;
  group.add(charredBeam);

  const fireSockets = [
    new THREE.Vector3(-3.3, 11.8, 3.6),
    new THREE.Vector3(2.2, 13.2, -2.3),
    new THREE.Vector3(5.1, 8.8, 2.8),
  ];
  fireSockets.forEach((socket, index) => {
    const ember = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.48 + index * 0.08, 1),
      materials.ember,
    );
    ember.name = 'MillFireCore';
    ember.position.copy(socket);
    group.add(ember);
  });

  return {
    group,
    fireSockets: fireSockets.map((socket) => socket.clone().add(group.position)),
    colliders: [
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(position.x, group.position.y + 6, position.z),
        new THREE.Vector3(15, 12, 13),
      ),
    ],
  };
}

function createStonePier(materials) {
  const pier = new THREE.Group();
  const body = box(2.8, 4.3, 8, materials.limestoneDark, 'BridgePier');
  body.position.y = 2.15;
  pier.add(body);
  const cutwater = new THREE.Mesh(
    new THREE.ConeGeometry(4, 4.5, 4),
    materials.limestone,
  );
  cutwater.position.set(0, 2.1, -4.2);
  cutwater.rotation.y = Math.PI * 0.25;
  cutwater.scale.set(0.45, 1, 0.55);
  cutwater.castShadow = true;
  pier.add(cutwater);
  return pier;
}

export function createStoneBridgeAndFord({
  materials,
  sampleHeight,
  position = new THREE.Vector3(-7, 0, -174),
}) {
  const group = new THREE.Group();
  group.name = 'SaintOrensBridgeAndFord';
  const baseY = sampleHeight(position.x, position.z);
  group.position.set(position.x, baseY, position.z);

  const deck = box(14, 1.1, 31, materials.limestone, 'StoneBridgeDeck');
  deck.position.y = 3.4;
  group.add(deck);

  [-6.35, 6.35].forEach((x) => {
    const parapet = box(1.15, 2, 31, materials.limestoneDark, 'BridgeParapet');
    parapet.position.set(x, 4.65, 0);
    group.add(parapet);
  });

  [-9, 9].forEach((z) => {
    const pier = createStonePier(materials);
    pier.position.z = z;
    group.add(pier);
  });

  const gatePosts = [-1, 1].map((side) => {
    const post = box(2.2, 7.5, 2.2, materials.limestone, 'BridgeGatePost');
    post.position.set(side * 5.5, 7, -13.2);
    group.add(post);
    return post;
  });
  const gateBeam = box(13, 1.3, 2.2, materials.timber, 'BridgeGateBeam');
  gateBeam.position.set(0, 10.2, -13.2);
  group.add(gateBeam);

  // Ford stones form a second, exposed crossing east of the bridge.
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(1.2 + ((row + column) % 3) * 0.2, 0),
        materials.limestoneDark,
      );
      stone.name = 'FordStone';
      const worldX = position.x + 23 + column * 2.2;
      const worldZ = position.z - 13 + row * 3.8;
      stone.position.set(
        23 + column * 2.2,
        sampleHeight(worldX, worldZ) - baseY + 0.8,
        -13 + row * 3.8,
      );
      stone.scale.y = 0.48;
      stone.rotation.y = row * 0.6 + column;
      stone.castShadow = true;
      group.add(stone);
    }
  }

  return {
    group,
    bridgeSurfaceHeight: baseY + 3.95,
    colliders: [
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(position.x - 6.6, baseY + 5, position.z),
        new THREE.Vector3(1.2, 4, 31),
      ),
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(position.x + 6.6, baseY + 5, position.z),
        new THREE.Vector3(1.2, 4, 31),
      ),
    ],
  };
}

export function createFieldDressing({
  materials,
  sampleHeight,
  seed = 94721,
  quality = 'high',
}) {
  const group = new THREE.Group();
  group.name = 'BattlefieldDressing';
  const random = createRng(seed + 1200);
  const count = quality === 'low' ? 45 : quality === 'medium' ? 85 : 140;
  const dummy = new THREE.Object3D();

  const stakeGeometry = new THREE.CylinderGeometry(0.055, 0.095, 2.4, 5);
  const stakes = new THREE.InstancedMesh(stakeGeometry, materials.timber, count);
  stakes.name = 'BrokenStakes';
  stakes.castShadow = quality !== 'low';
  stakes.receiveShadow = true;

  const shieldGeometry = new THREE.CylinderGeometry(0.72, 0.72, 0.12, 12);
  const shields = new THREE.InstancedMesh(shieldGeometry, materials.timberLight, count);
  shields.name = 'DiscardedShields';
  shields.castShadow = quality !== 'low';

  const spearGeometry = new THREE.CylinderGeometry(0.025, 0.035, 3.8, 5);
  const spears = new THREE.InstancedMesh(spearGeometry, materials.timberLight, count);
  spears.name = 'BrokenSpears';
  spears.castShadow = quality !== 'low';

  for (let index = 0; index < count; index += 1) {
    const z = randomRange(random, -138, 172);
    const laneWidth = THREE.MathUtils.lerp(72, 35, (172 - z) / 310);
    let x = randomSigned(random, laneWidth);
    if (Math.abs(x) < 6 && random() > 0.35) x += Math.sign(x || randomSigned(random)) * 8;
    const y = sampleHeight(x, z);

    setInstanceTransform(stakes, index, {
      position: new THREE.Vector3(x, y + 0.75, z),
      rotation: new THREE.Euler(
        randomRange(random, -0.5, 0.5),
        randomRange(random, 0, Math.PI),
        randomRange(random, -1.1, 1.1),
      ),
      scale: new THREE.Vector3(1, randomRange(random, 0.45, 1.1), 1),
    }, dummy);

    const shieldX = x + randomSigned(random, 3.5);
    const shieldZ = z + randomSigned(random, 3.5);
    setInstanceTransform(shields, index, {
      position: new THREE.Vector3(shieldX, sampleHeight(shieldX, shieldZ) + 0.15, shieldZ),
      rotation: new THREE.Euler(
        Math.PI * 0.5 + randomSigned(random, 0.24),
        randomRange(random, 0, Math.PI),
        randomRange(random, 0, Math.PI),
      ),
      scale: new THREE.Vector3(
        randomRange(random, 0.75, 1.1),
        1,
        randomRange(random, 0.8, 1.15),
      ),
    }, dummy);

    const spearX = x + randomSigned(random, 5);
    const spearZ = z + randomSigned(random, 5);
    setInstanceTransform(spears, index, {
      position: new THREE.Vector3(spearX, sampleHeight(spearX, spearZ) + 0.2, spearZ),
      rotation: new THREE.Euler(
        Math.PI * 0.5 + randomSigned(random, 0.2),
        randomRange(random, 0, Math.PI),
        randomRange(random, 0, Math.PI),
      ),
      scale: new THREE.Vector3(1, randomRange(random, 0.45, 1), 1),
    }, dummy);
  }

  [stakes, shields, spears].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    group.add(mesh);
  });

  return group;
}

function createBannerGeometry(width = 1.6, height = 2.9) {
  const geometry = new THREE.PlaneGeometry(width, height, 5, 8);
  geometry.translate(width * 0.5, -height * 0.5, 0);
  geometry.userData.basePositions = geometry.attributes.position.array.slice();
  return geometry;
}

export function createStandard({
  materials,
  sampleHeight,
  position,
  color = 'red',
  height = 7.5,
  fallen = false,
  name = 'BattleStandard',
}) {
  const group = new THREE.Group();
  group.name = name;
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);

  const pole = cylinder(0.06, 0.09, height, 7, materials.timberLight, 'StandardPole');
  pole.position.y = height * 0.5;
  group.add(pole);

  const material = color === 'blue'
    ? materials.blueCloth
    : color === 'ochre' ? materials.goldCloth : materials.redCloth;
  const cloth = new THREE.Mesh(createBannerGeometry(), material);
  cloth.name = 'AnimatedBannerCloth';
  cloth.position.set(0, height - 0.45, 0);
  cloth.castShadow = true;
  cloth.userData.bannerPhase = position.x * 0.17 + position.z * 0.07;
  group.add(cloth);

  const crosspiece = box(1.9, 0.09, 0.09, materials.timber, 'StandardCrosspiece');
  crosspiece.position.set(0.9, height - 0.5, 0);
  group.add(crosspiece);

  if (fallen) {
    group.rotation.z = Math.PI * 0.46;
    group.position.y += 0.3;
  }
  return group;
}

export function createDistantBattleBelts({
  materials,
  sampleHeight,
  seed = 94721,
  quality = 'high',
}) {
  const group = new THREE.Group();
  group.name = 'DistantBattleBelts';
  const random = createRng(seed + 4900);
  const rankCount = quality === 'low' ? 48 : quality === 'medium' ? 90 : 145;
  const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.95, 2, 5);
  const redRanks = new THREE.InstancedMesh(bodyGeometry, materials.redCloth, rankCount);
  const blueRanks = new THREE.InstancedMesh(bodyGeometry, materials.blueCloth, rankCount);
  redRanks.name = 'FarFrenchRanks';
  blueRanks.name = 'FarAngloGasconRanks';
  const dummy = new THREE.Object3D();

  for (let index = 0; index < rankCount; index += 1) {
    [-1, 1].forEach((side) => {
      const x = side * randomRange(random, 105, 235);
      const z = randomRange(random, -170, 95);
      const y = sampleHeight(x, z);
      const mesh = side < 0 ? blueRanks : redRanks;
      setInstanceTransform(mesh, index, {
        position: new THREE.Vector3(x, y + 1.2, z),
        rotation: new THREE.Euler(0, randomRange(random, -0.5, 0.5), 0),
        scale: new THREE.Vector3(
          randomRange(random, 0.82, 1.05),
          randomRange(random, 0.9, 1.12),
          randomRange(random, 0.82, 1.05),
        ),
      }, dummy);
    });
  }
  redRanks.count = rankCount;
  blueRanks.count = rankCount;
  group.add(redRanks, blueRanks);

  const banners = [];
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 ? 1 : -1;
    const x = side * randomRange(random, 125, 210);
    const z = randomRange(random, -155, 60);
    const banner = createStandard({
      materials,
      sampleHeight,
      position: new THREE.Vector3(x, 0, z),
      color: side > 0 ? 'red' : 'blue',
      height: randomRange(random, 6, 8),
      name: 'FarBattleBanner',
    });
    banner.scale.setScalar(0.72);
    banners.push(banner);
    group.add(banner);
  }

  return { group, banners, redRanks, blueRanks };
}
