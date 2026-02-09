import type { InventorySnapshot, ResourceCounts } from '../contracts/game-state';
import { RESOURCE_KINDS, type ResourceKind } from '../contracts/kinds';

export interface InventoryState extends InventorySnapshot {}

function createEmptyCounts(): ResourceCounts {
  return {
    wood: 0,
    stone: 0,
  };
}

export function createInventoryState(): InventoryState {
  return {
    selected: RESOURCE_KINDS[0],
    items: createEmptyCounts(),
  };
}

export function addInventoryItem(state: InventoryState, kind: ResourceKind, amount = 1): InventoryState {
  if (amount <= 0) {
    return state;
  }

  return {
    ...state,
    items: {
      ...state.items,
      [kind]: state.items[kind] + amount,
    },
  };
}

export function consumeSelectedItem(
  state: InventoryState,
  amount = 1,
): { state: InventoryState; consumed: boolean } {
  const selectedCount = state.items[state.selected];
  if (amount <= 0 || selectedCount < amount) {
    return { state, consumed: false };
  }

  return {
    consumed: true,
    state: {
      ...state,
      items: {
        ...state.items,
        [state.selected]: selectedCount - amount,
      },
    },
  };
}

export function selectInventorySlotByDigit(state: InventoryState, digit: number): InventoryState {
  if (!Number.isInteger(digit) || digit <= 0 || digit > RESOURCE_KINDS.length) {
    return state;
  }

  return {
    ...state,
    selected: RESOURCE_KINDS[digit - 1],
  };
}

export function getSelectedCount(state: InventoryState): number {
  return state.items[state.selected];
}
