export interface ParsedMapSaveKey {
  baseKey: string;
  mapKey: string;
}

export function buildMapScopedSaveKey(baseKey: string, mapKey: string): string {
  return `${baseKey}:${mapKey}`;
}

export function parseMapScopedSaveKey(baseKey: string, scopedKey: string): ParsedMapSaveKey | null {
  const prefix = `${baseKey}:`;
  if (!scopedKey.startsWith(prefix)) {
    return null;
  }

  const mapKey = scopedKey.slice(prefix.length);
  if (!mapKey) {
    return null;
  }

  return {
    baseKey,
    mapKey,
  };
}
