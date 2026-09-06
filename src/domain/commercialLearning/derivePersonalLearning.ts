import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { OpportunityOutcomeRecord } from '../../services/opportunityOutcomeStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { StakeholderRecord } from '../../services/stakeholderStore';
import type { ObjectionRecord } from '../../services/objectionStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { CommercialCommitment } from '../commercialKernel/types.ts';
import {
  projectCurrentEvidence,
  type CommercialEvidence,
} from '../commercialKernel/commercialEvidence.ts';
import { policyThresholds } from '../commercialKernel/policyEngine.ts';
import type { CommercialDimension } from '../commercialKernel/deriveDelta.ts';
import { isValidBusinessDate, sanitizeBusinessDate } from '../../utils/safeDate.ts';
import {
  evidenceStrengths,
  learningPatterns,
  MEANINGFUL_EFFECT_POINTS,
  strengthFor,
  type EvidenceStrength,
  type LearningInputKind,
  type LearningObservation,
  type LearningPatternDefinition,
  type LearningPatternId,
} from './learningPatterns.ts';

/**
 * What this seller's own closed deals show - and, far more often, what they
 * cannot show yet.
 *
 * ## The rule this file is built around
 *
 * Measure before concluding. Every number here is a count of records the reader
 * can open, every comparison names both of its groups, and every pattern that
 * has not earned a conclusion says so in the same shape as one that has. There
 * is no model, no fitted curve, no probability, and no combined score.
 *
 * ## Three ways to get this wrong, and what stops each one
 *
 * **Treating a gap in the instrument as a fact about the deal.** A 2026 deal
 * with no technical evidence recorded is not a deal where the trial failed - it
 * is a deal that closed before Memoire could hold a trial result at all. Every
 * pattern therefore resolves an `observableFrom` date *from the workspace's own
 * records*, and a deal that closed before it is excluded rather than counted as
 * an absence. Nothing here is hardcoded to a release date, and a record type
 * with no rows makes every deal unobservable - which is the correct answer, not
 * a bug.
 *
 * **Reading the answer back into the question.** A stakeholder added while
 * writing the win-up, an objection closed the week after the deal was lost, a
 * note captured during the retro - all of them are true records and none of
 * them was known while the deal was live. Every observation is gated on *both*
 * the business date and the recording date being on or before the outcome, so
 * retrospective tidying cannot manufacture a pattern.
 *
 * **Comparing groups that are not comparable.** A comparison of twenty-nine
 * against one clears any total-sample floor and is not a comparison. Strength
 * is decided by the smaller group first (see `strengthFor`), and a deal whose
 * history cannot answer the question leaves the cohort instead of padding the
 * side that needs no evidence.
 *
 * This module writes nothing, reads no clock of its own, and reaches no
 * network. Same records plus the same `today` produce the same answer forever.
 */

// ---------------------------------------------------------------------- types

/** Why a closed deal did not make it into a pattern's comparison. */
export const exclusionReasons = [
  'no_outcome_recorded',
  'outcome_not_won_or_lost',
  'outcome_date_unusable',
  'duplicate_outcome',
  'sample_record',
  'history_not_observable',
  'chronology_unavailable',
  'question_not_applicable',
] as const;
export type ExclusionReason = (typeof exclusionReasons)[number];

export type LearningGroup = {
  deals: number;
  won: number;
  lost: number;
  /** Null when the group is empty. Never zero, which would read as "never wins". */
  winRatePercent: number | null;
};

export type LearningDiagnostics = {
  /** Closed deals that answered the question one way or the other. */
  usable: number;
  excluded: number;
  /** Counts by reason, so "why only 12 deals?" has an answer. */
  reasons: Partial<Record<ExclusionReason, number>>;
  /**
   * The day this pattern's evidence first became recordable in this workspace,
   * derived from the earliest such record. Null when none exists at all.
   */
  observableFrom: string | null;
};

