import * as THREE from 'three';

const SURFACE_SHADER_KEY = 'procedural-world-surface-v2';

function applyProceduralSurface(material, {
  variation = 0.06,
  scale = 0.2,
  wetness = 0,
  wetScale = 0.065,
  normalStrength = 0.12,
} = {}) {
  const options = {
    variation,
    scale,
    wetness,
    wetScale,
    normalStrength,
  };

  material.userData.proceduralSurface = options;
  material.customProgramCacheKey = () => SURFACE_SHADER_KEY;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.surfaceVariation = { value: variation };
    shader.uniforms.surfaceScale = { value: scale };
    shader.uniforms.surfaceWetness = { value: wetness };
    shader.uniforms.surfaceWetScale = { value: wetScale };
    shader.uniforms.surfaceNormalStrength = { value: normalStrength };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vProceduralWorldPosition;`,
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
        vProceduralWorldPosition = (modelMatrix * proceduralWorldPosition).xyz;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vProceduralWorldPosition;
        uniform float surfaceVariation;
        uniform float surfaceScale;
        uniform float surfaceWetness;
        uniform float surfaceWetScale;
        uniform float surfaceNormalStrength;

        float worldSurfaceNoise(vec3 p) {
          float broad = sin(dot(p, vec3(0.91, 1.37, 1.17)));
          float crossed = sin(dot(p, vec3(1.73, -0.63, 0.77)) + broad * 1.6);
          return clamp(0.5 + broad * 0.24 + crossed * 0.22, 0.0, 1.0);
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float surfaceMacro = worldSurfaceNoise(vProceduralWorldPosition * surfaceScale);
        float surfaceDetail = worldSurfaceNoise(vProceduralWorldPosition * surfaceScale * 3.7 + 11.7);
        float surfaceTone = (surfaceMacro - 0.5) * surfaceVariation
          + (surfaceDetail - 0.5) * surfaceVariation * 0.38;
        diffuseColor.rgb *= 1.0 + surfaceTone;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float wetPatches = smoothstep(
          0.56,
          0.84,
          worldSurfaceNoise(vProceduralWorldPosition * surfaceWetScale + vec3(7.1, 0.0, 19.3))
        );
        roughnessFactor = clamp(
          roughnessFactor - wetPatches * surfaceWetness + (surfaceDetail - 0.5) * 0.055,
          0.24,
          1.0
        );
        diffuseColor.rgb *= 1.0 - wetPatches * surfaceWetness * 0.09;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        vec3 proceduralNormal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
        float proceduralFacing = abs(dot(proceduralNormal, normal));
        float proceduralBump = (surfaceDetail - 0.5) * surfaceNormalStrength * proceduralFacing;
        normal = normalize(normal + vec3(dFdx(proceduralBump), dFdy(proceduralBump), 0.0));`,
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
  const stone = { variation: 0.12, scale: 0.23, wetness: 0.2, wetScale: 0.05, normalStrength: 0.11 };
  const wood = { variation: 0.11, scale: 0.34, wetness: 0.16, wetScale: 0.07, normalStrength: 0.09 };
  const cloth = { variation: 0.055, scale: 0.7, wetness: 0.08, wetScale: 0.12, normalStrength: 0.035 };
  const organic = { variation: 0.12, scale: 0.42, wetness: 0.14, wetScale: 0.08, normalStrength: 0.1 };

  const materials = {
    limestone: standard(0x918b7b, 0.87, { flatShading: true }, stone),
    limestoneDark: standard(0x6d6b62, 0.91, { flatShading: true }, { ...stone, variation: 0.14 }),
    rubble: standard(0x66655e, 0.96, { flatShading: true }, { ...stone, variation: 0.17, scale: 0.38 }),
    plaster: standard(0xc4b99c, 0.9, {}, { variation: 0.075, scale: 0.3, wetness: 0.1, normalStrength: 0.055 }),
    plasterDark: standard(0x9c9279, 0.92, {}, { variation: 0.09, scale: 0.3, wetness: 0.12, normalStrength: 0.06 }),
    timber: standard(0x4a3526, 0.82, {}, wood),
    timberLight: standard(0x735438, 0.84, {}, { ...wood, variation: 0.13 }),
    thatch: standard(0x8b7647, 0.96, { flatShading: true }, { ...organic, scale: 0.75, normalStrength: 0.12 }),
    oldThatch: standard(0x625b3e, 0.98, { flatShading: true }, { ...organic, scale: 0.72, variation: 0.14 }),
    roofTile: standard(0x60443a, 0.86, { flatShading: true }, { ...stone, scale: 0.48, wetness: 0.24 }),
    iron: standard(0x3b4142, 0.42, { metalness: 0.48 }, { variation: 0.05, scale: 0.62, wetness: 0.12, normalStrength: 0.045 }),
    soil: standard(0x534237, 0.83, {}, { variation: 0.15, scale: 0.18, wetness: 0.3, wetScale: 0.045, normalStrength: 0.13 }),
    straw: standard(0xad9858, 0.96, {}, { ...organic, scale: 0.9, wetness: 0.08 }),
    canvas: standard(0xb5a17c, 0.9, { side: THREE.DoubleSide }, cloth),
    canvasDark: standard(0x756b58, 0.94, { side: THREE.DoubleSide }, { ...cloth, variation: 0.07 }),
    redCloth: standard(0x832825, 0.78, { side: THREE.DoubleSide }, cloth),
    goldCloth: standard(0xc19a45, 0.78, { side: THREE.DoubleSide }, cloth),
    blueCloth: standard(0x31546f, 0.8, { side: THREE.DoubleSide }, cloth),
    leaf: standard(0x415738, 0.92, { flatShading: true }, { ...organic, variation: 0.15, scale: 0.55 }),
    leafDry: standard(0x746c3d, 0.95, { flatShading: true }, { ...organic, variation: 0.16, scale: 0.58 }),
    bark: standard(0x4c3b2d, 0.94, { flatShading: true }, { ...wood, variation: 0.16, scale: 0.52, wetness: 0.1 }),
    charcoal: standard(0x262522, 0.89, {}, { variation: 0.12, scale: 0.46, wetness: 0.04, normalStrength: 0.08 }),
    ember: standard(0xff7b2c, 0.52, {
      emissive: 0xff3f0d,
      emissiveIntensity: 3.4,
    }, { variation: 0.08, scale: 0.8, wetness: 0, normalStrength: 0.035 }),
  };

  return materials;
}
