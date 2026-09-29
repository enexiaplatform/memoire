import {validateContractObligation,type ContractObligation} from '../domain/commercialKernel/contractObligation.ts';
import { conditionReferenceIndex, validateConditionReferences } from '../domain/commercialKernel/conditionReferences.ts';
import type { CommercialCondition } from '../domain/commercialKernel/commercialCondition.ts';
import type { CommercialEvidence } from '../domain/commercialKernel/commercialEvidence.ts';
import { validateRequirementReferences, requirementReferenceIndex } from '../domain/commercialKernel/requirementCommands.ts';
import type { OutcomeRequirement } from '../domain/commercialKernel/outcomeRequirement.ts';
import { validateDependencyGraph, type CommercialDependency } from '../domain/commercialKernel/commercialDependency.ts';
import { validateTimingAssertions, type CommercialTimingAssertion } from '../domain/commercialKernel/commercialTiming.ts';
import type { CommercialCommitment } from '../domain/commercialKernel/types.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { CommercialDecision } from '../domain/commercialKernel/commercialDecision.ts';
import type { DecisionObservation } from '../domain/commercialKernel/decisionLearning.ts';
import {validateMoneyGates,type CommercialMoneyGate} from '../domain/commercialKernel/moneyGate.ts';
import {validatePolicyReferences,type CommercialPolicy} from '../domain/commercialKernel/commercialPolicy.ts';
import {validateIncidentReferences,type CommercialIncident} from '../domain/commercialKernel/commercialIncident.ts';
import type {QuoteRecord} from '../services/quoteStore.ts';
import type { PlanRecord } from './weeklyPlan.ts';
import { HISTORICAL_REVISIONS_KEY,HISTORICAL_COVERAGE_KEY,historicalSources,validateHistoricalBundle,
  type StateRevision,type HistoryCoverage } from '../services/historicalIntegrity.ts';
import { canonicalContracts, contractForKey, archiveOnlyTables, CLOUD_ARCHIVE_KEY, isSampleRecord, recordIdentity, validateCanonicalRecord, type RecordData } from '../services/canonicalDurability.ts';
/**
 * The other half of export.
 *
 * A local-first product makes an implicit promise: your data is yours, and you
 * can always walk away with it. Export kept that promise; without restore it
 * was only half kept, because a backup you cannot put back is a souvenir, not
 * a safety net.
 *
 * Everything here is pure so the rules that matter - what counts as a Memoire
 * backup, what never comes back in - can be tested without a browser.
 */

/** Format 11 carries immutable post-Decision observations. */
export const BACKUP_FORMAT_VERSION = 14;
export const BACKUP_KEY_PREFIX = 'memoire.';

export type BackupEnvelope = {
  exportedAt: string;
  mode?: string;
  formatVersion?: number;
  localBrowserData: Record<string, unknown>;
  cloudData?: unknown;
  localBrowserRawData?: Record<string, string>;
};

export type BackupEntry = {
  key: string;
  /** Records for array-shaped stores; null when the value is not a collection. */
  recordCount: number | null;
  sampleCount: number;
};

export type BackupSummary = {
  exportedAt: string;
  mode: string;
  formatVersion: number;
  entries: BackupEntry[];
  totalKeys: number;
  totalRecords: number;
  /** Demo records found in the file. They are reported, then dropped. */
  totalSampleRecords: number;
  hadCloudData: boolean;
};

export type BackupParseResult =
  | { ok: true; envelope: BackupEnvelope; summary: BackupSummary }
  | { ok: false; reason: BackupRejectionReason; message: string };

export type BackupRejectionReason =
  | 'not-json'
  | 'not-an-object'
  | 'not-a-memoire-backup'
  | 'unsupported-version'
  | 'no-workspace-data'
  | 'invalid-records';

/**
 * Deliberately strict. A restore overwrites the workspace, so anything we are
 * not certain is a Memoire backup is refused with a reason the user can act on
 * rather than best-effort parsed into a half-restored state.
 */
