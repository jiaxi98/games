export interface MapPreset {
  key: string;
  name: string;
  description: string;
  seed: number;
  cityRadius: number;
  importManifestPath?: string;
}

export interface MapPresetStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const MAP_STORAGE_KEY = 'sandbox-survival:map';
export const DEFAULT_MAP_KEY = 'wildlands';

export const MAP_PRESETS: MapPreset[] = [
  {
    key: 'wildlands',
    name: 'Wildlands Frontier',
    description: 'River canyon wilderness with a compact industrial city.',
    seed: 20260207,
    cityRadius: 9.5,
    importManifestPath: 'assets/maps/wildlands/manifest.json',
  },
  {
    key: 'tiananmen',
    name: 'Tiananmen Inspired Plaza',
    description: 'Monumental central axis, ceremonial square, and fortified gate silhouette.',
    seed: 20260601,
    cityRadius: 11.2,
    importManifestPath: 'assets/maps/tiananmen/manifest.json',
  },
  {
    key: 'yiheyuan',
    name: 'Summer Palace Inspired Garden',
    description: 'Lakeside promenade, pavilion cluster, and hillside garden district.',
    seed: 20260618,
    cityRadius: 10.4,
    importManifestPath: 'assets/maps/yiheyuan/manifest.json',
  },
];

const MAP_PRESET_BY_KEY = new Map(MAP_PRESETS.map((preset) => [preset.key, preset]));

export function getMapPresetByKey(key: string): MapPreset | null {
  return MAP_PRESET_BY_KEY.get(key) ?? null;
}

export function getNextMapPresetKey(currentKey: string): string {
  const currentIndex = MAP_PRESETS.findIndex((preset) => preset.key === currentKey);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % MAP_PRESETS.length : 0;
  return MAP_PRESETS[nextIndex]?.key ?? DEFAULT_MAP_KEY;
}

export function resolveMapPreset(locationSearch: string, storage: MapPresetStorage): MapPreset {
  const params = new URLSearchParams(locationSearch);
  const queryMap = params.get('map')?.toLowerCase();

  if (queryMap) {
    const fromQuery = getMapPresetByKey(queryMap);
    if (fromQuery) {
      storage.setItem(MAP_STORAGE_KEY, queryMap);
      return fromQuery;
    }
  }

  const storedMap = storage.getItem(MAP_STORAGE_KEY)?.toLowerCase();
  if (storedMap) {
    const fromStorage = getMapPresetByKey(storedMap);
    if (fromStorage) {
      return fromStorage;
    }
  }

  return getMapPresetByKey(DEFAULT_MAP_KEY) ?? MAP_PRESETS[0];
}
