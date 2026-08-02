import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const DEFAULT_GROUND = Object.freeze({
  height: 0,
  normal: UP,
  material: 'earth',
});

const QUALITY_CAPS = Object.freeze({
  low: {
    particles: 220,
    sparks: 96,
    decals: 64,
    flashes: 4,
    contacts: 28,
    rainRate: 5,
  },
  medium: {
    particles: 360,
    sparks: 144,
    decals: 96,
    flashes: 6,
    contacts: 44,
    rainRate: 8,
  },
  high: {
    particles: 520,
    sparks: 208,
    decals: 136,
    flashes: 8,
    contacts: 60,
    rainRate: 11,
  },
});

const DECAL_STYLE = Object.freeze({
  blood: 0,
  dirt: 1,
  ring: 2,
  footprint: 3,
});

const _point = new THREE.Vector3();
const _direction = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _ground = { height: 0, normal: _normal, material: 'earth' };
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function createRadialTexture(size = 32, {
  ring = false,
  irregular = false,
} = {}) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const angle = Math.atan2(ny, nx);
      const wobble = irregular
        ? Math.sin(angle * 5 + 0.7) * 0.055 + Math.sin(angle * 9 - 1.2) * 0.025
        : 0;
      const distance = Math.hypot(nx, ny) + wobble;
      let alpha;
      if (ring) {
        alpha = 1 - THREE.MathUtils.smoothstep(Math.abs(distance - 0.64), 0.04, 0.2);
      } else {
        alpha = 1 - THREE.MathUtils.smoothstep(distance, 0.34, 1);
      }
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(THREE.MathUtils.clamp(alpha, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = ring ? 'ProceduralVfxRing' : 'ProceduralVfxSoftDisc';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

class ParticlePool {
  constructor({
    capacity,
    name,
    blending = THREE.NormalBlending,
    pixelRatio = 1,
  }) {
    this.capacity = capacity;
    this.cursor = 0;
    this.activeCount = 0;
    this.active = new Uint8Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.velocity = new Float32Array(capacity * 3);
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.opacity = new Float32Array(capacity);
    this.baseOpacity = new Float32Array(capacity);
    this.shapes = new Float32Array(capacity);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('particleColor', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('particleSize', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('particleOpacity', new THREE.BufferAttribute(this.opacity, 1));
    geometry.setAttribute('particleShape', new THREE.BufferAttribute(this.shapes, 1));

    const material = new THREE.ShaderMaterial({
      name: `${name}Material`,
      transparent: true,
      depthWrite: false,
      blending,
      fog: false,
      uniforms: {
        pixelRatio: { value: Math.min(pixelRatio, 1.75) },
      },
      vertexShader: /* glsl */`
        attribute vec3 particleColor;
        attribute float particleSize;
        attribute float particleOpacity;
        attribute float particleShape;
        uniform float pixelRatio;
        varying vec3 vParticleColor;
        varying float vParticleOpacity;
        varying float vParticleShape;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspective = 520.0 / max(1.0, -mvPosition.z);
          gl_PointSize = clamp(particleSize * perspective * pixelRatio, 0.0, 28.0);
          gl_Position = projectionMatrix * mvPosition;
          vParticleColor = particleColor;
          vParticleOpacity = particleOpacity;
          vParticleShape = particleShape;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vParticleColor;
        varying float vParticleOpacity;
        varying float vParticleShape;

        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float radial = length(p);
          float fleck = 1.0 - smoothstep(0.28, 0.5, radial);
          float shard = 1.0 - smoothstep(0.18, 0.5, length(p * vec2(0.44, 1.65)));
          float alpha = mix(fleck, shard, step(0.5, vParticleShape)) * vParticleOpacity;
          if (alpha < 0.008) discard;
          gl_FragColor = vec4(vParticleColor, alpha);
        }
      `,
    });

    this.object = new THREE.Points(geometry, material);
    this.object.name = name;
    this.object.renderOrder = blending === THREE.AdditiveBlending ? 14 : 12;
    this.object.frustumCulled = false;
  }

  spawn({
    position,
    velocity,
    color,
    size = 0.16,
    life = 0.65,
    opacity = 1,
    gravity = 8,
    drag = 1.5,
    shape = 0,
  }) {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (!this.active[index]) this.activeCount += 1;
    this.active[index] = 1;
    this.age[index] = 0;
    this.life[index] = Math.max(0.05, life);
    this.gravity[index] = gravity;
    this.drag[index] = drag;
    this.sizes[index] = size;
    this.baseOpacity[index] = opacity;
    this.opacity[index] = opacity;
    this.shapes[index] = shape;

    const offset = index * 3;
    this.positions[offset] = position.x;
    this.positions[offset + 1] = position.y;
    this.positions[offset + 2] = position.z;
    this.velocity[offset] = velocity.x;
    this.velocity[offset + 1] = velocity.y;
    this.velocity[offset + 2] = velocity.z;
    _color.set(color);
    this.colors[offset] = _color.r;
    this.colors[offset + 1] = _color.g;
    this.colors[offset + 2] = _color.b;
    return index;
  }

  update(delta) {
    if (this.activeCount === 0) return;
    const dt = Math.min(delta, 0.05);
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue;
      this.age[index] += dt;
      const normalizedAge = this.age[index] / this.life[index];
      if (normalizedAge >= 1) {
        this.active[index] = 0;
        this.activeCount -= 1;
        this.opacity[index] = 0;
        this.sizes[index] = 0;
        continue;
      }
      const offset = index * 3;
      const damping = Math.max(0, 1 - this.drag[index] * dt);
      this.velocity[offset] *= damping;
      this.velocity[offset + 1] = this.velocity[offset + 1] * damping - this.gravity[index] * dt;
      this.velocity[offset + 2] *= damping;
      this.positions[offset] += this.velocity[offset] * dt;
      this.positions[offset + 1] += this.velocity[offset + 1] * dt;
      this.positions[offset + 2] += this.velocity[offset + 2] * dt;
      const fadeIn = Math.min(1, normalizedAge * 8);
      const fadeOut = 1 - THREE.MathUtils.smoothstep(normalizedAge, 0.55, 1);
      this.opacity[index] = this.baseOpacity[index] * fadeIn * fadeOut;
    }
    this.object.geometry.attributes.position.needsUpdate = true;
    this.object.geometry.attributes.particleSize.needsUpdate = true;
    this.object.geometry.attributes.particleOpacity.needsUpdate = true;
  }

  resize(pixelRatio) {
    this.object.material.uniforms.pixelRatio.value = Math.min(pixelRatio, 1.75);
  }

  dispose() {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

class FlashSpritePool {
  constructor({ capacity, texture }) {
    this.capacity = capacity;
    this.cursor = 0;
    this.activeCount = 0;
    this.entries = [];
    this.group = new THREE.Group();
    this.group.name = 'PooledImpactFlashSprites';
    for (let index = 0; index < capacity; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.name = 'ImpactFlashSprite';
      sprite.visible = false;
      sprite.renderOrder = 16;
      this.entries.push({
        sprite,
        age: 0,
        life: 0,
        size: 0,
        active: false,
      });
      this.group.add(sprite);
    }
  }

  spawn(position, {
    color = 0xffd89a,
    size = 0.34,
    life = 0.1,
  } = {}) {
    const entry = this.entries[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    if (!entry.active) this.activeCount += 1;
    entry.active = true;
    entry.age = 0;
    entry.life = life;
    entry.size = size;
    entry.sprite.position.copy(position);
    entry.sprite.scale.setScalar(size);
    entry.sprite.material.color.set(color);
    entry.sprite.material.opacity = 1;
    entry.sprite.visible = true;
  }

  update(delta) {
    if (this.activeCount === 0) return;
    for (const entry of this.entries) {
      if (!entry.active) continue;
      entry.age += delta;
      const progress = entry.age / entry.life;
      if (progress >= 1) {
        entry.active = false;
        entry.sprite.visible = false;
        entry.sprite.material.opacity = 0;
        this.activeCount -= 1;
        continue;
      }
      entry.sprite.material.opacity = (1 - progress) ** 2;
      entry.sprite.scale.setScalar(entry.size * (0.72 + progress * 1.2));
    }
  }

  dispose() {
    this.group.removeFromParent();
    for (const { sprite } of this.entries) sprite.material.dispose();
  }
}

class GroundDecalPool {
  constructor({ capacity }) {
    this.capacity = capacity;
    this.cursor = 0;
    this.activeCount = 0;
    this.active = new Uint8Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.startScaleX = new Float32Array(capacity);
    this.startScaleZ = new Float32Array(capacity);
    this.endScale = new Float32Array(capacity);
    this.positions = Array.from({ length: capacity }, () => new THREE.Vector3());
    this.normals = Array.from({ length: capacity }, () => new THREE.Vector3(0, 1, 0));
    this.yaws = new Float32Array(capacity);
    this.opacity = new Float32Array(capacity);
    this.baseOpacity = new Float32Array(capacity);
    this.styles = new Float32Array(capacity);
    this.seeds = new Float32Array(capacity);
    this.colors = new Float32Array(capacity * 3);

    const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
    geometry.rotateX(-Math.PI * 0.5);
    geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(this.opacity, 1));
    geometry.setAttribute('instanceStyle', new THREE.InstancedBufferAttribute(this.styles, 1));
    geometry.setAttribute('instanceSeed', new THREE.InstancedBufferAttribute(this.seeds, 1));
    geometry.setAttribute('instanceTint', new THREE.InstancedBufferAttribute(this.colors, 3));

    const material = new THREE.ShaderMaterial({
      name: 'ProceduralGroundDecalMaterial',
      transparent: true,
      depthWrite: false,
      fog: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: /* glsl */`
        attribute float instanceOpacity;
        attribute float instanceStyle;
        attribute float instanceSeed;
        attribute vec3 instanceTint;
        varying vec2 vUv;
        varying float vOpacity;
        varying float vStyle;
        varying float vSeed;
        varying vec3 vTint;

        void main() {
          vUv = uv;
          vOpacity = instanceOpacity;
          vStyle = instanceStyle;
          vSeed = instanceSeed;
          vTint = instanceTint;
          vec4 worldPosition = modelMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec2 vUv;
        varying float vOpacity;
        varying float vStyle;
        varying float vSeed;
        varying vec3 vTint;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 17.13) * 43758.5453);
        }

        void main() {
          vec2 p = vUv - 0.5;
          float angle = atan(p.y, p.x);
          float wobble = sin(angle * 5.0 + vSeed * 9.0) * 0.035
            + sin(angle * 9.0 - vSeed * 4.0) * 0.018;
          float distanceToCenter = length(p) + wobble;
          float speckle = hash(floor(vUv * 15.0));
          float blob = 1.0 - smoothstep(0.31 + speckle * 0.025, 0.5, distanceToCenter);
          float dirt = (1.0 - smoothstep(0.24, 0.5, distanceToCenter))
            * mix(0.68, 1.0, speckle);
          float ring = 1.0 - smoothstep(0.018, 0.075, abs(distanceToCenter - 0.38));
          float toe = 1.0 - smoothstep(0.22, 0.48, length(p * vec2(1.65, 0.82)));
          float heel = 1.0 - smoothstep(0.12, 0.34, length((p + vec2(0.0, 0.17)) * vec2(1.8, 1.0)));
          float footprint = max(toe, heel) * mix(0.72, 1.0, speckle);

          float alpha = blob;
          if (vStyle > 0.5) alpha = dirt;
          if (vStyle > 1.5) alpha = ring;
          if (vStyle > 2.5) alpha = footprint;
          alpha *= vOpacity;
          if (alpha < 0.012) discard;
          gl_FragColor = vec4(vTint, alpha);
        }
      `,
    });

    this.object = new THREE.InstancedMesh(geometry, material, capacity);
    this.object.name = 'PooledGroundImpactDecals';
    this.object.count = capacity;
    this.object.frustumCulled = false;
    this.object.renderOrder = 2;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let index = 0; index < capacity; index += 1) this.#hide(index);
    this.object.instanceMatrix.needsUpdate = true;
  }

  spawn({
    position,
    normal = UP,
    color = 0x3a1714,
    opacity = 0.55,
    scaleX = 0.5,
    scaleZ = scaleX,
    endScale = 1,
    yaw = 0,
    life = 20,
    style = DECAL_STYLE.blood,
    seed = Math.random(),
  }) {
    const index = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (!this.active[index]) this.activeCount += 1;
    this.active[index] = 1;
    this.age[index] = 0;
    this.life[index] = Math.max(0.1, life);
    this.startScaleX[index] = scaleX;
    this.startScaleZ[index] = scaleZ;
    this.endScale[index] = endScale;
    this.positions[index].copy(position);
    this.normals[index].copy(normal).normalize();
    this.yaws[index] = yaw;
    this.baseOpacity[index] = opacity;
    this.opacity[index] = opacity;
    this.styles[index] = style;
    this.seeds[index] = seed;
    _color.set(color);
    const offset = index * 3;
    this.colors[offset] = _color.r;
    this.colors[offset + 1] = _color.g;
    this.colors[offset + 2] = _color.b;
    this.#writeMatrix(index, 0);
    this.object.geometry.attributes.instanceOpacity.needsUpdate = true;
    this.object.geometry.attributes.instanceStyle.needsUpdate = true;
    this.object.geometry.attributes.instanceSeed.needsUpdate = true;
    this.object.geometry.attributes.instanceTint.needsUpdate = true;
    this.object.instanceMatrix.needsUpdate = true;
    return index;
  }

  update(delta) {
    if (this.activeCount === 0) return;
    let matrixDirty = false;
    let opacityDirty = false;
    for (let index = 0; index < this.capacity; index += 1) {
      if (!this.active[index]) continue;
      this.age[index] += delta;
      const progress = this.age[index] / this.life[index];
      if (progress >= 1) {
        this.active[index] = 0;
        this.activeCount -= 1;
        this.opacity[index] = 0;
        this.#hide(index);
        matrixDirty = true;
        opacityDirty = true;
        continue;
      }
      const fadeStart = this.styles[index] === DECAL_STYLE.ring ? 0.05 : 0.72;
      this.opacity[index] = this.baseOpacity[index] * (
        1 - THREE.MathUtils.smoothstep(progress, fadeStart, 1)
      );
      this.#writeMatrix(index, progress);
      matrixDirty = true;
      opacityDirty = true;
    }
    if (matrixDirty) this.object.instanceMatrix.needsUpdate = true;
    if (opacityDirty) this.object.geometry.attributes.instanceOpacity.needsUpdate = true;
  }

  #writeMatrix(index, progress) {
    const growth = THREE.MathUtils.lerp(1, this.endScale[index], progress);
    _dummy.position.copy(this.positions[index]);
    _dummy.quaternion.setFromUnitVectors(UP, this.normals[index]);
    _dummy.rotateY(this.yaws[index]);
    _dummy.scale.set(
      this.startScaleX[index] * growth,
      1,
      this.startScaleZ[index] * growth,
    );
    _dummy.updateMatrix();
    this.object.setMatrixAt(index, _dummy.matrix);
  }

  #hide(index) {
    _dummy.position.set(0, -1000, 0);
    _dummy.quaternion.identity();
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    this.object.setMatrixAt(index, _dummy.matrix);
  }

  dispose() {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

class ContactGrounding {
  constructor({ capacity, texture }) {
    this.capacity = capacity;
    this.elapsed = 0;
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI * 0.5);
    const material = new THREE.MeshBasicMaterial({
      name: 'ContactGroundingMaterial',
      map: texture,
      color: 0x18130f,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.object = new THREE.InstancedMesh(geometry, material, capacity);
    this.object.name = 'NearbyActorContactGrounding';
    this.object.count = 0;
    this.object.renderOrder = 1;
    this.object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  update(delta, actors, cameraPosition, sampleGround) {
    this.elapsed += delta;
    if (this.elapsed < 0.075) return;
    this.elapsed %= 0.075;
    let count = 0;
    for (const actor of actors ?? []) {
      if (count >= this.capacity) break;
      if (!actor?.combatant?.alive || !actor.object3d?.visible) continue;
      const position = actor.object3d.position;
      if (position.distanceToSquared(cameraPosition) > 48 * 48) continue;
      const ground = sampleGround(position.x, position.z, _ground);
      _dummy.position.set(position.x, ground.height + 0.028, position.z);
      _dummy.quaternion.setFromUnitVectors(UP, ground.normal ?? UP);
      _dummy.rotateY(actor.object3d.rotation.y ?? 0);
      const radius = actor.radius ?? 0.42;
      _dummy.scale.set(radius * 1.65, 1, radius * 1.1);
      _dummy.updateMatrix();
      this.object.setMatrixAt(count, _dummy.matrix);
      count += 1;
    }
    this.object.count = count;
    if (count > 0) this.object.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

function readVector(value, target) {
  if (value?.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.fromArray(value);
  if (value && Number.isFinite(value.x) && Number.isFinite(value.z)) {
    return target.set(value.x, value.y ?? 0, value.z);
  }
  return null;
}

function eventPosition(event, target = _point) {
  const direct = event?.point
    ?? event?.position
    ?? event?.result?.point
    ?? event?.result?.position
    ?? event?.impact?.point;
  if (readVector(direct, target)) return target;
  const actorPosition = event?.target?.actor?.object3d?.position
    ?? event?.target?.object3d?.position
    ?? event?.target?.position
    ?? event?.actor?.object3d?.position
    ?? event?.actor?.position;
  return readVector(actorPosition, target);
}

function eventDirection(event, target = _direction) {
  const value = event?.direction ?? event?.result?.direction ?? event?.impact?.direction;
  if (readVector(value, target) && target.lengthSq() > 1e-8) return target.normalize();
  return target.set(0, 0.22, 1).normalize();
}

function eventSeverity(event) {
  return THREE.MathUtils.clamp(Number(
    event?.severity
    ?? event?.intensity
    ?? event?.result?.severity
    ?? event?.result?.intensity
    ?? 0.5,
  ) || 0, 0.08, 1);
}

function eventSurface(event) {
  return String(
    event?.material
    ?? event?.surface
    ?? event?.result?.material
    ?? event?.result?.surface
    ?? 'flesh',
  ).toLowerCase();
}

function eventOutcome(event) {
  return String(event?.outcome ?? event?.result?.outcome ?? 'hit').toLowerCase();
}

function createRandom(seed = 0x92f5a1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * Bounded, allocation-light scene-space feedback for combat and weather.
 * All persistent GPU objects are created up front and effects overwrite the
 * oldest slot when a cap is reached.
 */
export function createCombatVfx({
  scene,
  quality = 'high',
  pixelRatio = 1,
  sampleGround = (_x, _z, target = _ground) => Object.assign(target, DEFAULT_GROUND),
  seed = 94721,
} = {}) {
  if (!scene?.isScene) throw new TypeError('createCombatVfx requires a THREE.Scene.');
  const caps = QUALITY_CAPS[quality] ?? QUALITY_CAPS.high;
  const random = createRandom(seed + 8819);
  const root = new THREE.Group();
  root.name = 'CombatAndWeatherVFX';
  scene.add(root);

  const softTexture = createRadialTexture(32, { irregular: true });
  const particlePool = new ParticlePool({
    capacity: caps.particles,
    name: 'PooledBloodDirtAndMudPoints',
    pixelRatio,
  });
  const sparkPool = new ParticlePool({
    capacity: caps.sparks,
    name: 'PooledMetalSparkPoints',
    blending: THREE.AdditiveBlending,
    pixelRatio,
  });
  const decals = new GroundDecalPool({ capacity: caps.decals });
  const flashes = new FlashSpritePool({ capacity: caps.flashes, texture: softTexture });
  const contacts = new ContactGrounding({ capacity: caps.contacts, texture: softTexture });
  root.add(
    contacts.object,
    decals.object,
    particlePool.object,
    sparkPool.object,
    flashes.group,
  );

  let weatherIntensity = 1;
  let rainAccumulator = 0;
  let elapsed = 0;
  const recentCasualties = [];

  function groundAt(x, z) {
    _normal.set(0, 1, 0);
    _ground.height = 0;
    _ground.normal = _normal;
    _ground.material = 'earth';
    const result = sampleGround(x, z, _ground) ?? _ground;
    if (!result.normal?.isVector3) result.normal = _normal.set(0, 1, 0);
    return result;
  }

  function burst(pool, {
    position,
    direction,
    count,
    color,
    speed,
    lift,
    spread,
    size,
    life,
    gravity,
    drag,
    opacity = 1,
    shape = 0,
  }) {
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const radial = random() * spread;
      _direction.set(
        direction.x * speed + Math.cos(angle) * radial,
        direction.y * speed + lift * (0.45 + random() * 0.75),
        direction.z * speed + Math.sin(angle) * radial,
      );
      pool.spawn({
        position,
        velocity: _direction,
        color,
        size: size * (0.7 + random() * 0.65),
        life: life * (0.72 + random() * 0.55),
        gravity,
        drag,
        opacity,
        shape: random() > 0.55 ? shape : 0,
      });
    }
  }

  function spawnGroundDecal(position, options) {
    const ground = groundAt(position.x, position.z);
    _point.set(position.x, ground.height + (options.heightOffset ?? 0.035), position.z);
    return decals.spawn({
      position: _point,
      normal: ground.normal,
      yaw: options.yaw ?? random() * Math.PI * 2,
      seed: random(),
      ...options,
    });
  }

  function spawnImpact(event = {}) {
    const position = eventPosition(event);
    if (!position) return false;
    const severity = eventSeverity(event);
    const surface = eventSurface(event);
    const outcome = eventOutcome(event);
    const direction = eventDirection(event);
    const defended = outcome === 'blocked' || outcome === 'parried';
    const metal = defended || /metal|iron|steel|plate|mail|armor|shield/.test(surface);
    const flesh = /flesh|skin|body|unarmored/.test(surface);
    const wood = /wood|timber|shaft|shield/.test(surface);
    const countScale = quality === 'low' ? 0.65 : quality === 'medium' ? 0.82 : 1;

    if (metal) {
      burst(sparkPool, {
        position,
        direction,
        count: Math.max(4, Math.round((8 + severity * 14) * countScale)),
        color: defended ? 0xffd08a : 0xffb45e,
        speed: 1.4 + severity * 2.2,
        lift: 2.4 + severity * 2.1,
        spread: 2.3 + severity * 1.8,
        size: 0.11 + severity * 0.06,
        life: 0.26 + severity * 0.24,
        gravity: 5.5,
        drag: 1.1,
        opacity: 0.95,
        shape: 1,
      });
      flashes.spawn(position, {
        color: defended ? 0xfff0bf : 0xffc276,
        size: 0.22 + severity * (defended ? 0.42 : 0.28),
        life: defended ? 0.13 : 0.09,
      });
      if (defended) {
        burst(particlePool, {
          position,
          direction,
          count: Math.max(2, Math.round(4 * countScale)),
          color: 0x433a31,
          speed: 0.45,
          lift: 0.7,
          spread: 0.8,
          size: 0.18,
          life: 0.45,
          gravity: 2.8,
          drag: 2.4,
          opacity: 0.45,
        });
      }
      return true;
    }

    if (flesh) {
      burst(particlePool, {
        position,
        direction,
        count: Math.max(5, Math.round((7 + severity * 12) * countScale)),
        color: severity > 0.65 ? 0xa12620 : 0xb73429,
        speed: 0.75 + severity * 1.4,
        lift: 1.2 + severity * 1.3,
        spread: 1.1 + severity,
        size: 0.065 + severity * 0.045,
        life: 0.48 + severity * 0.35,
        gravity: 7.5,
        drag: 1.35,
        opacity: 0.86,
      });
      flashes.spawn(position, {
        color: 0xa83a28,
        size: 0.15 + severity * 0.18,
        life: 0.075,
      });
      if (severity > 0.38) {
        spawnGroundDecal(position, {
          color: 0x381513,
          opacity: 0.34 + severity * 0.24,
          scaleX: 0.2 + severity * 0.28,
          scaleZ: 0.16 + severity * 0.22,
          life: 34 + severity * 26,
          style: DECAL_STYLE.blood,
        });
      }
      return true;
    }

    burst(particlePool, {
      position,
      direction,
      count: Math.max(4, Math.round((wood ? 10 : 8) * countScale)),
      color: wood ? 0x785038 : 0x5a4938,
      speed: wood ? 1.9 : 0.8,
      lift: wood ? 2.2 : 1.4,
      spread: wood ? 2.1 : 1.4,
      size: wood ? 0.1 : 0.14,
      life: wood ? 0.55 : 0.8,
      gravity: wood ? 7 : 5.5,
      drag: wood ? 1 : 2.2,
      opacity: 0.72,
      shape: wood ? 1 : 0,
    });
    return true;
  }

  function spawnMudStep(position, {
    yaw = 0,
    side = 1,
    intensity = 0.5,
  } = {}) {
    const lateralX = Math.cos(yaw) * side * 0.14;
    const lateralZ = -Math.sin(yaw) * side * 0.14;
    _point.set(position.x + lateralX, position.y, position.z + lateralZ);
    spawnGroundDecal(_point, {
      color: 0x2a211b,
      opacity: 0.22 + intensity * 0.16,
      scaleX: 0.2,
      scaleZ: 0.39,
      yaw: -yaw,
      life: 9 + random() * 7,
      style: DECAL_STYLE.footprint,
    });
    const ground = groundAt(_point.x, _point.z);
    _point.y = ground.height + 0.06;
    burst(particlePool, {
      position: _point,
      direction: _direction.set(Math.sin(yaw), 0.15, Math.cos(yaw)),
      count: quality === 'low' ? 2 : 3,
      color: 0x4b392c,
      speed: 0.25,
      lift: 0.55 + intensity * 0.45,
      spread: 0.45,
      size: 0.14,
      life: 0.38,
      gravity: 6.5,
      drag: 2.2,
      opacity: 0.62,
    });
  }

  function spawnCasualty(event = {}) {
    const source = event?.position
      ?? event?.actor?.object3d?.position
      ?? event?.target?.actor?.object3d?.position
      ?? event?.target?.object3d?.position;
    const position = readVector(source, _point);
    if (!position) return false;
    for (let index = recentCasualties.length - 1; index >= 0; index -= 1) {
      const recent = recentCasualties[index];
      if (elapsed - recent.time > 1.25) {
        recentCasualties.splice(index, 1);
      } else if (recent.position.distanceToSquared(position) < 0.8 * 0.8) {
        return false;
      }
    }
    recentCasualties.push({ position: position.clone(), time: elapsed });
    if (recentCasualties.length > 12) recentCasualties.shift();
    spawnGroundDecal(position, {
      color: 0x321312,
      opacity: 0.58,
      scaleX: 0.74 + random() * 0.42,
      scaleZ: 1.08 + random() * 0.58,
      life: 70 + random() * 24,
      style: DECAL_STYLE.blood,
    });
    const ground = groundAt(position.x, position.z);
    _point.set(position.x, ground.height + 0.12, position.z);
    burst(particlePool, {
      position: _point,
      direction: _direction.set(0, 0.2, 0),
      count: quality === 'low' ? 4 : 7,
      color: 0x554536,
      speed: 0.15,
      lift: 0.85,
      spread: 0.8,
      size: 0.16,
      life: 0.85,
      gravity: 2.7,
      drag: 2.8,
      opacity: 0.38,
    });
    return true;
  }

  function spawnRainSplash(cameraPosition) {
    const angle = random() * Math.PI * 2;
    const radius = 2.2 + Math.sqrt(random()) * 15;
    const x = cameraPosition.x + Math.cos(angle) * radius;
    const z = cameraPosition.z + Math.sin(angle) * radius;
    const ground = groundAt(x, z);
    _point.set(x, ground.height + 0.045, z);
    decals.spawn({
      position: _point,
      normal: ground.normal,
      color: 0xb9d0d3,
      opacity: 0.16 + random() * 0.12,
      scaleX: 0.18 + random() * 0.12,
      scaleZ: 0.18 + random() * 0.12,
      endScale: 3.1,
      yaw: random() * Math.PI,
      life: 0.38 + random() * 0.18,
      style: DECAL_STYLE.ring,
      seed: random(),
    });
    if (quality !== 'low' && random() > 0.42) {
      _point.y += 0.02;
      burst(particlePool, {
        position: _point,
        direction: _direction.set(0, 1, 0),
        count: 2,
        color: 0xa9c2c7,
        speed: 0.05,
        lift: 0.6,
        spread: 0.35,
        size: 0.08,
        life: 0.28,
        gravity: 8,
        drag: 1.2,
        opacity: 0.42,
      });
    }
  }

  return {
    root,
    caps: Object.freeze({ ...caps }),
    spawnImpact,
    spawnMudStep,
    spawnCasualty,
    setWeatherIntensity(value) {
      weatherIntensity = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
    },
    update(delta, {
      camera,
      actors = [],
      rain = true,
    } = {}) {
      elapsed += Math.min(delta, 0.1);
      particlePool.update(delta);
      sparkPool.update(delta);
      decals.update(delta);
      flashes.update(delta);
      if (!camera?.position) return;
      contacts.update(delta, actors, camera.position, sampleGround);
      if (rain && weatherIntensity > 0.02) {
        rainAccumulator += Math.min(delta, 0.1) * caps.rainRate * weatherIntensity;
        let spawned = 0;
        while (rainAccumulator >= 1 && spawned < 3) {
          rainAccumulator -= 1;
          spawnRainSplash(camera.position);
          spawned += 1;
        }
      }
    },
    resize(nextPixelRatio) {
      particlePool.resize(nextPixelRatio);
      sparkPool.resize(nextPixelRatio);
    },
    getStats() {
      return {
        particles: particlePool.activeCount,
        sparks: sparkPool.activeCount,
        decals: decals.activeCount,
        flashes: flashes.activeCount,
        caps: {
          particles: particlePool.capacity,
          sparks: sparkPool.capacity,
          decals: decals.capacity,
          flashes: flashes.capacity,
          contacts: contacts.capacity,
        },
      };
    },
    dispose() {
      particlePool.dispose();
      sparkPool.dispose();
      decals.dispose();
      flashes.dispose();
      contacts.dispose();
      softTexture.dispose();
      root.removeFromParent();
    },
  };
}

export { DECAL_STYLE };
