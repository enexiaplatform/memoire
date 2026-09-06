import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { QuoteRecord } from '../../services/quoteStore';
import type { ObjectionRecord } from '../../services/objectionStore';
import type { DealQualification } from '../../utils/dealQualificationScore';
import { convertMoney, formatMoneyWithBase, getReportingCurrency, type SupportedCurrency } from '../../utils/money.ts';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import {
  DELTA_WINDOW_DAYS,
  // One classification of what an objection is about, shared with Delta.
  // A second hand-written copy is how two surfaces come to disagree about the
  // same record without either of them being obviously wrong.
  deltaObjectionDimension,
  type CommercialDeltaItem,
  type CommercialDimension,
} from './deriveDelta.ts';
import type { ReasonCode, Recommendation } from './policyEngine.ts';
import type { CommercialCommitment, CommitmentImpactType } from './types.ts';

/**
 * Next Best Action: which of the kernel's own recommendations to do first.
 *
 * This is a ranking primitive, not a recommendation engine. It produces no
 * candidate the policy engine did not already produce, reads nothing the policy
 * engine cannot see, and writes nothing at all. Memoire has five prioritisation
 * systems already; the point of this file is to be the one the others can
 * eventually collapse into, which it can only be if it never becomes a sixth
 * source of truth.
 *
 * ## Why there is no score
 *
 * The obvious implementation is a weighted sum, and the obvious problem with it
 * is that "priority 83" cannot be argued with. A seller who disagrees with the
 * order has nowhere to look, so they stop reading the order.
 *
 * Instead the comparison is lexicographic over four named dimensions, in a
 * fixed precedence. Any two recommendations differ on the first dimension where
 * they differ, and that dimension is the whole explanation:
 *
 *   1. URGENCY      - has the moment passed, or is it about to?
 *   2. UNBLOCKING   - would doing this move the thread, or tidy the record?
 *   3. EVIDENCE     - is this built on a specific record, or on an absence?
 *   4. VALUE        - how much money is attached?
 *
 * Value is deliberately last. It decides between commercially equivalent pieces
 * of work and can never outrank a nearer deadline, which is the failure mode
 * this ordering exists to prevent: a two-billion deal nobody has touched in a
 * year sitting above a three-hundred-million deal closing on Friday.
 *
 * ## What the dimensions are read from
 *
 * All of it from records the seller can open: the reason code the policy engine
 * already assigned, the commitment / quote / opportunity the recommendation
 * names, and - where the caller has one - the Phase 1 delta for the same
 * subject. Nothing is inferred about the world, and nothing is invented about
 * people or companies.
 */

// ------------------------------------------------------------------ dimensions

/**
 * When this stops being worth doing.
 *
 * Bands rather than a number of days, because the commercially meaningful
 * distinction is not "6.2 days" - it is whether the moment has already passed,
 * is inside the week the seller is planning, or is merely on the horizon.
 */
export const urgencyBands = ['now', 'this_week', 'soon', 'whenever'] as const;
export type UrgencyBand = (typeof urgencyBands)[number];

/** Whether doing this can move the commercial thread, or only tidy the record. */
export const unblockingBands = ['unblocks', 'advances', 'tidies'] as const;
export type UnblockingBand = (typeof unblockingBands)[number];

/**
 * How well grounded the recommendation is.
 *
 * `absence_only` is the honest label for the large family of rules that fire
 * because something is *missing* - no dated next action, no owner, no recorded
 * evidence. They are worth saying, and they are worth saying after everything
 * built on a promise somebody actually made.
 */
export const evidenceBands = ['specific', 'partial', 'absence_only'] as const;
export type EvidenceBand = (typeof evidenceBands)[number];

/**
 * The money attached to a recommendation.
 *
 * `amountBase` is null both when nothing is recorded and when the currency has
 * no rate. Those are different facts but they license the same behaviour: this
 * recommendation may not claim priority on the strength of its value. A null is
 * never read as a zero - a deal worth an unknown amount is not a worthless deal.
 */
export type CommercialValueAtStake = {
  amount: number | null;
  currency: string | null;
  amountBase: number | null;
  baseCurrency: SupportedCurrency;
  /** What the money is: an estimate, a quoted figure, or a promised impact. */
  kind: 'opportunity_estimate' | 'quoted_amount' | 'commitment_impact' | 'none';
};

export type RankedRecommendation = Recommendation & {
  /** 1-based position in this ranking. */
  rank: number;
  /**
   * The commercial move, sharpened where the records support it and left as the
   * policy engine wrote it where they do not.
   */
  candidateAction: string;
  urgency: UrgencyBand;
  unblocking: UnblockingBand;
  evidence: EvidenceBand;
  value: CommercialValueAtStake;
  /**
   * The date this recommendation is really about - a commitment's due date, a
   * quote's validity, or a deal's dated next action. Empty when it has none.
   * Read for urgency and for the tie-break; never invented.
   */
  dueDate: string;
  /** "Why this is first", in sentences. Never a score. */
  rationale: string[];
  /** Delta items that moved this recommendation's priority. */
  supportingChangeIds: string[];
  /** Recommendations that said the same thing and were folded into this one. */
  supersededIds: string[];
  calculatedAt: string;
};

