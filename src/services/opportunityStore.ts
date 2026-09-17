import { supabaseClient } from '../lib/supabaseClient.ts';
import { invalidateWorkspaceCollection } from './workspaceDataCache.ts';
import { reportWorkspaceSyncError } from './workspaceSyncStatus.ts';
import { sanitizeBusinessDate } from '../utils/safeDate.ts';
import { reconcileOpportunityOutcome } from '../utils/opportunityOutcome.ts';
import { requireLocalWrite, writeLocalRecords } from './localWriteGuard.ts';
import { fetchAllRows } from './supabasePaging.ts';
import { recordOpportunityStateChanges } from '../domain/commercialKernel/opportunityChanges.ts';

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
  /**
   * The day the deal was won or lost, when that is known from outside the app.
   *
   * A deal closed inside Memoire records its date on its outcome retro. A book
   * that arrived by CSV - which is every new operator's first day - had
   * nowhere to put one, so the order book fell through to the record's last
   * edit and dated a whole year's business at the import. Optional, and read
   * only when set.
   */
  closedOn?: string;
  evidence: string;
  missingContext: string;
  objectionDebt: string;
  /**
   * How the lead arrived, from the controlled list in utils/leadQueue.ts.
   *
   * Additive and optional, and deliberately a new field rather than a rename of
   * `channel`. `channel`, `opportunityType` and `sourceSystem` already carry
   * acquisition context on every imported book, and rewriting them would be a
   * migration over somebody's data to satisfy a vocabulary. `resolveLeadSource`
   * reads this first and falls back to those three, so an imported lead reports
   * a source on the day this ships with nothing re-entered.
   */
  leadSource?: string;
  /** The free-text qualifier: "Pharmedi 2026", "Samil / Mr Kim". */
  leadSourceDetail?: string;
  /**
   * The day a nurtured lead comes back.
   *
   * Nurture is the third answer a lead needs and the only one that had no home:
   * qualify and disqualify both already existed as stage and status moves, and
   * "good prospect, wrong year" had to be written as either a lie (disqualified)
   * or nothing (left to rot in the queue). Set means parked; the queue brings it
   * back on its own as the date approaches.
   *
   * Deliberately not a plan item or a commitment. The commitment ledger has one
   * writer by design, and a promise to yourself to look at a lead in December is
   * not a commercial commitment to anybody.
   */
  nurturedUntil?: string;
  /** Why it is parked. Optional - "budget next FY" is worth a sentence. */
  nurtureReason?: string;
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
  closed_on?: string | null;
  evidence: string | null;
  missing_context: string | null;
  objection_debt: string | null;
  lead_source?: string | null;
  lead_source_detail?: string | null;
  nurtured_until?: string | null;
  nurture_reason?: string | null;
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
  brand: '',
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

export type OpportunityWorkspaceTag = { source: 'demo' | 'user'; isSample: boolean };

