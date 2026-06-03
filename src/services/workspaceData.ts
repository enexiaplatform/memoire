import { loadAccounts, type AccountMemoryRecord } from './accountStore';
import { loadActionOutcomes, type ActionOutcomeRecord } from './actionOutcomeStore';
import { loadObjections, type ObjectionRecord } from './objectionStore';
import { loadOpportunities, type CrmLiteOpportunity } from './opportunityStore';
import { canUsePipelineDefenseCloudStore, loadCloudBriefs } from './pipelineDefenseCloudStore';
import { loadSalesActivities, type SalesActivityRecord } from './salesActivityStore';
import { loadSalesAssets, type SalesAssetRecord } from './salesAssetStore';
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

export type SalesWorkspaceData = {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  accounts: AccountMemoryRecord[];
  briefs: PipelineDefenseBrief[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  actionOutcomes: ActionOutcomeRecord[];
  assets: SalesAssetRecord[];
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

  const promise = Promise.all([
    loadSalesActivities(userId),
    loadOpportunities(userId),
    loadAccounts(userId),
    loadPipelineBriefs(userId),
    loadObjections(userId),
    loadStakeholders(userId),
  ]).then(([activities, opportunities, accounts, briefs, objections, stakeholders]) => ({
    activities,
    opportunities,
    accounts,
    briefs,
    objections,
    stakeholders,
    actionOutcomes: loadActionOutcomes(),
    assets: loadSalesAssets(),
  }));

  setCachedWorkspacePromise(cacheKey, promise);

  const value = await promise.catch((error) => {
    invalidateWorkspaceDataCache();
    throw error;
  });
  setCachedWorkspaceValue(cacheKey, value);
  return value;
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