/** Why a recommendation was withheld. Returned, never silently dropped. */
export const suppressionReasons = [
  'opportunity_closed',
  'commitment_already_scheduled',
  'duplicate_action',
] as const;
export type SuppressionReason = (typeof suppressionReasons)[number];

export type SuppressedRecommendation = {
  recommendation: Recommendation;
  reason: SuppressionReason;
  /** The record or recommendation that contradicts it. */
  contradictedBy: string[];
};

export type RankingResult = {
  ranked: RankedRecommendation[];
  suppressed: SuppressedRecommendation[];
  calculatedAt: string;
};

// ---------------------------------------------------------------------- input

/**
 * A seam, not a feature.
 *
 * Phase 4 will be able to say "this seller's deals of this shape close faster
 * when the technical side is settled first". When it can, it hands a reading in
 * here and the ranking gains a fifth dimension without the other four moving.
 * It is optional and there is no implementation: an abstraction with no consumer
 * is worse than no abstraction.
 */
export type PersonalEvidence = {
  /** One sentence, with its own sample count already stated by the producer. */
  reading: string;
  /** Which recommendation ids it speaks to. */
  recommendationIds: string[];
};

export type RankingInput = {
  /** The policy engine's output. The only source of candidates there is. */
  recommendations: Recommendation[];
  opportunities: CrmLiteOpportunity[];
  quotes: QuoteRecord[];
  commitments: CommercialCommitment[];
  objections?: ObjectionRecord[];
  qualification?: Map<string, DealQualification>;
  /**
   * Phase 1 observed changes, for the same subject as these recommendations.
   *
   * Optional and frequently absent: Today ranks the whole book and has no
   * per-subject delta, and must rank perfectly well without one. Where a
   * subject-scoped surface does have it, an observed change moves priority.
   */
  observedChanges?: CommercialDeltaItem[];
  personalEvidence?: PersonalEvidence[];
  /** Injected, so the same workspace always produces the same order. */
  today?: Date;
  reportingCurrency?: SupportedCurrency;
};

// ----------------------------------------------------------------- precedence

const URGENCY_ORDER: Record<UrgencyBand, number> = { now: 0, this_week: 1, soon: 2, whenever: 3 };
const UNBLOCKING_ORDER: Record<UnblockingBand, number> = { unblocks: 0, advances: 1, tidies: 2 };
const EVIDENCE_ORDER: Record<EvidenceBand, number> = { specific: 0, partial: 1, absence_only: 2 };

/**
 * What each rule is, before any record is read.
 *
 * Declared as a total record over `ReasonCode`, like the delta condition map:
 * adding a policy rule without deciding what kind of work it is becomes a type
 * error rather than a recommendation that silently ranks last forever.
 *
 * `urgency` here is the floor. Records raise it - an expired quote is `now`
 * where a quote with a week left is `this_week` - but never lower it.
 */
const RULE_SHAPE: Record<ReasonCode, {
  urgency: UrgencyBand;
  unblocking: UnblockingBand;
  evidence: EvidenceBand;
}> = {
  CUSTOMER_COMMITMENT_OVERDUE: { urgency: 'now', unblocking: 'unblocks', evidence: 'specific' },
  SELF_COMMITMENT_OVERDUE: { urgency: 'now', unblocking: 'unblocks', evidence: 'specific' },
  MONEY_CHECKPOINT_STUCK: { urgency: 'now', unblocking: 'unblocks', evidence: 'specific' },
  QUOTE_EXPIRING: { urgency: 'this_week', unblocking: 'unblocks', evidence: 'specific' },
  PERIOD_COVERAGE_LOW: { urgency: 'this_week', unblocking: 'advances', evidence: 'specific' },
  COMMITMENT_REPEATEDLY_RESCHEDULED: { urgency: 'soon', unblocking: 'advances', evidence: 'specific' },
  FORECAST_NOT_SUPPORTED: { urgency: 'soon', unblocking: 'advances', evidence: 'specific' },
  THREAD_SILENT: { urgency: 'soon', unblocking: 'advances', evidence: 'partial' },
  THREAD_WITHOUT_NEXT_COMMITMENT: { urgency: 'soon', unblocking: 'unblocks', evidence: 'absence_only' },
  OPPORTUNITY_WITHOUT_FUTURE_ACTION: { urgency: 'soon', unblocking: 'unblocks', evidence: 'absence_only' },
  OPPORTUNITY_WITHOUT_STAGE_EVIDENCE: { urgency: 'soon', unblocking: 'advances', evidence: 'absence_only' },
  COMMITMENT_WITHOUT_DUE_DATE: { urgency: 'whenever', unblocking: 'tidies', evidence: 'absence_only' },
  COMMITMENT_WITHOUT_OWNER: { urgency: 'whenever', unblocking: 'tidies', evidence: 'absence_only' },
};

/** The commitment rules that are about *when* the promise was due. */
const COMMITMENT_TIMING_RULES: ReasonCode[] = [
  'CUSTOMER_COMMITMENT_OVERDUE',
  'SELF_COMMITMENT_OVERDUE',
  'COMMITMENT_REPEATEDLY_RESCHEDULED',
];

