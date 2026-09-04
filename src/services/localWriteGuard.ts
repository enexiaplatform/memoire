import { reportClientOperationalEvent } from './clientTelemetry.ts';

/**
 * The one place a record collection is written to this browser.
 *
 * Every store used to call `localStorage.setItem` directly. Four of them
 * wrapped it in `try { ... } catch { return false }` and the rest did not wrap
 * it at all, and no caller anywhere checked the result. That produces exactly
 * one behaviour when the browser refuses a write: the record is gone, and the
 * interface says it saved.
 *
 * The refusal is not hypothetical and it is not rare in the shape this product
 * has. A workspace measured on 2026-08-02 costs about 2.5 KB per captured
 * activity and 1.8 KB per opportunity, as the browser counts it; against the
 * ~5 MB localStorage ceiling, somebody capturing six things a day meets the
 * wall inside two years, and much sooner if they use the paste-email path,
 * which stores the raw thread. Safari in private mode refuses writes on the
 * first one. A user who has filled their quota does not get a warning from the
 * platform - they get a `QuotaExceededError` on the next save, and that save is
 * the one that mattered.
 *
 * So: one function, it never throws, it always tells the caller what happened,
 * and a failure is announced loudly enough that the interface can stop claiming
 * the record is safe. Callers that ignore the result are the bug this file
 * exists to make visible, not a case it silently absorbs.
 */

export type LocalWriteFailureReason = 'quota' | 'unavailable' | 'unknown';

export type LocalWriteResult =
  | { ok: true }
  | { ok: false; reason: LocalWriteFailureReason; message: string };

export type LocalWriteFailure = {
  key: string;
  reason: LocalWriteFailureReason;
  message: string;
  at: string;
};

/** Fired on the window when a write is refused, so the shell can say so. */
export const LOCAL_WRITE_FAILED_EVENT = 'memoire:local-write-failed';
/** Fired when a write succeeds after a failure, so the warning can clear. */
export const LOCAL_WRITE_RECOVERED_EVENT = 'memoire:local-write-recovered';

let lastFailure: LocalWriteFailure | null = null;

export function getLastLocalWriteFailure(): LocalWriteFailure | null {
  return lastFailure;
}

/**
 * Writes one collection. Returns `{ ok: false }` rather than throwing, because
 * a store in the middle of a save has no useful way to handle an exception and
 * every existing caller is synchronous.
 */
export function writeLocalCollection(key: string, payload: string): LocalWriteResult {
  const storage = resolveStorage();
  if (!storage) {
    return { ok: false, reason: 'unavailable', message: 'This browser has no local storage available.' };
  }

  try {
    storage.setItem(key, payload);
    if (lastFailure) {
      lastFailure = null;
      dispatch(LOCAL_WRITE_RECOVERED_EVENT, null);
    }
    return { ok: true };
  } catch (error) {
    const reason = classify(error);
    const message = describe(reason, key);
    lastFailure = { key, reason, message, at: new Date().toISOString() };

    reportClientOperationalEvent({
      eventName: 'local_write_failed',
      component: 'localWriteGuard',
      operation: `write:${key}`,
      severity: 'error',
      error,
    });
    dispatch(LOCAL_WRITE_FAILED_EVENT, lastFailure);

    return { ok: false, reason, message };
  }
}

/** Convenience for the common case: a list of records, serialised here. */
export function writeLocalRecords(key: string, records: unknown): LocalWriteResult {
  try {
    return writeLocalCollection(key, JSON.stringify(records));
  } catch (error) {
    // JSON.stringify throws on a cycle. It has never happened here, but a
    // serialisation failure that reads as a successful save is the same bug.
    return { ok: false, reason: 'unknown', message: `Could not prepare ${key} for saving: ${String(error)}` };
  }
}

/**
 * What this workspace is costing the browser, and how close that is to the
 * ceiling. `navigator.storage.estimate()` covers the whole origin and is the
 * number the browser will actually enforce; the per-key breakdown is what the
 * operator can act on.
 */
export type StorageUsage = {
  /** Bytes used by Memoire's own keys, counted as UTF-16 like the browser does. */
  memoireBytes: number;
  /** Largest collections first. */
  byKey: { key: string; bytes: number; records: number | null }[];
  /** Whole-origin usage and quota, where the browser reports them. */
  originBytes: number | null;
  originQuota: number | null;
};

