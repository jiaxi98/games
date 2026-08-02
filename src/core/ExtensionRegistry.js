export class ExtensionRegistry {
  #context;
  #installed = new Map();

  constructor(context) {
    this.#context = context;
  }

  async install(extension, fallbackName = 'anonymous-extension') {
    const candidate = extension?.default ?? extension;
    const installer = typeof candidate === 'function'
      ? candidate
      : typeof candidate?.install === 'function'
        ? candidate.install.bind(candidate)
        : typeof extension?.register === 'function'
          ? extension.register.bind(extension)
          : null;
    const name = candidate?.name || extension?.name || fallbackName;

    if (typeof installer !== 'function') {
      console.warn(`[extensions] Skipping "${name}": no install function exported.`);
      return null;
    }

    if (this.#installed.has(name)) {
      console.warn(`[extensions] "${name}" is already installed.`);
      return this.#installed.get(name);
    }

    const result = await installer(this.#context);
    let dispose = null;

    if (typeof result === 'function') {
      dispose = result;
    } else if (result && typeof result === 'object') {
      if (result.fixedUpdate || result.update || result.render || result.resize) {
        dispose = this.#context.registerSystem(result, { name });
      } else {
        dispose = result.dispose?.bind(result) ?? null;
      }
    }

    const record = { name, dispose };
    this.#installed.set(name, record);
    this.#context.events.emit('extension:installed', { name });
    return record;
  }

  has(name) {
    return this.#installed.has(name);
  }

  list() {
    return [...this.#installed.keys()];
  }

  dispose() {
    for (const record of [...this.#installed.values()].reverse()) {
      record.dispose?.();
    }
    this.#installed.clear();
  }
}
