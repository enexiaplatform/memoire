import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { isValidBusinessDate } from '../../utils/safeDate.ts';
import type { SourceMetadata } from './types.ts';
// Type-only, so this file can name the dimension vocabulary without becoming a
// runtime dependency of the module that also reads evidence. Delta imports
// values from here; here imports nothing but a type from there.
import type { CommercialDimension } from './deriveDelta.ts';

/**
 * Commercial Evidence: what the seller has learned, as opposed to what Memoire
 * watched happen.
 *
 * ## Why this is not a CommercialEvent
 *
 * The kernel already has a record called "something that happened", and the
 * temptation to reuse it here is strong and wrong. Every event type in the
 * kernel is written by a command *as a side effect of a state change Memoire
 * itself made*: a stage moved under `updateOpportunity`, a promise was ticked,
 * a quote was sent. Their truth is guaranteed by construction - Memoire was
 * holding the record when it changed.
 *
 * "The trial passed" is a different kind of claim. Nothing in the workspace
 * changed; the seller is reporting the outside world, and the claim rests on
 * their word plus the sentence they wrote. Three consequences follow, and each
 * one on its own rules the event log out:
 *
 *   1. Events are never edited. Evidence is proposed by a parser and corrected
 *      by the operator before it is saved, and a wrong observed date has to be
 *      fixable afterwards.
 *   2. Events answer "what happened". Evidence has to answer "what do we
 *      currently know", which is a fold, and the kernel deliberately derives
 *      current state from records rather than from the log.
 *   3. The log is forward-only. Phase 1 established that the event stream is
 *      empty for every workspace older than the instrumentation, so an
 *      evidence model built on events could not describe a trial that happened
 *      last month. A dated record can, and does.
 *
 * ## Why this is not an objection, an activity, or the evidence text box
 *
 * An objection is a blocker the customer raised; recording "trial passed" as a
 * resolved objection would assert an objection that never existed. An activity
 * is a thing the seller did - "met QC" - and the meeting is not the finding. And
 * `opportunity.evidence` is one free-text box that is overwritten on every edit:
 * it cannot hold a failed trial on the 1st and a passed retest on the 5th, and
 * it cannot say which is current.
 *
 * ## Why this is not Smart Attributes
 *
 * The category set is closed, enumerated here, mirrored by a database CHECK
 * constraint, and mapped exhaustively onto the dimensions the kernel already
 * reasons in. There is no user-defined key, no free-form name, no value type,
 * and no way to add a category without a code change that the type system
 * forces you to finish. An attribute system is one where the schema is data;
 * here the schema is code.
 */

// ----------------------------------------------------------------- vocabulary

/**
 * What kind of thing is known. Exactly one today.
 *
 * A category earns its place by passing three tests: it happens in ordinary
 * technical selling, the kernel already has reasoning it changes, and there is
 * no existing field that says it more honestly. `technical_outcome` passes all
 * three - a trial result is the gating fact in a consultative sale, it is what
 * `OPPORTUNITY_WITHOUT_STAGE_EVIDENCE` is asking for, and nothing in the
 * workspace can currently hold it.
 *
 * Two candidates were investigated and deliberately left out:
 *
 *   Commercial signals. "Procurement started" is a stage move and "the decision
 *   slipped" is an expected-close move; both already have canonical homes, and
 *   a second place to say them is how two surfaces come to disagree. The one
 *   member with no home - "budget confirmed" - changes no rule that exists, so
 *   storing it would be storage for its own sake.
 *
 *   Competitor context. The parser recognises it, and recognising is not a
 *   reason to store: no policy rule, no Delta reading and no ranking dimension
 *   would behave differently today, and building the store first is how a
 *   feature arrives before the thinking that justifies it.
 */
export const evidenceCategories = ['technical_outcome'] as const;
export type EvidenceCategory = (typeof evidenceCategories)[number];

/**
 * Which way the fact points, commercially.
 *
 * Three words, not a score. A number here would be a sentiment reading dressed
 * up as a measurement, and the first surface that sorted by it would be ranking
 * deals on an adjective.
 *
 * `neutral` is a real answer and not a shrug: "the trial is still running" is a
 * true, useful, directionless fact, and forcing it into positive or negative is
 * exactly the overclaim this vocabulary exists to prevent.
 */
export const evidenceDirections = ['positive', 'negative', 'neutral'] as const;
export type EvidenceDirection = (typeof evidenceDirections)[number];

/** A one-line label per category, for headings and for content-free counting. */
export const evidenceCategoryLabels: Record<EvidenceCategory, string> = {
  technical_outcome: 'Technical evidence',
};

/**
 * What part of the commercial position each category speaks to.
 *
 * Total over the category set on purpose. Adding a category without deciding
 * what it is relevant to is then a compile error rather than a fact that
 * silently applies to everything - which is the Phase 2.1 failure mode, in a
 * new place.
 */
export const evidenceCategoryDimensions: Record<EvidenceCategory, CommercialDimension> = {
  technical_outcome: 'technical',
};

// --------------------------------------------------------------------- record

