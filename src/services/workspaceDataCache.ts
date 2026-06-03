const WORKSPACE_CACHE_TTL_MS = 120_000;

type CacheEntry<T> = {
  expiresAt: number;
  promise?: Promise<T>;
  value?: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

export function getCachedWorkspaceValue<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || !entry.value || Date.now() > entry.expiresAt) return null;
  return entry.value;
}

export function getCachedWorkspacePromise<T>(key: string): Promise<T> | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry || !entry.promise || Date.now() > entry.expiresAt) return null;
  return entry.promise;
}

export function setCachedWorkspacePromise<T>(key: string, promise: Promise<T>) {
  cache.set(key, {
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
    promise,
  });
}

export function setCachedWorkspaceValue<T>(key: string, value: T) {
  cache.set(key, {
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
    value,
  });
}

export function invalidateWorkspaceDataCache() {
  cache.clear();
}
