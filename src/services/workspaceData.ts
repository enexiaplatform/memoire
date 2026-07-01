import { loadAccounts, type AccountMemoryRecord } from './accountStore';
import { loadActionOutcomes, loadActionOutcomesForUser, type ActionOutcomeRecord } from './actionOutcomeStore';
import { loadObjections, type ObjectionRecord } from './objectionStore';
import { loadOpportunityOutcomes, loadOpportunityOutcomesForUser, type OpportunityOutcomeRecord } from './opportunityOutcomeStore';
import { loadOpportunities, type CrmLiteOpportunity } from './opportunityStore';
import { loadOperatingContext, type OperatingContextRecord } from './operatingContextStore';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from './pipelineDefenseCloudStore';
import { loadQuotes, loadQuotesForUser, type QuoteRecord } from './quoteStore';
import { loadSalesActivities, type SalesActivityRecord } from './salesActivityStore';
import { loadSalesAssets, loadSalesAssetsForUser, type SalesAssetRecord } from './salesAssetStore';
import { loadStakeholders, type StakeholderRecord } from './stakeholderStore';
import type { PipelineDefenseBrief } from '../utils/pipelineDefenseStorage';
import { loadPipelineDefenseBriefStore } from '../utils/pipelineDefenseStorage';
import {
  getCachedWorkspacePromise,
  getCachedWorkspaceValue,
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
  operatingContext: OperatingContextRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
};

type LoadOptions = {
  force?: boolean;
};

export async function loadSalesWorkspaceData(userId?: string | null, options: LoadOptions = {}): Promise<SalesWorkspaceData> {
  const cacheKey = `sales-workspace:${userId || 'local'}`;
  if (!options.force) {
    const cached = getCachedWorkspaceValue<SalesWorkspaceData>(cacheKey);
    if (cached) return cached;

    const pending = getCachedWorkspacePromise<SalesWorkspaceData>(cacheKey);
    if (pending) return pending;
  }

  if (userId) beginWorkspaceSyncCheck();

  const promise = Promise.all([
    loadSalesActivities(userId),
    loadOpportunities(userId),
    loadAccounts(userId),
    loadPipelineBriefs(userId),
    loadObjections(userId),
    loadStakeholders(userId),
    userId ? loadActionOutcomesForUser(userId) : Promise.resolve(loadActionOutcomes()),
    userId ? loadSalesAssetsForUser(userId) : Promise.resolve(loadSalesAssets()),
    userId ? loadQuotesForUser(userId) : Promise.resolve(loadQuotes()),
    loadOperatingContext(userId),
    userId ? loadOpportunityOutcomesForUser(userId) : Promise.resolve(loadOpportunityOutcomes()),
  ]).then(([activities, opportunities, accounts, briefs, objections, stakeholders, actionOutcomes, assets, quotes, operatingContext, opportunityOutcomes]) => {
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
      operatingContext,
      opportunityOutcomes,
    };
  });

  setCachedWorkspacePromise(cacheKey, promise);

  const value = await promise.catch((error) => {
    invalidateWorkspaceDataCache();
    if (userId) reportWorkspaceSyncError();
    throw error;
  });
  setCachedWorkspaceValue(cacheKey, value);
  return value;
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