/** Rules whose whole point is that nothing is scheduled to move the thread. */
const NOTHING_SCHEDULED_RULES: ReasonCode[] = [
  'THREAD_WITHOUT_NEXT_COMMITMENT',
  'OPPORTUNITY_WITHOUT_FUTURE_ACTION',
];

/**
 * What each rule is *about*, in the same dimensions Delta classifies changes in.
 *
 * This is the relevance gate, and it exists because the first version did not
 * have one. Any observed change on a deal raised the urgency of every
 * recommendation on that deal, so a price objection opening made "no stage
 * evidence recorded" more urgent - two facts about the same customer with
 * nothing connecting them. That is the difference between evidence that is
 * relevant and evidence that is merely nearby, and a product that cannot tell
 * them apart is guessing with a confident face.
 *
 * Declared as a total record over `ReasonCode`: a new rule cannot be added
 * without deciding what it is about, and cannot silently inherit "everything".
 *
 * Two entries are worth their reasoning:
 *
 *   OPPORTUNITY_WITHOUT_STAGE_EVIDENCE also lists `technical`, because a
 *   technical objection being settled *is* recorded evidence for the stage the
 *   deal claims. The link is in the domain, not in a keyword.
 *
 *   Nothing lists `stakeholder`. The policy engine has no rule about who is on
 *   the deal, so a stakeholder change has no rule to be relevant to, and
 *   pretending otherwise would be the exact failure this map prevents.
 */
const RULE_CONCERNS: Record<ReasonCode, readonly CommercialDimension[]> = {
  CUSTOMER_COMMITMENT_OVERDUE: ['momentum'],
  SELF_COMMITMENT_OVERDUE: ['momentum'],
  COMMITMENT_REPEATEDLY_RESCHEDULED: ['momentum'],
  COMMITMENT_WITHOUT_OWNER: ['momentum'],
  COMMITMENT_WITHOUT_DUE_DATE: ['momentum'],
  THREAD_SILENT: ['momentum'],
  THREAD_WITHOUT_NEXT_COMMITMENT: ['momentum'],
  OPPORTUNITY_WITHOUT_FUTURE_ACTION: ['momentum'],
  OPPORTUNITY_WITHOUT_STAGE_EVIDENCE: ['qualification', 'technical'],
  FORECAST_NOT_SUPPORTED: ['qualification'],
  QUOTE_EXPIRING: ['money', 'purchasing'],
  MONEY_CHECKPOINT_STUCK: ['money', 'purchasing'],
  PERIOD_COVERAGE_LOW: ['money'],
};

/**
 * What a promise is about, when the operator has said.
 *
 * A commitment rule is generically about momentum - something was promised and
 * has not happened. But a promise carries `impactType`, and where the operator
 * set it, it says what *kind* of promise: an overdue purchase order is a
 * purchasing matter, and an open price objection on the same deal is then
 * genuinely related to chasing it. Where `impactType` is `none` the extra
 * relevance is not claimed, because nothing recorded supports it.
 */
const COMMITMENT_IMPACT_CONCERNS: Record<CommitmentImpactType, readonly CommercialDimension[]> = {
  revenue: ['money', 'purchasing'],
  payment: ['money', 'purchasing'],
  delivery: ['technical'],
  relationship: ['stakeholder'],
  none: [],
};

/**
 * Changes whose relevance is timing rather than a single dimension.
 *
 * A deal's expected close moving is not only a money fact - it changes when
 * every dated piece of work on that deal has to happen. So it reaches any rule
 * that is time-sensitive at all, and none of the ones that are not. This is the
 * one cross-cutting case, and it is listed rather than inferred.
 */
const TIMING_CHANGE_KINDS: readonly CommercialDeltaItem['kind'][] = ['close_period_changed'];

/**
 * The only two numbers this file owns.
 *
 * They are calendar bucketing, not commercial judgement: they turn a date into
 * the band a person plans in. Every threshold that decides whether something is
 * *wrong* - how long is silent, how near is expiring, how many reschedules are
 * a pattern - stays in the policy engine, where it is inspectable and where the
 * interface already shows it next to the finding.
 */
const THIS_WEEK_DAYS = 7;
const SOON_DAYS = 30;

// ---------------------------------------------------------------------- rank

export function rankRecommendations(input: RankingInput): RankingResult {
  const today = input.today || new Date();
  const calculatedAt = today.toISOString();
  const todayKey = toDateKey(today);
  const baseCurrency = input.reportingCurrency || getReportingCurrency();

  const context = buildContext(input);
  const changes = input.observedChanges || [];

  const suppressed: SuppressedRecommendation[] = [];
  const surviving: Recommendation[] = [];

  for (const recommendation of input.recommendations) {
    const contradiction = findContradiction(recommendation, context, changes);
    if (contradiction) {
      suppressed.push({ recommendation, ...contradiction });
      continue;
    }
    surviving.push(recommendation);
  }

  // Computed once for the whole ranking, not per recommendation: the window,
  // supersession and canonical vetoes are properties of the change set, not of
  // whichever row is being described.
  const pressure = eligiblePressure(changes, context, todayKey);

  const scored = surviving.map((recommendation) =>
    describe(recommendation, context, pressure, { todayKey, baseCurrency, calculatedAt, personalEvidence: input.personalEvidence }));

  const merged = collapseEquivalentActions(scored, suppressed);

  const ordered = merged.sort(compareRanked);

  return {
    ranked: ordered.map((item, index) => ({ ...item, rank: index + 1 })),
    suppressed,
    calculatedAt,
  };
}

