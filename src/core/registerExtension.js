export function registerExtension(extension, name) {
  const register = window.__MEDIEVAL_RPG_REGISTER_EXTENSION__;
  if (typeof register === 'function') return register(extension, name);

  window.__MEDIEVAL_RPG_EXTENSIONS__ ??= [];
  window.__MEDIEVAL_RPG_EXTENSIONS__.push(
    name && typeof extension === 'function'
      ? { name, install: extension }
      : extension,
  );
  return null;
}
