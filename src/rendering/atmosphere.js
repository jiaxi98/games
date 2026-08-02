import * as THREE from 'three';
import { createRng, randomRange, randomSigned } from '../world/math.js';

const SKY_VERTEX_SHADER = /* glsl */`
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT_SHADER = /* glsl */`
  uniform vec3 zenithColor;
  uniform vec3 horizonColor;
  uniform vec3 groundColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform float time;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      value += noise(p) * amplitude;
      p = p * 2.03 + 17.3;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float up = direction.y;
    float aboveHorizon = smoothstep(-0.08, 0.34, up);
    float horizonBand = exp(-abs(up) * 5.5);

    vec3 sky = mix(horizonColor, zenithColor, smoothstep(0.0, 0.86, up));
    sky = mix(groundColor, sky, smoothstep(-0.28, 0.035, up));

    vec2 cloudUv = direction.xz / max(0.12, up + 0.5);
    vec2 wind = vec2(time * 0.0024, time * -0.00055);
    float broadCloud = fbm(cloudUv * 0.82 + wind);
    float midCloud = fbm(cloudUv * 1.75 - wind * 1.35 + 9.7);
    float fineCloud = fbm(cloudUv * 4.2 + wind * 2.1 + 31.0);
    float cloudField = broadCloud * 0.58 + midCloud * 0.32 + fineCloud * 0.1;
    float cloud = smoothstep(0.49, 0.73, cloudField) * aboveHorizon;
    float cloudBody = smoothstep(0.44, 0.76, broadCloud * 0.7 + midCloud * 0.3);

    vec3 cloudShadow = vec3(0.18, 0.205, 0.22);
    vec3 cloudLight = vec3(0.42, 0.46, 0.47);
    vec3 cloudColor = mix(cloudShadow, cloudLight, fineCloud * 0.48 + horizonBand * 0.2);
    sky = mix(sky, cloudColor, cloud * (0.58 + cloudBody * 0.2));

    float sunFacing = max(dot(direction, normalize(sunDirection)), 0.0);
    float sun = pow(sunFacing, 480.0);
    float sunGlow = pow(sunFacing, 18.0);
    float silverLining = pow(sunFacing, 7.0) * cloud * (1.0 - cloudBody * 0.42);
    sky += sunColor * (sun * 1.05 + sunGlow * 0.12 + silverLining * 0.12);

    sky = mix(sky, horizonColor * 1.08, horizonBand * 0.27);
    gl_FragColor = vec4(sky, 1.0);
  }
