import { describe, expect, it, vi } from 'vitest';
import { SystemRegistry } from '../../src/core/SystemRegistry.js';

describe('SystemRegistry', () => {
  it('runs systems in stable priority order and disposes removed systems', () => {
    const registry = new SystemRegistry();
    const calls = [];
    const dispose = vi.fn();

    registry.add({ update: () => calls.push('late') }, { priority: 10 });
    const remove = registry.add(
      { update: () => calls.push('first'), dispose },
      { priority: -10 },
    );
    registry.add({ update: () => calls.push('middle') }, { priority: 0 });

    registry.run('update', 1 / 60, {});
    expect(calls).toEqual(['first', 'middle', 'late']);

    remove();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
