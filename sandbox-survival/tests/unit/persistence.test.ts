import { describe, expect, it } from 'vitest';
import {
  archiveCorruptedSave,
  inspectGameState,
  loadGameState,
  parseSave,
  saveGameState,
  type StorageLike,
} from '../../src/persistence/save-slot';
import type { PersistedGameState } from '../../src/contracts/game-state';

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  readRaw(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  keys(): string[] {
    return [...this.data.keys()];
  }
}

function sampleSave(): PersistedGameState {
  return {
    version: 1,
    seed: 20260207,
    savedAt: 1234,
    player: {
      position: { x: 1, y: 1.7, z: 2 },
      yaw: 0,
      pitch: 0,
    },
    inventory: {
      selected: 'wood',
      items: { wood: 2, stone: 1 },
    },
    survival: {
      health: 90,
      hunger: 80,
      temperature: 50,
      durability: 60,
      clockMinutes: 700,
    },
    harvestedResourceIds: ['0:0:0'],
    placedStructures: [
      {
        id: 'structure:wood:1',
        kind: 'wood',
        position: { x: 1, y: 0.5, z: 1 },
      },
    ],
  };
}

describe('save slot', () => {
  it('serializes and restores saved game state', () => {
    const storage = new MemoryStorage();
    const save = sampleSave();

    saveGameState(storage, 'slot', save);
    const loaded = loadGameState(storage, 'slot');

    expect(loaded).toEqual(save);
  });

  it('returns null for invalid payload', () => {
    expect(parseSave('{"version":2}')).toBeNull();
    expect(parseSave('bad json')).toBeNull();
  });

  it('migrates legacy payload without explicit version', () => {
    const legacyRaw = JSON.stringify({
      seed: 20260207,
      savedAt: 1,
      player: {
        position: { x: 0, y: 1.7, z: 0 },
        yaw: 0,
        pitch: 0,
      },
      inventory: {
        selected: 'wood',
        items: { wood: 1, stone: 0 },
      },
      survival: {
        health: 100,
        hunger: 100,
        temperature: 58,
        durability: 100,
      },
      harvestedResourceIds: [],
      placedStructures: [],
    });

    const parsed = parseSave(legacyRaw);

    expect(parsed).not.toBeNull();
    expect(parsed?.version).toBe(1);
    expect(parsed?.survival.clockMinutes).toBe(720);
  });

  it('reports parse issues for broken payloads', () => {
    const storage = new MemoryStorage();
    storage.setItem('slot', '{"version":');
    const report = inspectGameState(storage, 'slot');

    expect(report.state).toBeNull();
    expect(report.issue).toBe('invalid_json');
    expect(report.raw).toContain('{"version":');
  });

  it('archives corrupted payload and clears active slot', () => {
    const storage = new MemoryStorage();
    storage.setItem('slot', '{"broken": true');
    const raw = storage.readRaw('slot');

    if (!raw) {
      throw new Error('expected raw save to exist');
    }

    const backupKey = archiveCorruptedSave(storage, 'slot', raw);

    expect(storage.readRaw('slot')).toBeNull();
    expect(storage.keys()).toContain(backupKey);
    expect(storage.readRaw(backupKey)).toBe('{"broken": true');
  });
});
