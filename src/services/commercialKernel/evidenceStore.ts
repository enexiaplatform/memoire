import {
  evidenceCategories,
  evidenceDirections,
  type CommercialEvidence,
} from '../../domain/commercialKernel/commercialEvidence.ts';
import { sourceTypes } from '../../domain/commercialKernel/types.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
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

export const EVIDENCE_STORAGE_KEY = 'memoire.commercialEvidence.v1';
export const EVIDENCE_UPDATED_EVENT = 'memoire:commercial-evidence-updated';

/**
 * Commercial Evidence rides the relational kernel path, not the JSON bag.
 *
 * The JSON-collection pattern is cheaper and is the right home for payloads
 * with no lifecycle - review packs, cached nudges, order costs. Evidence is not
 * one of those, for one reason that decides it: the category set has to be
 * closed. A `jsonb` payload will accept any string anybody ever writes into it,
 * and the moment that is true, this record is a custom-field system with a
 * suggestive name. A CHECK constraint on `category` and `direction` is what
 * makes "no arbitrary category creation" a property of the data rather than a
 * promise in a code review.
 *
 * The second reason is ordinary: supersession reads the latest observation per
 * scope and category, which is an index on (user, opportunity, category,
 * observed_at desc) and a full scan of a blob.
 */
export const evidenceCodec: KernelCodec<CommercialEvidence> = {
  table: 'commercial_evidence',
  storageKey: EVIDENCE_STORAGE_KEY,
  updatedEvent: EVIDENCE_UPDATED_EVENT,
  orderColumn: 'observed_at',
  compare: (left, right) => (right.observedAt || '').localeCompare(left.observedAt || '')
    || (right.recordedAt || '').localeCompare(left.recordedAt || '')
    || left.id.localeCompare(right.id),
  toRow: (record, userId) => ({
    user_id: userId,
    id: record.id,
    account_id: record.accountId || null,
    account_name: record.accountName,
    opportunity_id: record.opportunityId || null,
    thread_id: record.threadId || null,
    category: record.category,
    direction: record.direction,
    summary: record.summary,
    evidence_text: record.evidenceText,
    observed_at: record.observedAt,
    recorded_at: record.recordedAt,
    source_activity_id: record.sourceActivityId || null,
    source_type: record.sourceType,
    source_id: record.sourceId || null,
    source_url: record.sourceUrl || null,
    source_updated_at: record.sourceUpdatedAt || null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }),
  fromRow: (row) => evidenceCodec.sanitize({
    id: row.id,
    userId: row.user_id,
    accountId: row.account_id,
    accountName: row.account_name,
    opportunityId: row.opportunity_id,
    threadId: row.thread_id,
    category: row.category,
    direction: row.direction,
    summary: row.summary,
    evidenceText: row.evidence_text,
    observedAt: row.observed_at,
    recordedAt: row.recorded_at,
    sourceActivityId: row.source_activity_id,
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

    // Provenance is not optional. A claim with no sentence behind it is exactly
    // the free-floating assertion this record exists to make impossible, so it
    // is dropped on the way in rather than rendered with an empty quote.
    const evidenceText = text(raw.evidenceText).trim();
    if (!evidenceText) return null;

    const observedAt = sanitizeBusinessDate(text(raw.observedAt));
    if (!observedAt) return null;

    return {
      id,
      userId: optionalText(raw.userId),
      accountId: text(raw.accountId),
      accountName: text(raw.accountName),
      opportunityId: optionalText(raw.opportunityId),
      threadId: optionalText(raw.threadId),
      category: oneOf(raw.category, evidenceCategories, 'technical_outcome'),
      direction: oneOf(raw.direction, evidenceDirections, 'neutral'),
      summary: text(raw.summary) || evidenceText.slice(0, 120),
      evidenceText,
      observedAt,
      recordedAt: isoOrNow(raw.recordedAt),
      sourceActivityId: optionalText(raw.sourceActivityId),
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

export function loadCommercialEvidence() {
  return readLocal(evidenceCodec);
}

export function loadCommercialEvidenceForWorkspace(userId?: string | null, sampleDataActive = false) {
  return loadForWorkspace(evidenceCodec, userId, sampleDataActive);
}

export function saveCommercialEvidence(record: CommercialEvidence, options: { syncCloud?: boolean } = {}) {
  const next = writeLocal(evidenceCodec, [
    record,
    ...loadCommercialEvidence().filter((item) => item.id !== record.id),
  ]);
  if (options.syncCloud !== false) syncRecordsForCurrentUser(evidenceCodec, [record]);
  return next;
}

export function newEvidenceId() {
  return kernelId('evidence');
}
