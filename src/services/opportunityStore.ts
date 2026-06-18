import { supabaseClient } from '../lib/supabaseClient';
import { invalidateWorkspaceDataCache } from './workspaceDataCache';
import { reportWorkspaceSyncError } from './workspaceSyncStatus';

export const OPPORTUNITY_STORAGE_KEY = 'memoire.opportunities.v1';

export const opportunityStages = [
  'Lead',
  'Discovery',
  'Qualification',
  'Technical discussion',
  'Demo',
  'Proposal',
  'Negotiation',
  'Procurement',
  'Won',
  'Lost',
  'On hold',
] as const;

export const forecastEvidenceCategories = [
  'Defensible',
  'Weak but recoverable',
  'Hope-based',
  'Unsupported',
] as const;

export const decisionRecommendations = [
  'Defend',
  'Downgrade',
  'Rescue',
  'Monitor',
  'Deprioritize',
] as const;

export const opportunityStatuses = ['Active', 'Won', 'Lost', 'On hold'] as const;

export type OpportunityStage = (typeof opportunityStages)[number];
export type ForecastEvidenceCategory = (typeof forecastEvidenceCategories)[number];
export type DecisionRecommendation = (typeof decisionRecommendations)[number];
export type OpportunityStatus = (typeof opportunityStatuses)[number];

export interface CrmLiteOpportunity {
  id: string;
  userId?: string;
  source?: 'demo' | 'user';
  isSample?: boolean;
  accountName: string;
  opportunityName: string;
  stage: OpportunityStage;
  estimatedValue: number | null;
  currency: string;
  expectedClosePeriod: string;
  productOrSolution: string;
  decisionMaker: string;
  budgetOwner: string;
  procurementPath: string;
  technicalCriteria: string;
  nextAction: string;
  nextActionDate: string;
  evidence: string;
  missingContext: string;
  objectionDebt: string;
  forecastEvidenceCategory: ForecastEvidenceCategory;
  decisionRecommendation: DecisionRecommendation;
  status: OpportunityStatus;
  brand?: string;
  channel?: string;
  opportunityType?: string;
  fy26Value?: number | null;
  fy27Value?: number | null;
  quarterValues?: Record<string, unknown>;
  forecastMetadata?: Record<string, unknown>;
  pipelineProbability?: number | null;
  isStageInferred?: boolean;
  sourceStageConfidence?: string;
  sourceSystem?: string;
  externalSourceKey?: string;
  createdAt: string;
  updatedAt: string;
  storageMode: 'local' | 'cloud';
}

export type OpportunityFormInput = Omit<CrmLiteOpportunity, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'storageMode' | 'source' | 'isSample'>;

type OpportunityRow = {
  id: string;
  user_id: string;
  account_id?: string | null;
  account_name: string | null;
  opportunity_name: string | null;
  title?: string | null;
  account?: {
    id: string;
    name?: string | null;
    account_name?: string | null;
  } | null;
  stage: string | null;
  estimated_value: number | string | null;
  currency: string | null;
  expected_close_period: string | null;
  product_or_solution: string | null;
  decision_maker: string | null;
  budget_owner: string | null;
  procurement_path: string | null;
  technical_criteria: string | null;
  next_action: string | null;
  next_action_text?: string | null;
  next_action_date: string | null;
  evidence: string | null;
  missing_context: string | null;
  objection_debt: string | null;
  blocker?: string | null;
  forecast_evidence_category: string | null;
  decision_recommendation: string | null;
  status: string | null;
  brand?: string | null;
  channel?: string | null;
  opportunity_type?: string | null;
  fy26_value?: number | string | null;
  fy27_value?: number | string | null;
  quarter_values?: Record<string, unknown> | null;
  forecast_metadata?: Record<string, unknown> | null;
  pipeline_probability?: number | string | null;
  is_stage_inferred?: boolean | null;
  source_stage_confidence?: string | null;
  source_system?: string | null;
  external_source_key?: string | null;
  created_at: string;
  updated_at: string;
};

const TABLE_NAME = 'opportunities';

export const emptyOpportunityInput: OpportunityFormInput = {
  accountName: '',
  opportunityName: '',
  stage: 'Discovery',
  estimatedValue: null,
  currency: 'VND',
  expectedClosePeriod: '',
  productOrSolution: '',
  decisionMaker: '',
  budgetOwner: '',
  procurementPath: '',
  technicalCriteria: '',
  nextAction: '',
  nextActionDate: '',
  evidence: '',
  missingContext: '',
  objectionDebt: '',
  forecastEvidenceCategory: 'Weak but recoverable',
  decisionRecommendation: 'Monitor',
  status: 'Active',
};

