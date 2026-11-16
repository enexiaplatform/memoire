export type WorkspaceBrowserScope = Readonly<{ ownerId: string; workspaceId: string }>;

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function resolveWorkspaceStorage(scope?: WorkspaceBrowserScope): Storage | null {
  const storage = globalThis.window?.localStorage ?? globalThis.localStorage;
  if (!storage || !scope) return storage ?? null;
  if (!uuid.test(scope.ownerId) || !uuid.test(scope.workspaceId)) {
    throw new Error('Invalid workspace storage scope.');
  }

  const prefix = `memoire.workspace.v1.${scope.ownerId.toLowerCase()}.${scope.workspaceId.toLowerCase()}.`;
  function keys() {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => key !== null && key.startsWith(prefix));
  }

  return {
    get length() { return keys().length; },
    key(index) { return keys()[index]?.slice(prefix.length) ?? null; },
    getItem(key) { return storage.getItem(prefix + key); },
    setItem(key, value) { storage.setItem(prefix + key, value); },
    removeItem(key) { storage.removeItem(prefix + key); },
    clear() { keys().forEach(key => storage.removeItem(key)); },
  };
}
