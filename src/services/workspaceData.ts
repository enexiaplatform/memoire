import { loadAccounts, type AccountMemoryRecord } from './accountStore';
import { loadAccountMergesForWorkspace, type AccountMergeRecord } from './accountMergeStore';
import { loadActionOutcomes, loadActionOutcomesForUser, type ActionOutcomeRecord } from './actionOutcomeStore';
import { loadObjections, type ObjectionRecord } from './objectionStore';
import { loadOpportunityOutcomes, loadOpportunityOutcomesForUser, type OpportunityOutcomeRecord } from './opportunityOutcomeStore';
import { loadOpportunities, type CrmLiteOpportunity } from './opportunityStore';
import { loadOperatingContext, type OperatingContextRecord } from './operatingContextStore';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from './pipelineDefenseCloudStore';
import { loadQuotes, loadQuotesForUser, type QuoteRecord } from './quoteStore';
import { loadExpenses, loadExpensesForUser, type ExpenseRecord } from './expenseStore';
import { loadSalesActivities, type SalesActivityRecord } from './salesActivityStore';
import { loadSalesAssets, loadSalesAssetsForUser, type SalesAssetRecord } from './salesAssetStore';
import { loadStakeholders, type StakeholderRecord } from './stakeholderStore';
import { loadCommitmentsForWorkspace } from './commercialKernel/commitmentStore';
import { loadThreadsForWorkspace } from './commercialKernel/threadStore';
import { loadValueOutcomesForWorkspace } from './commercialKernel/valueOutcomeStore';
import type {
  CommercialCommitment,
  CommercialThread,
  CommercialValueOutcome,
} from '../domain/commercialKernel/types';
import type { PipelineDefenseBrief } from '../utils/pipelineDefenseStorage';
import { loadPipelineDefenseBriefStore } from '../utils/pipelineDefenseStorage';
import {
  clearCachedWorkspacePromise,
  getCachedWorkspacePromise,
  getCachedWorkspaceValue,
  getWorkspaceCacheStamp,
  isCachedWorkspaceValueStale,
  setCachedWorkspacePromise,
  setCachedWorkspaceValue,
} from './workspaceDataCache';
import {
  beginWorkspaceSyncCheck,
  getWorkspaceSyncStatus,
  reportWorkspaceSyncError,
  reportWorkspaceSyncReady,
} from './workspaceSyncStatus';
import { describeLocalShortfall, isLocalCopyComplete, recordWorkspaceCensus } from './workspaceCensus';

export type SalesWorkspaceData = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  assets: SalesAssetRecord[];
  quotes: QuoteRecord[];
  expenses: ExpenseRecord[];
  operatingContext: OperatingContextRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  /**
   * Which names the user has said are the same customer. Loaded here rather
   * than per page because every surface that groups by account has to apply
   * them or it draws a merged customer twice.
   */
  accountMerges: AccountMergeRecord[];
  // Commercial Kernel. Loaded with everything else so no surface has to fetch
  // commitments separately and end up showing a different answer to "what is
  // overdue" than the surface next to it.
  commitments: CommercialCommitment[];
  threads: CommercialThread[];
  valueOutcomes: CommercialValueOutcome[];
};

type LoadOptions = {
  force?: boolean;
};

/**
 * How long a cloud workspace load may run before the browser copy is shown
 * instead.
 *
 * A skeleton that never resolves is the worst answer this screen can give: the
 * seller cannot tell whether their day is empty, slow, or lost. If the cloud has
 * not answered by now, the local copy is shown, the sync pill says the cloud is
 * unavailable, and "Cloud sync" retries - all of which are true statements the
 * seller can act on.
 */
const WORKSPACE_LOAD_TIMEOUT_MS = 20_000;

/**
 * Fired once when a cloud load finishes *after* the screen was already drawn
 * from the browser copy. Surfaces that want to catch up re-read the workspace,
 * which is a warm cache hit by then.
 */
export const WORKSPACE_REFRESHED_EVENT = 'memoire:workspace-refreshed';

/**
 * Every collection the workspace is made of, and how to fetch one.
 *
 * They are listed rather than fetched inline so each can be cached, refreshed
 * and invalidated on its own. Saving an opportunity used to clear the whole
 * cache and the next screen refetched all sixteen - including 1,083 accounts and
 * 1,738 stakeholders, about 3 MB of JSON that the edit had not touched.
 */
