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
  getWorkspaceDataGeneration,
  invalidateWorkspaceDataCache,
  setCachedWorkspacePromise,
  setCachedWorkspaceValue,
} from './workspaceDataCache';
import {
  beginWorkspaceSyncCheck,
  getWorkspaceSyncStatus,
  reportWorkspaceSyncError,
  reportWorkspaceSyncReady,
} from './workspaceSyncStatus';

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

export async function loadSalesWorkspaceData(userId?: string | null, options: LoadOptions = {}): Promise<SalesWorkspaceData> {
  const cacheKey = `sales-workspace:${userId || 'local'}`;
  if (!options.force) {
    const cached = getCachedWorkspaceValue<SalesWorkspaceData>(cacheKey);
    if (cached) return cached;

    const pending = getCachedWorkspacePromise<SalesWorkspaceData>(cacheKey);
    if (pending) return pending;
  }

  if (userId) beginWorkspaceSyncCheck();

  const generationAtLoadStart = getWorkspaceDataGeneration();
  // Which of the sixteen loaders have not answered yet. When the watchdog below
  // gives up, this is the difference between "the workspace is slow" and a
  // named store to go and look at.
  const unsettled = new Set<string>();
  const track = <T,>(name: string, loader: Promise<T>): Promise<T> => {
    unsettled.add(name);
    return loader.finally(() => unsettled.delete(name));
  };

  const cloudLoad = Promise.all([
    track('activities', loadSalesActivities(userId)),
    track('opportunities', loadOpportunities(userId)),
    track('accounts', loadAccounts(userId)),
    track('briefs', loadPipelineBriefs(userId)),
    track('objections', loadObjections(userId)),
    track('stakeholders', loadStakeholders(userId)),
    track('actionOutcomes', userId ? loadActionOutcomesForUser(userId) : Promise.resolve(loadActionOutcomes())),
    track('assets', userId ? loadSalesAssetsForUser(userId) : Promise.resolve(loadSalesAssets())),
    track('quotes', userId ? loadQuotesForUser(userId) : Promise.resolve(loadQuotes())),
    track('operatingContext', loadOperatingContext(userId)),
    track('opportunityOutcomes', userId ? loadOpportunityOutcomesForUser(userId) : Promise.resolve(loadOpportunityOutcomes())),
    track('expenses', userId ? loadExpensesForUser(userId) : Promise.resolve(loadExpenses())),
    track('commitments', loadCommitmentsForWorkspace(userId)),
    track('threads', loadThreadsForWorkspace(userId)),
    track('valueOutcomes', loadValueOutcomesForWorkspace(userId)),
    track('accountMerges', loadAccountMergesForWorkspace(userId)),
  ]).then(([activities, opportunities, accounts, briefs, objections, stakeholders, actionOutcomes, assets, quotes, operatingContext, opportunityOutcomes, expenses, commitments, threads, valueOutcomes, accountMerges]) => {
    if (userId && getWorkspaceSyncStatus().state !== 'error') reportWorkspaceSyncReady();
    return {
      activities,
      opportunities,
      accounts,
      briefs,
      objections,
      stakeholders,
      actionOutcomes,
      assets,
      quotes,
      expenses,
      operatingContext,
      opportunityOutcomes,
      commitments,
      threads,
      valueOutcomes,
      accountMerges,
    };
  });

  // A cloud load that finishes after the watchdog gave up still holds the
  // freshest answer, so it fills the cache for the next reader instead of being
  // thrown away.
  const tracked = cloudLoad.then(
    (value) => {
      setCachedWorkspaceValue(cacheKey, value, generationAtLoadStart);
      return value;
    },
    (error) => {
      invalidateWorkspaceDataCache();
      if (userId) reportWorkspaceSyncError();
      throw error;
    },
  );

  const promise = userId ? withLocalFallback(tracked, unsettled) : tracked;
  setCachedWorkspacePromise(cacheKey, promise);

  try {
    return await promise;
  } finally {
    clearCachedWorkspacePromise(cacheKey, promise);
  }
}

/**
 * Resolves with the browser copy if the cloud load has not answered in time.
 *
 * The cloud load is not cancelled - it may still finish and populate the cache
 * for the next reader. What it loses is the right to keep the screen waiting.
 */
function withLocalFallback(
  cloudLoad: Promise<SalesWorkspaceData>,
  unsettled: Set<string>,
): Promise<SalesWorkspaceData> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(
        `[Memoire] Cloud workspace load exceeded ${WORKSPACE_LOAD_TIMEOUT_MS}ms; showing the browser copy. Still waiting on: ${
          Array.from(unsettled).join(', ') || 'nothing (the merge itself stalled)'
        }`,
      );
      reportWorkspaceSyncError('Cloud sync did not answer. Showing this browser\'s copy.');
      loadSalesWorkspaceData(null).then(resolve, reject);
    }, WORKSPACE_LOAD_TIMEOUT_MS);

    cloudLoad.then(
      (value) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(error);
      },
    );
  });
}

export function getCachedSalesWorkspaceData(userId?: string | null) {
  return getCachedWorkspaceValue<SalesWorkspaceData>(`sales-workspace:${userId || 'local'}`);
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