/**
 * The comparison, in one place and in precedence order.
 *
 * Every step is a named dimension a person can be shown. The last two are
 * tie-breaks and are deliberately not commercial claims: a due date is a fact,
 * and a record id is arbitrary but stable. What is gone from here is the old
 * `accountName.localeCompare` fallback, which put a book in alphabetical order
 * and let it read as a judgement.
 */
function compareRanked(left: RankedRecommendation, right: RankedRecommendation): number {
  const byUrgency = URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency];
  if (byUrgency !== 0) return byUrgency;

  const byUnblocking = UNBLOCKING_ORDER[left.unblocking] - UNBLOCKING_ORDER[right.unblocking];
  if (byUnblocking !== 0) return byUnblocking;

  const byEvidence = EVIDENCE_ORDER[left.evidence] - EVIDENCE_ORDER[right.evidence];
  if (byEvidence !== 0) return byEvidence;

  // Known value before unknown, then larger before smaller. Unknown is not
  // zero: it goes below equivalent work whose value is known, and no further.
  const leftKnown = left.value.amountBase !== null;
  const rightKnown = right.value.amountBase !== null;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  if (leftKnown && rightKnown && left.value.amountBase !== right.value.amountBase) {
    return (right.value.amountBase as number) - (left.value.amountBase as number);
  }

  const byDue = compareDueKeys(left.dueDate, right.dueDate);
  if (byDue !== 0) return byDue;

  return left.id.localeCompare(right.id);
}

// -------------------------------------------------------------------- context

type RankingContext = {
  opportunityById: Map<string, CrmLiteOpportunity>;
  quoteById: Map<string, QuoteRecord>;
  commitmentById: Map<string, CommercialCommitment>;
  openCommitmentsByOpportunity: Map<string, CommercialCommitment[]>;
  openObjectionsByOpportunity: Map<string, ObjectionRecord[]>;
  openObjectionsByAccount: Map<string, ObjectionRecord[]>;
  /** Ids of objections that are still open, for the canonical veto. */
  openObjectionIds: Set<string>;
  /**
   * Whether the caller supplied objections at all. Without this, "not in the
   * open set" would read as "resolved" on a caller that simply passed none.
   */
  knowsObjections: boolean;
  qualification: Map<string, DealQualification>;
};

function buildContext(input: RankingInput): RankingContext {
  const openCommitmentsByOpportunity = new Map<string, CommercialCommitment[]>();
  for (const commitment of input.commitments) {
    if (commitment.status !== 'open' || !commitment.opportunityId) continue;
    push(openCommitmentsByOpportunity, commitment.opportunityId, commitment);
  }

  const openObjectionsByOpportunity = new Map<string, ObjectionRecord[]>();
  const openObjectionsByAccount = new Map<string, ObjectionRecord[]>();
  const openObjectionIds = new Set<string>();
  for (const objection of input.objections || []) {
    if (objection.status === 'Resolved') continue;
    openObjectionIds.add(objection.id);
    if (objection.opportunityId) push(openObjectionsByOpportunity, objection.opportunityId, objection);
    if (objection.accountName) push(openObjectionsByAccount, normalizeEntityName(objection.accountName), objection);
  }

  return {
    opportunityById: new Map(input.opportunities.map((item) => [item.id, item])),
    quoteById: new Map(input.quotes.map((item) => [item.id, item])),
    commitmentById: new Map(input.commitments.map((item) => [item.id, item])),
    openCommitmentsByOpportunity,
    openObjectionsByOpportunity,
    openObjectionsByAccount,
    openObjectionIds,
    knowsObjections: Array.isArray(input.objections),
    qualification: input.qualification || new Map(),
  };
}

// ----------------------------------------------------------- contradictions

/**
 * Recommendations the records already answer.
 *
 * The policy engine checks each rule against the record it is about; it does
 * not check the rule against the rest of the workspace. So a commitment on a
 * deal that was won last month still reports as overdue, and a quote on a lost
 * deal still reports as expiring. Both are true statements about a record and
 * false statements about the business, and either one on a Best Move card
 * costs more trust than the ten correct rows beside it.
 */