`;

function createSky() {
  const material = new THREE.ShaderMaterial({
    name: 'ColdGasconSky',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenithColor: { value: new THREE.Color(0x2d3741) },
      horizonColor: { value: new THREE.Color(0x8e9a9b) },
      groundColor: { value: new THREE.Color(0x46504d) },
      sunColor: { value: new THREE.Color(0xffe2ad) },
      sunDirection: { value: new THREE.Vector3(-0.42, 0.34, 0.18).normalize() },
      time: { value: 0 },
    },
    vertexShader: SKY_VERTEX_SHADER,
    fragmentShader: SKY_FRAGMENT_SHADER,
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(470, 32, 18),
    material,
  );
  sky.name = 'ProceduralSlateSky';
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  return sky;
}

function createRain({ quality, seed }) {
  const dropCount = quality === 'low' ? 420 : quality === 'medium' ? 760 : 1280;
  const positions = new Float32Array(dropCount * 2 * 3);
  const speeds = new Float32Array(dropCount);
  const brightness = new Float32Array(dropCount * 2 * 3);
  const random = createRng(seed + 6100);
  for (let index = 0; index < dropCount; index += 1) {
    const x = randomSigned(random, 72);
    const y = randomRange(random, -8, 45);
    const z = randomSigned(random, 72);
    const offset = index * 6;
    positions[offset] = x;
    positions[offset + 1] = y;
    positions[offset + 2] = z;
    positions[offset + 3] = x + 0.16;
    positions[offset + 4] = y - randomRange(random, 0.7, 1.45);
    positions[offset + 5] = z + 0.06;
    speeds[index] = randomRange(random, 22, 38);
    const dropBrightness = randomRange(random, 0.52, 1);
    const colorOffset = index * 6;
    brightness[colorOffset] = dropBrightness;
    brightness[colorOffset + 1] = dropBrightness;
    brightness[colorOffset + 2] = dropBrightness;
    brightness[colorOffset + 3] = dropBrightness * 0.42;
    brightness[colorOffset + 4] = dropBrightness * 0.42;
    brightness[colorOffset + 5] = dropBrightness * 0.42;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(brightness, 3));
  const material = new THREE.LineBasicMaterial({
    color: 0xc7d9e1,
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const rain = new THREE.LineSegments(geometry, material);
  rain.name = 'LocalRainVolume';
  rain.frustumCulled = false;
  rain.renderOrder = 5;

  return {
    object: rain,
    update(delta, camera) {
      rain.position.x = camera.position.x;
      rain.position.z = camera.position.z;
      const array = geometry.attributes.position.array;
      for (let index = 0; index < dropCount; index += 1) {
        const offset = index * 6;
        const fall = speeds[index] * delta;
        array[offset + 1] -= fall;
        array[offset + 4] -= fall;
        if (array[offset + 4] < -8) {
          const resetY = randomRange(random, 34, 48);
          array[offset + 1] = resetY;
          array[offset + 4] = resetY - randomRange(random, 0.7, 1.45);
          array[offset] = randomSigned(random, 72);
          array[offset + 3] = array[offset] + 0.16;
          array[offset + 2] = randomSigned(random, 72);
          array[offset + 5] = array[offset + 2] + 0.06;
        }
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

function createMist({ quality, seed }) {
  const count = quality === 'low' ? 72 : quality === 'medium' ? 125 : 190;
  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const random = createRng(seed + 6300);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = randomSigned(random, 250);
    positions[index * 3 + 1] = randomRange(random, 0.8, 8);
    positions[index * 3 + 2] = randomSigned(random, 250);
    scales[index] = randomRange(random, 6, 18);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('mistScale', new THREE.BufferAttribute(scales, 1));
  const material = new THREE.ShaderMaterial({
    name: 'GroundMistMaterial',
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    uniforms: {
      color: { value: new THREE.Color(0xb3bfbc) },
      opacity: { value: 0.082 },
      time: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute float mistScale;
      uniform float time;
      varying float vFade;
      void main() {
        vec3 p = position;
        p.x += sin(time * 0.05 + position.z * 0.03) * 2.5;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = mistScale * (210.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        vFade = 1.0 - smoothstep(35.0, 260.0, -mvPosition.z);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform float opacity;
      varying float vFade;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float distance = length(p * vec2(1.0, 2.4));
        float alpha = (1.0 - smoothstep(0.08, 0.5, distance)) * opacity * vFade;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const mist = new THREE.Points(geometry, material);
  mist.name = 'LowBattleMist';
  mist.renderOrder = 3;
  return {
    object: mist,
    update(delta, camera, elapsed) {
      material.uniforms.time.value = elapsed;
      mist.position.x = camera.position.x * 0.06;
      mist.position.z = camera.position.z * 0.06;
    },
  };
}

function createSmokeEmitter({
  position,
  color,
  count,
  height,
  radius,
  seed,
  opacity = 0.42,
  sizeRange = [9, 21],
  maxSize = 34,
}) {
  const random = createRng(seed);
  const positions = new Float32Array(count * 3);
  const ages = new Float32Array(count);
  const life = new Float32Array(count);
  const drifts = [];
  for (let index = 0; index < count; index += 1) {
    ages[index] = randomRange(random, 0, 1);
    life[index] = randomRange(random, 5, 10);
    drifts.push(new THREE.Vector3(
      randomRange(random, 0.45, 1.5),
      randomRange(random, 2.5, 5.2),
      randomSigned(random, 0.48),
    ));
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    name: 'BattleSmokeMaterial',
    transparent: true,
    depthWrite: false,
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      attribute float size;
      varying float vDepth;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (240.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        vDepth = 1.0 - smoothstep(25.0, 300.0, -mvPosition.z);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform float opacity;
      varying float vDepth;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        float core = 1.0 - smoothstep(0.05, 0.5, d);
        float detail = mix(0.78, 1.0, fract(sin(dot(gl_PointCoord, vec2(41.7, 289.3))) * 43758.5453));
        gl_FragColor = vec4(color, core * detail * opacity * vDepth);
      }
    `,
  });
  const sizes = new Float32Array(count);
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const points = new THREE.Points(geometry, material);
  points.name = 'ProceduralBattleSmoke';
  points.position.copy(position);
  points.renderOrder = 4;
  material.uniforms.opacity.value = opacity;

  function respawn(index, initial = false) {
    ages[index] = initial ? randomRange(random, 0, life[index]) : 0;
    const angle = randomRange(random, 0, Math.PI * 2);
    const distance = randomRange(random, 0, radius);
    positions[index * 3] = Math.cos(angle) * distance;
    positions[index * 3 + 1] = randomRange(random, 0, height * 0.15);
    positions[index * 3 + 2] = Math.sin(angle) * distance;
    sizes[index] = randomRange(random, sizeRange[0], sizeRange[1]);
  }
  for (let index = 0; index < count; index += 1) respawn(index, true);

  return {
    object: points,
    material,
    update(delta) {
      for (let index = 0; index < count; index += 1) {
        ages[index] += delta;
        if (ages[index] >= life[index]) {
          respawn(index);
          continue;
        }
        const normalizedAge = ages[index] / life[index];
        const fade = Math.sin(normalizedAge * Math.PI);
        positions[index * 3] += drifts[index].x * delta;
        positions[index * 3 + 1] += drifts[index].y * delta;
        positions[index * 3 + 2] += drifts[index].z * delta;
        sizes[index] = THREE.MathUtils.lerp(
          sizeRange[0] * 0.78,
          maxSize,
          normalizedAge,
        ) * (0.62 + fade * 0.38);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
    },
  };
}

