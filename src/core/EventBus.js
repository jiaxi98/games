export class EventBus {
  #listeners = new Map();

  on(type, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError(`Listener for "${type}" must be a function.`);
    }

    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => this.off(type, listener);
  }

  once(type, listener) {
    const unsubscribe = this.on(type, (...args) => {
      unsubscribe();
      listener(...args);
    });
    return unsubscribe;
  }

  off(type, listener) {
    const listeners = this.#listeners.get(type);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) this.#listeners.delete(type);
  }

  emit(type, payload) {
    const listeners = this.#listeners.get(type);
    if (!listeners) return;

    for (const listener of [...listeners]) {
      listener(payload);
    }
  }

  clear() {
    this.#listeners.clear();
  }
}