function findContradiction(
  recommendation: Recommendation,
  context: RankingContext,
  changes: CommercialDeltaItem[],
): { reason: SuppressionReason; contradictedBy: string[] } | null {
  const opportunity = recommendation.opportunityId
    ? context.opportunityById.get(recommendation.opportunityId)
    : undefined;

  // A deal that is not running cannot have live work on it. `Active` is the
  // only status that leaves it open; Won, Lost and On hold all end the sentence.
  if (opportunity && opportunity.status !== 'Active') {
    return { reason: 'opportunity_closed', contradictedBy: [opportunity.id] };
  }

  if (NOTHING_SCHEDULED_RULES.includes(recommendation.reasonCode) && recommendation.opportunityId) {
    const open = context.openCommitmentsByOpportunity.get(recommendation.opportunityId) || [];
    if (open.length > 0) {
      return { reason: 'commitment_already_scheduled', contradictedBy: open.map((item) => item.id) };
    }
    // The delta can also know a promise was made inside the window, on a
    // surface whose commitment list has not caught up with it.
    const made = changes.filter((change) => change.kind === 'commitment_made');
    if (made.length > 0) {
      return {
        reason: 'commitment_already_scheduled',
        contradictedBy: made.flatMap((change) => change.sourceRecordIds),
      };
    }
  }

  return null;
}

/**
 * One gap, listed once.
 *
 * Two rules can arrive at the same sentence about the same deal - the policy
 * engine already collapses one such pair itself, where a thread with no open
 * commitment and the deal behind it with no dated next action both say "nothing
 * is scheduled to move this". This is the general form of that.
 *
 * It is deliberately narrow in two ways, both learned from getting it wrong.
 *
 * It only collapses `absence_only` recommendations. A rule grounded in a
 * specific record is about *that record*: two quotes expiring on one customer
 * are two quotes, and folding them into one row loses one of them. A rule
 * grounded in an absence is about the deal, and two absences on one deal that
 * produce the same sentence are one gap.
 *
 * And it only collapses where there is a concrete subject. Falling back to the
 * account name would merge unrelated work across everything filed under one
 * customer.
 */
function collapseEquivalentActions(
  items: RankedRecommendation[],
  suppressed: SuppressedRecommendation[],
): RankedRecommendation[] {
  const bySubjectAction = new Map<string, RankedRecommendation[]>();
  const kept: RankedRecommendation[] = [];

  for (const item of items) {
    const subject = item.opportunityId || item.threadId;
    if (!subject || item.evidence !== 'absence_only') {
      kept.push(item);
      continue;
    }
    push(bySubjectAction, `${subject}::${item.candidateAction.toLowerCase()}`, item);
  }

  for (const group of bySubjectAction.values()) {
    if (group.length === 1) {
      kept.push(group[0]);
      continue;
    }
    const [winner, ...rest] = [...group].sort(compareRanked);
    for (const loser of rest) {
      suppressed.push({
        recommendation: loser,
        reason: 'duplicate_action',
        contradictedBy: [winner.id],
      });
    }
    kept.push({
      ...winner,
      supersededIds: rest.map((item) => item.id),
      sourceRecordIds: unique([...winner.sourceRecordIds, ...rest.flatMap((item) => item.sourceRecordIds)]),
    });
  }
  return kept;
}

// ------------------------------------------------------------------ describe

function describe(
  recommendation: Recommendation,
  context: RankingContext,
  /** Already windowed, superseded and vetoed. Relevance is applied here. */
  pressure: CommercialDeltaItem[],
  options: {
    todayKey: string;
    baseCurrency: SupportedCurrency;
    calculatedAt: string;
    personalEvidence?: PersonalEvidence[];
  },
): RankedRecommendation {
  const shape = RULE_SHAPE[recommendation.reasonCode];
  const dueKey = resolveDueDate(recommendation, context);
  const value = resolveValue(recommendation, context, options.baseCurrency);

  const relevant = pressure.filter((change) => changeIsRelevant(change, recommendation, context));
  const negative = relevant.filter((change) => change.direction === 'weakened');
  const positive = relevant.filter((change) => change.direction === 'improved');

  let urgency = urgencyFromDate(shape.urgency, dueKey, options.todayKey);

  // Something was observed getting worse here, inside the delta window. That is
  // the difference between a standing gap and a deal actively deteriorating.
  if (negative.length > 0) urgency = raise(urgency);

  // Something was observed going right here. A gap on a thread the seller is
  // visibly working is less pressing than the same gap on one nobody has
  // touched - but only for work that tidies or advances. A blocked thread is
  // blocked whatever else happened this week.
  if (positive.length > 0 && negative.length === 0 && shape.unblocking !== 'unblocks') {
    urgency = lower(urgency);
  }

  const candidateAction = sharpenAction(recommendation, context);

  return {
    ...recommendation,
    rank: 0,
    candidateAction,
    urgency,
    unblocking: shape.unblocking,
    evidence: shape.evidence,
    value,
    dueDate: dueKey,
    rationale: buildRationale(recommendation, {
      urgency, dueKey, value, negative, positive, context, options,
    }),
    supportingChangeIds: relevant.map((change) => change.id),
    supersededIds: [],
    calculatedAt: options.calculatedAt,
  };
}

