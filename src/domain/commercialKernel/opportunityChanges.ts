import { isLeadStage } from '../../utils/leadIdentity.ts';
import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import { recordCommercialEvent } from './commands.ts';
import type { CommercialEvent, CommercialEventType, CommercialScope } from './types.ts';

/**
 * Observing the four opportunity changes that alter what the forecast means.
 *
 * `updateOpportunity` writes a record and moves `updated_at`. That timestamp
 * says something changed; it cannot say what, or what it changed from. Every
 * "what changed" feature built on it has therefore had to guess, and the guess
 * has been wrong in the same direction every time - asserting a stage move that
 * was really a typo fix in the notes field.
 *
 * The fix is small and it has to happen at the one moment the answer is free:
 * the update call already holds the previous record and the requested next one,
 * so the diff costs nothing and needs no history table. Four fields, chosen
 * because each one changes a number the seller is measured on:
 *
 *   stage                 - where the deal is claimed to be
 *   expectedClosePeriod   - which quarter the money is claimed to land in
 *   estimatedValue        - how much money is claimed
 *   status (Won/Lost)     - whether it is still claimed at all
 *
 * Deliberately NOT instrumented: `nextActionDate`, `evidence`, `notes`,
 * `decisionRecommendation`. They churn on almost every edit, the policy engine
 * already watches their current state as a condition, and an event per keystroke
 * is the timeline this work exists not to rebuild.
 */

export const OPPORTUNITY_CHANGE_FIELDS = [
  'stage',
  'expectedClosePeriod',
  'estimatedValue',
  'status',
] as const;
export type OpportunityChangeField = (typeof OPPORTUNITY_CHANGE_FIELDS)[number];

/**
 * How far a value must move before it is a change rather than a correction.
 *
 * Ten percent. Rounding a 498,000 estimate to 500,000 is housekeeping; taking
 * it to 300,000 is news.
 */
export const VALUE_CHANGE_RATIO = 0.1;

export type OpportunityFieldChange = {
  field: OpportunityChangeField;
  eventType: CommercialEventType;
  from: string;
  to: string;
  summary: string;
  /**
   * The currency the two amounts are in, on a value move only.
   *
   * A raw domain value, not a formatted string. Without it the payload carries
   * `300000000 -> 450000000` and every reader has to guess the unit; with it,
   * Delta can put the figures through the product's own money formatter at the
   * point it writes a sentence. Formatting stays out of the payload, because a
   * stored `"300M VND"` cannot be compared, converted or re-rendered in the
   * reader's reporting currency later.
   */
  currency?: string;
};

/**
 * What actually moved between two versions of a deal.
 *
 * Pure, so the decision to record an event can be tested without a store, and
 * so "did anything meaningful change?" is answerable without writing anything.
 *
 * A field that had no previous value produces nothing. Setting a stage for the
 * first time is not a move from somewhere, and rendering it as one - "moved
 * → Proposal" - is the same false-transition claim in a smaller font.
 */
export function diffOpportunityState(
  previous: Pick<CrmLiteOpportunity, OpportunityChangeField | 'opportunityName'> & { currency?: string; nurturedUntil?: string; nurtureReason?: string },
  next: Pick<CrmLiteOpportunity, OpportunityChangeField>,
): OpportunityFieldChange[] {
  const changes: OpportunityFieldChange[] = [];

  const beforeStage = (previous.stage || '').trim();
  const afterStage = (next.stage || '').trim();
  if (beforeStage && afterStage && beforeStage !== afterStage) {
    changes.push({
      field: 'stage',
      eventType: 'opportunity_stage_changed',
      from: beforeStage,
      to: afterStage,
      summary: `${previous.opportunityName}: stage ${beforeStage} → ${afterStage}`,
    });
  }

  const beforePeriod = (previous.expectedClosePeriod || '').trim();
  const afterPeriod = (next.expectedClosePeriod || '').trim();
  if (beforePeriod && afterPeriod && beforePeriod !== afterPeriod) {
    changes.push({
      field: 'expectedClosePeriod',
      eventType: 'opportunity_close_period_changed',
      from: beforePeriod,
      to: afterPeriod,
      summary: `${previous.opportunityName}: expected close ${beforePeriod} → ${afterPeriod}`,
    });
  }

  const beforeValue = previous.estimatedValue;
  const afterValue = next.estimatedValue;
  if (
    typeof beforeValue === 'number' && Number.isFinite(beforeValue) && beforeValue > 0
    && typeof afterValue === 'number' && Number.isFinite(afterValue)
    && Math.abs(afterValue - beforeValue) / Math.abs(beforeValue) >= VALUE_CHANGE_RATIO
  ) {
    changes.push({
      field: 'estimatedValue',
      eventType: 'opportunity_value_changed',
      from: String(beforeValue),
      to: String(afterValue),
      summary: `${previous.opportunityName}: value ${beforeValue} → ${afterValue}`,
      ...(previous.currency ? { currency: previous.currency } : {}),
    });
  }

  const beforeStatus = (previous.status || '').trim();
  const afterStatus = (next.status || '').trim();
  // Only the two outcomes. An Active↔On hold flip has no settled event type and
  // no reader, and inventing one for it would be modelling ahead of a need.
  if (beforeStatus && afterStatus && beforeStatus !== afterStatus
    && (afterStatus === 'Won' || afterStatus === 'Lost')) {
    changes.push({
      field: 'status',
      eventType: afterStatus === 'Won' ? 'opportunity_won' : 'opportunity_lost',
      from: beforeStatus,
      to: afterStatus,
      summary: `${previous.opportunityName}: ${beforeStatus} → ${afterStatus}`,
    });
  }

  return changes;
}

