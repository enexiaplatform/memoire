import { profileMinimums } from '../../utils/operatorProfile.ts';
import type { CommercialDimension } from '../commercialKernel/deriveDelta.ts';

/**
 * What Memoire is allowed to try to learn from this seller's own history.
 *
 * ## Why a closed registry
 *
 * The tempting version of this feature generates hypotheses: cross every field
 * against every outcome and report whatever comes back largest. On thirteen
 * closed deals that machine produces a confident finding every single time, and
 * every one of them is noise wearing a percentage. A closed, hand-written
 * registry is the difference between a product that measures something a person
 * chose to ask and one that mines a spreadsheet for coincidences.
 *
 * Each pattern therefore declares, up front and in code: what counts as the
 * behaviour, what it is compared against, which outcome is measured, which
 * canonical record has to have been *observable* before a deal may be counted
 * at all, and which commercial dimension it is relevant to.
 *
 * ## Why every pattern measures Won versus Lost
 *
 * It is the only outcome this repository can support honestly today. Speed of
 * progression would be the better measure - it uses the deals that have not
 * closed yet, which is most of them - but progression needs observed stage
 * transitions, and the commercial event log holds zero rows and only runs
 * forward from the day it shipped. Measuring progression from a deal's current
 * stage plus its `updated_at` is the exact false-transition claim Phase 1
 * exists to prevent, so it is not measured at all until the history is there.
 *
 * ## What this file must never become
 *
 * A score. There is no combined "deal health" number here, no weighting across
 * patterns, and no ranking of one pattern against another. Each pattern is one
 * comparison, reported with its own counts, and a reader who disagrees with it
 * can see exactly which deals produced it.
 */

// ------------------------------------------------------------------ vocabulary

export const learningPatternIds = [
  'technical_acceptance_before_close',
  'stakeholder_breadth_before_close',
  'customer_commitment_before_close',
  'quote_silence_before_close',
  'site_visit_before_close',
  'objection_resolved_before_close',
] as const;
export type LearningPatternId = (typeof learningPatternIds)[number];

/**
 * The canonical record a pattern needs, so "we never saw this" can be told
 * apart from "this did not happen".
 *
 * Each kind resolves to a date derived from the workspace itself - the earliest
 * moment the seller ever recorded one - never a hardcoded release date. A deal
 * that closed before that moment is excluded rather than counted as an absence,
 * because the instrument did not exist while that deal was running.
 */
export const learningInputKinds = [
  'commercial_evidence',
  'stakeholder',
  'commercial_commitment',
  'quote',
  'activity_channel',
  'objection',
] as const;
export type LearningInputKind = (typeof learningInputKinds)[number];

/**
 * How much history stands behind a comparison. Four words, not a percentage.
 *
 * A number like "72% confident" implies an inference this design does not make
 * and could not justify from a personal book of deals. These four are ordered,
 * they are checkable against the counts printed beside them, and they are what
 * decides whether a pattern may be shown, may be quoted as supporting evidence,
 * or may only be counted towards its own maturity.
 */
export const evidenceStrengths = ['insufficient', 'early', 'developing', 'established'] as const;
export type EvidenceStrength = (typeof evidenceStrengths)[number];

/**
 * The sample floors, in code rather than in copy.
 *
 * Anchored to the numbers this repository already defends rather than invented
 * for this feature:
 *
 *   `perGroup` at `early` is `profileMinimums.touchPatternPerSide` (3) - the
 *   existing answer to "when does a two-sided comparison stop being an
 *   anecdote", written there as "comparing three wins against one loss is not a
 *   comparison".
 *
 *   `perGroup` at `established` is `profileMinimums.winRateReliable` (12) - the
 *   point at which a win rate stops swinging ten points on a single deal. It
 *   applies per group, because each group here produces a win rate of its own.
 *
 *   `developing` sits halfway between them.
 *
 * `total` is deliberately more than twice `perGroup`. A 3-and-5 split reaching
 * the per-group floor on both sides is the thinnest shape that can qualify;
 * requiring the extra headroom stops a pattern being called on the strength of
 * one group plus the bare minimum on the other.
 */
