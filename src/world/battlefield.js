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

function createSupplyStack(materials, index) {
  const group = new THREE.Group();
  group.name = 'BaggageSupplyStack';
  const lower = box(1.6, 1.05, 1.25, materials.timberLight, 'SupplyCrate');
  lower.position.y = 0.52;
  lower.rotation.y = (index % 3 - 1) * 0.08;
  group.add(lower);
  if (index % 2 === 0) {
    const upper = box(1.2, 0.82, 1.05, materials.timber, 'SupplyCrate');
    upper.position.set(0.12, 1.43, -0.05);
    upper.rotation.y = -lower.rotation.y * 1.7;
    group.add(upper);
  } else {
    const sack = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.42, 0.68, 2, 6),
      materials.canvasDark,
    );
    sack.name = 'SupplySack';
    sack.position.set(0.08, 1.25, 0);
    sack.rotation.z = Math.PI * 0.5;
    sack.scale.set(1, 0.86, 0.72);
    sack.castShadow = true;
    group.add(sack);
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

  // A chain of low, faceted berms reads as heaped earth without becoming the
  // giant flat-sided polygon that previously dominated the opening view.
  const bermGeometry = new THREE.DodecahedronGeometry(1, 0);
  const earthworks = new THREE.InstancedMesh(bermGeometry, materials.soil, 12);
  earthworks.name = 'BaggageEmbankment';
  earthworks.receiveShadow = true;
  earthworks.castShadow = true;
  earthworks.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const dummy = new THREE.Object3D();
  let bermIndex = 0;
  [-1, 1].forEach((side) => {
    for (let index = 0; index < 6; index += 1) {
      const x = side * (13 + index * 9);
      const z = 4 + (index % 2 ? 0.8 : -0.4);
      const worldX = position.x + x;
      const worldZ = position.z + z;
      setInstanceTransform(earthworks, bermIndex, {
        position: new THREE.Vector3(
          x,
          sampleHeight(worldX, worldZ) - group.position.y + 1.05,
          z,
        ),
        rotation: new THREE.Euler(0, (index % 3 - 1) * 0.12, 0),
        scale: new THREE.Vector3(6.6, 1.65 + (index % 2) * 0.25, 5.6),
      }, dummy);
      bermIndex += 1;
    }
  });
  group.add(earthworks);

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
    cart.position.set(x, sampleHeight(worldX, worldZ) - group.position.y + 2.45, z);
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
      sampleHeight(position.x + x, position.z + z) - group.position.y
        + (Math.abs(x) > 10 ? 2.45 : 0.68),
      z,
    );
    barrel.rotation.z = index % 3 === 0 ? Math.PI * 0.5 : 0;
    group.add(barrel);
  }

  // Tall stakes make the traversable center gap legible from first person.
  [-1, 1].forEach((side) => {
    const standard = createStandard({
      materials,
      sampleHeight,
      position: new THREE.Vector3(position.x + side * 10.5, 0, position.z - 2.5),
      color: side < 0 ? 'blue' : 'ochre',
      height: 8.8,
      name: 'BaggageGateStandard',
    });
    standard.position.sub(group.position);
    standard.rotation.y = side * 0.08;
    group.add(standard);
  });

  const supplyPlacements = [
    [-54, 10], [-48, 13], [-38, 9], [-25, 12],
    [25, 11], [37, 8], [47, 13], [55, 10],
  ];
  supplyPlacements.forEach(([x, z], index) => {
    const stack = createSupplyStack(materials, index);
    stack.position.set(
      x,
      sampleHeight(position.x + x, position.z + z) - group.position.y + 2.45,
      z,
    );
    stack.rotation.y = (index % 4 - 1.5) * 0.17;
    group.add(stack);
  });

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

    const paddle = box(1.3, 0.42, 0.32, materials.timber, 'MillWheelPaddle');
    const angle = (index / 10) * Math.PI * 2;
    paddle.position.set(Math.cos(angle) * 4.08, Math.sin(angle) * 4.08, 0);
    paddle.rotation.z = angle;
    group.add(paddle);
  }
  return group;
}

