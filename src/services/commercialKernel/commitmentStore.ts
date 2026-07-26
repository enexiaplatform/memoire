import {
  commitmentImpactTypes,
  commitmentParties,
  commitmentStatuses,
  sourceTypes,
  type CommercialCommitment,
  type CommitmentDueDateChange,
} from '../../domain/commercialKernel/types.ts';
import {
  deleteRecordForCurrentUser,
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

export const COMMITMENT_STORAGE_KEY = 'memoire.commercialCommitments.v1';
export const COMMITMENTS_UPDATED_EVENT = 'memoire:commercial-commitments-updated';

const DEFAULT_SILENCE_THRESHOLD_DAYS = 3;

function sanitizeDueDateHistory(value: unknown): CommitmentDueDateChange[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const from = text(record.from);
    const to = text(record.to);
    if (!to) return [];
    return [{
      from,
      to,
      changedAt: isoOrNow(record.changedAt),
      ...(typeof record.reason === 'string' && record.reason ? { reason: record.reason } : {}),
    }];
  });
}

export const commitmentCodec: KernelCodec<CommercialCommitment> = {
  table: 'commercial_commitments',
  storageKey: COMMITMENT_STORAGE_KEY,
  updatedEvent: COMMITMENTS_UPDATED_EVENT,
  orderColumn: 'updated_at',
  // Open first, then by when it is due: the order the day is actually worked.
  compare: (left, right) => {
    if (left.status !== right.status) {
      if (left.status === 'open') return -1;
      if (right.status === 'open') return 1;
    }
    const leftDue = left.currentDueDate || '9999-12-31';
    const rightDue = right.currentDueDate || '9999-12-31';
    if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
    return (right.updatedAt || '').localeCompare(left.updatedAt || '');
  },
  toRow: (record, userId) => ({
    user_id: userId,
    id: record.id,
    thread_id: record.threadId,
    account_id: record.accountId,
    account_name: record.accountName,
    opportunity_id: record.opportunityId || null,
    commitment_party: record.commitmentParty,
    owner_label: record.ownerLabel,
    commitment_text: record.commitmentText,
    original_due_date: record.originalDueDate || null,
    current_due_date: record.currentDueDate || null,
    silence_threshold_days: record.silenceThresholdDays,
    status: record.status,
    impact_type: record.impactType,
    impact_amount: record.impactAmount ?? null,
    impact_currency: record.impactCurrency || null,
    source_event_id: record.sourceEventId || null,
    completion_evidence: record.completionEvidence || null,
    completion_event_id: record.completionEventId || null,
    due_date_history: record.dueDateHistory,
    last_renegotiated_at: record.lastRenegotiatedAt || null,
    completed_at: record.completedAt || null,
    cancelled_at: record.cancelledAt || null,
    source_type: record.sourceType,
    source_id: record.sourceId || null,
    source_url: record.sourceUrl || null,
    source_updated_at: record.sourceUpdatedAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }),
  fromRow: (row) => commitmentCodec.sanitize({
    id: row.id,
    userId: row.user_id,
    threadId: row.thread_id,
    accountId: row.account_id,
    accountName: row.account_name,
    opportunityId: row.opportunity_id,
    commitmentParty: row.commitment_party,
    ownerLabel: row.owner_label,
    commitmentText: row.commitment_text,
    originalDueDate: row.original_due_date,
    currentDueDate: row.current_due_date,
    silenceThresholdDays: row.silence_threshold_days,
    status: row.status,
    impactType: row.impact_type,
    impactAmount: row.impact_amount,
    impactCurrency: row.impact_currency,
    sourceEventId: row.source_event_id,
    completionEvidence: row.completion_evidence,
    completionEventId: row.completion_event_id,
    dueDateHistory: row.due_date_history,
    lastRenegotiatedAt: row.last_renegotiated_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }),
  sanitize: (value) => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const id = text(raw.id);
    if (!id) return null;

    const currentDueDate = text(raw.currentDueDate);
    const originalDueDate = text(raw.originalDueDate) || currentDueDate;
    const threshold = optionalNumber(raw.silenceThresholdDays);

    return {
      id,
      userId: optionalText(raw.userId),
      threadId: text(raw.threadId),
      accountId: text(raw.accountId),
      accountName: text(raw.accountName),
      opportunityId: optionalText(raw.opportunityId),
      commitmentParty: oneOf(raw.commitmentParty, commitmentParties, 'self'),
      ownerLabel: text(raw.ownerLabel),
      commitmentText: text(raw.commitmentText),
      originalDueDate,
      currentDueDate,
      silenceThresholdDays:
        threshold === null || threshold < 0 || threshold > 365 ? DEFAULT_SILENCE_THRESHOLD_DAYS : Math.round(threshold),
      status: oneOf(raw.status, commitmentStatuses, 'open'),
      impactType: oneOf(raw.impactType, commitmentImpactTypes, 'none'),
      impactAmount: optionalNumber(raw.impactAmount),
      impactCurrency: optionalText(raw.impactCurrency),
      sourceEventId: optionalText(raw.sourceEventId),
      completionEvidence: optionalText(raw.completionEvidence),
      completionEventId: optionalText(raw.completionEventId),
      dueDateHistory: sanitizeDueDateHistory(raw.dueDateHistory),
      lastRenegotiatedAt: optionalText(raw.lastRenegotiatedAt),
      completedAt: optionalText(raw.completedAt),
      cancelledAt: optionalText(raw.cancelledAt),
      sourceType: oneOf(raw.sourceType, sourceTypes, 'manual'),
      sourceId: optionalText(raw.sourceId),
      sourceUrl: optionalText(raw.sourceUrl),
      sourceUpdatedAt: optionalText(raw.sourceUpdatedAt),
      createdAt: isoOrNow(raw.createdAt),
      updatedAt: isoOrNow(raw.updatedAt),
      ...(raw.isSample === true ? { isSample: true } : {}),
    };
  },
};

export function loadCommitments() {
  return readLocal(commitmentCodec);
}

export function loadCommitmentsForWorkspace(userId?: string | null, sampleDataActive = false) {
  return loadForWorkspace(commitmentCodec, userId, sampleDataActive);
}

export function saveCommitment(record: CommercialCommitment, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(commitmentCodec, [
    record,
    ...loadCommitments().filter((item) => item.id !== record.id),
  ]);
  if (options.syncCloud !== false) syncRecordsForCurrentUser(commitmentCodec, [record]);
  return next;
}

export function deleteCommitment(recordId: string, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(commitmentCodec, loadCommitments().filter((item) => item.id !== recordId));
  if (options.syncCloud !== false) deleteRecordForCurrentUser(commitmentCodec, recordId);
  return next;
}

export function newCommitmentId() {
  return kernelId('commitment');
}

export { DEFAULT_SILENCE_THRESHOLD_DAYS };
