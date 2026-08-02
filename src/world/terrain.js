import * as THREE from 'three';
import {
  bell,
  distanceToPolyline2D,
  fbm2D,
  ridgedNoise2D,
  smoothstep,
} from './math.js';

export const WORLD_SIZE = 620;
export const WORLD_HALF_SIZE = WORLD_SIZE * 0.5;

export const LANDMARKS = Object.freeze({
  playerStart: new THREE.Vector3(4, 0, 255),
  baggageLine: new THREE.Vector3(2, 0, 225),
  meleeLane: new THREE.Vector3(12, 0, 90),
  hedgerowRally: new THREE.Vector3(-42, 0, 34),
  burningMill: new THREE.Vector3(104, 0, 18),
  spearLine: new THREE.Vector3(3, 0, -75),
  bridge: new THREE.Vector3(-7, 0, -174),
  ford: new THREE.Vector3(23, 0, -175),
  enemyRise: new THREE.Vector3(0, 0, -246),
  distantBattleWest: new THREE.Vector3(-155, 0, -145),
  distantBattleEast: new THREE.Vector3(145, 0, -125),
});

const ROAD_POINTS = [
  new THREE.Vector2(4, 302),
  new THREE.Vector2(2, 250),
  new THREE.Vector2(7, 205),
  new THREE.Vector2(11, 150),
  new THREE.Vector2(13, 96),
  new THREE.Vector2(6, 42),
  new THREE.Vector2(4, -12),
  new THREE.Vector2(2, -72),
  new THREE.Vector2(-4, -128),
  new THREE.Vector2(-7, -176),
  new THREE.Vector2(-3, -235),
];

const FARM_TRACK = [
  new THREE.Vector2(10, 205),
  new THREE.Vector2(-35, 207),
  new THREE.Vector2(-78, 214),
  new THREE.Vector2(-122, 225),
];

const CAMP_TRACK = [
  new THREE.Vector2(10, 80),
  new THREE.Vector2(46, 65),
  new THREE.Vector2(75, 43),
  new THREE.Vector2(104, 18),
];

const CHAPEL_TRACK = [
  new THREE.Vector2(1, -36),
  new THREE.Vector2(-36, -15),
  new THREE.Vector2(-75, 1),
  new THREE.Vector2(-104, 18),
];

function terrainBaseHeight(x, z, seed) {
  const broad = fbm2D(x * 0.0043, z * 0.0043, {
    seed,
    octaves: 5,
    gain: 0.54,
  });
  const medium = fbm2D(x * 0.012, z * 0.012, {
    seed: seed + 53,
    octaves: 4,
    gain: 0.48,
  });
  const ridge = ridgedNoise2D(x * 0.0065, z * 0.0065, {
    seed: seed + 117,
    octaves: 3,
    gain: 0.52,
  });

  const edgeUplift = smoothstep(165, 330, Math.hypot(x * 0.8, z));
  const northernRidge = smoothstep(-155, -305, z) * (
    7 + ridge * 12 + Math.max(0, Math.abs(x) - 135) * 0.045
  );
  const westernRidge = smoothstep(105, 305, -x) * ridge * 11;
  const southernShelf = smoothstep(185, 305, z) * 6;

  return (
    (broad - 0.5) * 22
    + (medium - 0.5) * 5.5
    + edgeUplift * 6
    + northernRidge
    + westernRidge
    + southernShelf
  );
}

function applyRoute(height, x, z, points, width, shoulder, cutDepth) {
  const distance = distanceToPolyline2D(x, z, points);
  const route = 1 - smoothstep(width, width + shoulder, distance);
  if (route <= 0) return height;

  const roadCamber = Math.min(distance / width, 1) * 0.4;
  const intended = height - cutDepth - route * 0.3 + roadCamber;
  return THREE.MathUtils.lerp(height, intended, route * 0.72);
}

export function sampleTerrainHeight(x, z, seed = 94721) {
  let height = terrainBaseHeight(x, z, seed);

  // The enemy-held rise silhouettes ranks beyond the bridge without becoming a castle.
  const enemyRiseDistance = Math.hypot(x * 0.76, (z + 242) * 0.74);
  const enemyRise = 1 - smoothstep(42, 122, enemyRiseDistance);
  const enemyRiseHeight = 8.5 + fbm2D(x * 0.018, z * 0.018, {
    seed: seed + 200,
    octaves: 2,
  }) * 1.1;
  height = THREE.MathUtils.lerp(height, enemyRiseHeight, enemyRise * 0.72);

  // Low, scarred central battlefield bowl.
  const battlefield = 1 - smoothstep(40, 165, Math.hypot(x * 0.78, z - 48));
  height -= battlefield * 3.6;

  // Saint-Orens brook crosses the advance near the enemy end of the lane.
  const streamCenter = -174 + Math.sin(x * 0.025) * 5;
  const streamDistance = Math.abs(z - streamCenter);
  const streamValley = 1 - smoothstep(3, 25, streamDistance);
  height -= streamValley * (4.1 + smoothstep(110, 280, Math.abs(x)) * 1.6);

  height = applyRoute(height, x, z, ROAD_POINTS, 5.4, 7.5, 1.35);
  height = applyRoute(height, x, z, FARM_TRACK, 3.1, 5.5, 0.65);
  height = applyRoute(height, x, z, CAMP_TRACK, 3.1, 5.5, 0.7);
  height = applyRoute(height, x, z, CHAPEL_TRACK, 2.6, 4.5, 0.45);

  // Flatten footprints enough for the baggage line, mill and bridge approaches.
  const pads = [
    { x: 0, z: 220, rx: 95, rz: 43, target: terrainBaseHeight(0, 220, seed) + 2.4 },
    { x: 104, z: 18, rx: 38, rz: 34, target: terrainBaseHeight(104, 18, seed) + 0.5 },
    { x: -42, z: 34, rx: 55, rz: 28, target: terrainBaseHeight(-42, 34, seed) },
    { x: 0, z: -174, rx: 50, rz: 24, target: terrainBaseHeight(0, -174, seed) - 1.3 },
    { x: 0, z: -238, rx: 72, rz: 40, target: enemyRiseHeight },
  ];

  pads.forEach((pad) => {
    const ellipticalDistance = Math.hypot(
      (x - pad.x) / pad.rx,
      (z - pad.z) / pad.rz,
    );
    const influence = 1 - smoothstep(0.66, 1, ellipticalDistance);
    height = THREE.MathUtils.lerp(height, pad.target, influence * 0.82);
  });

  // Shell impacts, shallow enough to traverse.
  const craters = [
    [-22, 82, 9, 2.7],
    [31, 64, 6, 1.7],
    [58, 102, 8, 2.1],
    [-55, 54, 5, 1.4],
    [14, -24, 7, 1.8],
    [74, -55, 5, 1.3],
  ];
  craters.forEach(([cx, cz, radius, depth]) => {
    height -= bell(Math.hypot(x - cx, z - cz), 0, radius) * depth;
  });

  return height;
}

