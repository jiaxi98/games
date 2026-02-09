import type { PersistedGameState, Vec3 } from '../contracts/game-state';
import type { ResourceKind } from '../contracts/kinds';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const DEFAULT_SAVE_KEY = 'sandbox-survival:slot-1';
export const SAVE_VERSION = 1;
const LEGACY_VERSION = 0;
const CORRUPTED_SAVE_SUFFIX = ':corrupt';

export type SaveLoadIssue = 'missing' | 'invalid_json' | 'invalid_schema' | 'unsupported_version';

interface ParseSaveResult {
  state: PersistedGameState | null;
  issue: Exclude<SaveLoadIssue, 'missing'> | null;
}

export interface LoadGameStateReport {
  state: PersistedGameState | null;
  issue: SaveLoadIssue | null;
  raw: string | null;
}

export function saveGameState(storage: StorageLike, key: string, state: PersistedGameState): void {
  storage.setItem(key, serializeSave(state));
}

export function loadGameState(storage: StorageLike, key: string): PersistedGameState | null {
  return inspectGameState(storage, key).state;
}

export function inspectGameState(storage: StorageLike, key: string): LoadGameStateReport {
  const raw = storage.getItem(key);
  if (!raw) {
    return {
      state: null,
      issue: 'missing',
      raw: null,
    };
  }

  const parsed = parseSaveDetailed(raw);
  return {
    state: parsed.state,
    issue: parsed.issue,
    raw,
  };
}

export function archiveCorruptedSave(storage: StorageLike, key: string, raw: string): string {
  const backupKey = `${key}${CORRUPTED_SAVE_SUFFIX}:${Date.now()}`;
  storage.setItem(backupKey, raw);
  storage.removeItem(key);
  return backupKey;
}

export function clearGameState(storage: StorageLike, key: string): void {
  storage.removeItem(key);
}

export function serializeSave(state: PersistedGameState): string {
  return JSON.stringify(state);
}

export function parseSave(raw: string): PersistedGameState | null {
  return parseSaveDetailed(raw).state;
}

function parseSaveDetailed(raw: string): ParseSaveResult {
  try {
    const parsed: unknown = JSON.parse(raw);
    const migration = migrateToLatest(parsed);

    if (!migration.ok) {
      return {
        state: null,
        issue: migration.issue,
      };
    }

    if (!isValidSave(migration.value)) {
      return {
        state: null,
        issue: 'invalid_schema',
      };
    }

    return {
      state: migration.value,
      issue: null,
    };
  } catch {
    return {
      state: null,
      issue: 'invalid_json',
    };
  }
}

type MigrationResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      issue: 'invalid_schema' | 'unsupported_version';
    };

function migrateToLatest(input: unknown): MigrationResult {
  if (!isObject(input)) {
    return {
      ok: false,
      issue: 'invalid_schema',
    };
  }

  const version = typeof input.version === 'number' ? input.version : LEGACY_VERSION;

  if (version === SAVE_VERSION) {
    return {
      ok: true,
      value: input,
    };
  }

  if (version !== LEGACY_VERSION) {
    return {
      ok: false,
      issue: 'unsupported_version',
    };
  }

  if (!isObject(input.survival)) {
    return {
      ok: false,
      issue: 'invalid_schema',
    };
  }

  const migrated = {
    ...input,
    version: SAVE_VERSION,
    survival: {
      ...input.survival,
      clockMinutes: typeof input.survival.clockMinutes === 'number' ? input.survival.clockMinutes : 720,
    },
  };

  return {
    ok: true,
    value: migrated,
  };
}

function isValidSave(input: unknown): input is PersistedGameState {
  if (!isObject(input)) {
    return false;
  }

  const state = input as Partial<PersistedGameState>;
  if (state.version !== SAVE_VERSION || typeof state.seed !== 'number' || typeof state.savedAt !== 'number') {
    return false;
  }

  if (!isPlayerSnapshot(state.player) || !isInventorySnapshot(state.inventory) || !isSurvivalSnapshot(state.survival)) {
    return false;
  }

  if (!Array.isArray(state.harvestedResourceIds) || !state.harvestedResourceIds.every((id) => typeof id === 'string')) {
    return false;
  }

  if (
    !Array.isArray(state.placedStructures) ||
    !state.placedStructures.every(
      (item) => isObject(item) && typeof item.id === 'string' && isResourceKind(item.kind) && isVec3(item.position),
    )
  ) {
    return false;
  }

  return true;
}

function isPlayerSnapshot(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    isVec3(value.position) && typeof value.yaw === 'number' && typeof value.pitch === 'number'
  );
}

function isInventorySnapshot(value: unknown): boolean {
  if (!isObject(value) || !isObject(value.items)) {
    return false;
  }

  return (
    isResourceKind(value.selected) &&
    typeof value.items.wood === 'number' &&
    typeof value.items.stone === 'number'
  );
}

function isSurvivalSnapshot(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.health === 'number' &&
    typeof value.hunger === 'number' &&
    typeof value.temperature === 'number' &&
    typeof value.durability === 'number' &&
    typeof value.clockMinutes === 'number'
  );
}

function isVec3(value: unknown): value is Vec3 {
  return isObject(value) && typeof value.x === 'number' && typeof value.y === 'number' && typeof value.z === 'number';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isResourceKind(value: unknown): value is ResourceKind {
  return value === 'wood' || value === 'stone';
}
