const WORKSPACE_CACHE_TTL_MS = 120_000;

type ValueEntry<T> = {
  expiresAt: number;
  value: T;
  generation: number;
};

type PendingEntry<T> = {
  promise: Promise<T>;
  generation: number;
};

const values = new Map<string, ValueEntry<unknown>>();

/**
 * In-flight loads, kept apart from cached values on purpose.
 *
 * A workspace load ends by writing what it merged back to localStorage, and
 * those writes used to invalidate the cache - including the entry holding the
 * load's own promise. Every surface that asked for the workspace while one was
 * already running therefore missed the de-duplication and started its own, so a
 * single visit to Today fetched all fourteen tables eight times over. Pending
 * loads survive invalidation; only their right to publish a value is revoked.
 */
const pending = new Map<string, PendingEntry<unknown>>();

/**
 * Bumped by every invalidation. A load that started before the workspace
 * changed underneath it can still be awaited by whoever asked for it, but it no
 * longer answers new callers and its result is never cached as current.
 */
let generation = 0;

export function getCachedWorkspaceValue<T>(key: string): T | null {
  const entry = values.get(key) as ValueEntry<T> | undefined;
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.value;
}

export function getCachedWorkspacePromise<T>(key: string): Promise<T> | null {
  const entry = pending.get(key) as PendingEntry<T> | undefined;
  if (!entry || entry.generation !== generation) return null;
  return entry.promise;
}

export function setCachedWorkspacePromise<T>(key: string, promise: Promise<T>) {
  pending.set(key, { promise, generation });
}

export function clearCachedWorkspacePromise(key: string, promise: Promise<unknown>) {
  const entry = pending.get(key);
  if (entry?.promise === promise) pending.delete(key);
}

export function setCachedWorkspaceValue<T>(key: string, value: T, generationAtLoadStart = generation) {
  // A value merged from data that has since changed would be served to the next
  // surface as if it were current. Drop it instead - the next reader reloads.
  if (generationAtLoadStart !== generation) return;
  values.set(key, {
    expiresAt: Date.now() + WORKSPACE_CACHE_TTL_MS,
    value,
    generation,
  });
}

export function getWorkspaceDataGeneration() {
  return generation;
}

export function invalidateWorkspaceDataCache() {
  generation += 1;
  values.clear();
}
