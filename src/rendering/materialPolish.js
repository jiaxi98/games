const POLISHED = new WeakSet();

const FAMILY_BY_NAME = Object.freeze([
  ['skin', /face|hand|skin/i],
  ['metal', /helmet|iron|mail|plate|blade|sword|spearhead|socket|guard|buckle|pommel|pauldron|wristband|fuller/i],
  ['wood', /shaft|pole|timber|wood/i],
  ['leather', /leather|boot|belt|bracer|vambrace|grip|glove|rainGuard/i],
  ['cloth', /cloth|tabard|stripe|torso|surcoat|skirt|sleeve|hose|leg|cuff|standard|banner/i],
]);

function familyFor(object, material) {
  if ((material.metalness ?? 0) >= 0.35) return 'metal';
  const name = `${object.name ?? ''} ${material.name ?? ''}`;
  for (const [family, pattern] of FAMILY_BY_NAME) {
    if (pattern.test(name)) return family;
  }
  return null;
}

function tuneColor(material, {
  saturation = 0,
  lightness = 0,
} = {}) {
  if (!material.color?.getHSL) return;
  const hsl = {};
  material.color.getHSL(hsl);
  material.color.setHSL(
    hsl.h,
    Math.min(1, Math.max(0, hsl.s + saturation)),
    Math.min(1, Math.max(0, hsl.l + lightness)),
  );
}

function tuneMaterial(material, family) {
  if (POLISHED.has(material)) return false;
  POLISHED.add(material);
  material.userData.renderingMaterialFamily = family;
  material.dithering = true;

  if (family === 'metal') {
    material.metalness = Math.max(0.58, material.metalness ?? 0);
    material.roughness = Math.min(0.38, Math.max(0.2, (material.roughness ?? 0.45) * 0.78));
    material.envMapIntensity = Math.max(1.18, material.envMapIntensity ?? 1);
    tuneColor(material, { saturation: -0.1, lightness: 0.035 });
  } else if (family === 'skin') {
    material.metalness = 0;
    material.roughness = Math.min(0.9, material.roughness ?? 0.9);
    tuneColor(material, { saturation: 0.08, lightness: 0.035 });
  } else if (family === 'cloth') {
    material.metalness = 0;
    material.roughness = Math.min(0.93, Math.max(0.8, material.roughness ?? 0.9));
    tuneColor(material, { saturation: 0.1, lightness: 0.018 });
  } else if (family === 'wood') {
    material.metalness = 0;
    material.roughness = Math.min(0.84, material.roughness ?? 0.84);
    tuneColor(material, { saturation: 0.12, lightness: 0.012 });
  } else if (family === 'leather') {
    material.metalness = 0;
    material.roughness = Math.min(0.82, material.roughness ?? 0.82);
    tuneColor(material, { saturation: 0.08, lightness: -0.012 });
  }
  material.needsUpdate = true;
  return true;
}

/**
 * Applies restrained value and response separation to generated actor and
 * viewmodel materials without taking ownership of their source modules.
 */
export function polishSceneMaterials(root) {
  let polished = 0;
  root?.traverse?.((object) => {
    if (!object.isMesh || object.userData.worldSurface) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.isMeshStandardMaterial && !material?.isMeshPhysicalMaterial) continue;
      if (material.userData.proceduralSurface) continue;
      const family = familyFor(object, material);
      if (family && tuneMaterial(material, family)) polished += 1;
    }
  });
  return polished;
}