export type PersonalLearningEvidence = {
  patternId: LearningPatternId;
  label: string;
  question: string;
  /** What the behaviour is called, so a surface never restates the registry. */
  exposedLabel: string;
  comparisonLabel: string;
  dimension: CommercialDimension;
  exposed: LearningGroup;
  comparison: LearningGroup;
  /** Both groups together. */
  sample: number;
  /**
   * Exposed win rate minus comparison win rate, in percentage points. Null
   * whenever either group is empty - a difference from nothing is not a
   * difference.
   */
  effectPoints: number | null;
  /**
   * Which side closed won more often. `none` covers both "no difference worth
   * reporting" and "not enough to say", and the strength tells them apart.
   */
  direction: 'exposed_higher' | 'comparison_higher' | 'none';
  strength: EvidenceStrength;
  /** One sentence. Associative wording only; never a claim about cause. */
  reading: string;
  /** What this comparison cannot say, in the seller's words. */
  limitations: string[];
  /** The opportunities behind the counts, so the reader can open them. */
  supportingRecordIds: string[];
  diagnostics: LearningDiagnostics;
  calculatedAt: string;
};

export type PersonalLearningInput = {
  opportunities: CrmLiteOpportunity[];
  opportunityOutcomes: OpportunityOutcomeRecord[];
  activities: SalesActivityRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  quotes: QuoteRecord[];
  commitments: CommercialCommitment[];
  evidence: CommercialEvidence[];
  /** Injected, so the same workspace always produces the same answer. */
  today?: Date;
  includeSampleRecords?: boolean;
};

export type PersonalLearningResult = {
  patterns: PersonalLearningEvidence[];
  /** Closed deals that could answer at least one question. */
  closedDealsConsidered: number;
  calculatedAt: string;
};

// --------------------------------------------------------------------- derive

export function derivePersonalLearning(input: PersonalLearningInput): PersonalLearningResult {
  const today = input.today || new Date();
  const calculatedAt = today.toISOString();
  const todayKey = calculatedAt.slice(0, 10);

  const includeSamples = input.includeSampleRecords === true;
  const visible = <T extends { isSample?: boolean; source?: string }>(record: T) =>
    includeSamples || (record.isSample !== true && record.source !== 'demo');

  const context = buildContext(input, visible);
  const cohort = buildCohort(input, visible, todayKey);

  return {
    patterns: learningPatterns.map((pattern) => measure(pattern, cohort, context, calculatedAt)),
    closedDealsConsidered: cohort.usable.length,
    calculatedAt,
  };
}

// --------------------------------------------------------------------- cohort

/** One closed deal, with the outcome that decides which group it lands in. */
type ClosedDeal = {
  opportunity: CrmLiteOpportunity;
  outcomeDate: string;
  won: boolean;
};

type Cohort = {
  usable: ClosedDeal[];
  /** Rejections that apply to every pattern, counted once. */
  rejected: Partial<Record<ExclusionReason, number>>;
};

/**
 * The closed deals every pattern starts from.
 *
 * Deliberately narrow. `Delayed` and `No decision` are real outcomes and they
 * are not a binary one, so folding them into "lost" would make every pattern
 * quietly measure "did it close at all" instead of the question on its label.
 * A deal with two outcome records keeps its earliest - the second is a retro
 * written twice, and counting the deal twice would let one customer carry a
 * pattern.
 */
function buildCohort(
  input: PersonalLearningInput,
  visible: (record: { isSample?: boolean; source?: string }) => boolean,
  todayKey: string,
): Cohort {
  const rejected: Partial<Record<ExclusionReason, number>> = {};
  const reject = (reason: ExclusionReason) => { rejected[reason] = (rejected[reason] || 0) + 1; };

  const opportunityById = new Map(input.opportunities.map((item) => [item.id, item]));

  const earliestOutcome = new Map<string, OpportunityOutcomeRecord>();
  for (const outcome of input.opportunityOutcomes) {
    if (!visible(outcome as { isSample?: boolean; source?: string })) { reject('sample_record'); continue; }
    const held = earliestOutcome.get(outcome.opportunityId);
    if (!held) { earliestOutcome.set(outcome.opportunityId, outcome); continue; }
    reject('duplicate_outcome');
    if ((outcome.outcomeDate || '') < (held.outcomeDate || '')) {
      earliestOutcome.set(outcome.opportunityId, outcome);
    }
  }

  const usable: ClosedDeal[] = [];
  for (const outcome of earliestOutcome.values()) {
    if (outcome.outcome !== 'Won' && outcome.outcome !== 'Lost') { reject('outcome_not_won_or_lost'); continue; }

    const outcomeDate = sanitizeBusinessDate(outcome.outcomeDate);
    // A date that cannot be read, or one in the future, cannot anchor a
    // before-and-after comparison. Excluded rather than guessed at.
    if (!outcomeDate || outcomeDate > todayKey) { reject('outcome_date_unusable'); continue; }

    const opportunity = opportunityById.get(outcome.opportunityId);
    if (!opportunity) { reject('no_outcome_recorded'); continue; }
    if (!visible(opportunity)) { reject('sample_record'); continue; }

    usable.push({ opportunity, outcomeDate, won: outcome.outcome === 'Won' });
  }

  return { usable, rejected };
}