function createFlameCards({ position, seed, quality }) {
  const random = createRng(seed);
  const count = quality === 'low' ? 4 : quality === 'medium' ? 6 : 8;
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = randomSigned(random, 1.35);
    positions[index * 3 + 1] = randomRange(random, -0.15, 1.35);
    positions[index * 3 + 2] = randomSigned(random, 1.2);
    phases[index] = randomRange(random, 0, Math.PI * 2);
    sizes[index] = randomRange(random, 20, 36);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('flamePhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('flameSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    name: 'ProceduralFlameCardMaterial',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      intensity: { value: 1 },
      colorHot: { value: new THREE.Color(0xffe08a) },
      colorBody: { value: new THREE.Color(0xff7a20) },
      colorEdge: { value: new THREE.Color(0xb91d08) },
    },
    vertexShader: /* glsl */`
      attribute float flamePhase;
      attribute float flameSize;
      uniform float time;
      varying float vPulse;
      void main() {
        vec3 p = position;
        p.x += sin(time * 8.0 + flamePhase) * 0.22;
        p.y += sin(time * 11.0 + flamePhase * 1.7) * 0.18;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        vPulse = 0.82 + sin(time * 9.0 + flamePhase) * 0.18;
        gl_PointSize = flameSize * vPulse * (260.0 / max(1.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 colorHot;
      uniform vec3 colorBody;
      uniform vec3 colorEdge;
      uniform float intensity;
      varying float vPulse;
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5, 0.58);
        p.x *= 1.55;
        float body = 1.0 - smoothstep(0.12, 0.58, length(p));
        float tip = smoothstep(0.55, -0.5, p.y);
        float hollow = smoothstep(0.05, 0.34, length(p * vec2(1.0, 1.45)));
        float alpha = body * tip * mix(0.82, 1.0, hollow) * vPulse * intensity;
        vec3 color = mix(colorHot, colorBody, smoothstep(0.05, 0.42, length(p)));
        color = mix(color, colorEdge, smoothstep(0.33, 0.58, length(p)));
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'ProceduralMillFlameCards';
  points.position.copy(position);
  points.renderOrder = 6;
  return {
    object: points,
    update(elapsed, intensity) {
      material.uniforms.time.value = elapsed;
      material.uniforms.intensity.value = intensity;
    },
  };
}

export function createAtmosphere({
  scene,
  quality = 'high',
  seed = 94721,
  fireSockets = [],
}) {
  const group = new THREE.Group();
  group.name = 'BattlefieldAtmosphere';
  scene.add(group);

  const previous = {
    background: scene.background,
    fog: scene.fog,
  };
  scene.background = new THREE.Color(0x667276);
  scene.fog = new THREE.FogExp2(0x788386, quality === 'low' ? 0.0055 : 0.00455);

  const sky = createSky();
  group.add(sky);

  const hemisphere = new THREE.HemisphereLight(0xb8c8cf, 0x392f25, 1.28);
  hemisphere.name = 'SlateHemisphereLight';
  group.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffe0ad, 3.35);
  key.name = 'PostStormKeyLight';
  key.position.set(-82, 112, 58);
  key.target.position.set(0, 0, -24);
  key.castShadow = true;
  key.shadow.mapSize.set(
    quality === 'low' ? 1024 : quality === 'medium' ? 1536 : 2048,
    quality === 'low' ? 1024 : quality === 'medium' ? 1536 : 2048,
  );
  key.shadow.camera.left = -66;
  key.shadow.camera.right = 66;
  key.shadow.camera.top = 74;
  key.shadow.camera.bottom = -74;
  key.shadow.camera.near = 6;
  key.shadow.camera.far = 250;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.035;
  group.add(key, key.target);

  const fill = new THREE.DirectionalLight(0x86a4b9, 0.46);
  fill.name = 'WetSkyFill';
  fill.position.set(110, 75, -160);
  group.add(fill);

  const rain = createRain({ quality, seed });
  const mist = createMist({ quality, seed });
  group.add(rain.object, mist.object);

  const smokeEmitters = [];
  const flameCards = [];
  fireSockets.forEach((position, index) => {
    const smoke = createSmokeEmitter({
      position,
      color: index === 0 ? 0x1a1b1c : 0x292725,
      count: quality === 'low' ? 18 : quality === 'medium' ? 30 : 46,
      height: 44,
      radius: 2.8,
      seed: seed + 7100 + index,
      opacity: index === 0 ? 0.52 : 0.45,
      sizeRange: [11, 24],
      maxSize: 40,
    });
    smokeEmitters.push(smoke);
    group.add(smoke.object);

    const light = new THREE.PointLight(0xff7628, index === 0 ? 7 : 4.5, 30, 2);
    light.name = 'MillFireLight';
    light.position.copy(position);
    light.position.y += 1.5;
    light.castShadow = false;
    group.add(light);
    smoke.light = light;
    smoke.baseLightIntensity = index === 0 ? 7 : 4.5;

    const flame = createFlameCards({
      position,
      seed: seed + 7350 + index,
      quality,
    });
    flameCards.push(flame);
    group.add(flame.object);
  });

  const distantSmokePositions = [
    new THREE.Vector3(-172, 2, -130),
    new THREE.Vector3(158, 2, -116),
    new THREE.Vector3(-215, 2, 38),
    new THREE.Vector3(206, 2, -16),
  ];
  distantSmokePositions.forEach((position, index) => {
    const smoke = createSmokeEmitter({
      position,
      color: 0x4b4d4d,
      count: quality === 'low' ? 9 : 18,
      height: 50,
      radius: 4,
      seed: seed + 7600 + index,
      opacity: 0.25,
      sizeRange: [8, 17],
      maxSize: 30,
    });
    smokeEmitters.push(smoke);
    group.add(smoke.object);
  });

  let weatherIntensity = 1;
  let fireIntensity = 1;
  const keyOffset = new THREE.Vector3(-82, 112, 58);
  const keyTargetOffset = new THREE.Vector3(0, 0, -24);
  const trackedCameraPosition = new THREE.Vector3();
  return {
    group,
    setWeatherIntensity(value) {
      weatherIntensity = THREE.MathUtils.clamp(value, 0, 1);
      rain.object.material.opacity = 0.32 * weatherIntensity;
      mist.object.material.uniforms.opacity.value = 0.082 * (0.3 + weatherIntensity * 0.7);
    },
    setFireIntensity(value) {
      fireIntensity = THREE.MathUtils.clamp(value, 0, 1.25);
      smokeEmitters.forEach((emitter) => {
        if (emitter.light) emitter.light.intensity = emitter.baseLightIntensity * fireIntensity;
      });
    },
    update(delta, elapsed, camera) {
      sky.position.copy(camera.position);
      sky.material.uniforms.time.value = elapsed;
      trackedCameraPosition.copy(camera.position);
      key.position.copy(trackedCameraPosition).add(keyOffset);
      key.target.position.copy(trackedCameraPosition).add(keyTargetOffset);
      key.target.position.y = Math.min(key.target.position.y, trackedCameraPosition.y - 1.5);
      key.target.updateMatrixWorld();
      rain.update(delta * weatherIntensity, camera);
      mist.update(delta, camera, elapsed);
      smokeEmitters.forEach((emitter, index) => {
        emitter.update(delta * (index < fireSockets.length ? fireIntensity : 1));
        if (emitter.light) {
          emitter.light.intensity = emitter.baseLightIntensity * (
            0.88 + Math.sin(elapsed * 12 + index * 2.7) * 0.12
          ) * fireIntensity;
        }
      });
      flameCards.forEach((flame) => flame.update(elapsed, fireIntensity));
    },
    dispose() {
      scene.background = previous.background;
      scene.fog = previous.fog;
      group.removeFromParent();
      group.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material?.dispose();
        }
        object.shadow?.map?.dispose?.();
      });
    },
  };
}
