import * as THREE from 'three';

const SURFACE_SHADER_KEY = 'procedural-world-surface-v4';

function applyProceduralSurface(material, {
  variation = 0.06,
  scale = 0.2,
  wetness = 0,
  wetScale = 0.065,
  normalStrength = 0.12,
  contactDarkening = 0.04,
  valueLift = 0,
  saturation = 1,
  fiber = 0,
  grain = 0,
  edgeHighlight = 0,
  upwardWetness = 0.25,
} = {}) {
  const options = {
    variation,
    scale,
    wetness,
    wetScale,
    normalStrength,
    contactDarkening,
    valueLift,
    saturation,
    fiber,
    grain,
    edgeHighlight,
    upwardWetness,
  };

  material.userData.proceduralSurface = options;
  material.customProgramCacheKey = () => `${SURFACE_SHADER_KEY}:${JSON.stringify(options)}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaceVariation = { value: variation };
    shader.uniforms.surfaceScale = { value: scale };
    shader.uniforms.surfaceWetness = { value: wetness };
    shader.uniforms.surfaceWetScale = { value: wetScale };
    shader.uniforms.surfaceNormalStrength = { value: normalStrength };
    shader.uniforms.surfaceContactDarkening = { value: contactDarkening };
    shader.uniforms.surfaceValueLift = { value: valueLift };
    shader.uniforms.surfaceSaturation = { value: saturation };
    shader.uniforms.surfaceFiber = { value: fiber };
    shader.uniforms.surfaceGrain = { value: grain };
    shader.uniforms.surfaceEdgeHighlight = { value: edgeHighlight };
    shader.uniforms.surfaceUpwardWetness = { value: upwardWetness };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vProceduralWorldPosition;
        varying vec3 vProceduralWorldNormal;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 proceduralWorldPosition = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          proceduralWorldPosition = batchingMatrix * proceduralWorldPosition;
        #endif
        #ifdef USE_INSTANCING
          proceduralWorldPosition = instanceMatrix * proceduralWorldPosition;
        #endif
        vProceduralWorldPosition = (modelMatrix * proceduralWorldPosition).xyz;
        vProceduralWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vProceduralWorldPosition;
        varying vec3 vProceduralWorldNormal;
        uniform float surfaceVariation;
        uniform float surfaceScale;
        uniform float surfaceWetness;
        uniform float surfaceWetScale;
        uniform float surfaceNormalStrength;
        uniform float surfaceContactDarkening;
        uniform float surfaceValueLift;
        uniform float surfaceSaturation;
        uniform float surfaceFiber;
        uniform float surfaceGrain;
        uniform float surfaceEdgeHighlight;
        uniform float surfaceUpwardWetness;

        float worldSurfaceNoise(vec3 p) {
          float broad = sin(dot(p, vec3(0.91, 1.37, 1.17)));
          float crossed = sin(dot(p, vec3(1.73, -0.63, 0.77)) + broad * 1.6);
          return clamp(0.5 + broad * 0.24 + crossed * 0.22, 0.0, 1.0);
        }

        float worldSurfaceLines(vec3 p, float frequency) {
          vec3 axis = abs(normalize(vProceduralWorldNormal));
          vec2 coordinates = axis.y > max(axis.x, axis.z) ? p.xz
            : axis.x > axis.z ? p.zy : p.xy;
          float primary = sin((coordinates.x + coordinates.y * 0.17) * frequency);
          float secondary = sin(coordinates.x * frequency * 2.07 + coordinates.y * 0.41);
          return primary * 0.7 + secondary * 0.3;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float surfaceMacro = worldSurfaceNoise(vProceduralWorldPosition * surfaceScale);
        float surfaceDetail = worldSurfaceNoise(vProceduralWorldPosition * surfaceScale * 3.7 + 11.7);
        float surfaceTone = (surfaceMacro - 0.5) * surfaceVariation
          + (surfaceDetail - 0.5) * surfaceVariation * 0.38;
        float fiberLines = worldSurfaceLines(vProceduralWorldPosition, 12.0);
        float grainLines = worldSurfaceLines(vProceduralWorldPosition, 4.4);
        surfaceTone += fiberLines * surfaceFiber * 0.08;
        surfaceTone += grainLines * surfaceGrain * 0.13;
        diffuseColor.rgb *= 1.0 + surfaceTone;
        float surfaceLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        diffuseColor.rgb = mix(vec3(surfaceLuma), diffuseColor.rgb, surfaceSaturation);
        diffuseColor.rgb += surfaceValueLift;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetPatches = smoothstep(
          0.56,
          0.84,
          worldSurfaceNoise(vProceduralWorldPosition * surfaceWetScale + vec3(7.1, 0.0, 19.3))
        );
        float upwardFacing = smoothstep(0.18, 0.92, normalize(vProceduralWorldNormal).y);
        float wetFacing = mix(1.0, upwardFacing, surfaceUpwardWetness);
        roughnessFactor = clamp(
          roughnessFactor - wetPatches * surfaceWetness * wetFacing
            + (surfaceDetail - 0.5) * 0.055,
          0.18,
          1.0
        );
        diffuseColor.rgb *= 1.0 - wetPatches * surfaceWetness * wetFacing * 0.13;
        float lowerSurface = 1.0 - smoothstep(0.08, 1.75, vProceduralWorldPosition.y);
        diffuseColor.rgb *= 1.0 - lowerSurface * surfaceContactDarkening;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 proceduralNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        float proceduralFacing = abs(dot(proceduralNormal, normal));
        float proceduralBump = (surfaceDetail - 0.5) * surfaceNormalStrength * proceduralFacing;
        normal = normalize(normal + vec3(dFdx(proceduralBump), dFdy(proceduralBump), 0.0));`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        float proceduralRim = pow(
          1.0 - saturate(dot(normalize(normal), normalize(vViewPosition))),
          3.0
        );
        reflectedLight.indirectDiffuse += diffuseColor.rgb
          * proceduralRim * surfaceEdgeHighlight * 0.2;`,
      );
  };

  return material;
}

function standard(color, roughness = 0.9, extra = {}, surface = {}) {
  return applyProceduralSurface(new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    ...extra,
  }), surface);
}

export function createWorldMaterials() {
  const stone = {
    variation: 0.16,
    scale: 0.36,
    wetness: 0.28,
    wetScale: 0.075,
    normalStrength: 0.15,
    contactDarkening: 0.065,
    saturation: 0.86,
    edgeHighlight: 0.025,
    upwardWetness: 0.62,
  };
  const wood = {
    variation: 0.14,
    scale: 0.48,
    wetness: 0.22,
    wetScale: 0.095,
    normalStrength: 0.12,
    contactDarkening: 0.055,
    saturation: 1.08,
    grain: 0.72,
    edgeHighlight: 0.018,
    upwardWetness: 0.45,
  };
  const cloth = {
    variation: 0.065,
    scale: 0.85,
    wetness: 0.1,
    wetScale: 0.14,
    normalStrength: 0.045,
    contactDarkening: 0.035,
    saturation: 1.14,
    fiber: 0.48,
    edgeHighlight: 0.035,
    upwardWetness: 0.32,
  };
  const organic = {
    variation: 0.15,
    scale: 0.58,
    wetness: 0.18,
    wetScale: 0.1,
    normalStrength: 0.13,
    contactDarkening: 0.05,
    saturation: 1.1,
    upwardWetness: 0.5,
  };

  const materials = {
    limestone: standard(0xa39c88, 0.85, { flatShading: true }, { ...stone, valueLift: 0.015 }),
    limestoneDark: standard(0x676b68, 0.89, { flatShading: true }, { ...stone, variation: 0.14 }),
    rubble: standard(0x5d6260, 0.94, { flatShading: true }, { ...stone, variation: 0.17, scale: 0.38 }),
    plaster: standard(0xd0c3a1, 0.88, {}, {
      variation: 0.075,
      scale: 0.3,
      wetness: 0.1,
      normalStrength: 0.055,
      saturation: 0.9,
      valueLift: 0.018,
    }),
    plasterDark: standard(0x9a927c, 0.91, {}, {
      variation: 0.09,
      scale: 0.3,
      wetness: 0.12,
      normalStrength: 0.06,
      saturation: 0.88,
    }),
    timber: standard(0x4b2d1d, 0.8, {}, wood),
    timberLight: standard(0x80563a, 0.82, {}, { ...wood, variation: 0.13, valueLift: 0.008 }),
    thatch: standard(0x9b8148, 0.95, { flatShading: true }, { ...organic, scale: 0.75, normalStrength: 0.12 }),
    oldThatch: standard(0x5d5d3e, 0.97, { flatShading: true }, { ...organic, scale: 0.72, variation: 0.14 }),
    roofTile: standard(0x71463c, 0.83, { flatShading: true }, { ...stone, scale: 0.48, wetness: 0.24, saturation: 1.08 }),
    iron: standard(0x465154, 0.34, { metalness: 0.68 }, {
      variation: 0.055,
      scale: 0.62,
      wetness: 0.18,
      normalStrength: 0.045,
      saturation: 0.72,
      edgeHighlight: 0.13,
      upwardWetness: 0.7,
    }),
    soil: standard(0x453229, 0.76, {}, {
      variation: 0.2,
      scale: 0.3,
      wetness: 0.54,
      wetScale: 0.07,
      normalStrength: 0.18,
      contactDarkening: 0.085,
      saturation: 0.94,
      upwardWetness: 0.78,
    }),
    straw: standard(0xb99d54, 0.95, {}, { ...organic, scale: 0.9, wetness: 0.08, valueLift: 0.01 }),
    canvas: standard(0xc0ab83, 0.89, { side: THREE.DoubleSide }, { ...cloth, saturation: 0.98 }),
    canvasDark: standard(0x6d6758, 0.93, { side: THREE.DoubleSide }, { ...cloth, variation: 0.07, saturation: 0.82 }),
    redCloth: standard(0x8f2525, 0.74, { side: THREE.DoubleSide }, { ...cloth, saturation: 1.2 }),
    goldCloth: standard(0xcaa34b, 0.75, { side: THREE.DoubleSide }, { ...cloth, saturation: 1.16, valueLift: 0.008 }),
    blueCloth: standard(0x295c7d, 0.76, { side: THREE.DoubleSide }, { ...cloth, saturation: 1.22 }),
    leaf: standard(0x345b38, 0.9, { flatShading: true }, { ...organic, variation: 0.15, scale: 0.55 }),
    leafDry: standard(0x79713e, 0.94, { flatShading: true }, { ...organic, variation: 0.16, scale: 0.58 }),
    bark: standard(0x473226, 0.92, { flatShading: true }, { ...wood, variation: 0.16, scale: 0.52, wetness: 0.1 }),
    charcoal: standard(0x262522, 0.89, {}, { variation: 0.12, scale: 0.46, wetness: 0.04, normalStrength: 0.08 }),
    ember: standard(0xff7b2c, 0.52, {
      emissive: 0xff3f0d,
      emissiveIntensity: 3.4,
    }, { variation: 0.08, scale: 0.8, wetness: 0, normalStrength: 0.035 }),
    standingWater: new THREE.MeshPhysicalMaterial({
      name: 'StandingWaterMaterial',
      color: 0x20383d,
      transparent: true,
      opacity: 0.56,
      roughness: 0.1,
      metalness: 0,
      depthWrite: false,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      reflectivity: 0.7,
    }),
  };

  Object.entries(materials).forEach(([key, material]) => {
    material.name ||= `WorldMaterial:${key}`;
    material.userData.materialFamily = material.userData.proceduralSurface
      ? key.includes('Cloth') || ['canvas', 'redCloth', 'goldCloth', 'blueCloth'].includes(key)
        ? 'cloth'
        : key.includes('timber') || key === 'bark'
          ? 'wood'
          : key === 'iron'
            ? 'metal'
            : key === 'soil'
              ? 'ground'
              : 'mineral'
      : key === 'standingWater' ? 'water' : 'other';
  });

  return materials;
}