// -------------------------------------------------------------------- context

type LearningContext = {
  /** The first day each kind of record was ever written in this workspace. */
  observableFrom: Record<LearningInputKind, string | null>;
  activitiesByOpportunity: Map<string, SalesActivityRecord[]>;
  stakeholdersByOpportunity: Map<string, StakeholderRecord[]>;
  objectionsByOpportunity: Map<string, ObjectionRecord[]>;
  quotesByOpportunity: Map<string, QuoteRecord[]>;
  commitmentsByOpportunity: Map<string, CommercialCommitment[]>;
  evidenceByOpportunity: Map<string, CommercialEvidence[]>;
};

/**
 * Everything indexed once, and the observability dates derived from the records
 * themselves.
 *
 * `observableFrom` is the whole missingness guard in one line each: the first
 * day the seller ever wrote a record of that kind. Before it, an absence proves
 * nothing about the deal; after it, an absence is a real observation. It is
 * read off the data rather than pinned to a release, so a workspace restored
 * from a backup, or one whose owner started using a feature late, gets its own
 * honest answer instead of the product's deployment history.
 */
function buildContext(
  input: PersonalLearningInput,
  visible: (record: { isSample?: boolean; source?: string }) => boolean,
): LearningContext {
  const activities = input.activities.filter(visible);
  const stakeholders = input.stakeholders.filter(visible);
  const objections = input.objections.filter(visible);
  const quotes = input.quotes.filter(visible);
  const commitments = input.commitments.filter(visible);
  const evidence = input.evidence.filter(visible);

  return {
    observableFrom: {
      commercial_evidence: earliestDay(evidence.map((item) => item.createdAt)),
      // Only stakeholders attached to a deal count: an account-level contact
      // list says nothing about which opportunity the person was on, and this
      // workspace holds 1,741 of them across three accounts from one import.
      stakeholder: earliestDay(stakeholders.filter((item) => item.opportunityId).map((item) => item.createdAt)),
      commercial_commitment: earliestDay(commitments.map((item) => item.createdAt)),
      quote: earliestDay(quotes.map((item) => item.createdAt || item.quoteDate)),
      // The field, not the table. Activities predate it, and one written before
      // it exists carries `''` - which means "not stated", never "not a visit".
      activity_channel: earliestDay(
        activities.filter((item) => (item.activityChannel || '').trim()).map((item) => item.createdAt),
      ),
      objection: earliestDay(objections.map((item) => item.createdAt)),
    },
    activitiesByOpportunity: groupBy(activities, (item) => item.linkedOpportunityId),
    stakeholdersByOpportunity: groupBy(stakeholders, (item) => item.opportunityId),
    objectionsByOpportunity: groupBy(objections, (item) => item.opportunityId),
    quotesByOpportunity: groupBy(quotes, (item) => item.opportunityId || ''),
    commitmentsByOpportunity: groupBy(commitments, (item) => item.opportunityId || ''),
    evidenceByOpportunity: groupBy(evidence, (item) => item.opportunityId || ''),
  };
}

// -------------------------------------------------------------------- measure

