const phases = ['fixedUpdate', 'update', 'lateUpdate', 'render', 'resize'];

export class SystemRegistry {
  #systems = [];
  #nextOrder = 0;

  add(system, { priority = 0, name } = {}) {
    if (!system || typeof system !== 'object') {
      throw new TypeError('A game system must be an object.');
    }

    const record = {
      name: name ?? system.name ?? system.constructor?.name ?? `System${this.#nextOrder}`,
      priority,
      order: this.#nextOrder++,
      system,
    };
    this.#systems.push(record);
    this.#systems.sort((a, b) => a.priority - b.priority || a.order - b.order);

    return () => {
      const index = this.#systems.indexOf(record);
      if (index !== -1) {
        this.#systems.splice(index, 1);
        system.dispose?.();
      }
    };
  }

  run(phase, ...args) {
    if (!phases.includes(phase)) {
      throw new Error(`Unknown system phase "${phase}".`);
    }

    for (const { system } of [...this.#systems]) {
      system[phase]?.(...args);
    }
  }

  dispose() {
    for (const { system } of [...this.#systems].reverse()) {
      system.dispose?.();
    }
    this.#systems.length = 0;
  }

  list() {
    return this.#systems.map(({ name, priority }) => ({ name, priority }));
  }
}