const collectionLoaders = {
  activities: (userId?: string | null) => loadSalesActivities(userId),
  opportunities: (userId?: string | null) => loadOpportunities(userId),
  accounts: (userId?: string | null) => loadAccounts(userId),
  briefs: (userId?: string | null) => loadPipelineBriefs(userId),
  objections: (userId?: string | null) => loadObjections(userId),
  stakeholders: (userId?: string | null) => loadStakeholders(userId),
  actionOutcomes: (userId?: string | null) =>
    (userId ? loadActionOutcomesForUser(userId) : Promise.resolve(loadActionOutcomes())),
  assets: (userId?: string | null) =>
    (userId ? loadSalesAssetsForUser(userId) : Promise.resolve(loadSalesAssets())),
  quotes: (userId?: string | null) => (userId ? loadQuotesForUser(userId) : Promise.resolve(loadQuotes())),
  operatingContext: (userId?: string | null) => loadOperatingContext(userId),
  opportunityOutcomes: (userId?: string | null) =>
    (userId ? loadOpportunityOutcomesForUser(userId) : Promise.resolve(loadOpportunityOutcomes())),
  expenses: (userId?: string | null) => (userId ? loadExpensesForUser(userId) : Promise.resolve(loadExpenses())),
  commitments: (userId?: string | null) => loadCommitmentsForWorkspace(userId),
  threads: (userId?: string | null) => loadThreadsForWorkspace(userId),
  valueOutcomes: (userId?: string | null) => loadValueOutcomesForWorkspace(userId),
  accountMerges: (userId?: string | null) => loadAccountMergesForWorkspace(userId),
} satisfies { [K in keyof SalesWorkspaceData]: (userId?: string | null) => Promise<SalesWorkspaceData[K]> };

export const WORKSPACE_COLLECTIONS = Object.keys(collectionLoaders) as (keyof SalesWorkspaceData)[];

function collectionCacheKey(userId: string | null | undefined, collection: string) {
  return `ws:${userId || 'local'}:${collection}`;
}

/**
 * One collection, from memory if it is still current and from the cloud if not.
 *
 * The pending entry is what stops a single visit to Today - which reads the
 * workspace from four places - fetching the same table four times.
 */
