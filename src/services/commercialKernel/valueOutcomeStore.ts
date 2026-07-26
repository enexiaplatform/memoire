import {
  valueAssessments,
  valueOutcomeTypes,
  type CommercialValueOutcome,
} from '../../domain/commercialKernel/types.ts';
import {
  isoOrNow,
  kernelId,
  loadForWorkspace,
  oneOf,
  optionalNumber,
  optionalText,
  readLocal,
  syncRecordsForCurrentUser,
  text,
  writeLocal,
  type KernelCodec,
} from './kernelRepository.ts';

export const VALUE_OUTCOME_STORAGE_KEY = 'memoire.commercialValueOutcomes.v1';
export const VALUE_OUTCOMES_UPDATED_EVENT = 'memoire:commercial-value-outcomes-updated';

export const valueOutcomeCodec: KernelCodec<CommercialValueOutcome> = {
  table: 'commercial_value_outcomes',
  storageKey: VALUE_OUTCOME_STORAGE_KEY,
  updatedEvent: VALUE_OUTCOMES_UPDATED_EVENT,
  orderColumn: 'occurred_at',
  compare: (left, right) => (right.occurredAt || '').localeCompare(left.occurredAt || ''),
  toRow: (record, userId) => ({
    user_id: userId,
    id: record.id,
    thread_id: record.threadId || null,
    account_id: record.accountId || null,
    opportunity_id: record.opportunityId || null,
    recommendation_id: record.recommendationId || null,
    outcome_type: record.outcomeType,
    user_assessment: record.userAssessment,
    impact_amount: record.impactAmount ?? null,
    impact_currency: record.impactCurrency || null,
    confidence: record.confidence ?? null,
    note: record.note || null,
    occurred_at: record.occurredAt,
    created_at: record.createdAt,
  }),
  fromRow: (row) => valueOutcomeCodec.sanitize({
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    recommendationId: row.recommendation_id,
    outcomeType: row.outcome_type,
    userAssessment: row.user_assessment,
    impactAmount: row.impact_amount,
    impactCurrency: row.impact_currency,
    confidence: row.confidence,
    note: row.note,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
  }),
  sanitize: (value) => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const id = text(raw.id);
    if (!id) return null;

    const confidence = optionalNumber(raw.confidence);

    return {
      id,
      userId: optionalText(raw.userId),
      threadId: optionalText(raw.threadId),
      accountId: optionalText(raw.accountId),
      opportunityId: optionalText(raw.opportunityId),
      recommendationId: optionalText(raw.recommendationId),
      outcomeType: oneOf(raw.outcomeType, valueOutcomeTypes, 'no_material_impact'),
      userAssessment: oneOf(raw.userAssessment, valueAssessments, 'would_have_done_anyway'),
      impactAmount: optionalNumber(raw.impactAmount),
      impactCurrency: optionalText(raw.impactCurrency),
      confidence: confidence === null || confidence < 0 || confidence > 1 ? null : confidence,
      note: optionalText(raw.note),
      occurredAt: isoOrNow(raw.occurredAt),
      createdAt: isoOrNow(raw.createdAt),
      ...(raw.isSample === true ? { isSample: true } : {}),
    };
  },
};

export function loadValueOutcomes() {
  return readLocal(valueOutcomeCodec);
}

export function loadValueOutcomesForWorkspace(userId?: string | null, sampleDataActive = false) {
  return loadForWorkspace(valueOutcomeCodec, userId, sampleDataActive);
}

export function saveValueOutcome(record: CommercialValueOutcome, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(valueOutcomeCodec, [
    record,
    ...loadValueOutcomes().filter((item) => item.id !== record.id),
  ]);
  if (options.syncCloud !== false) syncRecordsForCurrentUser(valueOutcomeCodec, [record]);
  return next;
}

export function newValueOutcomeId() {
  return kernelId('value');
}