export function createBurningMill({
  materials,
  sampleHeight,
  position = new THREE.Vector3(104, 0, 18),
}) {
  const landmarkScale = 1.3;
  const group = new THREE.Group();
  group.name = 'BurningMillFlank';
  group.position.set(position.x, sampleHeight(position.x, position.z), position.z);
  group.scale.setScalar(landmarkScale);
  group.userData.landmarkScale = landmarkScale;

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
  const axle = cylinder(0.3, 0.3, 2.2, 8, materials.charcoal, 'MillWheelAxle');
  axle.position.set(-6.8, 4.9, 0);
  axle.rotation.z = Math.PI * 0.5;
  group.add(axle);

  const door = box(2.2, 3.3, 0.25, materials.charcoal, 'MillDoorShadow');
  door.position.set(1.8, 1.65, 5.58);
  group.add(door);

  const charredBeam = box(14, 0.42, 0.42, materials.charcoal, 'CollapsedMillBeam');
  charredBeam.position.set(5, 6, 7);
  charredBeam.rotation.z = -0.65;
  charredBeam.rotation.y = 0.2;
  group.add(charredBeam);

  [-1, 1].forEach((side) => {
    const gableBrace = box(0.34, 6.2, 0.34, materials.charcoal, 'CharredGableBrace');
    gableBrace.position.set(side * 4.25, 10.4, 5.45);
    gableBrace.rotation.z = side * -0.52;
    group.add(gableBrace);
  });
  const roofRidge = box(0.36, 0.36, 12.2, materials.charcoal, 'MillRoofRidge');
  roofRidge.position.set(0, 16.65, 0);
  group.add(roofRidge);

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
    fireSockets: fireSockets.map((socket) => (
      socket.clone().multiplyScalar(landmarkScale).add(group.position)
    )),
    colliders: [
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(
          position.x,
          group.position.y + 6 * landmarkScale,
          position.z,
        ),
        new THREE.Vector3(
          15 * landmarkScale,
          12 * landmarkScale,
          13 * landmarkScale,
        ),
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
  const landmarkScale = 1.28;
  const group = new THREE.Group();
  group.name = 'SaintOrensBridgeAndFord';
  const baseY = sampleHeight(position.x, position.z);
  group.position.set(position.x, baseY, position.z);
  group.scale.setScalar(landmarkScale);
  group.userData.landmarkScale = landmarkScale;

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
  gatePosts.forEach((post, index) => {
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(1.65, 2.1, 4),
      materials.limestoneDark,
    );
    cap.name = 'BridgeGateFinial';
    cap.position.set(post.position.x, 11.78, post.position.z);
    cap.rotation.y = Math.PI * 0.25;
    cap.castShadow = true;
    group.add(cap);

    const brace = box(0.34, 5.8, 0.34, materials.timber, 'BridgeGateBrace');
    brace.position.set(index === 0 ? -3.2 : 3.2, 8.1, -12.55);
    brace.rotation.z = index === 0 ? -0.72 : 0.72;
    group.add(brace);
  });
  const coping = box(15.1, 0.38, 1.35, materials.limestone, 'BridgeGateCoping');
  coping.position.set(0, 11.05, -13.2);
  group.add(coping);

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
    bridgeSurfaceHeight: baseY + 3.95 * landmarkScale,
    walkableBounds: new THREE.Box2(
      new THREE.Vector2(position.x - 5.75 * landmarkScale, position.z - 15.5 * landmarkScale),
      new THREE.Vector2(position.x + 5.75 * landmarkScale, position.z + 15.5 * landmarkScale),
    ),
    colliders: [
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(
          position.x - 6.35 * landmarkScale,
          baseY + 5 * landmarkScale,
          position.z,
        ),
        new THREE.Vector3(
          1.15 * landmarkScale,
          4 * landmarkScale,
          31 * landmarkScale,
        ),
      ),
      new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(
          position.x + 6.35 * landmarkScale,
          baseY + 5 * landmarkScale,
          position.z,
        ),
        new THREE.Vector3(
          1.15 * landmarkScale,
          4 * landmarkScale,
          31 * landmarkScale,
        ),
      ),
    ],
  };
}

export const ROUTE_COMPOSITION_CELLS = Object.freeze([
  Object.freeze({
    name: 'BaggageGate',
    z: 224,
    foregroundSide: -1,
    conflictSide: 1,
    objective: 'CollapsedCentre',
    cart: false,
  }),
  Object.freeze({
    name: 'CollapsedCentre',
    z: 126,
    foregroundSide: 1,
    conflictSide: -1,
    objective: 'RallyOak',
    cart: true,
  }),
  Object.freeze({
    name: 'RallyCrossroads',
    z: 48,
    foregroundSide: -1,
    conflictSide: 1,
    objective: 'BurningMill',
    cart: false,
  }),
  Object.freeze({
    name: 'SpearLineApproach',
    z: -48,
    foregroundSide: 1,
    conflictSide: -1,
    objective: 'EnemySpearLine',
    cart: true,
  }),
  Object.freeze({
    name: 'BrookApproach',
    z: -126,
    foregroundSide: -1,
    conflictSide: 1,
    objective: 'SaintOrensBridge',
    cart: false,
  }),
  Object.freeze({
    name: 'SaintOrensCrossing',
    z: -202,
    foregroundSide: 1,
    conflictSide: -1,
    objective: 'EnemyRise',
    cart: true,
  }),
]);

function createStaticInstances(geometry, material, count, name, {
  castShadow = false,
  receiveShadow = true,
} = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  return mesh;
}