function loadCollection<K extends keyof SalesWorkspaceData>(
  collection: K,
  userId: string | null | undefined,
  force: boolean,
): Promise<SalesWorkspaceData[K]> {
  const key = collectionCacheKey(userId, collection);

  if (!force) {
    const cached = getCachedWorkspaceValue<SalesWorkspaceData[K]>(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = getCachedWorkspacePromise<SalesWorkspaceData[K]>(key);
    if (inFlight) return inFlight;
  }

  const stamp = getWorkspaceCacheStamp(collection);
  const loader = collectionLoaders[collection] as (id?: string | null) => Promise<SalesWorkspaceData[K]>;
  const promise = loader(userId).then((value) => {
    setCachedWorkspaceValue(key, value, stamp);
    return value;
  });

  setCachedWorkspacePromise(key, promise);
  // The catch keeps a failed collection from surfacing as an unhandled
  // rejection; the caller still sees the original failure through `promise`.
  void promise.catch(() => undefined).finally(() => clearCachedWorkspacePromise(key, promise));

  return promise;
}

export async function loadSalesWorkspaceData(userId?: string | null, options: LoadOptions = {}): Promise<SalesWorkspaceData> {
  const blobKey = collectionCacheKey(userId, 'all');

  if (!options.force) {
    const cached = getCachedSalesWorkspaceData(userId);
    if (cached) {
      // Serve from memory now, and if the entry has aged past the freshness
      // window, refresh it behind the screen so the next reader gets the newer
      // copy without anyone having waited for it.
      if (userId && isSalesWorkspaceStale(userId)) revalidateInBackground(userId);
      return cached;
    }

    const pending = getCachedWorkspacePromise<SalesWorkspaceData>(blobKey);
    if (pending) return pending;
  }

  if (userId) beginWorkspaceSyncCheck();

  // Which of the sixteen loaders have not answered yet. When the watchdog below
  // gives up, this is the difference between "the workspace is slow" and a
  // named store to go and look at.
  const unsettled = new Set<string>();
  const track = <T,>(name: string, loader: Promise<T>): Promise<T> => {
    unsettled.add(name);
    return loader.finally(() => unsettled.delete(name));
  };

  const names = WORKSPACE_COLLECTIONS;
  const cloudLoad = Promise.all(
    names.map((name) => track(name, loadCollection(name, userId, Boolean(options.force)))),
  ).then((results) => {
    if (userId && getWorkspaceSyncStatus().state !== 'error') reportWorkspaceSyncReady();
    const workspace = {} as SalesWorkspaceData;
    names.forEach((name, index) => {
      (workspace as Record<string, unknown>)[name] = results[index];
    });
    // What the cloud actually held, so the next first paint can tell a complete
    // browser copy from a fragment of one.
    if (userId) recordWorkspaceCensus(userId, workspace as unknown as Record<string, unknown>);
    return workspace;
  });

  const tracked = cloudLoad.catch((error) => {
    if (userId) reportWorkspaceSyncError();
    throw error;
  });

  const promise = userId ? withLocalFallback(tracked, unsettled, userId) : tracked;
  setCachedWorkspacePromise(blobKey, promise);

  try {
    return await promise;
  } finally {
    clearCachedWorkspacePromise(blobKey, promise);
  }
}

/**
 * How long the cloud gets to answer before the browser copy is shown instead,
 * with the cloud load continuing behind it.
 *
 * This is a first-paint budget, not a timeout. Every surface loads the whole
 * workspace as one barrier - sixteen collections, and on a real book about 3 MB
 * of JSON dominated by accounts and stakeholders - so the screen waited on the
 * slowest of sixteen round trips before it could draw anything. Measured
 * against this project's Supabase region that is ~1.3s from cold, on every
 * fresh page load, for records that had not changed since the last one.
 *
 * Splitting the *collections* was the obvious idea and is the wrong one: the
 * Today derivations read accounts and stakeholders as well as deals, so a
 * first-paint subset would draw a workspace where nobody has a champion and no
 * account has history - wrong answers, confidently rendered. Splitting on
 * *time* is safe, because the browser copy is a complete workspace that was
 * true a moment ago rather than a partial one that was never true.
 *
 * 400ms is chosen to be past a warm cloud answer (~140ms round trip) and short
 * of the point where a person decides the app is slow, so a fast connection
 * never sees the fallback at all.
 */
const FIRST_PAINT_BUDGET_MS = 400;

/**
 * Resolves with the browser copy rather than making the screen wait, and lets
 * the cloud load finish behind it.
 *
 * Two deadlines, one mechanism. At `FIRST_PAINT_BUDGET_MS` the browser copy is
 * shown *if there is one worth showing* and the cloud keeps loading into the
 * cache for the next reader. At `WORKSPACE_LOAD_TIMEOUT_MS` the cloud has
 * clearly failed, and the same fallback happens loudly - the sync pill says the
 * cloud is unavailable and "Cloud sync" retries.
 *
 * The "worth showing" test matters more than the timing, and "any record at all"
 * was not it. Nothing mirrors a cloud load back into localStorage - only records
 * created or edited on this device are written there - so a signed-in seller's
 * browser copy is a handful of recent edits, not a workspace. That test passed
 * for a copy holding eleven of 126 deals and no accounts or stakeholders at all,
 * and the screen then held that fragment for the rest of the session while every
 * request behind it returned 200. `isLocalCopyComplete` compares the copy against
 * what the cloud was last seen to hold; short of that, the screen waits.
 */
function withLocalFallback(
  cloudLoad: Promise<SalesWorkspaceData>,
  unsettled: Set<string>,
  userId: string,
): Promise<SalesWorkspaceData> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const firstPaint = setTimeout(() => {
      if (settled) return;
      void loadSalesWorkspaceData(null).then((local) => {
        if (settled) return;
        if (!isLocalCopyComplete(userId, local as unknown as Record<string, unknown>)) {
          if (import.meta.env.DEV) {
            console.debug(
              '[Memoire] First paint waited for the cloud; the browser copy is short on:',
              describeLocalShortfall(userId, local as unknown as Record<string, unknown>),
            );
          }
          return;
        }
        settled = true;
        clearTimeout(timer);
        // Deliberately quiet: nothing has gone wrong. The cloud load is still
        // running and fills the per-collection cache behind this screen;
        // announcing a sync problem here would train the operator to distrust a
        // pill that is usually right.
        //
        // When it lands, say so once. Without this the operator sits on a
        // workspace that was true a moment ago and never sees it catch up until
        // they navigate - which is the difference between "fast" and "stale".
        void cloudLoad.then(() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(WORKSPACE_REFRESHED_EVENT, { detail: { userId } }));
          }
        }).catch(() => undefined);
        resolve(local);
      }).catch(() => undefined);
    }, FIRST_PAINT_BUDGET_MS);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearTimeout(firstPaint);
      console.warn(
        `[Memoire] Cloud workspace load exceeded ${WORKSPACE_LOAD_TIMEOUT_MS}ms; showing the browser copy. Still waiting on: ${
          Array.from(unsettled).join(', ') || 'nothing (the merge itself stalled)'
        }`,
      );
      loadSalesWorkspaceData(null).then((local) => {
        // A red pill above a screen reading "0 accounts" is still a screen that
        // says the business is gone, and a seller reads the number before the
        // pill. An incomplete copy is refused and the surface reports a failed
        // load instead, which is the true statement.
        if (!isLocalCopyComplete(userId, local as unknown as Record<string, unknown>)) {
          reportWorkspaceSyncError('Cloud sync did not answer, and this browser does not hold a full copy.');
          reject(new Error(
            'Cloud sync did not answer and this browser only holds part of your workspace, '
            + 'so Memoire will not show a partial one. Check your connection and try again.',
          ));
          return;
        }
        reportWorkspaceSyncError('Cloud sync did not answer. Showing this browser\'s copy.');
        resolve(local);
      }, reject);
    }, WORKSPACE_LOAD_TIMEOUT_MS);

    cloudLoad.then(
      (value) => {
        clearTimeout(timer);
        clearTimeout(firstPaint);
        if (settled) return;
        settled = true;
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        clearTimeout(firstPaint);
        if (settled) return;
        settled = true;
        reject(error);
      },
    );
  });
}