/**
 * The observed changes eligible to move anything, before relevance is asked.
 *
 * Four gates, in order:
 *
 *   1. A condition is not a change. Phase 1 keeps those apart deliberately, and
 *      letting a standing condition act as new pressure would quietly undo it.
 *   2. A neutral change is history, not pressure.
 *   3. It has to be recent. The window is checked here rather than trusted from
 *      the caller, so a surface that hands over a wider delta cannot silently
 *      give a three-month-old objection today's urgency.
 *   4. Only the newest change per record counts. A price objection opened on
 *      Monday and resolved on Wednesday leaves both in the window; applying the
 *      Monday pressure would let a superseded fact keep pushing. Two pieces of
 *      evidence are two different records, so that gate cannot separate them -
 *      the canonical veto below does it instead, from the supersession Delta
 *      already computed over the whole history.
 *
 * Then the canonical veto: a change whose premise the current records have
 * already answered applies no pressure at all. New truth beats old pressure.
 */
function eligiblePressure(
  changes: CommercialDeltaItem[],
  context: RankingContext,
  todayKey: string,
): CommercialDeltaItem[] {
  const since = new Date(Date.parse(`${todayKey}T00:00:00Z`) - DELTA_WINDOW_DAYS * 86_400_000)
    .toISOString();

  const newestByRecord = new Map<string, CommercialDeltaItem>();
  for (const change of changes) {
    if (change.observation !== 'transition') continue;
    if (change.direction === 'neutral') continue;
    if (!change.occurredAt || change.occurredAt < since) continue;

    const key = change.sourceRecordIds[0] || change.id;
    const seen = newestByRecord.get(key);
    if (!seen || (change.occurredAt || '') > (seen.occurredAt || '')) newestByRecord.set(key, change);
  }

  return [...newestByRecord.values()]
    .filter((change) => !vetoedByCanonicalState(change, context))
    // Stable order, so the rationale reads the same way twice.
    .sort((left, right) =>
      (right.occurredAt || '').localeCompare(left.occurredAt || '') || left.id.localeCompare(right.id));
}

/**
 * Whether the current records have already answered what this change reported.
 *
 * The case that matters: an objection opened inside the window and resolved
 * since. Supersession above catches it when the resolution was itself observed,
 * but a resolution recorded without a date produces no change to supersede it -
 * and the objection is still, canonically, resolved. Asking the record directly
 * is the stronger test, so both run.
 */
function vetoedByCanonicalState(change: CommercialDeltaItem, context: RankingContext): boolean {
  // A recorded finding that a later observation replaced. The row is still true
  // history and Delta still lists it; what it may not do is keep pushing. A
  // trial that failed on the 1st and passed on retest on the 5th would
  // otherwise go on raising the urgency of the technical work it already
  // answered, which is exactly "stale evidence dominating newer evidence".
  if (change.kind === 'evidence_recorded') return Boolean(change.supersededBy);

  if (change.kind !== 'objection_opened') return false;
  const objectionId = change.sourceRecordIds[0];
  if (!objectionId) return false;
  // Unknown to this context means the caller passed no objections; that is not
  // evidence of resolution, so nothing is vetoed on it.
  if (!context.knowsObjections) return false;
  return !context.openObjectionIds.has(objectionId);
}

/**
 * Whether an observed change speaks to this recommendation at all.
 *
 * Dimension against declared concern, plus the one cross-cutting case. No
 * string matching, no proximity, no "it happened on the same deal".
 */
function changeIsRelevant(
  change: CommercialDeltaItem,
  recommendation: Recommendation,
  context: RankingContext,
): boolean {
  if (TIMING_CHANGE_KINDS.includes(change.kind)) {
    // Timing reaches anything with a clock on it, and nothing without one.
    return RULE_SHAPE[recommendation.reasonCode].urgency !== 'whenever';
  }
  return concernsOf(recommendation, context).includes(change.dimension);
}

/** What this recommendation is about: its rule, plus what the promise is about. */
function concernsOf(recommendation: Recommendation, context: RankingContext): readonly CommercialDimension[] {
  const base = RULE_CONCERNS[recommendation.reasonCode];
  if (!recommendation.commitmentId) return base;
  const commitment = context.commitmentById.get(recommendation.commitmentId);
  if (!commitment) return base;
  return [...base, ...COMMITMENT_IMPACT_CONCERNS[commitment.impactType]];
}

// ------------------------------------------------------------------- urgency

/**
 * The date the recommendation is really about, when it has one.
 *
 * Used for urgency and for the tie-break. Memoire has no "decision date" field,
 * so nothing here pretends to know one: a commitment has a due date, a quote
 * has a validity, and a deal has a dated next action. Those are the three dates
 * that exist, and they are the three that are read.
 */