export const learningSampleFloors = {
  early: { total: 8, perGroup: profileMinimums.touchPatternPerSide },
  developing: { total: 20, perGroup: 6 },
  established: { total: 40, perGroup: profileMinimums.winRateReliable },
} as const;

/**
 * How far two win rates must differ before the difference is worth a sentence.
 *
 * Fifteen percentage points. On a cohort near the `developing` floor a single
 * deal moves a group's rate by roughly ten points, so anything smaller than
 * this is one deal's worth of noise. Below it the pattern still reports - with
 * its counts - and says plainly that no difference is visible.
 */
export const MEANINGFUL_EFFECT_POINTS = 15;

// ------------------------------------------------------------------ definition

/**
 * How one deal answered the question this pattern asks.
 *
 * `unknown` is the load-bearing member. It is what a deal returns when the
 * chronology cannot be established, and it removes the deal from the comparison
 * instead of quietly landing it in the comparison group. Missing is not false.
 */
export const learningObservations = ['exposed', 'comparison', 'not_applicable', 'unknown'] as const;
export type LearningObservation = (typeof learningObservations)[number];

export type LearningPatternDefinition = {
  id: LearningPatternId;
  label: string;
  /** The question in the seller's words, shown above the counts. */
  question: string;
  /** The record type whose observability decides which deals may be counted. */
  requires: LearningInputKind;
  /** What the behaviour is called when it was present. Reads after "deals". */
  exposedLabel: string;
  /** What the other group is called. Reads after "comparable deals". */
  comparisonLabel: string;
  /**
   * Whether a deal with no trace of the behaviour belongs in the comparison
   * group.
   *
   * True for behaviours the seller could always have done - meeting a second
   * stakeholder, getting a promise. False for questions that only exist once
   * something happened: "did the deal go quiet after the quote" is meaningless
   * on a deal that was never quoted, and putting those deals in the comparison
   * group would answer a different question than the one on the label.
   */
  absenceIsComparison: boolean;
  /** Which part of the commercial position this speaks to. Typed, not inferred. */
  dimension: CommercialDimension;
};

/**
 * The registry.
 *
 * Six, and each one earned its place by being answerable from a canonical
 * record with a trustworthy date on it. Three candidates were investigated and
 * are deliberately absent; see `deferredLearningPatterns` below, which exists so
 * that the reasons are in the codebase rather than in a report nobody reads
 * again.
 */
export const learningPatterns: readonly LearningPatternDefinition[] = [
  {
    id: 'technical_acceptance_before_close',
    label: 'Technical acceptance before the deal closed',
    question: 'Do the deals you win more often have a positive technical result recorded before they closed?',
    requires: 'commercial_evidence',
    exposedLabel: 'with a positive technical result recorded beforehand',
    comparisonLabel: 'without one',
    absenceIsComparison: true,
    dimension: 'technical',
  },
  {
    id: 'stakeholder_breadth_before_close',
    label: 'More than one person on the customer side',
    question: 'Do the deals you win more often have more than one contact recorded before they closed?',
    requires: 'stakeholder',
    exposedLabel: 'where two or more contacts were recorded beforehand',
    comparisonLabel: 'with one contact or none',
    absenceIsComparison: true,
    dimension: 'stakeholder',
  },
  {
    id: 'customer_commitment_before_close',
    label: 'A promise from the customer',
    question: 'Do the deals you win more often have a promise from the customer recorded before they closed?',
    requires: 'commercial_commitment',
    exposedLabel: 'where the customer had promised something',
    comparisonLabel: 'where they had not',
    absenceIsComparison: true,
    dimension: 'momentum',
  },
  {
    id: 'quote_silence_before_close',
    label: 'Going quiet after a quote',
    question: 'Among your quoted deals, do the ones that went quiet after the quote close differently?',
    requires: 'quote',
    exposedLabel: 'that went quiet after the quote',
    comparisonLabel: 'that stayed in contact',
    // A deal that was never quoted cannot answer this question either way.
    absenceIsComparison: false,
    dimension: 'money',
  },
  {
    id: 'site_visit_before_close',
    label: 'Meeting in person',
    question: 'Do the deals you win more often include a visit recorded before they closed?',
    requires: 'activity_channel',
    exposedLabel: 'with a visit recorded beforehand',
    comparisonLabel: 'worked without one',
    absenceIsComparison: true,
    dimension: 'momentum',
  },
  {
    id: 'objection_resolved_before_close',
    label: 'Objections settled before the close',
    question: 'Among deals that raised an objection, do the ones you settled before closing look different?',
    requires: 'objection',
    exposedLabel: 'where the objection was settled before the close',
    comparisonLabel: 'where it was still open',
    // A deal nobody objected to is not the comparison group for this.
    absenceIsComparison: false,
    dimension: 'purchasing',
  },
];

