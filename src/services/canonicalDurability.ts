import { conditionCodec } from './commercialKernel/conditionStore.ts';
import { policyCodec } from './commercialKernel/policyStore.ts';
import { incidentCodec } from './commercialKernel/incidentStore.ts';
import { requirementCodec } from './commercialKernel/requirementStore.ts';
import { dependencyCodec } from './commercialKernel/dependencyStore.ts';
import { timingCodec } from './commercialKernel/timingStore.ts';
import { decisionCodec } from './commercialKernel/decisionStore.ts';
import { moneyGateCodec } from './commercialKernel/moneyGateStore.ts';
import { decisionObservationCodec } from './commercialKernel/decisionObservationStore.ts';
/** One inventory for backup decoding, restore routing, and future-entity checks. */
import { threadCodec } from './commercialKernel/threadStore.ts';
import { commitmentCodec } from './commercialKernel/commitmentStore.ts';
import { eventCodec } from './commercialKernel/eventStore.ts';
import { evidenceCodec } from './commercialKernel/evidenceStore.ts';
import { valueOutcomeCodec } from './commercialKernel/valueOutcomeStore.ts';
import { rowToAccount, accountToRow } from './accountStore.ts';
import { rowToOpportunity, opportunityToRow } from './opportunityStore.ts';
import { rowToStakeholder, stakeholderToRow } from './stakeholderStore.ts';
import { rowToObjection, objectionToRow } from './objectionStore.ts';
import { rowToRecord, activityToInsert } from './salesActivityStore.ts';
import { rowToOperatingContext, inputToRow } from './operatingContextStore.ts';
import * as enums from '../domain/commercialKernel/types.ts';
import { evidenceCategories, evidenceDirections } from '../domain/commercialKernel/commercialEvidence.ts';

export type RecordData = Record<string, unknown>;
export const kernelCodecs = [threadCodec, commitmentCodec, eventCodec, evidenceCodec, valueOutcomeCodec, conditionCodec, requirementCodec, dependencyCodec, timingCodec, moneyGateCodec, decisionCodec,decisionObservationCodec,policyCodec,incidentCodec] as const;
export type CanonicalContract = {
  table: string;
  key: string;
  kind: 'relational' | 'kernel' | 'json' | 'target';
  conflict: string;
  decode: (row: RecordData) => unknown;
  encode: (record: RecordData, userId: string) => RecordData;
};

function relational<A, B>(table: string, key: string, decode: (row: A) => unknown, encode: (record: B) => object): CanonicalContract {
  return { table, key, kind: 'relational', conflict: 'id',
    decode: row => ({ ...Object.fromEntries(Object.entries(row).map(([k,v]) => [k.replace(/_([a-z])/g, (_,c: string) => c.toUpperCase()),v])), ...decode(row as A) as object }),
    encode: (record, userId) => ({ ...encode(record as B), id: record.id, user_id: userId,
      created_at: record.createdAt, updated_at: record.updatedAt, ...relationalExtras(table, record) }),
  };
}