/**
 * Builds six authored composition cells along the playable route. The dense
 * forms remain outside a generous central lane while low-profile marks can
 * cross it, so each vista gains foreground, conflict and objective layers
 * without introducing new collision blockers.
 */
export function createRouteCompositionCells({
  materials,
  sampleHeight,
  seed = 94721,
  quality = 'high',
}) {
  const group = new THREE.Group();
  group.name = 'BattlefieldRouteComposition';
  const random = createRng(seed + 8400);
  const dummy = new THREE.Object3D();
  const highQualityShadows = quality === 'high';
  const perCellCount = (total, cellIndex) => (
    Math.floor(total / ROUTE_COMPOSITION_CELLS.length)
    + (cellIndex < total % ROUTE_COMPOSITION_CELLS.length ? 1 : 0)
  );

  const hedgeBankCount = ROUTE_COMPOSITION_CELLS.length * 2;
  const hedgeClumpCount = ROUTE_COMPOSITION_CELLS.length * 7;
  const fencePostCount = ROUTE_COMPOSITION_CELLS.length * 5;
  const fenceRailCount = ROUTE_COMPOSITION_CELLS.length * 4;
  const conflictCount = ROUTE_COMPOSITION_CELLS.length * 4;
  const woundedCount = ROUTE_COMPOSITION_CELLS.length * 3;
  const arrowCount = quality === 'low' ? 72 : quality === 'medium' ? 120 : 180;
  const mudCount = quality === 'low' ? 70 : quality === 'medium' ? 120 : 190;
  const strawCount = quality === 'low' ? 100 : quality === 'medium' ? 190 : 310;
  const footprintCount = quality === 'low' ? 54 : quality === 'medium' ? 90 : 138;
  const rutCount = ROUTE_COMPOSITION_CELLS.length * 6;
  const puddleRimCount = ROUTE_COMPOSITION_CELLS.length * 3;

  const hedgeBanks = createStaticInstances(
    new THREE.BoxGeometry(1, 1, 1),
    materials.soil,
    hedgeBankCount,
    'CompositionHedgeBanks',
    { castShadow: highQualityShadows },
  );
  const hedgeClumps = createStaticInstances(
    new THREE.IcosahedronGeometry(1, 0),
    materials.leafDry,
    hedgeClumpCount,
    'CompositionHedgeClumps',
    { castShadow: highQualityShadows },
  );
  const fencePosts = createStaticInstances(
    new THREE.CylinderGeometry(0.09, 0.14, 2.2, 5),
    materials.timber,
    fencePostCount,
    'CompositionFencePosts',
    { castShadow: highQualityShadows },
  );
  const fenceRails = createStaticInstances(
    new THREE.BoxGeometry(1, 0.13, 0.16),
    materials.timberLight,
    fenceRailCount,
    'CompositionFenceRails',
    { castShadow: highQualityShadows },
  );
  const blueConflict = createStaticInstances(
    new THREE.CapsuleGeometry(0.27, 0.88, 2, 5),
    materials.blueCloth,
    conflictCount / 2,
    'CompositionAngloGasconSilhouettes',
  );
  const redConflict = createStaticInstances(
    new THREE.CapsuleGeometry(0.27, 0.88, 2, 5),
    materials.redCloth,
    conflictCount / 2,
    'CompositionFrenchSilhouettes',
  );
  const conflictWeapons = createStaticInstances(
    new THREE.CylinderGeometry(0.022, 0.032, 3.5, 5),
    materials.timberLight,
    conflictCount,
    'CompositionConflictWeapons',
  );
  const blueWounded = createStaticInstances(
    new THREE.CapsuleGeometry(0.29, 0.76, 2, 6),
    materials.blueCloth,
    Math.ceil(woundedCount / 2),
    'CompositionWoundedAngloGascon',
    { castShadow: highQualityShadows },
  );
  const redWounded = createStaticInstances(
    new THREE.CapsuleGeometry(0.29, 0.76, 2, 6),
    materials.redCloth,
    Math.floor(woundedCount / 2),
    'CompositionWoundedFrench',
    { castShadow: highQualityShadows },
  );
  const arrows = createStaticInstances(
    new THREE.CylinderGeometry(0.014, 0.022, 1.12, 4),
    materials.timberLight,
    arrowCount,
    'InstancedBattlefieldArrows',
  );
  const mudClods = createStaticInstances(
    new THREE.DodecahedronGeometry(0.2, 0),
    materials.soil,
    mudCount,
    'InstancedRouteMudClods',
  );
  const straw = createStaticInstances(
    new THREE.ConeGeometry(0.025, 0.7, 3),
    materials.straw,
    strawCount,
    'InstancedRouteStraw',
  );
  const footprints = createStaticInstances(
    new THREE.SphereGeometry(0.28, 7, 4),
    materials.charcoal,
    footprintCount,
    'InstancedRouteFootprints',
    { receiveShadow: false },
  );
  const ruts = createStaticInstances(
    new THREE.BoxGeometry(0.44, 0.08, 1),
    materials.soil,
    rutCount,
    'InstancedWagonRuts',
    { receiveShadow: false },
  );
  const puddleRimGeometry = new THREE.TorusGeometry(1, 0.065, 5, 18);
  puddleRimGeometry.rotateX(Math.PI * 0.5);
  const puddleRims = createStaticInstances(
    puddleRimGeometry,
    materials.limestoneDark,
    puddleRimCount,
    'InstancedPuddleRims',
    { receiveShadow: false },
  );

  let hedgeBankIndex = 0;
  let hedgeClumpIndex = 0;
  let fencePostIndex = 0;
  let fenceRailIndex = 0;
  let blueConflictIndex = 0;
  let redConflictIndex = 0;
  let conflictWeaponIndex = 0;
  let blueWoundedIndex = 0;
  let redWoundedIndex = 0;
  let arrowIndex = 0;
  let mudIndex = 0;
  let strawIndex = 0;
  let footprintIndex = 0;
  let rutIndex = 0;
  let puddleRimIndex = 0;

  ROUTE_COMPOSITION_CELLS.forEach((cell, cellIndex) => {
    const anchor = new THREE.Group();
    anchor.name = `RouteCompositionCell:${cell.name}`;
    anchor.position.set(0, sampleHeight(0, cell.z), cell.z);
    anchor.userData.routeComposition = {
      index: cellIndex,
      foreground: true,
      midgroundConflict: true,
      backgroundObjective: cell.objective,
      clearHalfWidth: 8.5,
    };
    anchor.userData.visibilityAnchor = new THREE.Vector3(0, 0, cell.z);
    group.add(anchor);

    const foregroundX = cell.foregroundSide * (17 + (cellIndex % 2) * 3);
    const oppositeX = -cell.foregroundSide * (24 + (cellIndex % 3) * 2);
    const foregroundZ = cell.z + 18;
    const hedgeYaw = cell.foregroundSide * (0.12 + (cellIndex % 2) * 0.05);
    [
      [foregroundX, foregroundZ, 11.5, hedgeYaw],
      [oppositeX, cell.z + 5, 8.5, -hedgeYaw * 0.65],
    ].forEach(([x, z, length, yaw]) => {
      setInstanceTransform(hedgeBanks, hedgeBankIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.28, z),
        rotation: new THREE.Euler(0, yaw, 0),
        scale: new THREE.Vector3(length, 0.62, 1.65),
      }, dummy);
      hedgeBankIndex += 1;
      for (let clump = 0; clump < (length > 10 ? 4 : 3); clump += 1) {
        const offset = (clump - (length > 10 ? 1.5 : 1)) * 2.8;
        const clumpX = x + Math.cos(yaw) * offset;
        const clumpZ = z - Math.sin(yaw) * offset;
        setInstanceTransform(hedgeClumps, hedgeClumpIndex, {
          position: new THREE.Vector3(
            clumpX,
            sampleHeight(clumpX, clumpZ) + 1.25,
            clumpZ,
          ),
          rotation: new THREE.Euler(0, randomRange(random, 0, Math.PI), 0),
          scale: new THREE.Vector3(
            randomRange(random, 1.25, 1.8),
            randomRange(random, 0.78, 1.22),
            randomRange(random, 0.75, 1.05),
          ),
        }, dummy);
        hedgeClumpIndex += 1;
      }
    });

    const fenceX = -cell.foregroundSide * (15 + (cellIndex % 2) * 2);
    const fenceZ = cell.z + 22;
    const fenceYaw = -cell.foregroundSide * (0.2 + cellIndex * 0.018);
    for (let post = 0; post < 5; post += 1) {
      const offset = (post - 2) * 2.25;
      const x = fenceX + Math.cos(fenceYaw) * offset;
      const z = fenceZ - Math.sin(fenceYaw) * offset;
      setInstanceTransform(fencePosts, fencePostIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 1.02, z),
        rotation: new THREE.Euler(
          randomSigned(random, 0.05),
          fenceYaw,
          randomSigned(random, 0.08),
        ),
        scale: new THREE.Vector3(1, randomRange(random, 0.82, 1.12), 1),
      }, dummy);
      fencePostIndex += 1;
      if (post < 4) {
        const railOffset = offset + 1.125;
        const railX = fenceX + Math.cos(fenceYaw) * railOffset;
        const railZ = fenceZ - Math.sin(fenceYaw) * railOffset;
        setInstanceTransform(fenceRails, fenceRailIndex, {
          position: new THREE.Vector3(
            railX,
            sampleHeight(railX, railZ) + 1.12 + (post % 2) * 0.18,
            railZ,
          ),
          rotation: new THREE.Euler(0, fenceYaw, randomSigned(random, 0.045)),
          scale: new THREE.Vector3(2.5, 1, 1),
        }, dummy);
        fenceRailIndex += 1;
      }
    }

    if (cell.cart) {
      const cartX = cell.foregroundSide * (21 + cellIndex);
      const cartZ = cell.z + 9;
      const cart = createCart(materials, cellIndex % 2 === 0);
      cart.name = `CompositionCart:${cell.name}`;
      cart.scale.setScalar(0.86);
      cart.position.set(
        cartX,
        sampleHeight(cartX, cartZ) - anchor.position.y + 0.05,
        cartZ - cell.z,
      );
      cart.rotation.y = cell.foregroundSide * (Math.PI * 0.46 + cellIndex * 0.025);
      // Route anchors now own their authored non-instanced detail. Shared
      // instanced ground marks remain batched across the route, while these
      // relatively expensive carts can follow local/adjacent sector visibility.
      anchor.add(cart);
    }

    for (let fighter = 0; fighter < 4; fighter += 1) {
      const factionSide = fighter % 2 === 0 ? cell.conflictSide : -cell.conflictSide;
      const x = factionSide * (26 + fighter * 1.8 + (cellIndex % 2) * 3);
      const z = cell.z - 14 - Math.floor(fighter / 2) * 3.2;
      const target = (cellIndex + fighter) % 2 === 0 ? blueConflict : redConflict;
      const targetIndex = target === blueConflict ? blueConflictIndex++ : redConflictIndex++;
      const facing = factionSide < 0 ? Math.PI * 0.42 : -Math.PI * 0.42;
      setInstanceTransform(target, targetIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 1.15, z),
        rotation: new THREE.Euler(0, facing + randomSigned(random, 0.22), 0),
        scale: new THREE.Vector3(1, randomRange(random, 0.9, 1.13), 1),
      }, dummy);
      setInstanceTransform(conflictWeapons, conflictWeaponIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 2, z),
        rotation: new THREE.Euler(
          randomSigned(random, 0.18),
          facing,
          factionSide * randomRange(random, 0.38, 0.72),
        ),
        scale: new THREE.Vector3(1, randomRange(random, 0.8, 1.15), 1),
      }, dummy);
      conflictWeaponIndex += 1;
    }

    for (let wounded = 0; wounded < 3; wounded += 1) {
      const side = wounded % 2 ? -cell.foregroundSide : cell.foregroundSide;
      const x = side * (11.5 + wounded * 4.6 + (cellIndex % 2));
      const z = cell.z - 1 + wounded * 4.2;
      const target = (cellIndex + wounded) % 2 === 0 ? blueWounded : redWounded;
      const targetIndex = target === blueWounded ? blueWoundedIndex++ : redWoundedIndex++;
      setInstanceTransform(target, targetIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.26, z),
        rotation: new THREE.Euler(
          Math.PI * 0.5 + randomSigned(random, 0.12),
          randomRange(random, 0, Math.PI * 2),
          randomSigned(random, 0.12),
        ),
        scale: new THREE.Vector3(
          randomRange(random, 0.9, 1.12),
          randomRange(random, 0.86, 1.12),
          randomRange(random, 0.86, 1.08),
        ),
      }, dummy);
    }

    for (let index = 0; index < perCellCount(arrowCount, cellIndex); index += 1) {
      let x = randomSigned(random, 31);
      if (Math.abs(x) < 7 && random() > 0.45) x += Math.sign(x || 1) * 8;
      const z = cell.z + randomSigned(random, 31);
      setInstanceTransform(arrows, arrowIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.18, z),
        rotation: new THREE.Euler(
          Math.PI * 0.5 + randomSigned(random, 0.48),
          randomRange(random, 0, Math.PI),
          randomRange(random, 0, Math.PI),
        ),
        scale: new THREE.Vector3(1, randomRange(random, 0.65, 1), 1),
      }, dummy);
      arrowIndex += 1;
    }

    for (let index = 0; index < perCellCount(mudCount, cellIndex); index += 1) {
      const x = randomSigned(random, 15);
      const z = cell.z + randomSigned(random, 29);
      setInstanceTransform(mudClods, mudIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.1, z),
        rotation: new THREE.Euler(
          randomRange(random, 0, Math.PI),
          randomRange(random, 0, Math.PI),
          randomRange(random, 0, Math.PI),
        ),
        scale: new THREE.Vector3(
          randomRange(random, 0.55, 1.35),
          randomRange(random, 0.35, 0.82),
          randomRange(random, 0.6, 1.45),
        ),
      }, dummy);
      mudIndex += 1;
    }

    for (let index = 0; index < perCellCount(strawCount, cellIndex); index += 1) {
      const side = random() > 0.5 ? 1 : -1;
      const x = side * randomRange(random, 8.5, 34);
      const z = cell.z + randomSigned(random, 33);
      setInstanceTransform(straw, strawIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.08, z),
        rotation: new THREE.Euler(
          Math.PI * 0.5 + randomSigned(random, 0.25),
          randomRange(random, 0, Math.PI),
          randomRange(random, 0, Math.PI),
        ),
        scale: new THREE.Vector3(1, randomRange(random, 0.35, 1.2), 1),
      }, dummy);
      strawIndex += 1;
    }

    for (let index = 0; index < perCellCount(footprintCount, cellIndex); index += 1) {
      const pair = Math.floor(index / 2);
      const side = index % 2 ? 1 : -1;
      const x = side * (1.6 + (pair % 3) * 0.32) + randomSigned(random, 0.18);
      const z = cell.z + 25 - pair * 3.4 + randomSigned(random, 0.3);
      setInstanceTransform(footprints, footprintIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.035, z),
        rotation: new THREE.Euler(0, randomSigned(random, 0.22), 0),
        scale: new THREE.Vector3(0.7, 0.055, 1.35),
      }, dummy);
      footprintIndex += 1;
    }

    for (let index = 0; index < 6; index += 1) {
      const side = index % 2 ? 1 : -1;
      const x = side * (3.6 + Math.floor(index / 2) * 0.5);
      const z = cell.z + 27 - Math.floor(index / 2) * 11;
      setInstanceTransform(ruts, rutIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.035, z),
        rotation: new THREE.Euler(0, randomSigned(random, 0.04), 0),
        scale: new THREE.Vector3(1, 1, 8.5),
      }, dummy);
      rutIndex += 1;
    }

    for (let index = 0; index < 3; index += 1) {
      const side = index % 2 ? 1 : -1;
      const x = side * (4.8 + index * 1.4);
      const z = cell.z + 12 - index * 10.5;
      setInstanceTransform(puddleRims, puddleRimIndex, {
        position: new THREE.Vector3(x, sampleHeight(x, z) + 0.045, z),
        rotation: new THREE.Euler(0, randomRange(random, 0, Math.PI), 0),
        scale: new THREE.Vector3(
          1.25 + (index % 2) * 0.6,
          1,
          0.48 + index * 0.14,
        ),
      }, dummy);
      puddleRimIndex += 1;
    }
  });

  [
    hedgeBanks,
    hedgeClumps,
    fencePosts,
    fenceRails,
    blueConflict,
    redConflict,
    conflictWeapons,
    blueWounded,
    redWounded,
    arrows,
    mudClods,
    straw,
    footprints,
    ruts,
    puddleRims,
  ].forEach((mesh) => {
    group.add(mesh);
  });

  return group;
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
  const count = quality === 'low' ? 60 : quality === 'medium' ? 110 : 180;
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
      position: new THREE.Vector3(shieldX, sampleHeight(shieldX, shieldZ) + 0.1, shieldZ),
      rotation: new THREE.Euler(
        randomSigned(random, 0.12),
        randomRange(random, 0, Math.PI),
        randomSigned(random, 0.12),
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

  // Low horizontal forms and abandoned helmets imply losses without creating
  // collision clutter or relying on graphic/proprietary assets.
  const casualtyCount = quality === 'low' ? 14 : quality === 'medium' ? 26 : 42;
  const blueCount = Math.ceil(casualtyCount * 0.5);
  const redCount = casualtyCount - blueCount;
  const casualtyGeometry = new THREE.CapsuleGeometry(0.3, 0.78, 2, 6);
  const blueCasualties = new THREE.InstancedMesh(casualtyGeometry, materials.blueCloth, blueCount);
  const redCasualties = new THREE.InstancedMesh(casualtyGeometry, materials.redCloth, redCount);
  blueCasualties.name = 'FallenAngloGasconSilhouettes';
  redCasualties.name = 'FallenFrenchSilhouettes';
  const helmetGeometry = new THREE.ConeGeometry(0.28, 0.34, 6);
  const helmets = new THREE.InstancedMesh(helmetGeometry, materials.iron, casualtyCount);
  helmets.name = 'AbandonedHelmets';
  let blueIndex = 0;
  let redIndex = 0;
  for (let index = 0; index < casualtyCount; index += 1) {
    const cluster = index % 4;
    const clusterZ = [132, 68, -18, -94][cluster];
    let x = randomSigned(random, 54 - cluster * 4);
    if (Math.abs(x) < 7.5) x += Math.sign(x || randomSigned(random)) * 9;
    const z = clusterZ + randomSigned(random, 18);
    const y = sampleHeight(x, z);
    const target = index % 2 === 0 ? blueCasualties : redCasualties;
    const targetIndex = index % 2 === 0 ? blueIndex++ : redIndex++;
    setInstanceTransform(target, targetIndex, {
      position: new THREE.Vector3(x, y + 0.28, z),
      rotation: new THREE.Euler(
        Math.PI * 0.5 + randomSigned(random, 0.16),
        randomRange(random, 0, Math.PI * 2),
        randomSigned(random, 0.15),
      ),
      scale: new THREE.Vector3(
        randomRange(random, 0.86, 1.12),
        randomRange(random, 0.88, 1.2),
        randomRange(random, 0.82, 1.08),
      ),
    }, dummy);
    const helmetX = x + randomSigned(random, 1.25);
    const helmetZ = z + randomSigned(random, 1.25);
    setInstanceTransform(helmets, index, {
      position: new THREE.Vector3(
        helmetX,
        sampleHeight(helmetX, helmetZ) + 0.18,
        helmetZ,
      ),
      rotation: new THREE.Euler(
        Math.PI * 0.5 + randomSigned(random, 0.35),
        randomRange(random, 0, Math.PI * 2),
        randomSigned(random, 0.3),
      ),
      scale: new THREE.Vector3(1, randomRange(random, 0.78, 1.08), 1),
    }, dummy);
  }
  [blueCasualties, redCasualties, helmets].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = quality === 'high';
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
  cloth.geometry.attributes.normal.setUsage(THREE.StaticDrawUsage);
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
  const rankCount = quality === 'low' ? 72 : quality === 'medium' ? 125 : 190;
  const bodyGeometry = new THREE.CapsuleGeometry(0.3, 0.95, 2, 5);
  const redRanks = new THREE.InstancedMesh(bodyGeometry, materials.redCloth, rankCount);
  const blueRanks = new THREE.InstancedMesh(bodyGeometry, materials.blueCloth, rankCount);
  redRanks.name = 'FarFrenchRanks';
  blueRanks.name = 'FarAngloGasconRanks';
  const dummy = new THREE.Object3D();
  const spearGeometry = new THREE.CylinderGeometry(0.018, 0.026, 3.4, 5);
  const farSpears = new THREE.InstancedMesh(
    spearGeometry,
    materials.timberLight,
    rankCount * 2,
  );
  farSpears.name = 'FarRankSpearForest';
  let spearIndex = 0;
  const layouts = {
    blue: [
      { x: -91, z: 58, frontage: 13, heading: 0.03 },
      { x: -151, z: -48, frontage: 15, heading: 0.16 },
      { x: -92, z: -151, frontage: 12, heading: -0.08 },
    ],
    red: [
      { x: 79, z: -38, frontage: 14, heading: Math.PI - 0.04 },
      { x: 158, z: -104, frontage: 15, heading: Math.PI - 0.18 },
      { x: 75, z: -208, frontage: 12, heading: Math.PI + 0.08 },
    ],
  };
  const horizonSectors = [];
  const horizonSectorByKey = new Map();
  Object.entries(layouts).forEach(([side, formations]) => {
    formations.forEach((formation, index) => {
      const sector = new THREE.Group();
      sector.name = `DistantBattleSector:${side}:${index}`;
      sector.userData.visibilityAnchor = new THREE.Vector3(
        formation.x,
        0,
        formation.z,
      );
      sector.userData.horizonBattleSector = {
        side,
        index,
        frontage: formation.frontage,
      };
      horizonSectors.push(sector);
      horizonSectorByKey.set(`${side}:${index}`, sector);
      group.add(sector);
    });
  });

  function placeRanks(mesh, formations) {
    for (let index = 0; index < rankCount; index += 1) {
      const formation = formations[index % formations.length];
      const slot = Math.floor(index / formations.length);
      const row = Math.floor(slot / formation.frontage);
      const column = slot % formation.frontage;
      const x = formation.x
        + (column - (formation.frontage - 1) * 0.5) * 1.42
        + randomSigned(random, 0.22);
      const z = formation.z + row * 1.46 + randomSigned(random, 0.2);
      const y = sampleHeight(x, z);
      setInstanceTransform(mesh, index, {
        position: new THREE.Vector3(x, y + 1.2, z),
        rotation: new THREE.Euler(0, formation.heading + randomSigned(random, 0.08), 0),
        scale: new THREE.Vector3(
          randomRange(random, 0.86, 1.04),
          randomRange(random, 0.94, 1.12),
          randomRange(random, 0.86, 1.04),
        ),
      }, dummy);
      if (index % 5 !== 0) {
        setInstanceTransform(farSpears, spearIndex, {
          position: new THREE.Vector3(x, y + 1.92, z),
          rotation: new THREE.Euler(
            randomSigned(random, 0.08),
            formation.heading,
            randomSigned(random, 0.08),
          ),
          scale: new THREE.Vector3(1, randomRange(random, 0.88, 1.08), 1),
        }, dummy);
        spearIndex += 1;
      }
    }
  }
  placeRanks(blueRanks, layouts.blue);
  placeRanks(redRanks, layouts.red);
  redRanks.count = rankCount;
  blueRanks.count = rankCount;
  farSpears.count = spearIndex;
  [redRanks, blueRanks, farSpears].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    mesh.castShadow = false;
    group.add(mesh);
  });

  const cavalryPerSide = quality === 'low' ? 6 : quality === 'medium' ? 10 : 16;
  const horseGeometry = new THREE.CapsuleGeometry(0.44, 1.35, 2, 6);
  horseGeometry.rotateZ(Math.PI * 0.5);
  const horseBodies = new THREE.InstancedMesh(
    horseGeometry,
    materials.charcoal,
    cavalryPerSide * 2,
  );
  horseBodies.name = 'FarCavalryHorses';
  const riderGeometry = new THREE.CapsuleGeometry(0.22, 0.62, 2, 5);
  const blueRiders = new THREE.InstancedMesh(riderGeometry, materials.blueCloth, cavalryPerSide);
  const redRiders = new THREE.InstancedMesh(riderGeometry, materials.redCloth, cavalryPerSide);
  blueRiders.name = 'FarAngloGasconCavalry';
  redRiders.name = 'FarFrenchCavalry';
  for (let index = 0; index < cavalryPerSide; index += 1) {
    [-1, 1].forEach((side, sideIndex) => {
      const x = side * (184 + (index % 4) * 3.5) + randomSigned(random, 2);
      const z = -174 + Math.floor(index / 4) * 4.2 + randomSigned(random, 1.5);
      const y = sampleHeight(x, z);
      const heading = side < 0 ? 0.22 : Math.PI - 0.22;
      const horseIndex = index + sideIndex * cavalryPerSide;
      setInstanceTransform(horseBodies, horseIndex, {
        position: new THREE.Vector3(x, y + 1.05, z),
        rotation: new THREE.Euler(0, heading, 0),
        scale: new THREE.Vector3(
          randomRange(random, 0.92, 1.12),
          randomRange(random, 0.9, 1.08),
          randomRange(random, 0.9, 1.05),
        ),
      }, dummy);
      setInstanceTransform(side < 0 ? blueRiders : redRiders, index, {
        position: new THREE.Vector3(x, y + 2.15, z),
        rotation: new THREE.Euler(0, heading, randomSigned(random, 0.05)),
        scale: new THREE.Vector3(1, randomRange(random, 0.92, 1.08), 1),
      }, dummy);
    });
  }
  [horseBodies, blueRiders, redRiders].forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    group.add(mesh);
  });

  const smokeMaterial = new THREE.MeshStandardMaterial({
    color: 0x4b4b47,
    roughness: 1,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    flatShading: true,
  });
  const smokeCount = quality === 'low' ? 8 : quality === 'medium' ? 14 : 22;
  const smoke = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.5, 0),
    smokeMaterial,
    smokeCount,
  );
  smoke.name = 'FarBattleSmoke';
  for (let index = 0; index < smokeCount; index += 1) {
    const column = index % 5;
    const side = index % 2 ? 1 : -1;
    const x = side * (62 + (index % 4) * 28);
    const z = -118 - (index % 3) * 38;
    const baseY = sampleHeight(x, z);
    setInstanceTransform(smoke, index, {
      position: new THREE.Vector3(
        x + randomSigned(random, 5),
        baseY + 5 + column * 2.4,
        z + randomSigned(random, 5),
      ),
      rotation: new THREE.Euler(
        randomSigned(random, 0.2),
        randomRange(random, 0, Math.PI),
        randomSigned(random, 0.2),
      ),
      scale: new THREE.Vector3(
        randomRange(random, 1.2, 2.4),
        randomRange(random, 1.6, 3.2),
        randomRange(random, 1.2, 2.3),
      ),
    }, dummy);
  }
  smoke.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  smoke.renderOrder = 1;
  group.add(smoke);

  const banners = [];
  for (let index = 0; index < 18; index += 1) {
    const side = index % 2 ? 1 : -1;
    const formations = side < 0 ? layouts.blue : layouts.red;
    const formationIndex = index % formations.length;
    const formation = formations[formationIndex];
    const x = formation.x + randomSigned(random, 8);
    const z = formation.z + randomSigned(random, 6);
    const banner = createStandard({
      materials,
      sampleHeight,
      position: new THREE.Vector3(x, 0, z),
      color: side > 0 ? 'red' : 'blue',
      height: randomRange(random, 7, 9),
      name: 'FarBattleBanner',
    });
    banner.scale.setScalar(0.78);
    banners.push(banner);
    horizonSectorByKey
      .get(`${side < 0 ? 'blue' : 'red'}:${formationIndex}`)
      .add(banner);
  }

  return {
    group,
    banners,
    redRanks,
    blueRanks,
    horizonSectors,
  };
}
