import {
  moneyStates,
  sourceTypes,
  threadStatuses,
  waitingParties,
  type CommercialThread,
} from '../../domain/commercialKernel/types.ts';
import {
  deleteRecordForCurrentUser,
  isoOrNow,
  kernelId,
  loadForWorkspace,
  oneOf,
  optionalText,
  readLocal,
  syncRecordsForCurrentUser,
  text,
  writeLocal,
  type KernelCodec,
} from './kernelRepository.ts';

export const THREAD_STORAGE_KEY = 'memoire.commercialThreads.v1';
export const THREADS_UPDATED_EVENT = 'memoire:commercial-threads-updated';

export const threadCodec: KernelCodec<CommercialThread> = {
  table: 'commercial_threads',
  storageKey: THREAD_STORAGE_KEY,
  updatedEvent: THREADS_UPDATED_EVENT,
  orderColumn: 'last_activity_at',
  // Most recently active first: the question a thread list answers is "what has
  // been moving", and the silent ones fall to the bottom where they are visible
  // as a group rather than scattered.
  compare: (left, right) => (right.lastActivityAt || '').localeCompare(left.lastActivityAt || ''),
  toRow: (record, userId) => ({
    user_id: userId,
    id: record.id,
    account_id: record.accountId,
    account_name: record.accountName,
    opportunity_id: record.opportunityId || null,
    title: record.title,
    objective: record.objective,
    status: record.status,
    current_money_state: record.currentMoneyState,
    current_waiting_party: record.currentWaitingParty,
    last_activity_at: record.lastActivityAt,
    archived_at: record.archivedAt || null,
    source_type: record.sourceType,
    source_id: record.sourceId || null,
    source_url: record.sourceUrl || null,
    source_updated_at: record.sourceUpdatedAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }),
  fromRow: (row) => threadCodec.sanitize({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    opportunityId: row.opportunity_id,
    title: row.title,
    objective: row.objective,
    status: row.status,
    currentMoneyState: row.current_money_state,
    currentWaitingParty: row.current_waiting_party,
    lastActivityAt: row.last_activity_at,
    archivedAt: row.archived_at,
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

    return {
      id,
      userId: optionalText(raw.userId),
      accountId: text(raw.accountId),
      accountName: text(raw.accountName),
      opportunityId: optionalText(raw.opportunityId),
      title: text(raw.title),
      objective: text(raw.objective),
      status: oneOf(raw.status, threadStatuses, 'active'),
      currentMoneyState: oneOf(raw.currentMoneyState, moneyStates, 'none'),
      currentWaitingParty: oneOf(raw.currentWaitingParty, waitingParties, 'none'),
      lastActivityAt: isoOrNow(raw.lastActivityAt),
      archivedAt: optionalText(raw.archivedAt),
      sourceType: oneOf(raw.sourceType, sourceTypes, 'manual'),
      sourceId: optionalText(raw.sourceId),
      sourceUrl: optionalText(raw.sourceUrl),
      sourceUpdatedAt: optionalText(raw.sourceUpdatedAt),
      createdAt: isoOrNow(raw.createdAt),
      updatedAt: isoOrNow(raw.updatedAt),
    };
  },
};

export function loadThreads() {
  return readLocal(threadCodec);
}

export function loadThreadsForWorkspace(userId?: string | null, sampleDataActive = false) {
  return loadForWorkspace(threadCodec, userId, sampleDataActive);
}

export function saveThread(record: CommercialThread, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(threadCodec, [record, ...loadThreads().filter((item) => item.id !== record.id)]);
  if (options.syncCloud !== false) syncRecordsForCurrentUser(threadCodec, [record]);
  return next;
}

export function deleteThread(recordId: string, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(threadCodec, loadThreads().filter((item) => item.id !== recordId));
  if (options.syncCloud !== false) deleteRecordForCurrentUser(threadCodec, recordId);
  return next;
}

export function newThreadId() {
  return kernelId('thread');
}