export function sampleTerrainNormal(x, z, target = new THREE.Vector3(), seed = 94721) {
  const step = 0.7;
  const left = sampleTerrainHeight(x - step, z, seed);
  const right = sampleTerrainHeight(x + step, z, seed);
  const down = sampleTerrainHeight(x, z - step, seed);
  const up = sampleTerrainHeight(x, z + step, seed);
  return target.set(left - right, step * 2, down - up).normalize();
}

function terrainColorAt(x, z, height, slope, seed) {
  const dryNoise = fbm2D(x * 0.025, z * 0.025, {
    seed: seed + 401,
    octaves: 3,
  });
  const roadDistance = Math.min(
    distanceToPolyline2D(x, z, ROAD_POINTS),
    distanceToPolyline2D(x, z, FARM_TRACK),
    distanceToPolyline2D(x, z, CAMP_TRACK),
    distanceToPolyline2D(x, z, CHAPEL_TRACK),
  );
  const road = 1 - smoothstep(3.2, 8.8, roadDistance);
  const battlefield = 1 - smoothstep(65, 165, Math.hypot(x * 0.82, z - 45));
  const streamCenter = -174 + Math.sin(x * 0.025) * 5;
  const wet = 1 - smoothstep(2, 20, Math.abs(z - streamCenter));
  const rock = smoothstep(0.24, 0.72, slope) + smoothstep(16, 31, height) * 0.45;

  const grass = new THREE.Color(0x536038);
  const summerGrass = new THREE.Color(0x747443);
  const earth = new THREE.Color(0x594738);
  const mud = new THREE.Color(0x302f29);
  const stone = new THREE.Color(0x69675d);

  grass.lerp(summerGrass, dryNoise * 0.68);
  grass.lerp(earth, Math.max(road, battlefield * (0.25 + dryNoise * 0.25)));
  grass.lerp(mud, wet * 0.62);
  grass.lerp(stone, Math.min(1, rock) * 0.72);
  return grass;
}

export function createTerrain(options = {}) {
  const {
    seed = 94721,
    size = WORLD_SIZE,
    segments = 192,
    receiveShadow = true,
  } = options;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  const normal = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = sampleTerrainHeight(x, z, seed);
    position.setY(index, height);
  }

  geometry.computeVertexNormals();

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    const height = position.getY(index);
    normal.fromBufferAttribute(geometry.attributes.normal, index);
    const slope = 1 - normal.y;
    color.copy(terrainColorAt(x, z, height, slope, seed));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.worldTime = { value: 0 };
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
        float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor.rgb *= 0.965 + grain * 0.055;
        #include <dithering_fragment>
      `,
    );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'BattlefieldTerrain';
  mesh.receiveShadow = receiveShadow;
  mesh.userData.worldSurface = true;

  ROAD_POINTS.forEach((point) => {
    // Preserve exported points as immutable-ish configuration, not scene vectors.
    point.isRoadControlPoint = true;
  });

  return {
    mesh,
    roadPoints: ROAD_POINTS.map((point) => point.clone()),
    sampleHeight: (x, z) => sampleTerrainHeight(x, z, seed),
    sampleNormal: (x, z, target) => sampleTerrainNormal(x, z, target, seed),
  };
}

export function createWatercourse(sampleHeight, quality = 'high') {
  const points = [];
  const count = quality === 'low' ? 28 : 52;
  for (let index = 0; index < count; index += 1) {
    const x = THREE.MathUtils.lerp(-305, 305, index / (count - 1));
    const z = -174 + Math.sin(x * 0.025) * 5;
    points.push(new THREE.Vector3(x, sampleHeight(x, z) + 0.32, z));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(
    curve,
    count * 2,
    2.3,
    8,
    false,
  );
  geometry.scale(1, 0.12, 1);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x334d4b,
    roughness: 0.24,
    metalness: 0,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    clearcoat: 0.45,
    clearcoatRoughness: 0.32,
  });
  const stream = new THREE.Mesh(geometry, material);
  stream.name = 'AshenBrook';
  stream.renderOrder = 2;
  return stream;
}
