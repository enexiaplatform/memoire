import {
  commercialEventTypes,
  sourceTypes,
  type CommercialEvent,
} from '../../domain/commercialKernel/types.ts';
import {
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

export const EVENT_STORAGE_KEY = 'memoire.commercialEvents.v1';
export const EVENTS_UPDATED_EVENT = 'memoire:commercial-events-updated';

/**
 * How many events one workspace keeps locally.
 *
 * The cloud copy is unbounded; this cap only stops localStorage from filling up
 * on a long-running workspace and taking every other store down with it. The
 * events dropped locally are the oldest, which are also the ones no surface
 * queries without going to the cloud anyway.
 */
export const LOCAL_EVENT_LIMIT = 2000;

export const eventCodec: KernelCodec<CommercialEvent> = {
  table: 'commercial_events',
  storageKey: EVENT_STORAGE_KEY,
  updatedEvent: EVENTS_UPDATED_EVENT,
  orderColumn: 'occurred_at',
  compare: (left, right) => {
    const byOccurred = (right.occurredAt || '').localeCompare(left.occurredAt || '');
    if (byOccurred !== 0) return byOccurred;
    return (right.recordedAt || '').localeCompare(left.recordedAt || '');
  },
  toRow: (record, userId) => ({
    user_id: userId,
    id: record.id,
    event_type: record.eventType,
    occurred_at: record.occurredAt,
    recorded_at: record.recordedAt,
    account_id: record.accountId || null,
    opportunity_id: record.opportunityId || null,
    thread_id: record.threadId || null,
    commitment_id: record.commitmentId || null,
    summary: record.summary,
    structured_payload: record.structuredPayload,
    idempotency_key: record.idempotencyKey || null,
    source_type: record.sourceType,
    source_id: record.sourceId || null,
    source_url: record.sourceUrl || null,
    source_updated_at: record.sourceUpdatedAt || null,
    created_at: record.createdAt,
  }),
  fromRow: (row) => eventCodec.sanitize({
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
    accountId: row.account_id,
    opportunityId: row.opportunity_id,
    threadId: row.thread_id,
    commitmentId: row.commitment_id,
    summary: row.summary,
    structuredPayload: row.structured_payload,
    idempotencyKey: row.idempotency_key,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceUrl: row.source_url,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
  }),
  sanitize: (value) => {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;
    const id = text(raw.id);
    const eventType = typeof raw.eventType === 'string' ? raw.eventType : '';
    // An unrecognised event type is dropped rather than stored: history that
    // nothing can interpret is noise, and keeping it would let a typo become a
    // permanent phantom row in Timeline.
    if (!id || !(commercialEventTypes as readonly string[]).includes(eventType)) return null;

    return {
      id,
      userId: optionalText(raw.userId),
      eventType: eventType as CommercialEvent['eventType'],
      occurredAt: isoOrNow(raw.occurredAt),
      recordedAt: isoOrNow(raw.recordedAt),
      accountId: optionalText(raw.accountId),
      opportunityId: optionalText(raw.opportunityId),
      threadId: optionalText(raw.threadId),
      commitmentId: optionalText(raw.commitmentId),
      summary: text(raw.summary),
      structuredPayload:
        raw.structuredPayload && typeof raw.structuredPayload === 'object' && !Array.isArray(raw.structuredPayload)
          ? (raw.structuredPayload as Record<string, unknown>)
          : {},
      idempotencyKey: optionalText(raw.idempotencyKey),
      sourceType: oneOf(raw.sourceType, sourceTypes, 'manual'),
      sourceId: optionalText(raw.sourceId),
      sourceUrl: optionalText(raw.sourceUrl),
      sourceUpdatedAt: optionalText(raw.sourceUpdatedAt),
      createdAt: isoOrNow(raw.createdAt),
      ...(raw.isSample === true ? { isSample: true } : {}),
    };
  },
};

export function loadEvents() {
  return readLocal(eventCodec);
}

export function loadEventsForWorkspace(userId?: string | null, sampleDataActive = false) {
  return loadForWorkspace(eventCodec, userId, sampleDataActive);
}

/**
 * Appends an event. Returns the stored list unchanged if an event with the same
 * idempotency key is already present - the guard that lets a CSV re-import or a
 * re-run rule be safe to repeat.
 */
export function appendEvent(record: CommercialEvent, options: { syncCloud?: boolean } = {}) {
  const existing = loadEvents();
  if (record.idempotencyKey && existing.some((item) => item.idempotencyKey === record.idempotencyKey)) {
    return existing;
  }

  const next = writeLocal(eventCodec, [
    record,
    ...existing.filter((item) => item.id !== record.id),
  ]).slice(0, LOCAL_EVENT_LIMIT);

  // Re-write only if the cap actually trimmed something, so the common path
  // does not pay for a second serialization.
  const stored = next.length === existing.length + 1 ? next : writeLocal(eventCodec, next);
  if (options.syncCloud !== false) syncRecordsForCurrentUser(eventCodec, [record]);
  return stored;
}

export function newEventId() {
  return kernelId('event');
}