export function canUseOpportunityCloudStore(userId?: string | null) {
  return Boolean(userId && supabaseClient);
}

export async function loadOpportunities(userId?: string | null): Promise<CrmLiteOpportunity[]> {
  if (canUseOpportunityCloudStore(userId)) {
    try {
      return await loadCloudOpportunities(userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      debugOpportunityStore('cloud load failed; falling back to local', { message: getErrorMessage(error) });
      return loadLocalOpportunities();
    }
  }

  return loadLocalOpportunities();
}

export async function createOpportunity(
  input: OpportunityFormInput,
  userId?: string | null
): Promise<{ opportunity: CrmLiteOpportunity; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeOpportunityInput(input);

  if (canUseOpportunityCloudStore(userId)) {
    try {
      const opportunity = await createCloudOpportunity(normalized, userId as string);
      saveLocalOpportunityRecord({ ...opportunity, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { opportunity, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const opportunity = createLocalOpportunity(normalized, userId || undefined);
      saveLocalOpportunityRecord(opportunity);
      invalidateWorkspaceDataCache();
      debugOpportunityStore('cloud create failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        opportunity,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
      };
    }
  }

  const opportunity = createLocalOpportunity(normalized, userId || undefined);
  saveLocalOpportunityRecord(opportunity);
  invalidateWorkspaceDataCache();
  return { opportunity, mode: 'local' };
}

export async function updateOpportunity(
  opportunity: CrmLiteOpportunity,
  input: OpportunityFormInput,
  userId?: string | null
): Promise<{ opportunity: CrmLiteOpportunity; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeOpportunityInput(input);

  if (opportunity.storageMode === 'cloud' && canUseOpportunityCloudStore(userId)) {
    try {
      const updated = await updateCloudOpportunity(opportunity.id, normalized, userId as string);
      saveLocalOpportunityRecord({ ...updated, storageMode: 'local' });
      invalidateWorkspaceDataCache();
      return { opportunity: updated, mode: 'cloud' };
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = {
        ...opportunity,
        ...normalized,
        updatedAt: new Date().toISOString(),
        storageMode: 'local' as const,
      };
      saveLocalOpportunityRecord(localCopy);
      invalidateWorkspaceDataCache();
      debugOpportunityStore('cloud update failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        opportunity: localCopy,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
      };
    }
  }

  const updated = {
    ...opportunity,
    ...normalized,
    updatedAt: new Date().toISOString(),
    storageMode: 'local' as const,
  };
  saveLocalOpportunityRecord(updated);
  invalidateWorkspaceDataCache();
  return { opportunity: updated, mode: 'local' };
}

export async function deleteOpportunity(opportunity: CrmLiteOpportunity, userId?: string | null) {
  if (opportunity.storageMode === 'cloud' && canUseOpportunityCloudStore(userId)) {
    const { error } = await supabaseClient!
      .from(TABLE_NAME)
      .delete()
      .eq('id', opportunity.id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
  }

  deleteLocalOpportunity(opportunity.id);
  invalidateWorkspaceDataCache();
}

export function opportunityToFormInput(opportunity: CrmLiteOpportunity): OpportunityFormInput {
  return {
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    stage: opportunity.stage,
    estimatedValue: opportunity.estimatedValue,
    currency: opportunity.currency,
    expectedClosePeriod: opportunity.expectedClosePeriod,
    productOrSolution: opportunity.productOrSolution,
    decisionMaker: opportunity.decisionMaker,
    budgetOwner: opportunity.budgetOwner,
    procurementPath: opportunity.procurementPath,
    technicalCriteria: opportunity.technicalCriteria,
    nextAction: opportunity.nextAction,
    nextActionDate: opportunity.nextActionDate,
    evidence: opportunity.evidence,
    missingContext: opportunity.missingContext,
    objectionDebt: opportunity.objectionDebt,
    forecastEvidenceCategory: opportunity.forecastEvidenceCategory,
    decisionRecommendation: opportunity.decisionRecommendation,
    status: opportunity.status,
  };
}

function loadLocalOpportunities(): CrmLiteOpportunity[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(OPPORTUNITY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<CrmLiteOpportunity>[];
    return parsed
      .filter((item) => item.id && item.accountName && item.opportunityName)
      .map<CrmLiteOpportunity>((item) => ({
        id: item.id || createId(),
        userId: item.userId,
        source: normalizeSource(item.source),
        isSample: item.isSample === true,
        accountName: item.accountName || '',
        opportunityName: item.opportunityName || '',
        stage: normalizeStage(item.stage),
        estimatedValue: normalizeNumber(item.estimatedValue),
        currency: item.currency || 'VND',
        expectedClosePeriod: item.expectedClosePeriod || '',
        productOrSolution: item.productOrSolution || '',
        decisionMaker: item.decisionMaker || '',
        budgetOwner: item.budgetOwner || '',
        procurementPath: item.procurementPath || '',
        technicalCriteria: item.technicalCriteria || '',
        nextAction: item.nextAction || '',
        nextActionDate: item.nextActionDate || '',
        evidence: item.evidence || '',
        missingContext: item.missingContext || '',
        objectionDebt: item.objectionDebt || '',
        forecastEvidenceCategory: normalizeForecastCategory(item.forecastEvidenceCategory),
        decisionRecommendation: normalizeDecisionRecommendation(item.decisionRecommendation),
        status: normalizeStatus(item.status),
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
      }))
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalOpportunityRecord(record: CrmLiteOpportunity) {
  if (typeof localStorage === 'undefined') return;
  const next = [record, ...loadLocalOpportunities().filter((item) => item.id !== record.id)];
  localStorage.setItem(OPPORTUNITY_STORAGE_KEY, JSON.stringify(next.sort(sortNewestFirst)));
}

function deleteLocalOpportunity(opportunityId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalOpportunities().filter((item) => item.id !== opportunityId);
  localStorage.setItem(OPPORTUNITY_STORAGE_KEY, JSON.stringify(next));
}

async function loadCloudOpportunities(userId: string): Promise<CrmLiteOpportunity[]> {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .select('*,account:account_id(id,name,account_name)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as OpportunityRow[]).map(rowToOpportunity);
}

async function createCloudOpportunity(input: OpportunityFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .insert(opportunityToInsert(input, userId))
    .select('*')
    .single();

  if (error) {
    const fallback = await supabaseClient!
      .from(TABLE_NAME)
      .insert(opportunityToInsertWithLegacyColumns(input, userId))
      .select('*')
      .single();

    if (fallback.error) throw new Error(fallback.error.message);
    return rowToOpportunity(fallback.data as OpportunityRow);
  }

  return rowToOpportunity(data as OpportunityRow);
}

async function updateCloudOpportunity(opportunityId: string, input: OpportunityFormInput, userId: string) {
  const { data, error } = await supabaseClient!
    .from(TABLE_NAME)
    .update(opportunityToUpdate(input))
    .eq('id', opportunityId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return rowToOpportunity(data as OpportunityRow);
}

function createLocalOpportunity(input: OpportunityFormInput, userId?: string): CrmLiteOpportunity {
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: createId(),
    userId,
    source: 'user',
    isSample: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToOpportunity(row: OpportunityRow): CrmLiteOpportunity {
  const linkedAccountName = row.account?.account_name || row.account?.name || '';
  const storedAccountName = row.account_name?.trim() || '';
  const opportunityName = row.opportunity_name || row.title || '';

  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    accountName: isLegacyAccountPlaceholder(storedAccountName) ? linkedAccountName : storedAccountName || linkedAccountName,
    opportunityName,
    stage: normalizeStage(row.stage),
    estimatedValue: normalizeNumber(row.estimated_value),
    currency: row.currency || 'VND',
    expectedClosePeriod: row.expected_close_period || '',
    productOrSolution: row.product_or_solution || deriveLegacyProductOrSolution(opportunityName),
    decisionMaker: row.decision_maker || '',
    budgetOwner: row.budget_owner || '',
    procurementPath: row.procurement_path || '',
    technicalCriteria: row.technical_criteria || '',
    nextAction: row.next_action || row.next_action_text || '',
    nextActionDate: row.next_action_date || '',
    evidence: row.evidence || '',
    missingContext: row.missing_context || '',
    objectionDebt: row.objection_debt || row.blocker || '',
    forecastEvidenceCategory: normalizeForecastCategory(row.forecast_evidence_category),
    decisionRecommendation: normalizeDecisionRecommendation(row.decision_recommendation),
    status: normalizeStatus(row.status),
    brand: row.brand || '',
    channel: row.channel || '',
    opportunityType: row.opportunity_type || '',
    fy26Value: normalizeNumber(row.fy26_value),
    fy27Value: normalizeNumber(row.fy27_value),
    quarterValues: normalizeJsonObject(row.quarter_values),
    forecastMetadata: normalizeJsonObject(row.forecast_metadata),
    pipelineProbability: normalizeNumber(row.pipeline_probability),
    isStageInferred: Boolean(row.is_stage_inferred),
    sourceStageConfidence: row.source_stage_confidence || '',
    sourceSystem: row.source_system || '',
    externalSourceKey: row.external_source_key || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storageMode: 'cloud',
  };
}

function isLegacyAccountPlaceholder(value: string) {
  return !value || /^legacy account$/i.test(value) || /^unknown account$/i.test(value);
}

function deriveLegacyProductOrSolution(opportunityName: string) {
  const parts = opportunityName
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.length > 1 ? parts.slice(1).join(' / ') : '';
}

function opportunityToInsert(input: OpportunityFormInput, userId: string) {
  const timestamp = new Date().toISOString();
  return {
    ...opportunityToRow(input),
    user_id: userId,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function opportunityToInsertWithLegacyColumns(input: OpportunityFormInput, userId: string) {
  return {
    ...opportunityToInsert(input, userId),
    title: input.opportunityName,
    next_action_text: input.nextAction || null,
    blocker: input.objectionDebt || null,
  };
}

function opportunityToUpdate(input: OpportunityFormInput) {
  return {
    ...opportunityToRow(input),
    updated_at: new Date().toISOString(),
  };
}

function opportunityToRow(input: OpportunityFormInput) {
  return {
    account_name: input.accountName,
    opportunity_name: input.opportunityName,
    stage: input.stage,
    estimated_value: input.estimatedValue,
    currency: input.currency || 'VND',
    expected_close_period: input.expectedClosePeriod || null,
    product_or_solution: input.productOrSolution || null,
    decision_maker: input.decisionMaker || null,
    budget_owner: input.budgetOwner || null,
    procurement_path: input.procurementPath || null,
    technical_criteria: input.technicalCriteria || null,
    next_action: input.nextAction || null,
    next_action_date: input.nextActionDate || null,
    evidence: input.evidence || null,
    missing_context: input.missingContext || null,
    objection_debt: input.objectionDebt || null,
    forecast_evidence_category: input.forecastEvidenceCategory,
    decision_recommendation: input.decisionRecommendation,
    status: input.status,
  };
}

function normalizeOpportunityInput(input: OpportunityFormInput): OpportunityFormInput {
  return {
    ...emptyOpportunityInput,
    ...input,
    accountName: input.accountName.trim(),
    opportunityName: input.opportunityName.trim(),
    estimatedValue: normalizeNumber(input.estimatedValue),
    currency: (input.currency || 'VND').trim().toUpperCase(),
    stage: normalizeStage(input.stage),
    forecastEvidenceCategory: normalizeForecastCategory(input.forecastEvidenceCategory),
    decisionRecommendation: normalizeDecisionRecommendation(input.decisionRecommendation),
    status: normalizeStatus(input.status),
  };
}

function normalizeStage(value: unknown): OpportunityStage {
  return opportunityStages.includes(value as OpportunityStage) ? value as OpportunityStage : 'Discovery';
}

function normalizeForecastCategory(value: unknown): ForecastEvidenceCategory {
  return forecastEvidenceCategories.includes(value as ForecastEvidenceCategory) ? value as ForecastEvidenceCategory : 'Weak but recoverable';
}

function normalizeDecisionRecommendation(value: unknown): DecisionRecommendation {
  return decisionRecommendations.includes(value as DecisionRecommendation) ? value as DecisionRecommendation : 'Monitor';
}

function normalizeStatus(value: unknown): OpportunityStatus {
  return opportunityStatuses.includes(value as OpportunityStatus) ? value as OpportunityStatus : 'Active';
}

function normalizeSource(value: unknown): CrmLiteOpportunity['source'] {
  return value === 'demo' ? 'demo' : value === 'user' ? 'user' : undefined;
}

function normalizeNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sortNewestFirst(a: CrmLiteOpportunity, b: CrmLiteOpportunity) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

function debugOpportunityStore(message: string, context?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug(`[OpportunityStore] ${message}`, context || {});
  }
}