function relationalExtras(table: string, r: RecordData): RecordData {
  const fields = table === 'accounts' ? ['accountCode','territory','stateProvince','priority','fy26TargetSgd','fy27TargetSgd','accountMasterStage','strategy','strategyOwner','nextFollowUp','overdueStatus','sourceSystem','externalSourceKey']
    : table === 'operating_context' ? ['sourceSystem','externalSourceKey']
    : table === 'opportunities' ? ['accountId']
    : table === 'stakeholders' ? ['accountId','opportunityId']
    : table === 'objections' ? ['accountId','opportunityId','stakeholderId','sourceActivityId'] : [];
  return Object.fromEntries(fields.filter(k => r[k] !== undefined).map(k => [k.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`), r[k] === '' ? null : r[k]]));
}

export const canonicalContracts: CanonicalContract[] = [
  relational('accounts', 'memoire.accounts.v1', rowToAccount, accountToRow),
  relational('opportunities', 'memoire.opportunities.v1', rowToOpportunity, opportunityToRow),
  relational('stakeholders', 'memoire.stakeholders.v1', rowToStakeholder, stakeholderToRow),
  relational('objections', 'memoire.objections.v1', rowToObjection, objectionToRow),
  { ...relational('sales_activities', 'memoire.salesActivities.v1', rowToRecord, () => ({})),
    encode: (record, userId) => ({ ...activityToInsert(record as unknown as Parameters<typeof activityToInsert>[0], userId,
      { createdAt: String(record.createdAt), updatedAt: String(record.updatedAt) },
      record as unknown as Parameters<typeof activityToInsert>[3]), id: record.id, link_status: record.linkStatus }),
  },
  relational('operating_context', 'memoire.operatingContext.v1', rowToOperatingContext, inputToRow),
  ...kernelCodecs.map(codec => ({ table: codec.table, key: codec.storageKey, kind: 'kernel' as const,
    conflict: 'user_id,id', decode: codec.fromRow,
    encode: (record: RecordData, userId: string) => codec.toRow(record as never, userId),
  })),
  ...Object.entries({
    reviewPacks: 'review_packs', salesAssets: 'sales_assets', actionOutcomes: 'action_outcomes',
    opportunityOutcomes: 'opportunity_outcomes', quotes: 'quotes', nudges: 'nudges',
    weeklyCommitments: 'weekly_commitments', planItems: 'plan_items', accountMerges: 'account_merges',
    orderMilestones: 'order_milestones', orderCosts: 'order_costs', orderReceivables: 'order_receivables',
    supplierCommitments: 'supplier_commitments', expenses: 'expenses', knowledgeNotes: 'knowledge_notes',
  }).map(([name, table]) => ({ table, key: `memoire.${name}.v1`, kind: 'json' as const,
    conflict: 'user_id,id', decode: (row: RecordData) => row.payload,
    encode: (record: RecordData, userId: string) => ({ user_id: userId, id: record.id, payload: record,
      created_at: record.createdAt, updated_at: record.updatedAt }),
  })),
  { table: 'commercial_targets', key: 'memoire.commercialTargets.v1', kind: 'target', conflict: 'user_id,fiscal_year,period',
    decode: row => ({ period: row.period, fiscalYear: row.fiscal_year, amount: row.amount, currency: row.currency,
      fiscalYearStartMonth: row.fiscal_year_start_month, note: row.note, createdAt: row.created_at, updatedAt: row.updated_at }),
    encode: (r, userId) => ({ user_id: userId, period: r.period, fiscal_year: r.fiscalYear, amount: r.amount,
      currency: r.currency, fiscal_year_start_month: r.fiscalYearStartMonth, note: r.note, created_at: r.createdAt, updated_at: r.updatedAt }),
  },
];

/** Exported for retention, never replayed as commercial commands or privileged writes. */
export const archiveOnlyTables = ['user_profiles', 'usage_monthly', 'pipeline_defense_briefs', 'captures', 'entities',
  'relationships', 'contacts', 'interactions', 'actions', 'activity_log', 'import_batches', 'import_row_results',
  'commercial_history_coverage', 'commercial_state_revisions'] as const;
export const CLOUD_ARCHIVE_KEY = 'memoire.backup.cloudArchive.v1';

export function contractForKey(key: string) {
  return canonicalContracts.find(c => c.key === key || (c.table === 'operating_context' && key.startsWith(`${c.key}:`)));
}
export function recordIdentity(contract: CanonicalContract, record: RecordData): string {
  return contract.kind === 'target' ? `${record.fiscalYear}:${record.period}` : String(record.id || '');
}
export function isSampleRecord(value: unknown) {
  const r = value as RecordData | null;
  return Boolean(r && typeof r === 'object' && (r.isSample === true || r.source === 'demo'));
}

const closedEnums: Record<string, readonly string[]> = {
  sourceType: enums.sourceTypes, currentMoneyState: enums.moneyStates, currentWaitingParty: enums.waitingParties,
  commitmentParty: enums.commitmentParties, impactType: enums.commitmentImpactTypes,
  eventType: enums.commercialEventTypes, outcomeType: enums.valueOutcomeTypes, userAssessment: enums.valueAssessments,
  category: evidenceCategories, direction: evidenceDirections,
};

/** Validate before codecs can repair/default/drop anything. Preserve the original accepted record. */
export function validateCanonicalRecord(contract: CanonicalContract, value: unknown): asserts value is RecordData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${contract.table}: record must be an object.`);
  const r = value as RecordData;
  if (contract.kind !== 'target' && (typeof r.id !== 'string' || !r.id.trim())) throw new Error(`${contract.table}: missing stable record id.`);
  if (contract.kind === 'target' && (!Number.isInteger(r.fiscalYear) || !['Q1','Q2','Q3','Q4'].includes(String(r.period))
    || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount < 0)) throw new Error('Invalid commercial target.');
  for (const [key, val] of Object.entries(r)) {
    if ((key.endsWith('At') || key.endsWith('Date')) && val != null && val !== '') {
      if (typeof val !== 'string' || !Number.isFinite(Date.parse(val))) throw new Error(`${contract.table}: invalid ${key}.`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(val) && new Date(val).toISOString().slice(0,10) !== val) throw new Error(`${contract.table}: impossible ${key}.`);
    }
  }
  if (contract.kind !== 'kernel') return;
  if(contract.table==='commercial_incidents'){
    if(!incidentCodec.sanitize(r))throw new Error('commercial_incidents: invalid canonical record.');
    return;
  }
  if(contract.table==='commercial_policies'){
    if(!policyCodec.sanitize(r))throw new Error('commercial_policies: invalid canonical record.');
    return;
  }
  if (contract.table === 'commercial_evidence' && r.providedBy != null
    && !['customer','self','internal'].includes(String(r.providedBy))) throw new Error('commercial_evidence: unsupported provider.');
  if (contract.table === 'commercial_conditions' || contract.table === 'commercial_outcome_requirements'
    || contract.table === 'commercial_dependencies' || contract.table === 'commercial_timing_assertions'
    || contract.table === 'commercial_money_gates' || contract.table === 'commercial_decisions' || contract.table === 'commercial_decision_observations') {
    const codec=contract.table==='commercial_conditions'?conditionCodec:contract.table==='commercial_outcome_requirements'?requirementCodec
      :contract.table==='commercial_dependencies'?dependencyCodec:contract.table==='commercial_timing_assertions'?timingCodec
        :contract.table==='commercial_money_gates'?moneyGateCodec:contract.table==='commercial_decisions'?decisionCodec:decisionObservationCodec;
    if (!codec.sanitize(r)) throw new Error(`${contract.table}: invalid canonical record.`);
    return;
  }
  for (const [key, allowed] of Object.entries(closedEnums)) {
    if (r[key] !== undefined && !allowed.includes(String(r[key]))) throw new Error(`${contract.table}: unsupported ${key}.`);
  }
  if (r.status !== undefined) {
    const allowed = contract.table === 'commercial_threads' ? enums.threadStatuses : enums.commitmentStatuses;
    if (!(allowed as readonly string[]).includes(String(r.status))) throw new Error(`${contract.table}: unsupported status.`);
  }
  for (const field of ['createdAt', ...(contract.table === 'commercial_events' || contract.table === 'commercial_evidence' ? ['recordedAt'] : []),
    ...(contract.table === 'commercial_events' || contract.table === 'commercial_value_outcomes' ? ['occurredAt'] : ['updatedAt'])]) {
    if (typeof r[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(r[field])) throw new Error(`${contract.table}: missing ${field}; restore will not invent history.`);
  }
  const required = contract.table === 'commercial_value_outcomes' ? ['outcomeType', 'userAssessment']
    : contract.table === 'commercial_events' ? ['sourceType', 'eventType']
    : contract.table === 'commercial_evidence' ? ['sourceType', 'category', 'direction']
    : contract.table === 'commercial_commitments' ? ['sourceType', 'status', 'commitmentParty', 'impactType']
    : ['sourceType', 'status', 'currentMoneyState', 'currentWaitingParty'];
  for (const field of required) if (r[field] === undefined) throw new Error(`${contract.table}: missing ${field}; restore will not infer commercial meaning.`);
  const codec = kernelCodecs.find(c => c.table === contract.table)!;
  const clean = codec.sanitize(r);
  if (!clean) throw new Error(`${contract.table}: invalid record ${r.id}.`);
  if (r.dueDateHistory !== undefined) {
    if (!Array.isArray(r.dueDateHistory)) throw new Error('Invalid commitment history.');
    for (const entry of r.dueDateHistory) {
      if (!entry || typeof entry !== 'object' || typeof entry.to !== 'string' || !entry.to
        || typeof entry.changedAt !== 'string' || !Number.isFinite(Date.parse(entry.changedAt))) throw new Error('Invalid commitment history.');
      for (const date of [entry.from, entry.to]) if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10) !== date)) throw new Error('Invalid commitment history date.');
    }
  }
}