/**
 * The key that makes a repeated save write one row instead of two.
 *
 * It is the field plus **the revision the mutation started from** - the
 * `updatedAt` of the version of the record being changed.
 *
 * The first version of this keyed on the transition plus the calendar day, and
 * it was wrong in a way that only appears on a deal somebody is actually
 * working: a stage moved Proposal -> Negotiation, back to Proposal after a
 * call, and to Negotiation again the same afternoon. Two genuinely different
 * A->B transitions, one key. The second was discarded, so the history said the
 * deal moved forward once when it had moved three times.
 *
 * The starting revision separates them exactly. Two genuine A->B transitions
 * cannot share one, because the B->A write between them moved `updatedAt`. A
 * retry of the *same* logical mutation does share one, because it starts from
 * the same version of the record - which is exactly the property retry
 * idempotency needs, and exactly what a random id would destroy.
 *
 * A record carrying no revision stamp falls back to the day. That is the old,
 * weaker behaviour, kept because the alternative - no key at all - fails in the
 * direction of writing duplicates.
 */
export function opportunityChangeIdempotencyKey(
  opportunityId: string,
  field: OpportunityChangeField,
  fromRevision: string,
): string {
  return `opp-change:${opportunityId}:${field}:${trim(fromRevision, 60)}`;
}

/**
 * Records the observed changes, one event each.
 *
 * Called after the record write, never instead of it: the canonical state is
 * the opportunity, and a failure to note history must not cost the operator
 * their edit.
 *
 * Durability comes from the local-first write path rather than from a queue.
 * `recordCommercialEvent` appends to the browser copy synchronously and offers
 * the row to the cloud in the background; a cloud failure leaves the event in
 * localStorage, and the next windowed read offers it again (see
 * `loadRecentEvents`, which pushes exactly the in-window events the cloud is
 * missing). The record is its own queue entry - the same discipline the offline
 * capture queue uses, and the reason there is no second list to go stale.
 *
 * Repeats are handled by `opportunityChangeIdempotencyKey`; see it for why the
 * key is the revision the mutation started from.
 */
export function recordOpportunityStateChanges(
  scope: CommercialScope,
  previous: Pick<
    CrmLiteOpportunity,
    OpportunityChangeField | 'opportunityName' | 'id' | 'accountName' | 'updatedAt'
  > & { currency?: string; nurturedUntil?: string; nurtureReason?: string },
  next: Pick<CrmLiteOpportunity, OpportunityChangeField>,
  options: { occurredAt?: string } = {},
): CommercialEvent[] {
  const changes = diffOpportunityState(previous, next);
  if (changes.length === 0) return [];

  const occurredAt = options.occurredAt || new Date().toISOString();
  const dayKey = occurredAt.slice(0, 10);

  return changes.map((change) => recordCommercialEvent(scope, {
    eventType: change.eventType,
    summary: change.summary,
    occurredAt,
    opportunityId: previous.id,
    structuredPayload: {
      field: change.field,
      from: change.from,
      to: change.to,
      // A deal links to its account by name, not by id, so the name travels
      // with the event or an account-scoped reader can never find it.
      accountName: previous.accountName,
      ...(change.currency ? { currency: change.currency } : {}),
      // Clearing the active schedule must not erase why this Lead was parked.
      ...(change.field === 'stage' && isLeadStage(previous.stage) && previous.nurturedUntil
        ? { previousNurture: { revisitDate: previous.nurturedUntil, reason: previous.nurtureReason || '' } }
        : {}),
    },
    idempotencyKey: opportunityChangeIdempotencyKey(
      previous.id, change.field, previous.updatedAt || dayKey,
    ),
  }, { requireDurable: true }));
}

function trim(value: string, max = 40) {
  return value.slice(0, max);
}
