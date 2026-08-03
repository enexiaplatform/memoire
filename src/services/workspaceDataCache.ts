/**
 * How long a cached workspace may still be served at all.
 *
 * Every write in the app invalidates this cache, so a stale entry can only come
 * from another device or another tab - not from anything the seller just did
 * here. Ten minutes is the outer bound on that; `WORKSPACE_REVALIDATE_AFTER_MS`
 * below is what actually keeps it fresh, and it is a minute.
 */
const WORKSPACE_CACHE_TTL_MS = 600_000;

/**
 * How old a cached workspace may get before the next reader also triggers a
 * background refresh.
 *
 * The entry is still served immediately - the seller gets their screen painted
 * from memory - and the refresh lands in the cache for whoever reads next. This
 * is the difference between a tab switch that waits on sixteen tables and one
 * that does not.
 */
const WORKSPACE_REVALIDATE_AFTER_MS = 60_000;

type ValueEntry<T> = {
  expiresAt: number;
  staleAt: number;
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

/** Whether a served entry is old enough that the reader should also refresh it. */
export function isCachedWorkspaceValueStale(key: string): boolean {
  const entry = values.get(key);
  if (!entry) return false;
  return Date.now() > entry.staleAt;
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
  const now = Date.now();
  values.set(key, {
    expiresAt: now + WORKSPACE_CACHE_TTL_MS,
    staleAt: now + WORKSPACE_REVALIDATE_AFTER_MS,
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