export type CommercialEvidence = {
  id: string;
  userId: string | null;
  /** Deals link to customers by name in this workspace; the name travels. */
  accountName: string;
  accountId: string;
  opportunityId?: string | null;
  threadId?: string | null;
  category: EvidenceCategory;
  direction: EvidenceDirection;
  /** One canonical line: "Trial accepted". Never the whole note. */
  summary: string;
  /**
   * The operator's own sentence, kept verbatim.
   *
   * Mandatory, and the reason a claim can be checked. "Why does Memoire believe
   * the trial passed" has exactly one honest answer, and it is this string.
   */
  evidenceText: string;
  /** The business day the thing was observed, not the day it was typed. */
  observedAt: string;
  /** When Memoire learned it. Differs from `observedAt` for a back-dated note. */
  recordedAt: string;
  sourceActivityId?: string | null;
  createdAt: string;
  updatedAt: string;
  isSample?: boolean;
} & SourceMetadata;

// ---------------------------------------------------------------- supersession

/**
 * The scope a piece of evidence is current *within*.
 *
 * A deal, when the evidence names one; otherwise the customer. Evidence on one
 * deal never supersedes evidence on another, and account-level evidence and
 * deal-level evidence are separate lines - a trial for the plant is not the
 * same claim as a trial for one order, and folding them would let either
 * silence the other.
 */
export function evidenceScopeKey(record: Pick<CommercialEvidence, 'opportunityId' | 'accountName'>): string {
  if (record.opportunityId) return `opportunity:${record.opportunityId}`;
  return `account:${normalizeEntityName(record.accountName || '')}`;
}

function projectionKey(record: CommercialEvidence): string {
  return `${evidenceScopeKey(record)}|${record.category}`;
}

/**
 * The current reading, and the history behind it.
 *
 * The supersession rule is the smallest one that can be stated in a sentence:
 * within one scope and one category, the latest observation is what is true
 * now. Nothing is deleted, nothing is rewritten, and every earlier record stays
 * exactly as it was recorded - a trial that failed on the 1st really did fail
 * on the 1st, and a product that erases that to keep its summary tidy is lying
 * about the deal's history.
 *
 * Ties are broken by `recordedAt` and then by id, so two observations sharing a
 * day resolve the same way on every run rather than swapping between loads.
 */
export type EvidenceProjection = {
  /** Latest per scope+category, keyed by scope key. */
  currentByScope: Map<string, CommercialEvidence[]>;
  /** Every record that a later one has replaced. */
  supersededIds: Set<string>;
  /** What replaced each superseded record. */
  supersededBy: Map<string, string>;
};

export function projectCurrentEvidence(records: CommercialEvidence[]): EvidenceProjection {
  const latest = new Map<string, CommercialEvidence>();
  const supersededIds = new Set<string>();
  const supersededBy = new Map<string, string>();

  for (const record of records) {
    const key = projectionKey(record);
    const held = latest.get(key);
    if (!held) {
      latest.set(key, record);
      continue;
    }
    const [winner, loser] = isMoreRecentObservation(record, held) ? [record, held] : [held, record];
    latest.set(key, winner);
    supersededIds.add(loser.id);
    supersededBy.set(loser.id, winner.id);
  }

  const currentByScope = new Map<string, CommercialEvidence[]>();
  for (const record of latest.values()) {
    const scope = evidenceScopeKey(record);
    const bucket = currentByScope.get(scope);
    if (bucket) bucket.push(record);
    else currentByScope.set(scope, [record]);
  }

  return { currentByScope, supersededIds, supersededBy };
}

/**
 * Whether `candidate` is a later observation than `held`.
 *
 * Compared on the observed day first, because that is the day the business
 * learned it. An unreadable date loses rather than winning: a broken string
 * sorting to the top is how a garbled record became "the newest touch" in the
 * silence detector, and that lesson is cheap to reapply here.
 */
function isMoreRecentObservation(candidate: CommercialEvidence, held: CommercialEvidence): boolean {
  const candidateDay = isValidBusinessDate(candidate.observedAt) ? candidate.observedAt : '';
  const heldDay = isValidBusinessDate(held.observedAt) ? held.observedAt : '';
  if (candidateDay !== heldDay) return candidateDay > heldDay;
  if ((candidate.recordedAt || '') !== (held.recordedAt || '')) {
    return (candidate.recordedAt || '') > (held.recordedAt || '');
  }
  return candidate.id > held.id;
}

/**
 * The evidence that currently supports a deal claiming the stage it claims.
 *
 * Negative evidence is deliberately not counted. `OPPORTUNITY_WITHOUT_STAGE_EVIDENCE`
 * asks what supports the stage; a failed trial is recorded, relevant, and the
 * opposite of support, so a deal sitting at Demo with a failed trial still has
 * that gap and should still be told so.
 */
export function supportingEvidenceFor(
  projection: EvidenceProjection,
  scope: { opportunityId?: string | null; accountName?: string | null },
): CommercialEvidence[] {
  const key = evidenceScopeKey({
    opportunityId: scope.opportunityId || null,
    accountName: scope.accountName || '',
  });
  return (projection.currentByScope.get(key) || []).filter((record) => record.direction !== 'negative');
}

/** Every current record in one scope, whichever way it points. */
export function currentEvidenceFor(
  projection: EvidenceProjection,
  scope: { opportunityId?: string | null; accountName?: string | null },
): CommercialEvidence[] {
  const key = evidenceScopeKey({
    opportunityId: scope.opportunityId || null,
    accountName: scope.accountName || '',
  });
  return projection.currentByScope.get(key) || [];
}

/** The direction as Delta reads it. Evidence keeps its own word; Delta keeps its. */
export function deltaDirectionForEvidence(direction: EvidenceDirection): 'improved' | 'weakened' | 'neutral' {
  if (direction === 'positive') return 'improved';
  if (direction === 'negative') return 'weakened';
  return 'neutral';
}
