import type { MapPreset } from './map-presets';

export interface MapAssetPalette {
  riverColor: number;
  cityAccentColor: number;
  districtBaseColor: number;
  sidewalkColor: number;
  buildingColor: number;
  bridgeColor: number;
}

const DEFAULT_PALETTE: MapAssetPalette = {
  riverColor: 0x4c7ca8,
  cityAccentColor: 0x7f878f,
  districtBaseColor: 0x4b4f52,
  sidewalkColor: 0x72777b,
  buildingColor: 0xa3a39d,
  bridgeColor: 0x73675d,
};

const MAP_ASSET_BY_KEY: Record<string, MapAssetPalette> = {
  wildlands: {
    riverColor: 0x4c7ca8,
    cityAccentColor: 0x7f878f,
    districtBaseColor: 0x4b4f52,
    sidewalkColor: 0x72777b,
    buildingColor: 0xa3a39d,
    bridgeColor: 0x73675d,
  },
  tiananmen: {
    riverColor: 0x3f77a3,
    cityAccentColor: 0xb64a34,
    districtBaseColor: 0x4b4f52,
    sidewalkColor: 0x7e766f,
    buildingColor: 0xb5ab9a,
    bridgeColor: 0x9f5e46,
  },
  yiheyuan: {
    riverColor: 0x5a8bb8,
    cityAccentColor: 0x4d7b55,
    districtBaseColor: 0x475a4a,
    sidewalkColor: 0x72777b,
    buildingColor: 0xa3a39d,
    bridgeColor: 0x73675d,
  },
};

export function resolveMapAssetPalette(mapPreset: MapPreset): MapAssetPalette {
  return MAP_ASSET_BY_KEY[mapPreset.key] ?? DEFAULT_PALETTE;
}