export function parseBackupFile(raw: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json', message: 'That file is not valid JSON. Pick the .json file from a Memoire export ZIP.' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-an-object', message: 'That file does not look like a Memoire export.' };
  }

  const candidate = parsed as Partial<BackupEnvelope>;
  const local = candidate.localBrowserData;

  if (!local || typeof local !== 'object' || Array.isArray(local) || typeof candidate.exportedAt !== 'string') {
    return {
      ok: false,
      reason: 'not-a-memoire-backup',
      message: 'That file is missing the workspace section a Memoire export always has. Nothing was changed.',
    };
  }

  const formatVersion = candidate.formatVersion === undefined ? 1 : candidate.formatVersion;
  if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      reason: 'unsupported-version',
      message: `This backup was written by a newer version of Memoire (format ${formatVersion}). Update before restoring it.`,
    };
  }

  const workspaceKeys = Object.keys(local).filter(isWorkspaceKey);
  if (workspaceKeys.length === 0 && !candidate.cloudData) {
    return {
      ok: false,
      reason: 'no-workspace-data',
      message: 'This export contains no Memoire workspace data to restore.',
    };
  }

  const envelope: BackupEnvelope = {
    exportedAt: candidate.exportedAt,
    mode: typeof candidate.mode === 'string' ? candidate.mode : 'unknown',
    formatVersion,
    localBrowserData: local as Record<string, unknown>,
    cloudData: candidate.cloudData,
    localBrowserRawData: candidate.localBrowserRawData,
  };

  try {
    buildRestorePlan(envelope);
    return { ok: true, envelope, summary: summarizeBackup(envelope) };
  } catch (error) {
    return { ok: false, reason: 'invalid-records', message: `${error instanceof Error ? error.message : String(error)} Nothing was changed.` };
  }
}

export function summarizeBackup(envelope: BackupEnvelope): BackupSummary {
  const plan = buildRestorePlan(envelope);
  const entries = plan.writes.map(({ key, value }) => {
    let records: unknown;
    try { records = JSON.parse(value); } catch { records = value; }
    return { key, recordCount: Array.isArray(records) ? records.length : null, sampleCount: 0 };
  });

  return {
    exportedAt: envelope.exportedAt,
    mode: envelope.mode || 'unknown',
    formatVersion: envelope.formatVersion || 1,
    entries,
    totalKeys: entries.length,
    totalRecords: entries.reduce((total, entry) => total + (entry.recordCount || 0), 0),
    totalSampleRecords: plan.droppedSampleRecords,
    hadCloudData: Boolean(envelope.cloudData),
  };
}

export type RestorePlan = {
  /** Exactly what will be written to localStorage, key by key. */
  writes: Array<{ key: string; value: string }>;
  droppedSampleRecords: number;
  restoredRecords: number;
};

/**
 * Demo records never ride a restore into a live workspace. The whole app holds
 * this line at write time (`isUserSnapshot`, the sample-tagged stores); a
 * backup taken while the demo sandbox was loaded would quietly cross it, so it
 * is enforced here too - and the count is reported rather than swallowed.
 */
