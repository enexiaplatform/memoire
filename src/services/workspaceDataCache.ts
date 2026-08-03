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
  stamp: WorkspaceCacheStamp;
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
 * Bumped by a whole-workspace invalidation. A load that started before the
 * workspace changed underneath it can still be awaited by whoever asked for it,
 * but it no longer answers new callers and its result is never cached as
 * current.
 */
let generation = 0;

/**
 * Bumped per collection, so saving one record stops throwing away all sixteen.
 *
 * Editing a deal used to clear the whole cache, and the next screen then
 * refetched every table - including 1,083 accounts and 1,738 stakeholders, about
 * 3 MB of JSON, none of which the edit had touched. A write now says which
 * collection it changed; only that one is refetched and the rest are served from
 * memory.
 *
 * `invalidateWorkspaceDataCache` is still the honest answer whenever a caller
 * does not know what it changed - it is slower, never wrong - so anything not
 * migrated to name its collection keeps working exactly as before.
 */
const collectionGenerations = new Map<string, number>();

/**
 * What a load must present to be allowed to publish its result: the epoch and
 * the collection counter as they were when it started. Either moving means the
 * data it merged is no longer current.
 */
export type WorkspaceCacheStamp = {
  epoch: number;
  collection: number;
};

export function getWorkspaceCacheStamp(collection: string): WorkspaceCacheStamp {
  return { epoch: generation, collection: collectionGenerations.get(collection) ?? 0 };
}

function isCurrentStamp(collection: string, stamp: WorkspaceCacheStamp) {
  return stamp.epoch === generation && stamp.collection === (collectionGenerations.get(collection) ?? 0);
}

/** Drops one collection's cached copy, leaving every other collection served. */
export function invalidateWorkspaceCollection(collection: string) {
  collectionGenerations.set(collection, (collectionGenerations.get(collection) ?? 0) + 1);
  for (const key of values.keys()) {
    if (keyCollection(key) === collection) values.delete(key);
  }
}

/** Cache keys are `ws:<userId>:<collection>`; the collection is the last part. */
function keyCollection(key: string) {
  const at = key.lastIndexOf(':');
  return at === -1 ? '' : key.slice(at + 1);
}

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
  if (!entry || !isCurrentStamp(keyCollection(key), entry.stamp)) return null;
  return entry.promise;
}

export function setCachedWorkspacePromise<T>(key: string, promise: Promise<T>) {
  pending.set(key, { promise, stamp: getWorkspaceCacheStamp(keyCollection(key)) });
}

export function clearCachedWorkspacePromise(key: string, promise: Promise<unknown>) {
  const entry = pending.get(key);
  if (entry?.promise === promise) pending.delete(key);
}

export function setCachedWorkspaceValue<T>(key: string, value: T, stampAtLoadStart?: WorkspaceCacheStamp) {
  // A value merged from data that has since changed would be served to the next
  // surface as if it were current. Drop it instead - the next reader reloads.
  const collection = keyCollection(key);
  const stamp = stampAtLoadStart ?? getWorkspaceCacheStamp(collection);
  if (!isCurrentStamp(collection, stamp)) return;

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
