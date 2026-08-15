import { reportClientOperationalEvent } from './clientTelemetry.ts';
import { writeLocalCollection } from './localWriteGuard.ts';

/**
 * Which account the records in this browser belong to.
 *
 * Every store writes its collection to one un-namespaced key -
 * `memoire.opportunities.v1`, `memoire.accountMerges.v1`, and so on - and
 * signing out does not clear them, because records captured offline have to
 * survive until they sync. That is correct for one person on one browser and
 * wrong the moment a second account signs in on the same one, which is the
 * normal case for a shared office machine.
 *
 * Measured on 2026-08-15: a brand-new account opened in a browser that had held
 * another workspace showed that workspace's merged customer names on Accounts,
 * listed sixteen of its deals in the quote form's opportunity picker, and
 * inherited its reporting currency. The per-collection owner keys were meant to
 * stop that, but they only gate whether local rows get *merged*, they do not
 * stop a page reading the raw collection - and different pages read different
 * paths, so the leak surfaced on some screens and not others.
 *
 * So ownership is decided once, for the whole local workspace, at the only
 * moment it can be decided safely: when a session is applied. If this browser's
 * records belong to somebody else, they are removed before anything reads them.
 * Nothing is merged, nothing is claimed field by field, and no page has to
 * remember to check.
 *
 * Records written with nobody signed in stay adoptable - that is the "try it,
 * then create an account" path, and there is no other user to take them from.
 */

export const LOCAL_WORKSPACE_OWNER_KEY = 'memoire.local-workspace-owner.v1';

/** Fired after a foreign workspace is cleared, so the shell can say what happened. */
export const LOCAL_WORKSPACE_PURGED_EVENT = 'memoire:local-workspace-purged';

/**
 * Keys that are not workspace records and must survive a change of owner.
 *
 * `memoire.supabase.` holds the Supabase session itself: purging it during
 * sign-in would sign the user straight back out. The other two are properties
 * of the device rather than of anybody's business.
 */
const DEVICE_SCOPED_PREFIXES = [
  'memoire.supabase.',
  'memoire.analytics.',
  'memoire.pipelineDefenseAuthRedirect.',
  LOCAL_WORKSPACE_OWNER_KEY,
];

export type WorkspaceClaimResult = {
  /** What happened, for logs and for the operator-facing notice. */
  outcome: 'unchanged' | 'adopted' | 'purged' | 'unavailable';
  /** The account that held these records before, when it was somebody else. */
  previousOwner: string | null;
  /** Keys removed. Empty unless `outcome` is `purged`. */
  removedKeys: string[];
};

export function getLocalWorkspaceOwner(): string | null {
  const storage = resolveStorage();
  if (!storage) return null;
  try {
    return storage.getItem(LOCAL_WORKSPACE_OWNER_KEY);
  } catch {
    return null;
  }
}

/**
 * Makes this browser's records belong to `userId`, clearing them first if they
 * belonged to a different account.
 *
 * Call it before anything reads a store. It is synchronous on purpose: the
 * stores are synchronous, and an await here is a window in which a page can
 * render somebody else's customers.
 */
export function claimLocalWorkspace(userId: string): WorkspaceClaimResult {
  const storage = resolveStorage();
  if (!storage || !userId) {
    return { outcome: 'unavailable', previousOwner: null, removedKeys: [] };
  }

  const previousOwner = getLocalWorkspaceOwner();
  if (previousOwner === userId) {
    return { outcome: 'unchanged', previousOwner, removedKeys: [] };
  }

  // No recorded owner means the records here were captured signed out, or
  // predate this key. Either way there is no other account they can be taken
  // from, so this user adopts them.
  if (!previousOwner) {
    writeLocalCollection(LOCAL_WORKSPACE_OWNER_KEY, userId);
    return { outcome: 'adopted', previousOwner: null, removedKeys: [] };
  }

  const removedKeys = purgeWorkspaceKeys(storage);
  writeLocalCollection(LOCAL_WORKSPACE_OWNER_KEY, userId);

  reportClientOperationalEvent({
    eventName: 'local_workspace_purged',
    component: 'localWorkspaceOwner',
    operation: `claim:${removedKeys.length}-keys`,
    severity: 'warning',
  });

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent(LOCAL_WORKSPACE_PURGED_EVENT, {
      detail: { removedKeyCount: removedKeys.length },
    }));
  }

  return { outcome: 'purged', previousOwner, removedKeys };
}

/**
 * Whether a stored key holds workspace records rather than device state.
 *
 * Exported so the contract test can assert the session key is never in the
 * purge set: getting that wrong signs people out instead of protecting them.
 */
export function isWorkspaceScopedKey(key: string): boolean {
  if (!key.startsWith('memoire')) return false;
  return !DEVICE_SCOPED_PREFIXES.some((prefix) => key === prefix || key.startsWith(prefix));
}

function purgeWorkspaceKeys(storage: Storage): string[] {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && isWorkspaceScopedKey(key)) doomed.push(key);
  }
  doomed.forEach((key) => {
    try {
      storage.removeItem(key);
    } catch {
      // A browser that refuses removeItem is already refusing setItem; the
      // claim below still records the new owner, and the next read finds
      // whatever this browser would not let go of.
    }
  });
  return doomed;
}

function resolveStorage(): Storage | null {
  if (typeof globalThis === 'undefined') return null;
  const scoped = (globalThis as { window?: { localStorage?: Storage } }).window?.localStorage;
  if (scoped) return scoped;
  const bare = (globalThis as { localStorage?: Storage }).localStorage;
  return bare || null;
}