function resolveDueDate(recommendation: Recommendation, context: RankingContext): string {
  // Only the rules that are about a promise's timing read its date. "It does
  // not say who owes it" is a tidying job about a missing name; letting it
  // inherit the promise's overdue date made a housekeeping row read as the most
  // urgent thing on the deal.
  if (recommendation.commitmentId && COMMITMENT_TIMING_RULES.includes(recommendation.reasonCode)) {
    const commitment = context.commitmentById.get(recommendation.commitmentId);
    if (commitment?.currentDueDate) return commitment.currentDueDate;
  }
  if (recommendation.reasonCode === 'QUOTE_EXPIRING') {
    for (const id of recommendation.sourceRecordIds) {
      const quote = context.quoteById.get(id);
      if (quote?.validUntil) return quote.validUntil;
    }
  }
  // Only the rule that is literally about the deal's next-action date may read
  // it. Every other opportunity-scoped rule would be borrowing an unrelated
  // date to claim urgency it has not got - and then printing "it is dated 3
  // days out" underneath a finding about missing stage evidence.
  if (recommendation.reasonCode === 'OPPORTUNITY_WITHOUT_FUTURE_ACTION' && recommendation.opportunityId) {
    const opportunity = context.opportunityById.get(recommendation.opportunityId);
    if (opportunity?.nextActionDate) return opportunity.nextActionDate;
  }
  return '';
}

function urgencyFromDate(floor: UrgencyBand, dueKey: string, todayKey: string): UrgencyBand {
  if (!dueKey) return floor;
  const days = daysBetween(todayKey, dueKey);
  if (days === null) return floor;

  const fromDate: UrgencyBand = days < 0
    ? 'now'
    : days <= THIS_WEEK_DAYS
      ? 'this_week'
      : days <= SOON_DAYS ? 'soon' : 'whenever';

  // The date may only raise urgency above the rule's floor, never lower it. A
  // silent thread whose next action is dated three months out is still silent.
  return URGENCY_ORDER[fromDate] < URGENCY_ORDER[floor] ? fromDate : floor;
}

function raise(band: UrgencyBand): UrgencyBand {
  const index = URGENCY_ORDER[band];
  return urgencyBands[Math.max(0, index - 1)];
}

function lower(band: UrgencyBand): UrgencyBand {
  const index = URGENCY_ORDER[band];
  return urgencyBands[Math.min(urgencyBands.length - 1, index + 1)];
}

// --------------------------------------------------------------------- value

/**
 * The money attached, converted once, through the workspace's own rates.
 *
 * `convertMoney` returns null for a currency nobody has priced, and that null
 * is carried rather than defaulted. Comparing a raw 400,000 against a raw
 * 300,000,000 without asking what currency each is in is the arithmetic that
 * makes a small European deal outrank a large Vietnamese one, or the reverse -
 * and it is invisible on screen, because both numbers look right.
 */
function resolveValue(
  recommendation: Recommendation,
  context: RankingContext,
  baseCurrency: SupportedCurrency,
): CommercialValueAtStake {
  const none: CommercialValueAtStake = {
    amount: null, currency: null, amountBase: null, baseCurrency, kind: 'none',
  };

  if (recommendation.commitmentId) {
    const commitment = context.commitmentById.get(recommendation.commitmentId);
    if (commitment && typeof commitment.impactAmount === 'number' && commitment.impactCurrency) {
      return money(commitment.impactAmount, commitment.impactCurrency, baseCurrency, 'commitment_impact');
    }
  }

  if (recommendation.reasonCode === 'QUOTE_EXPIRING') {
    for (const id of recommendation.sourceRecordIds) {
      const quote = context.quoteById.get(id);
      if (quote && typeof quote.amount === 'number') {
        return money(quote.amount, quote.currency, baseCurrency, 'quoted_amount');
      }
    }
  }

  if (recommendation.opportunityId) {
    const opportunity = context.opportunityById.get(recommendation.opportunityId);
    if (opportunity && typeof opportunity.estimatedValue === 'number') {
      return money(opportunity.estimatedValue, opportunity.currency, baseCurrency, 'opportunity_estimate');
    }
  }

  return none;
}

function money(
  amount: number,
  currency: string,
  baseCurrency: SupportedCurrency,
  kind: CommercialValueAtStake['kind'],
): CommercialValueAtStake {
  return {
    amount,
    currency,
    amountBase: convertMoney(amount, currency, baseCurrency),
    baseCurrency,
    kind,
  };
}

// ----------------------------------------------------------------- sharpening

/**
 * The action, said as specifically as the records allow and no further.
 *
 * Every sharpening below is gated on a record that exists. Where the gate is
 * open the sentence names a real person, a real objection or a real promise;
 * where it is shut the policy engine's own wording stands. A generic sentence
 * that is true beats a specific one that invented a purchasing manager - and
 * inventing people is the one thing this product must be obviously incapable
 * of doing.
 */
function sharpenAction(recommendation: Recommendation, context: RankingContext): string {
  const fallback = recommendation.recommendedAction;

  if (recommendation.commitmentId) {
    const commitment = context.commitmentById.get(recommendation.commitmentId);
    const owner = commitment?.ownerLabel.trim();
    if (commitment && owner && recommendation.reasonCode === 'CUSTOMER_COMMITMENT_OVERDUE') {
      return `Ask ${owner} to confirm a new date for "${commitment.commitmentText}".`;
    }
    if (commitment && recommendation.reasonCode === 'COMMITMENT_REPEATEDLY_RESCHEDULED') {
      return `Find out what is blocking "${commitment.commitmentText}", or drop it.`;
    }
  }

  const objection = relevantOpenObjection(recommendation, context);
  if (objection) {
    if (recommendation.reasonCode === 'THREAD_SILENT') {
      return `Make contact - the ${objection.objectionType.toLowerCase()} objection is still open.`;
    }
    if (recommendation.reasonCode === 'QUOTE_EXPIRING') {
      return `Settle the open ${objection.objectionType.toLowerCase()} objection before the quote lapses.`;
    }
  }

  return fallback;
}