export function buildRestorePlan(envelope: BackupEnvelope): RestorePlan {
  const version = envelope.formatVersion === undefined ? 1 : envelope.formatVersion;
  if (!Number.isInteger(version) || version < 1 || version > BACKUP_FORMAT_VERSION) throw new Error('Unsupported backup version.');
  if (!Number.isFinite(Date.parse(envelope.exportedAt))) throw new Error('Invalid backup timestamp.');
  if (!envelope.localBrowserData || typeof envelope.localBrowserData !== 'object' || Array.isArray(envelope.localBrowserData)) throw new Error('Invalid workspace section.');
  if (describeCloudExportGaps(envelope.cloudData)) throw new Error('This cloud export is incomplete. Export again before replacing a workspace.');
  let droppedSampleRecords = 0;
  let restoredRecords = 0;
  const normalized: Record<string, unknown> = {};
  const cloud = envelope.cloudData as { data?: Record<string, unknown>; user_id?: string; manifest?: { tables?: Record<string, { rows?: number }> } } | null;
  if (cloud != null && (!cloud || typeof cloud !== 'object' || !cloud.data || typeof cloud.data !== 'object' || Array.isArray(cloud.data))) throw new Error('Invalid cloud backup section.');
  if (cloud?.data) {
    for (const [table, entry] of Object.entries(cloud.manifest?.tables || {})) {
      if (!Array.isArray(cloud.data[table]) || (typeof entry.rows === 'number' && entry.rows !== (cloud.data[table] as unknown[]).length)) throw new Error(`${table}: the export manifest does not match its data.`);
    }
    for (const [table, rows] of Object.entries(cloud.data)) {
      if (!Array.isArray(rows)) throw new Error(`${table}: expected a list of cloud rows.`);
      if(table==='commercial_history_coverage'||table==='commercial_state_revisions'){
        for(const row of rows){
          if(!row||typeof row!=='object'||Array.isArray(row)||
            (cloud.user_id&&(row as RecordData).user_id!==cloud.user_id))
            throw new Error(`${table}: malformed or mixed-account history row.`);
        }
        const key=table==='commercial_history_coverage'?'memoire.cloudHistoryCoverage.v1':'memoire.cloudStateRevisions.v1';
        normalized[key]=table==='commercial_history_coverage'?rows.map((r:RecordData)=>({scope:r.user_id,
          historyGuaranteedFrom:r.history_guaranteed_from,schemaVersion:r.schema_version,lineageId:r.lineage_id}))
          :rows.map((r:RecordData)=>({id:r.id,scope:r.user_id,entityType:r.entity_type,entityId:r.entity_id,
            revisionNo:r.revision_no,mutationId:r.mutation_id,operation:r.operation,recordedAt:r.recorded_at,
            schemaVersion:r.schema_version,state:r.state&&typeof r.state==='object'
              ?Object.fromEntries(Object.entries(r.state as RecordData).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c:string)=>c.toUpperCase()),v])):null}));
        continue;
      }
      const contract = canonicalContracts.find(c => c.table === table);
      if (!contract) {
        if (!(archiveOnlyTables as readonly string[]).includes(table)) throw new Error(`Unsupported cloud dataset: ${table}.`);
        continue;
      }
      const seen = new Set<string>();
      const records: RecordData[] = [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${table}: malformed cloud row.`);
        if (isSampleRecord(row) || isSampleRecord(row.payload)) { droppedSampleRecords++; continue; }
        if (cloud.user_id && row.user_id !== cloud.user_id) throw new Error(`${table}: mixed account ownership.`);
        // Validate source enums and dates before the normal read codec can default them.
        if (contract.kind !== 'json') validateCanonicalRecord(contract, Object.fromEntries(Object.entries(row).map(([k,v]) => [k.replace(/_([a-z])/g, (_,c: string) => c.toUpperCase()),v])));
        const decoded = contract.decode(row);
        validateCanonicalRecord(contract, decoded);
        if (contract.kind !== 'target' && decoded.id !== row.id) throw new Error(`${table}: payload identity does not match its row.`);
        const id = recordIdentity(contract, decoded);
        if (seen.has(id)) throw new Error(`${table}: duplicate record identity ${id}.`);
        seen.add(id);
        records.push(decoded);
      }
      const key = contract.table === 'operating_context' ? `${contract.key}:${cloud.user_id || 'guest'}` : contract.key;
      normalized[key] = records;
    }
    // Preserve non-canonical audit/legacy rows and fields not represented by today's UI.
    normalized[CLOUD_ARCHIVE_KEY] = { ...cloud, data: Object.fromEntries(Object.entries(cloud.data).map(([table, rows]) => [table, (rows as RecordData[]).filter(row => !isSampleRecord(row) && !isSampleRecord(row.payload))])) };
  }
  for (const [key, value] of Object.entries(envelope.localBrowserData)) {
    if (!isRestorableWorkspaceKey(key)) continue;
    const contract = contractForKey(key);
    if (contract && !Array.isArray(value)) throw new Error(`${key}: expected a record collection.`);
    if (!Array.isArray(value)) { if (key !== CLOUD_ARCHIVE_KEY || !cloud) normalized[key] = value; continue; }
    const seen = new Set<string>();
    const local: RecordData[] = [];
    for (const record of value) {
      if (isSampleRecord(record)||([HISTORICAL_REVISIONS_KEY,HISTORICAL_COVERAGE_KEY].includes(key)
        &&(record as RecordData)?.scope==='sample')) { droppedSampleRecords++; continue; }
      if (contract) {
        validateCanonicalRecord(contract, record);
        const id = recordIdentity(contract, record);
        if (seen.has(id)) throw new Error(`${key}: duplicate record identity ${id}.`);
        seen.add(id);
      }
      local.push(record);
    }
    if (contract) {
      if(Array.isArray(cloud?.data?.commercial_history_coverage)
        &&cloud.data.commercial_history_coverage.length>0&&contract.table in historicalSources){
        // A complete cloud history snapshot has one matching canonical current state.
        // A newer browser mirror cannot be spliced into that immutable lineage.
        continue;
      }
      const merged = new Map<string, RecordData>();
      for (const record of [...(normalized[key] as RecordData[] || []), ...local]) {
        const id = recordIdentity(contract, record);
        const previous = merged.get(id);
        if(previous&&(contract.table==='commercial_decisions'||contract.table==='commercial_decision_observations')){
          const semantic=(r:RecordData)=>JSON.stringify({...r,executionLinks:[],updatedAt:''});
          if(semantic(previous)!==semantic(record))throw new Error('Decision history conflicts between local and cloud backup copies.');
        }
        const stamp = (r: RecordData) => Date.parse(String(r.updatedAt || r.recordedAt || r.createdAt || '')) || 0;
        if (!previous || stamp(record) >= stamp(previous)) merged.set(id, { ...previous, ...record });
      }
      normalized[key] = Array.from(merged.values());
    } else normalized[key] = local;
  }
  for(const obligation of (normalized['memoire.contractObligations.v1']||[]) as ContractObligation[])
    validateContractObligation(obligation,{opportunities:normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[]||[],requirements:normalized['memoire.outcomeRequirements.v1'] as OutcomeRequirement[]||[],commitments:normalized['memoire.commercialCommitments.v1'] as CommercialCommitment[]||[]});
  for(const policy of (normalized['memoire.commercialPolicies.v1']||[]) as CommercialPolicy[])
    validatePolicyReferences(policy,normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[]||[],normalized['memoire.outcomeRequirements.v1'] as OutcomeRequirement[]||[]);
  for(const incident of (normalized['memoire.commercialIncidents.v1']||[]) as CommercialIncident[])
    validateIncidentReferences(incident,normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[]||[],normalized['memoire.commercialPolicies.v1'] as CommercialPolicy[]||[]);
  const conditions = normalized['memoire.commercialConditions.v1'] as CommercialCondition[] | undefined;
  if (conditions?.length) {
    const index = conditionReferenceIndex(
      normalized['memoire.accounts.v1'] as { id: string }[] || [],
      normalized['memoire.opportunities.v1'] as { id: string }[] || [],
      normalized['memoire.commercialEvidence.v1'] as CommercialEvidence[] || [],
    );
    for (const condition of conditions) validateConditionReferences(condition, index);
  }
  const requirements = normalized['memoire.outcomeRequirements.v1'] as OutcomeRequirement[] | undefined;
  if (requirements?.length) {
    const index = requirementReferenceIndex(
      normalized['memoire.accounts.v1'] as {id:string}[] || [],
      normalized['memoire.opportunities.v1'] as {id:string}[] || [],
      conditions || [],
    );
    for (const requirement of requirements) validateRequirementReferences(requirement,index);
  }
  const dependencies=normalized['memoire.commercialDependencies.v1'] as CommercialDependency[] | undefined;
  if(dependencies?.length) validateDependencyGraph(requirements||[],dependencies);
  const timing=normalized['memoire.commercialTiming.v1'] as CommercialTimingAssertion[] | undefined;
  if(timing?.length) validateTimingAssertions(timing,{
    opportunities:normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[] || [],
    requirements:requirements||[],
    commitments:normalized['memoire.commercialCommitments.v1'] as CommercialCommitment[] || [],
    evidence:normalized['memoire.commercialEvidence.v1'] as CommercialEvidence[] || [],
  });
  const moneyGates=normalized['memoire.commercialMoneyGates.v1'] as CommercialMoneyGate[]|undefined;
  if(moneyGates?.length)validateMoneyGates(moneyGates,{opportunities:normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[]||[],
    quotes:normalized['memoire.quotes.v1'] as QuoteRecord[]||[],requirements:requirements||[]});
  const localRevisions=normalized[HISTORICAL_REVISIONS_KEY] as StateRevision[]|undefined;
  const localCoverage=normalized[HISTORICAL_COVERAGE_KEY] as HistoryCoverage[]|undefined;
  if(Boolean(localRevisions)!==Boolean(localCoverage))throw new Error('Historical revisions and coverage boundary must travel together.');
  if(localRevisions&&localCoverage)validateHistoricalBundle(localRevisions,localCoverage,cloud?{}:normalized);
  const cloudRevisions=normalized['memoire.cloudStateRevisions.v1'] as StateRevision[]|undefined;
  const cloudCoverage=normalized['memoire.cloudHistoryCoverage.v1'] as HistoryCoverage[]|undefined;
  if(Boolean(cloudRevisions)!==Boolean(cloudCoverage))throw new Error('Cloud historical revisions and coverage boundary must travel together.');
  if(cloudRevisions&&cloudCoverage)validateHistoricalBundle(cloudRevisions,cloudCoverage,{});
  if(cloudRevisions&&cloudCoverage&&cloudCoverage.length){
    normalized[HISTORICAL_REVISIONS_KEY]=cloudRevisions;
    normalized[HISTORICAL_COVERAGE_KEY]=cloudCoverage;
  }
  const decisions=normalized['memoire.commercialDecisions.v1'] as CommercialDecision[] | undefined;
  if(decisions?.length){
    const accounts=normalized['memoire.accounts.v1'] as {id:string;userId?:string|null}[] || [];
    const opportunities=normalized['memoire.opportunities.v1'] as CrmLiteOpportunity[] || [];
    const plans=normalized['memoire.planItems.v1'] as PlanRecord[] || [];
    const commitments=normalized['memoire.commercialCommitments.v1'] as CommercialCommitment[] || [];
    const byId=new Map(decisions.map(d=>[d.id,d]));
    for(const d of decisions){
      const account=accounts.find(a=>a.id===d.accountId&&a.userId===d.userId);
      const opportunity=opportunities.find(o=>o.id===d.opportunityId&&o.userId===d.userId&&o.accountId===d.accountId);
      if(!account||!opportunity)throw new Error('Decision Account/Opportunity scope is missing from backup.');
      if(d.supersedesDecisionId){const old=byId.get(d.supersedesDecisionId);
        if(!old||old.userId!==d.userId||old.opportunityId!==d.opportunityId)throw new Error('Decision supersession scope mismatch.');}
      if(d.intervention.targetKind==='requirement'&&!requirements?.some(r=>r.id===d.intervention.targetRequirementId
        &&r.userId===d.userId&&r.opportunityId===d.opportunityId))throw new Error('Decision Intervention Requirement scope mismatch.');
      for(const link of d.executionLinks){
        if(link.kind==='action'&&!plans.some(p=>p.id===link.recordId&&p.linkedOpportunityId===d.opportunityId))
          throw new Error('Decision execution Plan action scope mismatch.');
        if(link.kind==='commitment'&&!commitments.some(c=>c.id===link.recordId&&c.userId===d.userId
          &&c.accountId===d.accountId&&c.opportunityId===d.opportunityId))
          throw new Error('Decision execution Commitment scope mismatch.');
      }
    }
  }
  const observations=normalized['memoire.decisionObservations.v1'] as DecisionObservation[]|undefined;
  if(observations?.length){
    const byDecision=new Map((decisions||[]).map(row=>[row.id,row]));
    for(const observation of observations){
      const decision=byDecision.get(observation.decisionId);
      if(!decision||decision.userId!==observation.userId||decision.accountId!==observation.accountId
        ||decision.opportunityId!==observation.opportunityId)throw new Error('Decision Observation scope mismatch in backup.');
      const elapsed=Math.floor((Date.parse(observation.observationCutoff)-Date.parse(decision.decidedAt))/86400000);
      if(elapsed!==observation.elapsedDays)throw new Error('Decision Observation horizon mismatch in backup.');
      for(const execution of observation.snapshot.execution)if(!decision.executionLinks.some(link=>link.kind===execution.kind
        &&link.recordId===execution.recordId&&Date.parse(link.linkedAt)<=Date.parse(observation.observationCutoff)))
        throw new Error('Decision Observation execution reference mismatch in backup.');
    }
  }
  const writes = Object.keys(normalized).sort().map(key => {
    const value = normalized[key];
    if (Array.isArray(value)) restoredRecords += value.length;
    const raw = envelope.localBrowserRawData?.[key];
    if (raw !== undefined && !Array.isArray(value) && !contractForKey(key) && key !== CLOUD_ARCHIVE_KEY) {
      if (typeof raw !== 'string') throw new Error(`${key}: invalid original browser value.`);
      let decoded: unknown;
      try { decoded = JSON.parse(raw); } catch { decoded = raw; }
      if (JSON.stringify(decoded) !== JSON.stringify(value)) throw new Error(`${key}: browser value does not match its backup.`);
      return { key, value: raw };
    }
    // These preferences have always used bare strings/numbers, not JSON strings.
    if ((LEGACY_WORKSPACE_KEYS as readonly string[]).includes(key)) return { key, value: String(value) };
    return { key, value: JSON.stringify(value) };
  });
  if (!writes.length) throw new Error('This backup contains no recoverable workspace data.');
  return { writes, droppedSampleRecords, restoredRecords };
}

/** Session, owner, sample and recovery-control keys are never imported from a file. */
export function isRestorableWorkspaceKey(key: string) {
  return isWorkspaceKey(key) && !/(?:cloud-owner|local-workspace-owner|sampleData|demo|auth|restoreJournal)/i.test(key);
}

/**
 * What the cloud half of an export could not read, in the operator's words.
 *
 * `/api/export` has always answered with a manifest - `complete`, a row count
 * per table, and a warning for any table that errored. Nothing read it. The
 * Settings screen declared `const cloudWarning = ''` and then branched on it, so
 * the check could not fire and a partial export downloaded looking exactly like
 * a whole one. That is the single worst way for a backup to fail: silently, and
 * only discovered on the day it is needed.
 *
 * Naming the tables matters more than a generic apology. "Quotes and Order costs
 * could not be read" lets the operator judge whether the gap touches anything
 * they care about today; "something went wrong" does not.
 *
 * Returns an empty string when the export is whole, so the caller can treat the
 * result as "is there anything to warn about".
 */
export function describeCloudExportGaps(cloudData: unknown): string {
  if (!cloudData || typeof cloudData !== 'object') return '';
  const manifest = (cloudData as { manifest?: unknown }).manifest;
  if (!manifest || typeof manifest !== 'object') return '';
  // Absent is not incomplete: a signed-out export carries no cloud half at all,
  // and an older response shape should not be reported as a broken backup.
  if ((manifest as { complete?: unknown }).complete !== false) return '';

  const tables = (manifest as { tables?: unknown }).tables;
  const missing = tables && typeof tables === 'object'
    ? Object.entries(tables as Record<string, unknown>)
      .filter(([, value]) => Boolean(value && typeof value === 'object' && (value as { warning?: unknown }).warning))
      .map(([table]) => friendlyTableName(table))
    : [];

  if (missing.length === 0) return 'Part of your account data could not be read.';
  return `${joinWithAnd(missing)} could not be read from your account.`;
}

/** "order_costs" is a column name; the operator recorded order costs. */
function friendlyTableName(table: string) {
  return table.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
}

function joinWithAnd(values: string[]) {
  if (values.length === 1) return values[0];
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

/**
 * Two workspace settings predate the `memoire.` convention and are punctuated
 * `memoire_`, so a prefix test on the dot did not see them. They are not
 * cosmetic: one is the currency every figure in the product is denominated in,
 * the other is the opening cash balance the whole cash-on-hand line is built
 * from.
 *
 * Three things went wrong for the want of a character. A backup did not carry
 * them, so restoring onto a new laptop reopened the workspace in the default
 * currency with no opening balance and every total quietly re-denominated.
 * "Clear all Memoire data stored in this browser" left them behind. And the same
 * clear runs after an account is permanently deleted, so a figure about somebody
 * else's business stayed on a shared machine after they had asked for all of it
 * to go.
 *
 * Named rather than matched on `memoire` alone, because `memoire_demo_auth` and
 * `memoire_demo_workspace` are also underscored and must stay out - they are
 * demo-mode flags, and carrying one into a restore would put a live workspace
 * into the sandbox.
 */
export const LEGACY_WORKSPACE_KEYS = [
  'memoire_reporting_currency',
  'memoire_opening_cash_balance',
] as const;

export function isWorkspaceKey(key: string) {
  if ((LEGACY_WORKSPACE_KEYS as readonly string[]).includes(key)) return true;
  return key.startsWith(BACKUP_KEY_PREFIX);
}
