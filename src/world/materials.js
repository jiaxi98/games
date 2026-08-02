import * as THREE from 'three';

function standard(color, roughness = 0.9, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    ...extra,
  });
}

export function createWorldMaterials() {
  const materials = {
    limestone: standard(0x7f796b, 0.96, { flatShading: true }),
    limestoneDark: standard(0x5d5b54, 0.98, { flatShading: true }),
    rubble: standard(0x55544d, 1, { flatShading: true }),
    plaster: standard(0xb5aa8d, 0.96),
    plasterDark: standard(0x8d836c, 0.97),
    timber: standard(0x3e2c20, 0.92),
    timberLight: standard(0x60452d, 0.94),
    thatch: standard(0x78643b, 1, { flatShading: true }),
    oldThatch: standard(0x514932, 1, { flatShading: true }),
    roofTile: standard(0x4d3730, 0.96, { flatShading: true }),
    iron: standard(0x2b2e2e, 0.55, { metalness: 0.45 }),
    soil: standard(0x42352b, 1),
    straw: standard(0x9b8549, 1),
    canvas: standard(0xa48f6c, 0.98, { side: THREE.DoubleSide }),
    canvasDark: standard(0x625948, 1, { side: THREE.DoubleSide }),
    redCloth: standard(0x6d1f1d, 0.86, { side: THREE.DoubleSide }),
    goldCloth: standard(0xb18b38, 0.86, { side: THREE.DoubleSide }),
    blueCloth: standard(0x27425a, 0.88, { side: THREE.DoubleSide }),
    leaf: standard(0x344328, 1, { flatShading: true }),
    leafDry: standard(0x5d5630, 1, { flatShading: true }),
    bark: standard(0x3e3025, 1, { flatShading: true }),
    charcoal: standard(0x1b1b19, 1),
    ember: standard(0xff6a21, 0.65, {
      emissive: 0xff3b0a,
      emissiveIntensity: 2.5,
    }),
  };

  return materials;
}