function measure(
  pattern: LearningPatternDefinition,
  cohort: Cohort,
  context: LearningContext,
  calculatedAt: string,
): PersonalLearningEvidence {
  const observableFrom = context.observableFrom[pattern.requires];
  const reasons: Partial<Record<ExclusionReason, number>> = { ...cohort.rejected };
  const reject = (reason: ExclusionReason) => { reasons[reason] = (reasons[reason] || 0) + 1; };

  const exposedDeals: ClosedDeal[] = [];
  const comparisonDeals: ClosedDeal[] = [];

  for (const deal of cohort.usable) {
    // The instrument has to have existed while this deal was still running.
    // Without this, every deal that closed before the feature shipped would be
    // counted as a deal where the behaviour did not happen.
    if (!observableFrom || deal.outcomeDate < observableFrom) { reject('history_not_observable'); continue; }

    const observation = observe(pattern, deal, context);
    if (observation === 'unknown') { reject('chronology_unavailable'); continue; }
    if (observation === 'not_applicable') { reject('question_not_applicable'); continue; }
    if (observation === 'exposed') exposedDeals.push(deal);
    else comparisonDeals.push(deal);
  }

  const exposed = summarise(exposedDeals);
  const comparison = summarise(comparisonDeals);
  const strength = strengthFor(exposed.deals, comparison.deals);

  const effectPoints = exposed.winRatePercent !== null && comparison.winRatePercent !== null
    ? Math.round(exposed.winRatePercent - comparison.winRatePercent)
    : null;

  // A difference is only reported when the sample can carry it *and* it is
  // larger than one deal's worth of movement. Both gates, in that order.
  const meaningful = strength !== 'insufficient'
    && effectPoints !== null
    && Math.abs(effectPoints) >= MEANINGFUL_EFFECT_POINTS;

  const direction: PersonalLearningEvidence['direction'] = !meaningful
    ? 'none'
    : (effectPoints as number) > 0 ? 'exposed_higher' : 'comparison_higher';

  return {
    patternId: pattern.id,
    label: pattern.label,
    question: pattern.question,
    exposedLabel: pattern.exposedLabel,
    comparisonLabel: pattern.comparisonLabel,
    dimension: pattern.dimension,
    exposed,
    comparison,
    sample: exposed.deals + comparison.deals,
    effectPoints,
    direction,
    strength,
    reading: readingFor(pattern, { exposed, comparison, direction, strength }),
    limitations: limitationsFor(pattern, { strength, observableFrom, exposed, comparison }),
    supportingRecordIds: [...exposedDeals, ...comparisonDeals].map((deal) => deal.opportunity.id),
    diagnostics: {
      usable: exposed.deals + comparison.deals,
      excluded: Object.values(reasons).reduce((total, count) => total + (count || 0), 0),
      reasons,
      observableFrom,
    },
    calculatedAt,
  };
}

function summarise(deals: ClosedDeal[]): LearningGroup {
  const won = deals.filter((deal) => deal.won).length;
  return {
    deals: deals.length,
    won,
    lost: deals.length - won,
    winRatePercent: deals.length === 0 ? null : Math.round((won / deals.length) * 100),
  };
}

// ---------------------------------------------------------------- observation

/**
 * Which side of the comparison one deal is on.
 *
 * Every branch is gated on the outcome date. The gate is applied to the
 * *recording* timestamp as well as the business date wherever a record has
 * both, because a note written during the win-up is a true record of something
 * that happened and was not knowledge anybody had while the deal was live.
 */