export function measureLocalStorageUsage(): StorageUsage {
  const byKey: StorageUsage['byKey'] = [];
  let memoireBytes = 0;

  const storage = resolveStorage();
  if (storage) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (!key || !key.startsWith('memoire')) continue;
      const value = storage.getItem(key) || '';
      // Two bytes per code unit: what the storage quota is measured in.
      const bytes = (key.length + value.length) * 2;
      memoireBytes += bytes;
      byKey.push({ key, bytes, records: countRecords(value) });
    }
  }

  byKey.sort((left, right) => right.bytes - left.bytes);
  return { memoireBytes, byKey, originBytes: null, originQuota: null };
}

/** The browser's own figure. Async, and absent on older Safari. */
export async function estimateOriginStorage(): Promise<{ originBytes: number | null; originQuota: number | null }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { originBytes: null, originQuota: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      originBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
      originQuota: typeof estimate.quota === 'number' ? estimate.quota : null,
    };
  } catch {
    return { originBytes: null, originQuota: null };
  }
}

function countRecords(value: string): number | null {
  if (!value.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.length : null;
  } catch {
    return null;
  }
}

/**
 * What kind of failure this was, read from the error's shape rather than its
 * constructor.
 *
 * It used to require `error instanceof DOMException` before looking at anything
 * else, so the whole quota branch - and the one message that tells an operator
 * what to actually do about it - was reachable only when the error object came
 * from the same realm's DOMException. Three cases where it does not:
 *
 *   - An error thrown across a realm boundary. `instanceof` compares against
 *     *this* window's constructor, so a storage call that crosses an iframe, or
 *     a privacy extension that wraps `localStorage` in a proxy of its own, fails
 *     the check while being a genuine quota error.
 *   - Safari in private mode, which historically threw a plain `Error`.
 *   - Any environment without a `DOMException` global at all, which this file
 *     knowingly runs in - see `resolveStorage` below.
 *
 * In each of those the operator was told "Memoire could not save to this
 * browser" when the true answer was "this browser is full, export a backup and
 * sign in so records sync". The first sentence is a shrug; the second is a way
 * out, and it was unreachable outside the happy path.
 *
 * Name and code are what every browser actually sets, so they are what this
 * reads. A real `DOMException` classifies exactly as it did before.
 */
function classify(error: unknown): LocalWriteFailureReason {
  // Chrome and Firefox report code 22 / name QuotaExceededError; Safari in
  // private mode historically threw code 1014 with a different name.
  const named = error as { name?: unknown; code?: unknown } | null;
  const name = typeof named?.name === 'string' ? named.name : '';
  const code = typeof named?.code === 'number' ? named.code : null;

  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014) {
    return 'quota';
  }

  // A DOMException that is not about space is the browser refusing storage
  // outright - blocked site data, or a context with no storage partition.
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return 'unavailable';
  if (name === 'SecurityError' || name === 'InvalidAccessError') return 'unavailable';

  return 'unknown';
}

function describe(reason: LocalWriteFailureReason, key: string): string {
  if (reason === 'quota') {
    return 'This browser has run out of space for Memoire, so the last change was not saved here. Export a backup, then sign in so records sync to your account.';
  }
  if (reason === 'unavailable') {
    return 'This browser is blocking local storage, so the last change was not saved. Private browsing and blocked site data both do this.';
  }
  return `Memoire could not save to this browser (${key}). The last change was not stored.`;
}

/**
 * The storage this environment actually has.
 *
 * The stores reach for a bare `localStorage` in some places and
 * `window.localStorage` in others - the same object in a browser, but not in
 * every environment this code legitimately runs in. The contract scripts stub a
 * global `localStorage` with no `window` at all, and a guard that only knew the
 * window shape turned those runs into silent no-ops: every write "succeeded"
 * without storing anything, which is the exact failure this file exists to
 * prevent, wearing a different coat.
 */
function resolveStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  const scoped = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (scoped) return scoped;
  const bare = (globalThis as { localStorage?: Storage }).localStorage;
  return bare || null;
}

function dispatch(name: string, detail: LocalWriteFailure | null) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