/**
 * Candidates that were designed, checked against the data, and left out.
 *
 * Kept in code because "why is there no discount pattern" is a question that
 * will be asked again, and the answer is a property of the workspace rather
 * than an opinion.
 */
export const deferredLearningPatterns: readonly { id: string; reason: string }[] = [
  {
    id: 'post_trial_follow_up_speed',
    reason: 'It measures progression, and progression needs observed stage transitions. '
      + 'The commercial event log holds no rows and only runs forward, so the interval '
      + 'could not be computed for any historical deal without inventing the transition.',
  },
  {
    id: 'early_commercial_concession',
    reason: 'Quotes carry a structured `discount`, so this is buildable - but the workspace '
      + 'holds two quotes and neither is on a closed deal. Shipping it would add a card '
      + 'that can only ever say "not enough history" for a question already covered by '
      + 'the quote-silence pattern on the same cohort.',
  },
  {
    id: 'objection_type_mix',
    reason: 'Which kind of objection is associated with which outcome needs a cohort per '
      + 'objection type, which multiplies an already thin sample by twelve. It is the '
      + 'right question at a book size this one is nowhere near.',
  },
];

// ------------------------------------------------------------------- strength

/**
 * Both sides, then the total. The order matters: a comparison of 29 against 1
 * clears any total floor and is not a comparison.
 */
export function strengthFor(exposedDeals: number, comparisonDeals: number): EvidenceStrength {
  const total = exposedDeals + comparisonDeals;
  const smallest = Math.min(exposedDeals, comparisonDeals);

  if (total >= learningSampleFloors.established.total
    && smallest >= learningSampleFloors.established.perGroup) return 'established';
  if (total >= learningSampleFloors.developing.total
    && smallest >= learningSampleFloors.developing.perGroup) return 'developing';
  if (total >= learningSampleFloors.early.total
    && smallest >= learningSampleFloors.early.perGroup) return 'early';
  return 'insufficient';
}

const STRENGTH_ORDER: Record<EvidenceStrength, number> = {
  insufficient: 0,
  early: 1,
  developing: 2,
  established: 3,
};

export function isAtLeast(strength: EvidenceStrength, floor: EvidenceStrength): boolean {
  return STRENGTH_ORDER[strength] >= STRENGTH_ORDER[floor];
}

/**
 * The floor at which a pattern may be quoted beside a recommendation.
 *
 * `developing`, not `early`. An eight-deal pattern is worth showing the person
 * whose deals they are, on a page they went to in order to look back; it is not
 * worth putting in front of them while they decide what to do this morning.
 *
 * Note what this constant does *not* unlock: reordering. Personal history never
 * changes which recommendation comes first in this phase - see
 * `personalEvidenceFor`, which produces rationale lines and nothing else.
 */
export const LEARNING_QUOTABLE_FROM: EvidenceStrength = 'developing';

export const evidenceStrengthLabels: Record<EvidenceStrength, string> = {
  insufficient: 'Not enough history',
  early: 'Early signal',
  developing: 'Building up',
  established: 'Consistent so far',
};