function observe(
  pattern: LearningPatternDefinition,
  deal: ClosedDeal,
  context: LearningContext,
): LearningObservation {
  const id = deal.opportunity.id;
  const closedOn = deal.outcomeDate;

  switch (pattern.id) {
    case 'technical_acceptance_before_close': {
      const before = (context.evidenceByOpportunity.get(id) || []).filter((record) => (
        record.category === 'technical_outcome'
        && onOrBefore(record.observedAt, closedOn)
        && onOrBefore(dayOf(record.recordedAt), closedOn)
      ));
      if (before.length === 0) return 'comparison';
      // Supersession applied to what was known *then*, not to what is known
      // now: a retest recorded after the close cannot rewrite the state the
      // deal was actually in when it closed.
      const projection = projectCurrentEvidence(before);
      const current = (projection.currentByScope.get(`opportunity:${id}`) || [])
        .filter((record) => record.category === 'technical_outcome');
      return current.some((record) => record.direction === 'positive') ? 'exposed' : 'comparison';
    }

    case 'stakeholder_breadth_before_close': {
      const before = (context.stakeholdersByOpportunity.get(id) || [])
        .filter((record) => onOrBefore(dayOf(record.createdAt), closedOn));
      const distinct = new Set(before.map((record) => record.name.trim().toLowerCase()).filter(Boolean));
      return distinct.size >= 2 ? 'exposed' : 'comparison';
    }

    case 'customer_commitment_before_close': {
      const before = (context.commitmentsByOpportunity.get(id) || []).filter((record) => (
        record.commitmentParty === 'customer' && onOrBefore(dayOf(record.createdAt), closedOn)
      ));
      return before.length > 0 ? 'exposed' : 'comparison';
    }

    case 'quote_silence_before_close': {
      const quotes = (context.quotesByOpportunity.get(id) || [])
        .filter((record) => onOrBefore(record.quoteDate, closedOn));
      // No quote, no question. This pattern is about what happened after one.
      if (quotes.length === 0) return 'not_applicable';
      const quotedOn = quotes
        .map((record) => sanitizeBusinessDate(record.quoteDate))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);
      if (!quotedOn) return 'unknown';

      const touches = linkedTouchesBefore(context, id, closedOn);
      // A deal with nothing linked to it has an unknown contact history, not an
      // empty one: only one activity in a hundred carries a deal link in this
      // workspace, and reading that as "never contacted" would invent silence.
      if (touches === null) return 'unknown';

      const lastTouchAfterQuote = touches
        .map((activity) => sanitizeBusinessDate(activity.activityDate))
        .filter((value): value is string => Boolean(value) && value >= quotedOn)
        .sort()
        .at(-1);

      const gap = daysBetween(quotedOn, lastTouchAfterQuote || closedOn);
      if (gap === null) return 'unknown';
      // The kernel's own silence threshold. A second definition of "quiet"
      // would let this page and the risk panel disagree about the same deal.
      return gap > policyThresholds.threadSilenceDays ? 'exposed' : 'comparison';
    }

    case 'site_visit_before_close': {
      const touches = linkedTouchesBefore(context, id, closedOn);
      if (touches === null) return 'unknown';
      // An activity carrying no channel is "not stated". A deal whose touches
      // all predate the field cannot answer this question either way.
      const stated = touches.filter((activity) => (activity.activityChannel || '').trim());
      if (stated.length === 0) return 'unknown';
      return stated.some((activity) => (
        activity.activityChannel === 'On-site visit' || activity.activityChannel === 'Hosted visit'
      )) ? 'exposed' : 'comparison';
    }

    case 'objection_resolved_before_close': {
      const raised = (context.objectionsByOpportunity.get(id) || [])
        .filter((record) => onOrBefore(dayOf(record.createdAt), closedOn));
      // A deal nobody objected to is not the comparison group for this.
      if (raised.length === 0) return 'not_applicable';
      const settled = raised.every((record) => (
        record.status === 'Resolved' && onOrBefore(record.resolvedAt, closedOn)
      ));
      return settled ? 'exposed' : 'comparison';
    }

    default: {
      // Exhaustive: a pattern added to the registry without an observation is a
      // compile error rather than a card that silently counts nobody.
      const unreachable: never = pattern.id;
      throw new Error(`No observation defined for learning pattern ${String(unreachable)}`);
    }
  }
}

/**
 * The deal's own touches, up to and including the day it closed.
 *
 * Returns null when the deal has no linked activity at all - which is a gap in
 * linkage, not a quiet deal. Both dates are checked: `activityDate` is when the
 * work happened and `createdAt` is when it was written down, and a touch typed
 * up during the retro fails the second even when it passes the first.
 */
function linkedTouchesBefore(
  context: LearningContext,
  opportunityId: string,
  closedOn: string,
): SalesActivityRecord[] | null {
  const linked = context.activitiesByOpportunity.get(opportunityId) || [];
  if (linked.length === 0) return null;
  return linked.filter((activity) => (
    onOrBefore(activity.activityDate, closedOn) && onOrBefore(dayOf(activity.createdAt), closedOn)
  ));
}

// ---------------------------------------------------------------------- copy

