import type { ObjectionRecord, ObjectionType } from '../../services/objectionStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { StakeholderRecord } from '../../services/stakeholderStore';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { isValidBusinessDate, sanitizeBusinessDate } from '../../utils/safeDate.ts';
import type { PlanRecord } from '../../utils/weeklyPlan';
import {
  policyThresholds,
  reasonCodes,
  type ReasonCode,
  type Recommendation,
  type Severity,
} from './policyEngine.ts';
import {
  deltaDirectionForEvidence,
  evidenceCategoryDimensions,
  evidenceCategoryLabels,
  projectCurrentEvidence,
  type CommercialEvidence,
} from './commercialEvidence.ts';
import { formatCompactCurrencyAmount } from '../../utils/money.ts';
import { closePeriodMoveDirection } from '../../utils/closePeriod.ts';
import {
  opportunityStages as canonicalStages,
  toCanonicalOpportunityStage,
  type CommercialCommitment,
  type CommercialEvent,
} from './types.ts';

/**
 * Delta Intelligence: what changed, so what, now what.
 *
 * This module exists because of one rule that the product got wrong before it
 * existed, and that it must never get wrong again:
 *
 *   A record's `updated_at` proves that something changed. It does not prove
 *   WHAT changed.
 *
 * The previous "what changed" implementation (features/v31/whatChangedDigest)
 * read `opportunity.updated_at`, found it recent, and printed "Opportunity
 * stage updated" - a sentence asserting a transition nobody ever observed. On a
 * book where every deal is touched weekly that is a page of confident fiction.
 *
 * So this file splits the answer in two, structurally rather than by
 * convention, because a convention is what the last one broke:
 *
 *   `changes`    - transitions Memoire actually OBSERVED. Every one carries a
 *                  before/after or a dated occurrence, and the record that
 *                  proves it. Past-tense wording is allowed here and nowhere
 *                  else.
 *   `conditions` - what is true about this subject RIGHT NOW. Phrased as a
 *                  state, never as a change. These are not re-derived here:
 *                  they are the Commercial Kernel's own policy recommendations,
 *                  filtered to the subject, so there is exactly one set of
 *                  thresholds in the product and Delta cannot drift from the
 *                  risk panel sitting next to it.
 *
 * Three further rules this file is built around:
 *
 *   1. Nothing is written. This is a pure function of records plus an injected
 *      `today`. Same inputs, same output, forever.
 *   2. No new recommendation is invented. "Now what" is a pointer at the policy
 *      engine's existing answer. Ranking belongs to a later phase.
 *   3. History coverage is stated, not assumed. Field-level transitions only
 *      exist from the day instrumentation shipped; `historyCoverage` says so,
 *      and the interface is expected to repeat it rather than imply six months
 *      of transitions that were never recorded.
 */

// ------------------------------------------------------------------ vocabulary

/** How a claim is known. The first three are observations; the last two are state. */
export const deltaProvenances = [
  /** A CommercialEvent, written when a command observed the transition. */
  'event',
  /** A record field that preserves its own prior value (e.g. dueDateHistory). */
  'record_history',
  /** A dated record whose appearance in the window IS the change. */
  'record_occurrence',
  /** A policy recommendation about the present. Never a transition. */
  'policy',
] as const;
export type DeltaProvenance = (typeof deltaProvenances)[number];

/** Provenances that may carry past-tense, transition wording. */
export const OBSERVED_PROVENANCES: readonly DeltaProvenance[] = [
  'event',
  'record_history',
  'record_occurrence',
];

export const deltaChangeKinds = [
  // ---- observed transitions
  'stage_changed',
  'close_period_changed',
  'value_changed',
  'outcome_recorded',
  'money_state_changed',
  'commitment_made',
  'commitment_completed',
  'commitment_rescheduled',
  'objection_opened',
  'objection_resolved',
  'stakeholder_added',
  'silence_broken',
  'evidence_recorded',
  // ---- current conditions (one per policy reason code)
  'commitment_overdue',
  'commitment_unreliable',
  'commitment_unowned',
  'commitment_undated',
  'thread_silent',
  'no_next_commitment',
  'stage_without_evidence',
  'next_action_missing',
  'quote_expiring',
  'money_checkpoint_stuck',
  'coverage_low',
  'forecast_unsupported',
] as const;
export type DeltaChangeKind = (typeof deltaChangeKinds)[number];

/**
 * Which part of the commercial position a change speaks to.
 *
 * Six, deliberately. This is the vocabulary the "so what" sentence is built
 * from, and a seventh dimension buys a nuance nobody can act on differently.
 */
export const commercialDimensions = [
  'momentum',
  'purchasing',
  'technical',
  'stakeholder',
  'money',
  'qualification',
] as const;
export type CommercialDimension = (typeof commercialDimensions)[number];

/** Whether the commercial position got better or worse. Not whether risk rose. */
export type DeltaDirection = 'improved' | 'weakened' | 'neutral';

// ---------------------------------------------------------------------- types

export type CommercialDeltaSubject =
  | { kind: 'account'; id: string; name: string }
  | { kind: 'opportunity'; id: string; name: string; accountName: string }
  | { kind: 'thread'; id: string; name: string; accountName: string; opportunityId?: string | null };