export async function createOpportunity(
  input: OpportunityFormInput,
  userId: string | null | undefined,
  workspace: OpportunityWorkspaceTag,
): Promise<{ opportunity: CrmLiteOpportunity; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeOpportunityInput(input);

  // Workspace isolation is explicit and takes precedence over signed-in identity.
  const sample = workspace.isSample || workspace.source === 'demo';
  const tag: OpportunityWorkspaceTag = { source: sample ? 'demo' : 'user', isSample: sample };
  if (!sample && canUseOpportunityCloudStore(userId)) {
    let opportunity: CrmLiteOpportunity;
    try {
      opportunity = await createCloudOpportunity(normalized, userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      const opportunity = createLocalOpportunity(normalized, userId || undefined, tag);
      saveLocalOpportunityRecord(opportunity);
      invalidateWorkspaceCollection('opportunities');
      debugOpportunityStore('cloud create failed; local copy preserved', { message: getErrorMessage(error) });
      return {
        opportunity,
        mode: 'local',
        warning: 'Cloud sync issue - your local copy is preserved.',
      };
    }
    const warning = mirrorCloudOpportunity(opportunity);
    invalidateWorkspaceCollection('opportunities');
    return { opportunity, mode: 'cloud', warning };
  }

  const opportunity = createLocalOpportunity(normalized, sample ? undefined : userId || undefined, tag);
  saveLocalOpportunityRecord(opportunity);
  invalidateWorkspaceCollection('opportunities');
  return { opportunity, mode: 'local' };
}

export async function updateOpportunity(
  opportunity: CrmLiteOpportunity,
  input: OpportunityFormInput,
  userId?: string | null
): Promise<{ opportunity: CrmLiteOpportunity; mode: 'local' | 'cloud'; warning?: string }> {
  const normalized = normalizeOpportunityInput(input);

  /**
   * Notes which of the four watched fields actually moved.
   *
   * Called after the record is safely written, never before: the edit is the
   * canonical act, and history that fails to record must not take the operator's
   * change with it. `updated_at` moves on every save and can never answer "what
   * changed" - this is the only moment the previous value still exists.
   */
  const noteObservedChanges = () => {
    try {
      recordOpportunityStateChanges(
        { userId: userId ?? null, sampleDataActive: opportunity.isSample === true },
        opportunity,
        normalized,
      );
    } catch (error) {
      reportWorkspaceSyncError();
      debugOpportunityStore('state saved but history append failed', { message: getErrorMessage(error) });
      return 'The opportunity was saved, but its change history could not be saved. Do not repeat the state change.';
    }
  };

  if (!opportunity.isSample && opportunity.source !== 'demo' && opportunity.storageMode === 'cloud' && canUseOpportunityCloudStore(userId)) {
    let updated: CrmLiteOpportunity;
    try {
      updated = await updateCloudOpportunity(opportunity.id, normalized, userId as string);
    } catch (error) {
      reportWorkspaceSyncError();
      const localCopy = {
        ...opportunity,
        ...normalized,
        updatedAt: new Date().toISOString(),
        storageMode: 'local' as const,
      };
      saveLocalOpportunityRecord(localCopy);
      invalidateWorkspaceCollection('opportunities');
      debugOpportunityStore('cloud update failed; local copy preserved', { message: getErrorMessage(error) });
      const historyWarning = noteObservedChanges();
      return {
        opportunity: localCopy,
        mode: 'local',
        warning: ['Cloud sync issue - your local copy is preserved.', historyWarning].filter(Boolean).join(' '),
      };
    }
    // A refused browser mirror must not turn an accepted cloud write into a
    // failure or a second mutation. Cloud is authoritative on this branch.
    const mirrorWarning = mirrorCloudOpportunity(updated);
    invalidateWorkspaceCollection('opportunities');
    const historyWarning = noteObservedChanges();
    return { opportunity: updated, mode: 'cloud', warning: [mirrorWarning, historyWarning].filter(Boolean).join(' ') || undefined };
  }

  const updated = {
    ...opportunity,
    ...normalized,
    updatedAt: new Date().toISOString(),
    storageMode: 'local' as const,
  };
  saveLocalOpportunityRecord(updated);
  invalidateWorkspaceCollection('opportunities');
  const warning = noteObservedChanges();
  return { opportunity: updated, mode: 'local', warning };
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
  invalidateWorkspaceCollection('opportunities');
}

/**
 * A saved deal, as the input that would re-save it unchanged.
 *
 * Written as a copy with metadata removed rather than as a list of fields.
 * That is the whole point of it.
 *
 * This function used to name twenty fields by hand, which meant it carried
 * twenty of the thirty-odd a deal has. Everything it did not name was blanked
 * on every cloud save that went through it - and four of the app's write paths
 * go through it, including dragging a deal to another day on the plan board and
 * ticking a follow-up on Today. `closed_on`, written by `opportunityToRow` and
 * absent here, was being nulled by a drag; the brand had already been fixed the
 * same way once, one field at a time.
 *
 * Copying the record cannot forget a field. `OpportunityFormInput` is the
 * record minus its identity and storage columns, so removing exactly those and
 * keeping the rest is the definition restated in code rather than a list that
 * has to be maintained beside it.
 */
export function opportunityToFormInput(opportunity: CrmLiteOpportunity): OpportunityFormInput {
  const input = { ...opportunity };
  for (const key of ['id', 'userId', 'createdAt', 'updatedAt', 'storageMode', 'source', 'isSample']) {
    Reflect.deleteProperty(input, key);
  }
  return {
    ...input,
    // Normalised rather than carried raw: an undefined brand on an imported
    // deal has to reach the editor as an empty string, or the controlled input
    // it feeds flips from uncontrolled to controlled on first keystroke.
    brand: opportunity.brand || '',
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
      .map<CrmLiteOpportunity>((item) => {
        const outcome = reconciledOutcome(item.stage, item.status);
        return {
        id: item.id || createId(),
        userId: item.userId,
        source: normalizeSource(item.source),
        isSample: item.isSample === true,
        accountName: item.accountName || '',
        opportunityName: item.opportunityName || '',
        stage: outcome.stage,
        estimatedValue: normalizeNumber(item.estimatedValue),
        currency: item.currency || 'VND',
        expectedClosePeriod: item.expectedClosePeriod || '',
        productOrSolution: item.productOrSolution || '',
        decisionMaker: item.decisionMaker || '',
        budgetOwner: item.budgetOwner || '',
        procurementPath: item.procurementPath || '',
        technicalCriteria: item.technicalCriteria || '',
        nextAction: item.nextAction || '',
        nextActionDate: sanitizeBusinessDate(item.nextActionDate),
        evidence: item.evidence || '',
        missingContext: item.missingContext || '',
        objectionDebt: item.objectionDebt || '',
        // The lead fields. Read here as well as in the cloud reader for the
        // reason written at length above: this reader rebuilds the whole local
        // mirror, so a field it forgets is deleted from every record on the
        // device the next time any one of them is edited.
        leadSource: item.leadSource || '',
        leadSourceDetail: item.leadSourceDetail || '',
        nurturedUntil: sanitizeBusinessDate(item.nurturedUntil || '') || '',
        nurtureReason: item.nurtureReason || '',
        forecastEvidenceCategory: normalizeForecastCategory(item.forecastEvidenceCategory),
        decisionRecommendation: normalizeDecisionRecommendation(item.decisionRecommendation),
        status: outcome.status,
        /*
         * The day it closed - the third field this reader has silently dropped,
         * and the one with the loudest consequence.
         *
         * `closedOn` exists because an imported book had nowhere to record when
         * a deal was actually won, so the order book fell through to the
         * record's last edit and dated a whole year's business at the moment of
         * import. Omitting it here reintroduced exactly that: every local read
         * returned a deal with no close date, the outcome derivation fell back
         * to `updatedAt`, and Review's headline counted five deals closed
         * "this week" that had closed in three different months.
         *
         * Worse, `saveLocalOpportunityRecord` rebuilds the whole mirror from
         * this reader, so editing one deal erased the close date from every
         * other deal on the device. See the note below about brand and
         * probability - same reader, same shape of bug, same year.
         */
        closedOn: sanitizeBusinessDate(item.closedOn || '') || undefined,
        // The imported dimensions. These were absent here while the cloud
        // reader carried all of them, so every local read quietly returned a
        // thinner opportunity than the one that was stored - and because
        // saveLocalOpportunityRecord rebuilds the file from this reader,
        // editing one deal stripped brand, probability and quarter values from
        // every other deal in the mirror. Nothing warned: the fields simply
        // stopped existing, so the order book saw no committed deals and the
        // brand rollup saw no brands.
        brand: item.brand || '',
        channel: item.channel || '',
        opportunityType: item.opportunityType || '',
        fy26Value: normalizeNumber(item.fy26Value),
        fy27Value: normalizeNumber(item.fy27Value),
        quarterValues: item.quarterValues,
        forecastMetadata: item.forecastMetadata,
        pipelineProbability: normalizeNumber(item.pipelineProbability),
        isStageInferred: item.isStageInferred === true,
        sourceStageConfidence: item.sourceStageConfidence || '',
        sourceSystem: item.sourceSystem || '',
        externalSourceKey: item.externalSourceKey || '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
        storageMode: 'local',
        };
      })
      .sort(sortNewestFirst);
  } catch {
    return [];
  }
}

function saveLocalOpportunityRecord(record: CrmLiteOpportunity) {
  const next = [record, ...loadLocalOpportunities().filter((item) => item.id !== record.id)];
  requireLocalWrite(writeLocalRecords(OPPORTUNITY_STORAGE_KEY, next.sort(sortNewestFirst)));
}

function mirrorCloudOpportunity(record: CrmLiteOpportunity): string | undefined {
  try {
    saveLocalOpportunityRecord({ ...record, storageMode: 'local' });
  } catch {
    return 'Saved to your account, but the browser copy could not be saved. Offline access may be out of date.';
  }
}

function deleteLocalOpportunity(opportunityId: string) {
  if (typeof localStorage === 'undefined') return;
  const next = loadLocalOpportunities().filter((item) => item.id !== opportunityId);
  writeLocalRecords(OPPORTUNITY_STORAGE_KEY, next);
}

async function loadCloudOpportunities(userId: string): Promise<CrmLiteOpportunity[]> {
  // Paged: see `fetchAllRows`. A pipeline is not something to read the first
  // thousand of.
  const data = await fetchAllRows<OpportunityRow>((from, to) => supabaseClient!
    .from(TABLE_NAME)
    .select('*,account:account_id(id,name,account_name)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    // Total order, so paging cannot repeat or skip a deal. See `fetchAllRows`.
    .order('id', { ascending: true })
    .range(from, to) as never);

  return data.map(rowToOpportunity);
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

function createLocalOpportunity(input: OpportunityFormInput, userId: string | undefined, workspace: OpportunityWorkspaceTag): CrmLiteOpportunity {
  const timestamp = new Date().toISOString();
  return {
    ...input,
    id: createId(),
    userId,
    source: workspace.source,
    isSample: workspace.isSample,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageMode: 'local',
  };
}

function rowToOpportunity(row: OpportunityRow): CrmLiteOpportunity {
  const linkedAccountName = row.account?.account_name || row.account?.name || '';
  const storedAccountName = row.account_name?.trim() || '';
  const opportunityName = row.opportunity_name || row.title || '';
  const outcome = reconciledOutcome(row.stage, row.status);

  return {
    id: row.id,
    userId: row.user_id,
    source: 'user',
    isSample: false,
    accountName: isLegacyAccountPlaceholder(storedAccountName) ? linkedAccountName : storedAccountName || linkedAccountName,
    opportunityName,
    stage: outcome.stage,
    estimatedValue: normalizeNumber(row.estimated_value),
    currency: row.currency || 'VND',
    expectedClosePeriod: row.expected_close_period || '',
    productOrSolution: row.product_or_solution || deriveLegacyProductOrSolution(opportunityName),
    decisionMaker: row.decision_maker || '',
    budgetOwner: row.budget_owner || '',
    procurementPath: row.procurement_path || '',
    technicalCriteria: row.technical_criteria || '',
    nextAction: row.next_action || row.next_action_text || '',
    nextActionDate: sanitizeBusinessDate(row.next_action_date),
    closedOn: sanitizeBusinessDate(row.closed_on) || undefined,
    evidence: row.evidence || '',
    missingContext: row.missing_context || '',
    objectionDebt: row.objection_debt || row.blocker || '',
    leadSource: row.lead_source || '',
    leadSourceDetail: row.lead_source_detail || '',
    nurturedUntil: sanitizeBusinessDate(row.nurtured_until) || '',
    nurtureReason: row.nurture_reason || '',
    forecastEvidenceCategory: normalizeForecastCategory(row.forecast_evidence_category),
    decisionRecommendation: normalizeDecisionRecommendation(row.decision_recommendation),
    status: outcome.status,
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
    next_action_date: sanitizeBusinessDate(input.nextActionDate) || null,
    closed_on: sanitizeBusinessDate(input.closedOn || '') || null,
    evidence: input.evidence || null,
    missing_context: input.missingContext || null,
    objection_debt: input.objectionDebt || null,
    lead_source: input.leadSource?.trim() || null,
    lead_source_detail: input.leadSourceDetail?.trim() || null,
    nurtured_until: sanitizeBusinessDate(input.nurturedUntil || '') || null,
    nurture_reason: input.nurtureReason?.trim() || null,
    forecast_evidence_category: input.forecastEvidenceCategory,
    decision_recommendation: input.decisionRecommendation,
    status: input.status,
    brand: input.brand?.trim() || null,
  };
}

function normalizeOpportunityInput(input: OpportunityFormInput): OpportunityFormInput {
  const outcome = reconciledOutcome(input.stage, input.status);
  return {
    ...emptyOpportunityInput,
    ...input,
    accountName: input.accountName.trim(),
    opportunityName: input.opportunityName.trim(),
    estimatedValue: normalizeNumber(input.estimatedValue),
    currency: (input.currency || 'VND').trim().toUpperCase(),
    stage: outcome.stage,
    forecastEvidenceCategory: normalizeForecastCategory(input.forecastEvidenceCategory),
    decisionRecommendation: normalizeDecisionRecommendation(input.decisionRecommendation),
    status: outcome.status,
    nextActionDate: sanitizeBusinessDate(input.nextActionDate),
  };
}

/**
 * The one place stage and status are made to agree.
 *
 * Applied on every write *and* on both read paths, because a workspace already
 * holds records where they disagree - a deal dragged to Won on the board while
 * Status stayed Active. Reconciling on read repairs those as they load, so no
 * migration has to touch anybody's rows and no figure is ever computed from a
 * record that says two things at once. See utils/opportunityOutcome.ts for the
 * rule and why it resolves the way it does.
 */
function reconciledOutcome(stage: unknown, status: unknown) {
  return reconcileOpportunityOutcome(normalizeStage(stage), normalizeStatus(status));
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
  if (import.meta.env?.DEV) {
    console.debug(`[OpportunityStore] ${message}`, context || {});
  }
}
