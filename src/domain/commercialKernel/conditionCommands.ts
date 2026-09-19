import { type CommercialCondition, type ConditionEvidenceLink, type ConditionIntent, isCommercialCondition } from './commercialCondition.ts';
import { conditionReferenceIndex, validateConditionReferences } from './conditionReferences.ts';
import { loadCommercialConditions, localConditionReferenceIndex, saveCommercialCondition } from '../../services/commercialKernel/conditionStore.ts';
import { kernelId } from '../../services/commercialKernel/kernelRepository.ts';
import { recordCommercialEvent, type CommandResult } from './commands.ts';
import type { CommercialScope, CommercialEventType } from './types.ts';
import { reportWorkspaceSyncError } from '../../services/workspaceSyncStatus.ts';

type CreateConditionInput = Pick<CommercialCondition, 'accountId' | 'opportunityId' | 'statement' | 'conditionCategory' | 'intent' | 'validFrom'>
  & Partial<Pick<CommercialCondition, 'sourceType' | 'sourceId' | 'sourceUrl' | 'sourceUpdatedAt'>>
  & { evidence?: Pick<ConditionEvidenceLink, 'evidenceId' | 'assessment'> };
function persist(scope: CommercialScope, condition: CommercialCondition, eventType: CommercialEventType, payload: Record<string, unknown>, references?: ReturnType<typeof conditionReferenceIndex>): CommandResult<CommercialCondition> {
  try {
    if (!isCommercialCondition(condition)) throw new Error('Check the proposition, intent, dates and evidence links.');
    validateConditionReferences(condition, references || localConditionReferenceIndex());
    saveCommercialCondition(condition);
  } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Condition was not saved.' }; }
  try {
    const event = recordCommercialEvent(scope, { eventType, accountId: condition.accountId, opportunityId: condition.opportunityId,
      summary: eventType === 'condition_created' ? 'Commercial condition recorded' : 'Commercial condition updated',
      sourceType: condition.sourceType, sourceId: condition.sourceId,
      structuredPayload: { conditionId: condition.id, ...payload } });
    return { ok: true, value: condition, event };
  } catch {
    const warning = 'Saved in this browser, but change history could not be saved. Do not repeat the state change.';
    reportWorkspaceSyncError(warning);
    return { ok: true, value: condition, warning };
  }
}
export function createCommercialCondition(scope: CommercialScope, input: CreateConditionInput, references?: ReturnType<typeof conditionReferenceIndex>): CommandResult<CommercialCondition> {
  const timestamp = new Date().toISOString();
  const condition: CommercialCondition = { id: kernelId('condition'), userId: scope.userId,
    accountId: input.accountId, opportunityId: input.opportunityId || null,
    statement: typeof input.statement === 'string' ? input.statement.trim() : '', conditionCategory: input.conditionCategory, intent: input.intent, lifecycle: 'active',
    validFrom: input.validFrom || null, sourceType: input.sourceType || 'manual', sourceId: input.sourceId || null,
    sourceUrl: input.sourceUrl || null, sourceUpdatedAt: input.sourceUpdatedAt || null,
    createdAt: timestamp, updatedAt: timestamp, ...(scope.sampleDataActive ? { isSample: true } : {}),
    evidenceLinks: input.evidence ? [{ ...input.evidence, recordedAt: timestamp }] : [] };
  return persist(scope, condition, 'condition_created', { intent: condition.intent, evidenceIds: condition.evidenceLinks.map(l => l.evidenceId) }, references);
}
/** Immutable statement and scope: a materially different proposition gets a new ID.
 * expectedUpdatedAt prevents a stale open editor from overwriting newer local work. */
export function changeCommercialCondition(scope: CommercialScope, id: string, expectedUpdatedAt: string,
  change: { kind: 'intent'; intent: ConditionIntent } | { kind: 'retire' } | { kind: 'link'; link: Omit<ConditionEvidenceLink, 'recordedAt'> },
  references?: ReturnType<typeof conditionReferenceIndex>,
): CommandResult<CommercialCondition> {
  const current = loadCommercialConditions().find(r => r.id === id);
  if (!current || current.userId !== scope.userId || Boolean(current.isSample) !== Boolean(scope.sampleDataActive)) return { ok: false, error: 'Condition not found in this workspace.' };
  if (current.updatedAt !== expectedUpdatedAt) return { ok: false, error: 'This condition changed. Reopen it before saving.' };
  if (current.lifecycle === 'retired') return { ok: false, error: 'This proposition is retired. Record a new condition if it matters again.' };
  const timestamp = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
  const next = { ...current, updatedAt: timestamp };
  let eventType: CommercialEventType;
  let payload: Record<string, unknown>;
  if (change.kind === 'retire') { next.lifecycle = 'retired'; eventType = 'condition_retired'; payload = { from: 'active', to: 'retired' }; }
  else if (change.kind === 'intent') { next.intent = change.intent; eventType = 'condition_intent_changed'; payload = { from: current.intent, to: change.intent }; }
  else { next.evidenceLinks = [...current.evidenceLinks, { ...change.link, recordedAt: timestamp }]; eventType = 'condition_evidence_linked'; payload = { ...change.link }; }
  return persist(scope, next, eventType, payload, references);
}