export type CommercialDeltaItem = {
  id: string;
  kind: DeltaChangeKind;
  /**
   * `transition` means Memoire saw it happen. `condition` means it is true now.
   * The two never mix in one item, and the UI reads them under different
   * headings, because "purchasing risk increased" and "purchasing risk is
   * elevated" are different claims and only one of them needs history.
   */
  observation: 'transition' | 'condition';
  provenance: DeltaProvenance;
  /** One sentence, in the operator's own record language. */
  statement: string;
  /**
   * The observed before and after. Present ONLY when a real prior value was
   * recorded - never reconstructed from the current value plus a timestamp.
   */
  transition?: { from: string; to: string };
  /** When it happened. Null for conditions: a condition is true now, not "at" a time. */
  occurredAt: string | null;
  dimension: CommercialDimension;
  direction: DeltaDirection;
  /** Reuses the kernel severity vocabulary. Delta introduces no second scale. */
  significance: Severity;
  sourceRecordIds: string[];
  /** Set on conditions, so a row traces back to the policy rule that raised it. */
  reasonCode?: ReasonCode;
  /** How many records this row stands for, when identical changes were grouped. */
  groupedCount?: number;
  /**
   * The later observation that replaced this one, when there is one.
   *
   * The row stays in the list: a trial that failed on the 1st really did fail
   * on the 1st, and deleting it to keep the summary tidy would be rewriting the
   * deal's history. What the flag buys is that the reading and the ranking skip
   * it, so a superseded fact is visible without still being in charge.
   */
  supersededBy?: string;
};

/**
 * How much of the window Memoire can actually speak to.
 *
 * `observedFrom` is the earliest commercial event this workspace can offer. It
 * is not a hardcoded deployment date: a workspace that has never recorded an
 * event reports null, and one whose history was trimmed by the load window
 * reports the window edge. Both understate coverage rather than overstate it,
 * which is the only safe direction for this number.
 */
export type DeltaHistoryCoverage = {
  observedFrom: string | null;
  /** True only when the whole requested window sits inside observed history. */
  complete: boolean;
};

export type CommercialDeltaInterpretation = {
  statement: string;
  /** The item ids this reading was built from. Nothing else may support it. */
  basis: string[];
};

export type CommercialDelta = {
  subject: CommercialDeltaSubject;
  period: { since: string; until: string; days: number };
  historyCoverage: DeltaHistoryCoverage;
  /** Observed transitions, newest first. */
  changes: CommercialDeltaItem[];
  /** Present-tense conditions, most severe first. */
  conditions: CommercialDeltaItem[];
  /** Null whenever the evidence does not support a reading. Never filler prose. */
  interpretation: CommercialDeltaInterpretation | null;
  /**
   * The policy engine's existing answer for this subject. Delta selects; it
   * never scores, weights or invents. A second recommendation engine is exactly
   * what this product does not need.
   */
  recommendation: Recommendation | null;
  evidenceRecordIds: string[];
  calculatedAt: string;
};

// ----------------------------------------------------------------- thresholds

/**
 * The window Delta looks back over.
 *
 * Fourteen days, matching the rhythm the rest of the kernel already assumes:
 * a thread is silent at 10 days and a money checkpoint is stuck at 14, so a
 * fortnight is the shortest window that can contain either becoming true. It is
 * an input with a default rather than a constant, so a caller can widen it
 * without this module learning about surfaces.
 */
export const DELTA_WINDOW_DAYS = 14;

/**
 * How many identical changes may be listed before they collapse into one row.
 *
 * Three. A CSV import can create forty stakeholders on one account on one day,
 * and forty rows saying "stakeholder added" is the timeline this module exists
 * not to be.
 */
export const DELTA_GROUP_AFTER = 3;

/**
 * Every policy reason code, mapped onto the condition it describes.
 *
 * Declared as a total record over `ReasonCode` on purpose: adding a rule to the
 * policy engine without deciding what it means for Delta is then a type error
 * rather than a row that silently never appears.
 */
const CONDITION_BY_REASON: Record<ReasonCode, {
  kind: DeltaChangeKind;
  dimension: CommercialDimension;
  direction: DeltaDirection;
}> = {
  CUSTOMER_COMMITMENT_OVERDUE: { kind: 'commitment_overdue', dimension: 'momentum', direction: 'weakened' },
  SELF_COMMITMENT_OVERDUE: { kind: 'commitment_overdue', dimension: 'momentum', direction: 'weakened' },
  COMMITMENT_REPEATEDLY_RESCHEDULED: { kind: 'commitment_unreliable', dimension: 'momentum', direction: 'weakened' },
  COMMITMENT_WITHOUT_OWNER: { kind: 'commitment_unowned', dimension: 'momentum', direction: 'neutral' },
  COMMITMENT_WITHOUT_DUE_DATE: { kind: 'commitment_undated', dimension: 'momentum', direction: 'neutral' },
  THREAD_SILENT: { kind: 'thread_silent', dimension: 'momentum', direction: 'weakened' },
  THREAD_WITHOUT_NEXT_COMMITMENT: { kind: 'no_next_commitment', dimension: 'momentum', direction: 'weakened' },
  OPPORTUNITY_WITHOUT_STAGE_EVIDENCE: { kind: 'stage_without_evidence', dimension: 'qualification', direction: 'weakened' },
  OPPORTUNITY_WITHOUT_FUTURE_ACTION: { kind: 'next_action_missing', dimension: 'momentum', direction: 'weakened' },
  QUOTE_EXPIRING: { kind: 'quote_expiring', dimension: 'money', direction: 'weakened' },
  MONEY_CHECKPOINT_STUCK: { kind: 'money_checkpoint_stuck', dimension: 'money', direction: 'weakened' },
  PERIOD_COVERAGE_LOW: { kind: 'coverage_low', dimension: 'money', direction: 'weakened' },
  FORECAST_NOT_SUPPORTED: { kind: 'forecast_unsupported', dimension: 'qualification', direction: 'weakened' },
};