/**
 * The open objection worth naming beside this recommendation.
 *
 * Two gates, and both had to be added.
 *
 * It must be *relevant*: its category has to fall inside what this rule is
 * about. An open price objection belongs beside chasing an overdue purchase
 * order and beside a quote about to lapse. It does not belong beside "no stage
 * evidence recorded" - those are two true facts about one customer, and putting
 * them in the same sentence implies a connection the records do not contain.
 *
 * And there must be exactly one. "The objection" is a false claim on a deal
 * carrying three, and choosing one of them would be arbitrary.
 */
function relevantOpenObjection(recommendation: Recommendation, context: RankingContext): ObjectionRecord | null {
  const byDeal = recommendation.opportunityId
    ? context.openObjectionsByOpportunity.get(recommendation.opportunityId)
    : undefined;
  const candidates = byDeal && byDeal.length > 0
    ? byDeal
    : context.openObjectionsByAccount.get(normalizeEntityName(recommendation.accountName || '')) || [];

  const concerns = concernsOf(recommendation, context);
  const relevant = candidates.filter(
    (objection) => concerns.includes(deltaObjectionDimension[objection.objectionType] || 'qualification'),
  );

  return relevant.length === 1 ? relevant[0] : null;
}


// ----------------------------------------------------------------- rationale

/**
 * Why this one, in sentences a seller can check.
 *
 * The first line is always the rule's own reason text, because that is the
 * finding; the rest is what moved it up or down the list. There is no line
 * saying what the score was, because there is no score.
 */
function buildRationale(
  recommendation: Recommendation,
  args: {
    urgency: UrgencyBand;
    dueKey: string;
    value: CommercialValueAtStake;
    negative: CommercialDeltaItem[];
    positive: CommercialDeltaItem[];
    context: RankingContext;
    options: { todayKey: string; personalEvidence?: PersonalEvidence[] };
  },
): string[] {
  const lines: string[] = [recommendation.reasonText];

  if (args.dueKey) {
    const days = daysBetween(args.options.todayKey, args.dueKey);
    if (days !== null) {
      if (days < 0) lines.push(`The date on it passed ${plural(Math.abs(days), 'day')} ago.`);
      else if (days === 0) lines.push('It is dated today.');
      else if (days <= SOON_DAYS) lines.push(`It is dated ${plural(days, 'day')} out.`);
    }
  }

  for (const change of args.negative) lines.push(`Since your last look: ${change.statement}`);
  for (const change of args.positive) lines.push(`Also since your last look: ${change.statement}`);

  const objection = relevantOpenObjection(recommendation, args.context);
  if (objection) lines.push(`An open ${objection.objectionType.toLowerCase()} objection is still unresolved here.`);

  if (args.value.amountBase !== null && args.value.amount !== null && args.value.currency) {
    lines.push(`${valueNoun(args.value.kind)}: ${formatMoneyWithBase(args.value.amount, args.value.currency, { compact: true })}.`);
  } else if (args.value.kind === 'none') {
    // Said plainly rather than hidden, because "no value recorded" is the
    // reason this sits below an otherwise identical row - and it is fixable.
    lines.push('No value is recorded on this deal, so it cannot be weighed against the others.');
  } else {
    lines.push(`Value is recorded in ${args.value.currency}, which has no exchange rate set, so it is not compared.`);
  }

  // A qualification gap answers "why is the evidence credible?", so it belongs
  // beside a rule about evidence and nowhere else. It used to be appended to
  // everything, which put "Still missing: champion" under an overdue purchase
  // order - true about the deal, and no part of why that PO is late.
  if (concernsOf(recommendation, args.context).includes('qualification')) {
    const qualification = recommendation.opportunityId
      ? args.context.qualification.get(recommendation.opportunityId)
      : undefined;
    const blocker = qualification?.blockers[0];
    if (blocker) lines.push(`Still missing: ${blocker.label.toLowerCase()}.`);
  }

  for (const evidence of args.options.personalEvidence || []) {
    if (evidence.recommendationIds.includes(recommendation.id)) lines.push(evidence.reading);
  }

  return lines;
}

function valueNoun(kind: CommercialValueAtStake['kind']): string {
  if (kind === 'quoted_amount') return 'Quoted';
  if (kind === 'commitment_impact') return 'Tied to this promise';
  return 'Estimated value';
}

// ------------------------------------------------------------------- helpers

function compareDueKeys(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

function daysBetween(from: string, to: string): number | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${Math.abs(count) === 1 ? '' : 's'}`;
}

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const existing = map.get(key);
  if (existing) existing.push(value);
  else map.set(key, [value]);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Re-exported so a contract can assert the maps cover every rule. */
export { RULE_SHAPE as recommendationRuleShape };
export { RULE_CONCERNS as recommendationRuleConcerns };