/**
 * Refreshes an aged cache entry without anyone waiting on it.
 *
 * `inFlightRevalidation` is not an optimisation either: without it, every
 * surface that reads a stale entry - and a single visit to Today reads it from
 * four places - would start its own refresh, which is the fan-out this whole
 * cache exists to prevent.
 */
const inFlightRevalidation = new Set<string>();

function revalidateInBackground(userId: string) {
  if (inFlightRevalidation.has(userId)) return;
  inFlightRevalidation.add(userId);
  void loadSalesWorkspaceData(userId, { force: true })
    .catch(() => {
      // The served copy stands. A failed refresh is already reported through
      // the sync status by the load itself.
    })
    .finally(() => {
      inFlightRevalidation.delete(userId);
    });
}

/**
 * The workspace, only if every collection in it is still cached.
 *
 * Assembled rather than stored as one blob so that saving a quote does not cost
 * the seller their cached accounts. A partial answer is never returned: a screen
 * drawn from twelve fresh collections and four missing ones would show a deal
 * with no account and an empty commitment list, which reads as data loss.
 */
export function getCachedSalesWorkspaceData(userId?: string | null): SalesWorkspaceData | null {
  const workspace = {} as SalesWorkspaceData;
  for (const name of WORKSPACE_COLLECTIONS) {
    const value = getCachedWorkspaceValue<unknown>(collectionCacheKey(userId, name));
    if (value === null) return null;
    (workspace as Record<string, unknown>)[name] = value;
  }
  return workspace;
}

/** True when any collection has aged past the freshness window. */
function isSalesWorkspaceStale(userId?: string | null) {
  return WORKSPACE_COLLECTIONS.some((name) => isCachedWorkspaceValueStale(collectionCacheKey(userId, name)));
}

async function loadPipelineBriefs(userId?: string | null) {
  if (userId && canUsePipelineDefenseCloudStore()) {
    try {
      return await loadCloudBriefs(userId as string);
    } catch {
      return loadPipelineDefenseBriefStore().briefs;
    }
  }

  return loadPipelineDefenseBriefStore().briefs;
}