/** Which part of the deal an objection is really about. */
const DIMENSION_BY_OBJECTION: Record<ObjectionType, CommercialDimension> = {
  Price: 'purchasing',
  Budget: 'purchasing',
  Procurement: 'purchasing',
  Competitor: 'purchasing',
  'Technical fit': 'technical',
  'Compliance / validation': 'technical',
  Documentation: 'technical',
  'Lead time': 'technical',
  'Local support': 'technical',
  'Trust / relationship': 'stakeholder',
  Timing: 'money',
  Other: 'qualification',
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_WEIGHT: Record<Severity, number> = { critical: 3, high: 2, medium: 1, low: 1 };

// ------------------------------------------------------------------- the input

export type DeltaInput = {
  subject: CommercialDeltaSubject;
  /** Bounded event window from the store. Never the whole history. */
  events: CommercialEvent[];
  commitments: CommercialCommitment[];
  /**
   * The Plan, because that is where promises are actually kept.
   *
   * A plan line ticked off stores `doneAt`, and a capture-derived promise gets
   * a completion stub carrying the same. The derived commitment list cannot
   * answer this - it filters settled promises out by design - so without the
   * plan records "commitment completed" would only ever fire for the hand-written
   * ledger, which almost nobody uses.
   */
  planItems: PlanRecord[];
  objections: ObjectionRecord[];
  stakeholders: StakeholderRecord[];
  activities: SalesActivityRecord[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  /**
   * What the seller recorded learning. The whole list, not the window: a fact
   * from last month is what supersedes a fact from this one, and a projection
   * built only from the window would let a stale reading come back.
   */
  evidence?: CommercialEvidence[];
  /** The policy engine's output, already computed. Delta runs no rules of its own. */
  recommendations: Recommendation[];
  /**
   * Earliest event the loader could see, so coverage can be stated even when
   * this subject has no events of its own. Null when the workspace has none.
   */
  observedFrom?: string | null;
  windowDays?: number;
  /** Injected, so the same workspace always produces the same answer. */
  today?: Date;
  includeSampleRecords?: boolean;
};

// -------------------------------------------------------------------- derive

export function deriveCommercialDelta(input: DeltaInput): CommercialDelta {
  const today = input.today || new Date();
  const calculatedAt = today.toISOString();
  const days = input.windowDays ?? DELTA_WINDOW_DAYS;
  const since = new Date(today.getTime() - days * 86_400_000).toISOString();

  const includeSamples = input.includeSampleRecords === true;
  const visible = <T extends { isSample?: boolean }>(record: T) =>
    includeSamples || record.isSample !== true;

  const inWindow = (timestamp: string | null) =>
    Boolean(timestamp) && (timestamp as string) >= since && (timestamp as string) <= calculatedAt;

  const scope = subjectScope(input.subject);

  const changes = [
    ...eventChanges(input.events.filter(visible), scope, inWindow),
    ...commitmentChanges(input.commitments.filter(visible), scope, inWindow),
    ...planCompletionChanges(input.planItems.filter(visible), scope, inWindow),
    ...objectionChanges(input.objections.filter(visible), scope, inWindow),
    ...stakeholderChanges(input.stakeholders.filter(visible), scope, inWindow),
    ...outcomeChanges(input.opportunityOutcomes, scope, inWindow),
    ...silenceBrokenChanges(input.activities.filter(visible), scope, inWindow),
    ...evidenceChanges(input.evidence?.filter(visible) || [], scope, inWindow),
  ];

  const materialChanges = groupRepeatedChanges(
    preferRecordedOutcome(dedupeById(changes))
      // Newest first, with the item id as the tie-break so two changes sharing a
      // timestamp cannot swap places between two runs of the same input.
      .sort((left, right) =>
        (right.occurredAt || '').localeCompare(left.occurredAt || '') || left.id.localeCompare(right.id)),
  );

  const conditions = input.recommendations
    .filter((recommendation) => recommendationMatchesSubject(recommendation, scope))
    .map(conditionFromRecommendation)
    .sort((left, right) => SEVERITY_ORDER[left.significance] - SEVERITY_ORDER[right.significance]);

  const recommendation = input.recommendations.find(
    (item) => recommendationMatchesSubject(item, scope),
  ) || null;

  return {
    subject: input.subject,
    period: { since, until: calculatedAt, days },
    historyCoverage: coverageFor(input.observedFrom ?? null, since),
    changes: materialChanges,
    conditions,
    interpretation: interpret(materialChanges, conditions),
    recommendation,
    evidenceRecordIds: unique([
      ...materialChanges.flatMap((item) => item.sourceRecordIds),
      ...conditions.flatMap((item) => item.sourceRecordIds),
    ]),
    calculatedAt,
  };
}

// ------------------------------------------------------------------- coverage

function coverageFor(observedFrom: string | null, since: string): DeltaHistoryCoverage {
  if (!observedFrom) return { observedFrom: null, complete: false };
  return { observedFrom, complete: observedFrom <= since };
}

// ---------------------------------------------------------------- subject scope

type SubjectScope = {
  kind: CommercialDeltaSubject['kind'];
  accountKey: string;
  opportunityId: string | null;
  threadId: string | null;
};

function subjectScope(subject: CommercialDeltaSubject): SubjectScope {
  if (subject.kind === 'account') {
    return { kind: 'account', accountKey: normalizeEntityName(subject.name), opportunityId: null, threadId: null };
  }
  if (subject.kind === 'opportunity') {
    return {
      kind: 'opportunity',
      accountKey: normalizeEntityName(subject.accountName),
      opportunityId: subject.id,
      threadId: null,
    };
  }
  return {
    kind: 'thread',
    accountKey: normalizeEntityName(subject.accountName),
    opportunityId: subject.opportunityId || null,
    threadId: subject.id,
  };
}

/**
 * Whether a record belongs to the subject.
 *
 * An account gathers everything filed under its name. A deal gathers only what
 * names that deal - never everything at the customer, because attributing
 * another deal's objection to this one is how a drawer starts lying about which
 * deal is in trouble.
 */
function matches(
  scope: SubjectScope,
  record: { accountName?: string | null; opportunityId?: string | null },
): boolean {
  if (scope.kind === 'account') {
    return normalizeEntityName(record.accountName || '') === scope.accountKey;
  }
  return Boolean(record.opportunityId) && record.opportunityId === scope.opportunityId;
}

function recommendationMatchesSubject(recommendation: Recommendation, scope: SubjectScope): boolean {
  if (scope.kind === 'account') {
    return normalizeEntityName(recommendation.accountName || '') === scope.accountKey;
  }
  if (scope.kind === 'thread' && scope.threadId && recommendation.threadId === scope.threadId) return true;
  return Boolean(recommendation.opportunityId) && recommendation.opportunityId === scope.opportunityId;
}

// -------------------------------------------------------------------- events

/**
 * Transitions the kernel's commands observed and wrote down.
 *
 * Only events whose payload actually carries a before and an after become
 * transition rows. An event without one is history that cannot prove what it
 * asserts, so it is dropped rather than rendered with a guess in place of the
 * missing half.
 */
function eventChanges(
  events: CommercialEvent[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return events.flatMap((event): CommercialDeltaItem[] => {
    if (!inWindow(event.occurredAt)) return [];
    if (!eventMatchesSubject(event, scope)) return [];

    const from = payloadText(event, 'from');
    const to = payloadText(event, 'to');

    switch (event.eventType) {
      case 'opportunity_stage_changed': {
        if (!from || !to) return [];
        return [{
          id: `event:${event.id}`,
          kind: 'stage_changed' as const,
          observation: 'transition' as const,
          provenance: 'event' as const,
          statement: `Stage moved ${from} → ${to}.`,
          transition: { from, to },
          occurredAt: event.occurredAt,
          dimension: 'qualification' as const,
          direction: stageDirection(from, to),
          significance: 'medium' as Severity,
          sourceRecordIds: [event.opportunityId || event.id],
        }];
      }
      case 'opportunity_close_period_changed': {
        if (!from || !to) return [];
        return [{
          id: `event:${event.id}`,
          kind: 'close_period_changed' as const,
          observation: 'transition' as const,
          provenance: 'event' as const,
          statement: `Expected close moved ${from} → ${to}.`,
          transition: { from, to },
          occurredAt: event.occurredAt,
          dimension: 'money' as const,
          direction: closePeriodMoveDirection(from, to, event.occurredAt),
          significance: 'high' as Severity,
          sourceRecordIds: [event.opportunityId || event.id],
        }];
      }
      case 'opportunity_value_changed': {
        if (!from || !to) return [];
        const before = payloadNumber(event, 'from');
        const after = payloadNumber(event, 'to');
        // The payload keeps raw amounts, which is right - they can be compared
        // and converted - and equally unreadable in a sentence. This is the
        // derivation boundary, so this is where money becomes money: the panel
        // used to read "Deal value moved 300000000 → 450000000".
        const currency = payloadText(event, 'currency');
        const money = (raw: string, amount: number | null) => (
          amount === null || !currency ? raw : formatCompactCurrencyAmount(amount, currency)
        );
        return [{
          id: `event:${event.id}`,
          kind: 'value_changed' as const,
          observation: 'transition' as const,
          provenance: 'event' as const,
          statement: `Deal value moved ${money(from, before)} → ${money(to, after)}.`,
          transition: { from, to },
          occurredAt: event.occurredAt,
          dimension: 'money' as const,
          direction: before !== null && after !== null && after < before ? 'weakened' : 'improved',
          significance: 'medium' as Severity,
          sourceRecordIds: [event.opportunityId || event.id],
        }];
      }
      case 'opportunity_won':
      case 'opportunity_lost': {
        const won = event.eventType === 'opportunity_won';
        return [{
          id: `event:${event.id}`,
          kind: 'outcome_recorded' as const,
          observation: 'transition' as const,
          provenance: 'event' as const,
          statement: won ? 'Deal was won.' : 'Deal was lost.',
          ...(from && to ? { transition: { from, to } } : {}),
          occurredAt: event.occurredAt,
          dimension: 'qualification' as const,
          direction: won ? ('improved' as const) : ('weakened' as const),
          significance: 'high' as Severity,
          sourceRecordIds: [event.opportunityId || event.id],
        }];
      }
      case 'quote_created':
      case 'quote_sent':
      case 'po_received':
      case 'delivery_completed':
      case 'payment_received': {
        if (!from || !to) return [];
        return [{
          id: `event:${event.id}`,
          kind: 'money_state_changed' as const,
          observation: 'transition' as const,
          provenance: 'event' as const,
          statement: `Money moved ${humanise(from)} → ${humanise(to)}.`,
          transition: { from, to },
          occurredAt: event.occurredAt,
          dimension: 'money' as const,
          direction: 'improved' as const,
          significance: 'medium' as Severity,
          sourceRecordIds: [event.threadId || event.id],
        }];
      }
      default:
        // Commitment and thread events are read off the records themselves
        // below, where the same transition is available retroactively. Reading
        // both would print every kept promise twice.
        return [];
    }
  });
}

function eventMatchesSubject(event: CommercialEvent, scope: SubjectScope): boolean {
  if (scope.kind === 'account') {
    const named = payloadText(event, 'accountName');
    if (named && normalizeEntityName(named) === scope.accountKey) return true;
    return Boolean(event.accountId) && normalizeEntityName(event.accountId || '') === scope.accountKey;
  }
  if (scope.kind === 'thread' && scope.threadId && event.threadId === scope.threadId) return true;
  return Boolean(event.opportunityId) && event.opportunityId === scope.opportunityId;
}

// --------------------------------------------------------------- commitments

/**
 * Promises, read off the commitment records themselves.
 *
 * This is the reason Delta works on a six-month-old workspace that has never
 * written an event: a commitment stores `originalDueDate` and a
 * `dueDateHistory` of `{ from, to, changedAt }`, so a reschedule is a genuine
 * observed transition available retroactively - no instrumentation required.
 */
function commitmentChanges(
  commitments: CommercialCommitment[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return commitments.flatMap((commitment) => {
    if (!matches(scope, commitment)) return [];
    const items: CommercialDeltaItem[] = [];

    if (inWindow(commitment.createdAt)) {
      items.push({
        id: `commitment-made:${commitment.id}`,
        kind: 'commitment_made',
        observation: 'transition',
        provenance: 'record_occurrence',
        statement: `${ownerPhrase(commitment)} committed to "${commitment.commitmentText}".`,
        occurredAt: commitment.createdAt,
        dimension: 'momentum',
        direction: 'improved',
        significance: 'low',
        sourceRecordIds: [commitment.id],
      });
    }

    if (commitment.status === 'completed' && inWindow(commitment.completedAt || null)) {
      items.push({
        id: `commitment-done:${commitment.id}`,
        kind: 'commitment_completed',
        observation: 'transition',
        provenance: 'record_occurrence',
        statement: `${ownerPhrase(commitment)} completed "${commitment.commitmentText}".`,
        occurredAt: commitment.completedAt as string,
        dimension: 'momentum',
        direction: 'improved',
        significance: 'medium',
        sourceRecordIds: [commitment.id],
      });
    }

    for (const move of commitment.dueDateHistory) {
      if (!inWindow(move.changedAt)) continue;
      // `from` can be empty on a promise that had no date to begin with. That
      // is not a move from anywhere, so it is not claimed as one.
      if (!move.from || !move.to) continue;
      items.push({
        id: `commitment-moved:${commitment.id}:${move.changedAt}`,
        kind: 'commitment_rescheduled',
        observation: 'transition',
        provenance: 'record_history',
        statement: `"${commitment.commitmentText}" moved ${move.from} → ${move.to}.`,
        transition: { from: move.from, to: move.to },
        occurredAt: move.changedAt,
        dimension: 'momentum',
        direction: 'weakened',
        significance: 'medium',
        sourceRecordIds: [commitment.id],
      });
    }

    return items;
  });
}

/**
 * Promises kept on the Plan.
 *
 * `doneAt` is written by the tick itself, so this is an observation rather than
 * an inference - and it works on every plan line the workspace already holds,
 * with no instrumentation and no backfill.
 */
function planCompletionChanges(
  planItems: PlanRecord[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return planItems.flatMap((item) => {
    if (!item.done || !item.doneAt || item.__deleted) return [];
    if (!inWindow(item.doneAt)) return [];
    const label = item.label?.trim();
    if (!label) return [];
    if (!matches(scope, {
      accountName: item.linkedAccountName,
      opportunityId: item.linkedOpportunityId,
    })) return [];

    return [{
      id: `plan-done:${item.id}`,
      kind: 'commitment_completed' as const,
      observation: 'transition' as const,
      provenance: 'record_occurrence' as const,
      statement: `You completed "${label}".`,
      occurredAt: item.doneAt,
      dimension: 'momentum' as const,
      direction: 'improved' as const,
      significance: 'medium' as Severity,
      sourceRecordIds: [item.id],
    }];
  });
}

// ---------------------------------------------------------------- objections

function objectionChanges(
  objections: ObjectionRecord[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return objections.flatMap((objection) => {
    if (!matches(scope, objection)) return [];
    const dimension = DIMENSION_BY_OBJECTION[objection.objectionType] || 'qualification';
    const items: CommercialDeltaItem[] = [];

    if (inWindow(objection.createdAt)) {
      items.push({
        id: `objection-open:${objection.id}`,
        kind: 'objection_opened',
        observation: 'transition',
        provenance: 'record_occurrence',
        statement: `${objection.objectionType} objection opened: ${objection.objectionText}`,
        occurredAt: objection.createdAt,
        dimension,
        direction: 'weakened',
        significance: objection.impact === 'High' ? 'high' : 'medium',
        sourceRecordIds: [objection.id],
      });
    }

    // Only a recorded resolution date proves a resolution happened in the
    // window. `updatedAt` would date the last edit, which is exactly the claim
    // this module refuses to make.
    const resolvedAt = resolutionTimestamp(objection);
    if (objection.status === 'Resolved' && resolvedAt && inWindow(resolvedAt)) {
      items.push({
        id: `objection-resolved:${objection.id}`,
        kind: 'objection_resolved',
        observation: 'transition',
        provenance: 'record_occurrence',
        statement: `${objection.objectionType} objection resolved: ${objection.objectionText}`,
        occurredAt: resolvedAt,
        dimension,
        direction: 'improved',
        significance: 'medium',
        sourceRecordIds: [objection.id],
      });
    }

    return items;
  });
}

/** A resolution date, as an instant, from the business date the ledger stores. */
function resolutionTimestamp(objection: ObjectionRecord): string | null {
  const raw = objection.resolvedAt;
  if (!raw) return null;
  if (isValidBusinessDate(raw)) return `${raw}T00:00:00.000Z`;
  const sanitized = sanitizeBusinessDate(raw);
  if (sanitized) return `${sanitized}T00:00:00.000Z`;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

// -------------------------------------------------------------- stakeholders

function stakeholderChanges(
  stakeholders: StakeholderRecord[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return stakeholders.flatMap((stakeholder) => {
    if (!matches(scope, stakeholder)) return [];
    if (!inWindow(stakeholder.createdAt)) return [];
    return [{
      id: `stakeholder-added:${stakeholder.id}`,
      kind: 'stakeholder_added' as const,
      observation: 'transition' as const,
      provenance: 'record_occurrence' as const,
      statement: `${stakeholder.name} added${stakeholder.roleTitle ? ` (${stakeholder.roleTitle})` : ''}.`,
      occurredAt: stakeholder.createdAt,
      dimension: 'stakeholder' as const,
      direction: 'improved' as const,
      significance: 'low' as Severity,
      sourceRecordIds: [stakeholder.id],
    }];
  });
}

// ------------------------------------------------------------------ evidence

/**
 * What the seller learned, read as a change.
 *
 * Provenance `record_occurrence`: the record is dated, and its appearance in
 * the window IS the change - the same shape as an objection opening or an
 * outcome being written. It deliberately does not read the `evidence_recorded`
 * event, even though one is written. A record can describe a trial that
 * happened before the instrumentation existed and an event cannot, and reading
 * both would print the same trial twice.
 *
 * Supersession is computed over the whole list rather than the window, because
 * the fact that replaces a stale one is frequently older or newer than the
 * fortnight on screen. A superseded row is kept and flagged, never dropped.
 */
function evidenceChanges(
  records: CommercialEvidence[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  const relevant = records.filter((record) => matches(scope, {
    accountName: record.accountName,
    opportunityId: record.opportunityId,
  }));
  if (relevant.length === 0) return [];

  const projection = projectCurrentEvidence(relevant);

  return relevant.flatMap((record): CommercialDeltaItem[] => {
    const at = isValidBusinessDate(record.observedAt) ? `${record.observedAt}T00:00:00.000Z` : null;
    if (!inWindow(at)) return [];

    const supersededBy = projection.supersededBy.get(record.id);
    const direction = deltaDirectionForEvidence(record.direction);

    return [{
      id: `evidence:${record.id}`,
      kind: 'evidence_recorded' as const,
      observation: 'transition' as const,
      provenance: 'record_occurrence' as const,
      statement: `${evidenceCategoryLabels[record.category]} recorded: ${record.summary}.`,
      occurredAt: at,
      dimension: evidenceCategoryDimensions[record.category],
      direction,
      // Medium, like a stage move. A recorded finding is real news and it is
      // not an emergency; borrowing `high` here would put every trial result
      // above every slipped close date.
      significance: 'medium' as Severity,
      sourceRecordIds: [record.id],
      ...(supersededBy ? { supersededBy } : {}),
    }];
  });
}

// ------------------------------------------------------------------ outcomes

function outcomeChanges(
  outcomes: OpportunityOutcomeRecord[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  return outcomes.flatMap((outcome) => {
    if (!matches(scope, { accountName: outcome.accountName, opportunityId: outcome.opportunityId })) return [];
    const at = isValidBusinessDate(outcome.outcomeDate) ? `${outcome.outcomeDate}T00:00:00.000Z` : null;
    if (!at || !inWindow(at)) return [];

    const won = outcome.outcome === 'Won';
    return [{
      id: `outcome:${outcome.id}`,
      kind: 'outcome_recorded' as const,
      observation: 'transition' as const,
      provenance: 'record_occurrence' as const,
      statement: `${outcome.opportunityName} was ${outcome.outcome.toLowerCase()}.`,
      // The stage the deal held before it closed is snapshotted on the retro,
      // so this one genuinely has a before as well as an after.
      ...(outcome.stageBeforeOutcome
        ? { transition: { from: outcome.stageBeforeOutcome, to: outcome.outcome } }
        : {}),
      occurredAt: at,
      dimension: 'qualification' as const,
      direction: won ? ('improved' as const) : ('weakened' as const),
      significance: 'high' as Severity,
      sourceRecordIds: [outcome.opportunityId || outcome.id],
    }];
  });
}

// ------------------------------------------------------------------- silence

/**
 * A customer who went quiet and then came back.
 *
 * This is the one activity-derived row, and it is here because the gap is the
 * change - not the touch. Every captured note is timeline; a touch that ends a
 * silence past the threshold the policy engine already uses is a genuine
 * commercial event, computable retroactively from dates the records have always
 * carried.
 */
function silenceBrokenChanges(
  activities: SalesActivityRecord[],
  scope: SubjectScope,
  inWindow: (timestamp: string | null) => boolean,
): CommercialDeltaItem[] {
  const touches = activities
    .filter((activity) => matches(scope, {
      accountName: activity.linkedAccountName || activity.accountName,
      opportunityId: activity.linkedOpportunityId,
    }))
    .flatMap((activity) => {
      const date = sanitizeBusinessDate(activity.activityDate);
      return date ? [{ id: activity.id, date }] : [];
    })
    // Stable order: by day, then by record id, so two touches on the same day
    // cannot reorder between runs and change which one is named as the return.
    .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

  const items: CommercialDeltaItem[] = [];
  for (let index = 1; index < touches.length; index += 1) {
    const previous = touches[index - 1];
    const current = touches[index];
    const gap = Math.round(
      (Date.parse(`${current.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86_400_000,
    );
    if (gap < policyThresholds.threadSilenceDays) continue;
    const at = `${current.date}T00:00:00.000Z`;
    if (!inWindow(at)) continue;
    items.push({
      id: `silence-broken:${current.id}`,
      kind: 'silence_broken',
      observation: 'transition',
      provenance: 'record_occurrence',
      statement: `Contact resumed after ${gap} quiet days.`,
      transition: { from: previous.date, to: current.date },
      occurredAt: at,
      dimension: 'momentum',
      direction: 'improved',
      significance: 'medium',
      // Both touches, because the gap between them is the claim.
      sourceRecordIds: [previous.id, current.id],
    });
  }
  return items;
}

// ---------------------------------------------------------------- conditions

/**
 * A policy recommendation, restated as a present-tense condition.
 *
 * The reason text is reused verbatim. The policy engine already writes in the
 * present ("has been waiting for 12 days", "is valid for 3 more days"), and
 * rewriting it here would create a second voice for the same rule - and a
 * second place for transition language to sneak back in.
 */
function conditionFromRecommendation(recommendation: Recommendation): CommercialDeltaItem {
  const mapping = CONDITION_BY_REASON[recommendation.reasonCode];
  return {
    id: `condition:${recommendation.id}`,
    kind: mapping.kind,
    observation: 'condition',
    provenance: 'policy',
    statement: recommendation.reasonText,
    occurredAt: null,
    dimension: mapping.dimension,
    direction: mapping.direction,
    significance: recommendation.severity,
    sourceRecordIds: recommendation.sourceRecordIds,
    reasonCode: recommendation.reasonCode,
  };
}

// ------------------------------------------------------------ interpretation

/**
 * The "so what", built from dimensions rather than written.
 *
 * Two rules make this checkable instead of decorative:
 *
 *   1. A reading is emitted only when at least one dimension actually moved.
 *      A quiet fortnight gets no sentence, because "nothing much changed"
 *      dressed up as analysis is how a panel stops being read.
 *   2. Past-tense wording ("increased", "weakened") is used only for a
 *      dimension that has an observed transition behind it. A dimension known
 *      solely from current conditions gets present-tense wording, because that
 *      is all the evidence supports.
 */
function interpret(
  changes: CommercialDeltaItem[],
  conditions: CommercialDeltaItem[],
): CommercialDeltaInterpretation | null {
  const all = [...changes, ...conditions];
  if (all.length === 0) return null;

  /**
   * Whether a transition was seen is tracked per direction, not per dimension.
   *
   * A dimension can hold one observed improvement and three standing problems.
   * The net then reads "weakened", and a single `observed` flag would license
   * "purchasing risk increased" - past tense, asserting a deterioration - when
   * the only thing actually watched happening was an objection being resolved.
   * Past-tense wording is earned only by a transition that moved the dimension
   * the way the sentence says it moved.
   */
  const scored = new Map<CommercialDimension, {
    net: number;
    observedImproved: boolean;
    observedWeakened: boolean;
    basis: string[];
  }>();
  for (const item of all) {
    if (item.direction === 'neutral') continue;
    // A fact a later observation replaced is history, not a reading. Leaving it
    // in would let a failed trial and the retest that passed it both push the
    // technical dimension, and the "so what" would report a fortnight where
    // technical risk both increased and eased.
    if (item.supersededBy) continue;
    const entry = scored.get(item.dimension)
      || { net: 0, observedImproved: false, observedWeakened: false, basis: [] };
    entry.net += (item.direction === 'improved' ? 1 : -1) * SEVERITY_WEIGHT[item.significance];
    if (item.observation === 'transition') {
      if (item.direction === 'improved') entry.observedImproved = true;
      else entry.observedWeakened = true;
    }
    entry.basis.push(item.id);
    scored.set(item.dimension, entry);
  }

  const moved = [...scored.entries()]
    .filter(([, entry]) => entry.net !== 0)
    // Largest movement first; ties broken by the declared dimension order so
    // the sentence is stable for the same inputs.
    .sort((left, right) => {
      const bySize = Math.abs(right[1].net) - Math.abs(left[1].net);
      if (bySize !== 0) return bySize;
      return commercialDimensions.indexOf(left[0]) - commercialDimensions.indexOf(right[0]);
    })
    .slice(0, 2);

  if (moved.length === 0) return null;

  const parts = moved.map(([dimension, entry]) => {
    const direction = entry.net > 0 ? ('improved' as const) : ('weakened' as const);
    const observed = direction === 'improved' ? entry.observedImproved : entry.observedWeakened;
    return { label: DIMENSION_LABELS[dimension], ...verbFor(dimension, direction, observed) };
  });

  return { statement: sentenceFor(parts), basis: moved.flatMap(([, entry]) => entry.basis) };
}

/**
 * Two dimensions, one sentence.
 *
 * "while" is for a contrast - the shape the reading exists to show, where one
 * side of the deal improved and the other did not. When both moved the same way
 * it is not a contrast, and "purchasing risk increased while money exposure
 * increased" reads like a bug. Same movement is joined instead.
 */
function sentenceFor(parts: { label: string; phrase: string; observed: boolean }[]): string {
  if (parts.length === 1) return `${capitalise(parts[0].label)} ${parts[0].phrase}.`;

  const [first, second] = parts;
  if (first.observed && second.observed && first.phrase === second.phrase) {
    return `${capitalise(first.label)} and ${second.label} both ${first.phrase}.`;
  }
  return `${capitalise(first.label)} ${first.phrase} while ${second.label} ${second.phrase}.`;
}

/** What each dimension is called in a sentence. */
const DIMENSION_LABELS: Record<CommercialDimension, string> = {
  momentum: 'commercial momentum',
  purchasing: 'purchasing risk',
  technical: 'technical risk',
  stakeholder: 'stakeholder coverage',
  money: 'money exposure',
  qualification: 'decision confidence',
};

/**
 * What each dimension is said to have done, in two tenses.
 *
 * The `observed` column is the honesty gate. Its verbs assert a change -
 * "increased", "eased", "weakened" - and may only be used where a transition
 * was actually seen moving this dimension this way. The `condition` column
 * asserts a state and is always safe, because a current condition is something
 * the records can prove without any history at all.
 */
const DIMENSION_VERBS: Record<
  CommercialDimension,
  Record<'improved' | 'weakened', { observed: string; condition: string }>
> = {
  momentum: {
    improved: { observed: 'recovered', condition: 'is steady' },
    weakened: { observed: 'weakened', condition: 'is weak' },
  },
  purchasing: {
    improved: { observed: 'eased', condition: 'is contained' },
    weakened: { observed: 'increased', condition: 'is elevated' },
  },
  technical: {
    improved: { observed: 'eased', condition: 'is contained' },
    weakened: { observed: 'increased', condition: 'is elevated' },
  },
  stakeholder: {
    improved: { observed: 'improved', condition: 'is sound' },
    weakened: { observed: 'weakened', condition: 'is thin' },
  },
  money: {
    improved: { observed: 'eased', condition: 'is contained' },
    weakened: { observed: 'increased', condition: 'is elevated' },
  },
  qualification: {
    improved: { observed: 'improved', condition: 'is sound' },
    weakened: { observed: 'weakened', condition: 'is thin' },
  },
};

function verbFor(dimension: CommercialDimension, direction: 'improved' | 'weakened', observed: boolean) {
  const verbs = DIMENSION_VERBS[dimension][direction];
  return { phrase: observed ? verbs.observed : verbs.condition, observed };
}

// ------------------------------------------------------------ noise control

/**
 * Collapses identical work into one row.
 *
 * A CSV import can create forty stakeholders on one account on one day. Forty
 * rows is a timeline; "40 people added" is a change.
 */
function groupRepeatedChanges(items: CommercialDeltaItem[]): CommercialDeltaItem[] {
  const byKind = new Map<DeltaChangeKind, CommercialDeltaItem[]>();
  for (const item of items) {
    byKind.set(item.kind, [...(byKind.get(item.kind) || []), item]);
  }

  const out: CommercialDeltaItem[] = [];
  for (const item of items) {
    const group = byKind.get(item.kind) as CommercialDeltaItem[];
    if (group.length < DELTA_GROUP_AFTER) {
      out.push(item);
      continue;
    }
    if (out.some((existing) => existing.kind === item.kind)) continue;
    out.push({
      ...group[0],
      id: `grouped:${item.kind}`,
      statement: groupStatement(item.kind, group.length),
      // A group spans several moments, so it claims none of them as its own.
      transition: undefined,
      occurredAt: group[0].occurredAt,
      significance: mostSevere(group),
      sourceRecordIds: unique(group.flatMap((entry) => entry.sourceRecordIds)),
      groupedCount: group.length,
    });
  }
  return out;
}

const GROUP_NOUNS: Partial<Record<DeltaChangeKind, [string, string]>> = {
  stakeholder_added: ['person added', 'people added'],
  commitment_made: ['promise made', 'promises made'],
  commitment_completed: ['promise kept', 'promises kept'],
  commitment_rescheduled: ['promise moved', 'promises moved'],
  objection_opened: ['objection opened', 'objections opened'],
  objection_resolved: ['objection resolved', 'objections resolved'],
  silence_broken: ['return after silence', 'returns after silence'],
  stage_changed: ['stage change', 'stage changes'],
  value_changed: ['value change', 'value changes'],
  close_period_changed: ['close-date move', 'close-date moves'],
  money_state_changed: ['money step', 'money steps'],
  outcome_recorded: ['deal closed', 'deals closed'],
  evidence_recorded: ['finding recorded', 'findings recorded'],
};

function groupStatement(kind: DeltaChangeKind, count: number) {
  const nouns = GROUP_NOUNS[kind];
  if (!nouns) return `${count} changes of the same kind.`;
  return `${count} ${count === 1 ? nouns[0] : nouns[1]}.`;
}

function mostSevere(items: CommercialDeltaItem[]): Severity {
  return items.reduce<Severity>(
    (worst, item) => (SEVERITY_ORDER[item.significance] < SEVERITY_ORDER[worst] ? item.significance : worst),
    'low',
  );
}

// ------------------------------------------------------------------- helpers

function stageDirection(from: string, to: string): DeltaDirection {
  const order = canonicalStages as readonly string[];
  const before = order.indexOf(toCanonicalOpportunityStage(from));
  const after = order.indexOf(toCanonicalOpportunityStage(to));
  if (before < 0 || after < 0 || before === after) return 'neutral';
  return after > before ? 'improved' : 'weakened';
}

function ownerPhrase(commitment: CommercialCommitment) {
  if (commitment.commitmentParty === 'self') return 'You';
  return commitment.ownerLabel.trim() || (commitment.commitmentParty === 'customer' ? 'The customer' : 'Someone internal');
}

function payloadText(event: CommercialEvent, key: string): string {
  const value = event.structuredPayload?.[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function payloadNumber(event: CommercialEvent, key: string): number | null {
  const value = event.structuredPayload?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(typeof value === 'string' ? value.replace(/[^\d.-]/g, '') : NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanise(value: string) {
  return value.replace(/_/g, ' ');
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * One closing, said once.
 *
 * A deal marked Won writes an `opportunity_won` event, and closing it out
 * properly also writes an outcome retro. Both are true records of the same
 * moment, so both produce a row - and the drawer would report the deal closing
 * twice. The retro wins: it works retroactively on deals closed before any
 * instrumentation existed, and it carries the stage the deal held beforehand,
 * so it is the one with the better `from`.
 */
function preferRecordedOutcome(items: CommercialDeltaItem[]): CommercialDeltaItem[] {
  const recordedOutcomes = new Set(
    items
      .filter((item) => item.kind === 'outcome_recorded' && item.provenance === 'record_occurrence')
      .map((item) => item.sourceRecordIds[0])
      .filter(Boolean),
  );
  if (recordedOutcomes.size === 0) return items;

  return items.filter((item) => !(
    item.kind === 'outcome_recorded'
    && item.provenance === 'event'
    && recordedOutcomes.has(item.sourceRecordIds[0])
  ));
}

function dedupeById(items: CommercialDeltaItem[]): CommercialDeltaItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Re-exported so a contract can assert the mapping is total over the rules. */
export const DELTA_CONDITION_REASON_CODES = reasonCodes;
export { CONDITION_BY_REASON as deltaConditionByReason };

/** Exported so a contract can hold the ranking's copy of this in step. */
export { DIMENSION_BY_OBJECTION as deltaObjectionDimension };