/**
 * The sentence, in the associative voice and nothing else.
 *
 * "Have closed won more often" describes what the records contain. "Improves
 * your win rate" claims that doing it would change the next outcome, which is a
 * causal statement that observational history from one book of business cannot
 * support - the deals where the seller got a customer promise are the deals
 * that were going well enough for a customer to promise something.
 *
 * The distinction is not pedantry. A seller who follows a false causal claim
 * changes how they sell on the strength of a coincidence, and the product that
 * told them to do it will get the blame - correctly.
 */
function readingFor(
  pattern: LearningPatternDefinition,
  args: {
    exposed: LearningGroup;
    comparison: LearningGroup;
    direction: PersonalLearningEvidence['direction'];
    strength: EvidenceStrength;
  },
): string {
  if (args.strength === 'insufficient') {
    return `Not enough comparable closed deals yet to say anything about this.`;
  }

  if (args.direction === 'none') {
    return `No difference is visible in your recorded history: `
      + `${args.exposed.winRatePercent}% of deals ${pattern.exposedLabel} closed won, `
      + `against ${args.comparison.winRatePercent}% of comparable deals ${pattern.comparisonLabel}.`;
  }

  const higher = args.direction === 'exposed_higher'
    ? { rate: args.exposed.winRatePercent, label: pattern.exposedLabel }
    : { rate: args.comparison.winRatePercent, label: pattern.comparisonLabel };
  const lower = args.direction === 'exposed_higher'
    ? { rate: args.comparison.winRatePercent, label: pattern.comparisonLabel }
    : { rate: args.exposed.winRatePercent, label: pattern.exposedLabel };

  return `In your recorded history, deals ${higher.label} have closed won more often `
    + `(${higher.rate}%) than comparable deals ${lower.label} (${lower.rate}%).`;
}

function limitationsFor(
  pattern: LearningPatternDefinition,
  args: {
    strength: EvidenceStrength;
    observableFrom: string | null;
    exposed: LearningGroup;
    comparison: LearningGroup;
  },
): string[] {
  const limitations: string[] = [];

  if (!args.observableFrom) {
    limitations.push('Memoire has never recorded the kind of record this question needs, so no closed deal can answer it yet.');
  } else if (args.strength === 'insufficient') {
    limitations.push(`Only deals that closed on or after ${args.observableFrom} can answer this, because that is when this kind of record first appeared in your workspace.`);
  }

  const smallest = Math.min(args.exposed.deals, args.comparison.deals);
  if (smallest === 0 && (args.exposed.deals + args.comparison.deals) > 0) {
    limitations.push('Every comparable deal is on the same side, so there is nothing to compare it against.');
  }

  if (args.strength === 'early' || args.strength === 'developing') {
    limitations.push('This is what your records show so far, not a rule. One more closed deal can still move it.');
  }

  // Said on every pattern that reports a difference, because it is the single
  // most common way a reader of a comparison like this misreads it.
  if (args.strength !== 'insufficient') {
    limitations.push('These deals were not comparable in every other respect, so this describes what happened rather than what caused it.');
  }

  if (!pattern.absenceIsComparison) {
    limitations.push(`Only deals where this question applies are counted.`);
  }

  return limitations;
}

// ------------------------------------------------------------------- helpers

function groupBy<T>(records: T[], key: (record: T) => string | null | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const record of records) {
    const id = (key(record) || '').trim();
    if (!id) continue;
    const bucket = map.get(id);
    if (bucket) bucket.push(record);
    else map.set(id, [record]);
  }
  return map;
}

/** The earliest usable business day in a list of timestamps. Null when none. */
function earliestDay(timestamps: (string | null | undefined)[]): string | null {
  const days = timestamps
    .map((value) => dayOf(value))
    .filter((value): value is string => Boolean(value))
    .sort();
  return days[0] || null;
}

function dayOf(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const day = timestamp.slice(0, 10);
  return isValidBusinessDate(day) ? day : null;
}

/** True only when `value` is a readable date on or before `limit`. */
function onOrBefore(value: string | null | undefined, limit: string): boolean {
  const day = value ? sanitizeBusinessDate(value) : null;
  return Boolean(day) && (day as string) <= limit;
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/** Exported so a contract can assert the vocabulary has not silently grown. */
export { evidenceStrengths };
