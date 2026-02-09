import { describe, expect, it } from 'vitest';
import {
  addInventoryItem,
  consumeSelectedItem,
  createInventoryState,
  getSelectedCount,
  selectInventorySlotByDigit,
} from '../../src/gameplay/inventory';

describe('inventory', () => {
  it('adds and consumes resources from selected slot', () => {
    let state = createInventoryState();
    state = addInventoryItem(state, 'wood', 3);

    const consumed = consumeSelectedItem(state, 2);

    expect(consumed.consumed).toBe(true);
    expect(consumed.state.items.wood).toBe(1);
  });

  it('switches hotbar by numeric key and tracks selected count', () => {
    let state = createInventoryState();
    state = addInventoryItem(state, 'stone', 4);
    state = selectInventorySlotByDigit(state, 2);

    expect(state.selected).toBe('stone');
    expect(getSelectedCount(state)).toBe(4);
  });

  it('does not consume when slot has insufficient amount', () => {
    const state = createInventoryState();
    const consumed = consumeSelectedItem(state, 1);

    expect(consumed.consumed).toBe(false);
    expect(consumed.state).toEqual(state);
  });
});
