import type { CrmLiteOpportunity, OpportunityStage } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import type { QuoteRecord } from '../services/quoteStore';
import {
  analyzeMeddicLiteOpportunity,
  type MeddicLiteFieldKey,
  type MeddicLiteReview,
  type MeddicLiteStatus,
} from './meddicLite.ts';

/**
 * How much of a deal is actually known, as a number - and which stage that
 * knowledge honestly supports.
 *
 * Memoire already reviewed deals against MEDDIC and returned Strong / Partial /
 * Missing per letter. What it could not do was add them up, weight them by how
 * much each one matters, or say the sentence an operator needs at a pipeline
 * review: *you have this deal at Negotiation and the evidence supports
 * Qualification*. This file does those three things and nothing else - the
 * grading itself stays in meddicLite, so there is one MEDDIC engine.
 *
 * The shape is borrowed from a distributor's own MEDDPICC scorecard, a
 * spreadsheet built to the same purpose: nine elements, each scored 0/1/2, each
 * carrying a weight, summed against a maximum of 32, with two elements that
 * block at zero however good the rest looks.
 *
 * One deliberate difference. That spreadsheet asks a person to score all nine,
 * every fortnight, for every deal - and the honest consequence is that most
 * rows are never scored, which is exactly the failure Memoire's own
 * believability card already had: it read a hand-graded field nobody had
 * graded, and drew the whole pipeline as one bar. A spreadsheet has to ask a
 * human because it cannot read the activity log. Memoire can. So every element
 * here is derived from records that already exist - the stakeholder map, the
 * objection ledger, captured touches, the quote book - and the way to raise a
 * score is to go and record the thing, not to type a better number about it.
 *
 * That is also why there is no override. An override would be a second source
 * of truth for the one question this file exists to answer, and the first thing
 * it would be used for is making a weak deal look strong before a review.
 */

/** What each letter is worth. Sums to 16, so the maximum score is 32. */
export type QualificationElement = {
  key: MeddicLiteFieldKey;
  label: string;
  weight: number;
  /**
   * The stage this element must be fully evidenced by. `null` for Competition,
   * which matters at every stage and gates none: a deal is not held at
   * Discovery because nobody has named a rival.
   */
  gatesStage: OpportunityStage | null;
};

/**
 * Champion and Economic Buyer carry three because they are the two that decide
 * whether a deal survives contact with someone you have not met. Urgency,
 * decision process, paper process and competition carry one - each is a real
 * signal, none of them saves a deal that has no advocate and no budget holder.
 *
 * Order is the order of the ladder, so reading the list top to bottom is
 * reading the deal's own progress.
 */
export const QUALIFICATION_ELEMENTS: QualificationElement[] = [
  { key: 'identifyPain', label: 'Identify the pain', weight: 2, gatesStage: 'Discovery' },
  { key: 'metrics', label: 'Metrics', weight: 2, gatesStage: 'Qualification' },
  { key: 'implicate', label: 'Urgency', weight: 1, gatesStage: 'Qualification' },
  { key: 'decisionCriteria', label: 'Decision criteria', weight: 2, gatesStage: 'Qualification' },
  { key: 'decisionProcess', label: 'Decision process', weight: 1, gatesStage: 'Qualification' },
  { key: 'champion', label: 'Champion', weight: 3, gatesStage: 'Qualification' },
  { key: 'economicBuyer', label: 'Economic buyer', weight: 3, gatesStage: 'Demo' },
  { key: 'paperProcess', label: 'Paper process', weight: 1, gatesStage: 'Negotiation' },
  { key: 'competition', label: 'Competition', weight: 1, gatesStage: null },
];

/**
 * The two that block at zero.
 *
 * A deal with no champion and no budget holder can still score respectably by
 * being well documented everywhere else, and that number would be a lie: nobody
 * inside the account wants this and nobody can pay for it. So they are called
 * out separately from the total rather than folded into it.
 */
export const BLOCKING_ELEMENTS: MeddicLiteFieldKey[] = ['champion', 'economicBuyer'];

/**
 * Two gates, deliberately different, taken from the same source workbook.
 *
 * The forecast gate is stricter than the effort gate because they answer
 * different questions. "Is this deal solid enough to promise revenue on" is a
 * question about money and deserves a high bar. "Did this person do real work
 * this month" is a question about effort, and holding it to the forecast bar
 * would mark a good month's prospecting as a failure.
 */
export const FORECAST_GATE = 0.75;
export const EFFORT_GATE = 0.5;

/** 0, 1 or 2 - the same three answers the source scorecard allows. */
export function scoreForStatus(status: MeddicLiteStatus): 0 | 1 | 2 {
  return status === 'Strong' ? 2 : status === 'Partial' ? 1 : 0;
}

export type QualificationElementScore = {
  key: MeddicLiteFieldKey;
  label: string;
  weight: number;
  status: MeddicLiteStatus;
  /** 0, 1 or 2. */
  points: 0 | 1 | 2;
  weightedPoints: number;
  /** Why it scored what it scored, taken straight from the MEDDIC review. */
  evidence: string[];
  /** What is missing, and therefore what to go and record. */
  gaps: string[];
  blocking: boolean;
};

export type DealQualification = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  elements: QualificationElementScore[];
  /** Sum of weight x points. */
  weighted: number;
  /** Sum of weights x 2. Fixed at 32 unless the element list changes. */
  max: number;
  /** `weighted / max`, 0 to 1. */
  percentOfMax: number;
  /** Elements that must not be zero and are. Empty is the normal case. */
  blockers: QualificationElementScore[];
  /** Where the seller says the deal is. */
  claimedStage: OpportunityStage;
  /** The furthest stage the evidence actually supports. */
  evidenceStage: OpportunityStage;
  /**
   * How many rungs of the ladder the claim sits above the evidence. Zero or
   * negative is fine - a seller being conservative is not a problem to report.
   */
  stageGap: number;
  /** Clears the forecast gate and has no blocker. Only these may back a forecast. */
  backsForecast: boolean;
  /** Clears the lower gate. Used for "of which real" counts, never for money. */
  clearsEffortGate: boolean;
};

/**
 * The ladder rung each stage sits on, for comparing a claim against evidence.
 *
 * Closed states are absent on purpose: a won or lost deal is not optimistic
 * about itself, and `On hold` has no position - it is a deal that stopped,
 * which the ladder cannot express as a rung.
 */
const STAGE_RUNG: Partial<Record<OpportunityStage, number>> = {
  Lead: 0,
  Discovery: 1,
  Qualification: 2,
  'Technical discussion': 3,
  Demo: 4,
  Proposal: 5,
  Negotiation: 6,
  Procurement: 7,
};

export function scoreDealQualification(input: {
  opportunity: CrmLiteOpportunity;
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  quotes?: QuoteRecord[];
  /** Pass a review already computed for this deal rather than recomputing it. */
  review?: MeddicLiteReview;
}): DealQualification {
  const { opportunity } = input;
  const review = input.review || analyzeMeddicLiteOpportunity({
    opportunity,
    stakeholders: input.stakeholders || [],
    objections: input.objections || [],
    activities: input.activities || [],
    quotes: input.quotes || [],
  });

  const byKey = new Map(review.fields.map((field) => [field.key, field]));

  const elements: QualificationElementScore[] = QUALIFICATION_ELEMENTS.map((element) => {
    const field = byKey.get(element.key);
    // A letter the review did not return scores zero rather than being skipped.
    // Dropping it would quietly lower the maximum and inflate the percentage -
    // a deal would look better for the app knowing less about it.
    const status: MeddicLiteStatus = field?.status || 'Missing';
    const points = scoreForStatus(status);
    return {
      key: element.key,
      label: element.label,
      weight: element.weight,
      status,
      points,
      weightedPoints: element.weight * points,
      evidence: field?.evidence || [],
      gaps: field?.gaps || [],
      blocking: BLOCKING_ELEMENTS.includes(element.key),
    };
  });

  const weighted = elements.reduce((total, element) => total + element.weightedPoints, 0);
  const max = QUALIFICATION_ELEMENTS.reduce((total, element) => total + element.weight * 2, 0);
  const percentOfMax = max === 0 ? 0 : weighted / max;
  const blockers = elements.filter((element) => element.blocking && element.points === 0);

  const claimedStage = opportunity.stage;
  const evidenceStage = deriveEvidenceStage(elements);

  const claimedRung = STAGE_RUNG[claimedStage];
  const evidenceRung = STAGE_RUNG[evidenceStage] ?? 0;
  // A closed or paused deal has no rung, so it has no gap to report. Reporting
  // one would put "over-stated" on every deal already won.
  const stageGap = claimedRung === undefined ? 0 : claimedRung - evidenceRung;

  return {
    opportunityId: opportunity.id,
    accountName: opportunity.accountName,
    opportunityName: opportunity.opportunityName,
    elements,
    weighted,
    max,
    percentOfMax,
    blockers,
    claimedStage,
    evidenceStage,
    stageGap,
    backsForecast: percentOfMax >= FORECAST_GATE && blockers.length === 0,
    clearsEffortGate: percentOfMax >= EFFORT_GATE,
  };
}

/**
 * The furthest stage the evidence supports: the first element not fully
 * evidenced decides it.
 *
 * Read as a chain rather than a total, because that is how a deal actually
 * fails. Nine points of paperwork does not compensate for never having found
 * the pain; the deal is at Discovery whatever the total says. Competition is
 * excluded because it gates no stage - it is a risk, not a rung.
 */
export function deriveEvidenceStage(elements: QualificationElementScore[]): OpportunityStage {
  const scoreOf = (key: MeddicLiteFieldKey) => elements.find((element) => element.key === key)?.points ?? 0;

  if (scoreOf('identifyPain') < 2) return 'Discovery';

  const qualificationSet: MeddicLiteFieldKey[] = [
    'metrics', 'implicate', 'decisionCriteria', 'decisionProcess', 'champion',
  ];
  if (qualificationSet.some((key) => scoreOf(key) < 2)) return 'Qualification';

  // Without a budget holder a deal can be demonstrated but not proposed: a
  // quotation addressed to nobody who can approve it is a document, not a step.
  if (scoreOf('economicBuyer') < 2) return 'Demo';

  // Without a paper route it can be proposed but not negotiated - there is
  // nothing to negotiate towards.
  if (scoreOf('paperProcess') < 2) return 'Proposal';

  return 'Negotiation';
}

/**
 * The one sentence to put in front of an operator, or '' when there is nothing
 * worth saying.
 *
 * Silent when the claim matches the evidence. A panel that produces a line for
 * every deal is a panel people stop reading, and most deals are honestly
 * staged.
 */
export function describeStageGap(qualification: DealQualification): string {
  if (qualification.blockers.length > 0) {
    const names = qualification.blockers.map((blocker) => blocker.label.toLowerCase());
    return `No ${names.join(' and no ')} on this deal. Whatever else is known, nobody inside the account is carrying it.`;
  }
  if (qualification.stageGap <= 0) return '';
  return `You have this at ${qualification.claimedStage}. The evidence supports ${qualification.evidenceStage}.`;
}

/**
 * Every active deal scored, newest gap first.
 *
 * Active only: a won deal cannot be over-stated and a lost one no longer
 * matters, so including them would pad every count with history.
 */
export function scorePipelineQualification(input: {
  opportunities: CrmLiteOpportunity[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  quotes?: QuoteRecord[];
}): DealQualification[] {
  return input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => scoreDealQualification({
      opportunity,
      stakeholders: input.stakeholders,
      objections: input.objections,
      activities: input.activities,
      quotes: input.quotes,
    }));
}

export type QualificationPipelineSummary = {
  scored: number;
  backingForecast: number;
  clearingEffortGate: number;
  blocked: number;
  overStated: number;
  /** Mean percent of maximum across active deals, or null when there are none. */
  averagePercent: number | null;
  /** The worst offenders, biggest claim-versus-evidence gap first. */
  worstGaps: DealQualification[];
};

export function summariseQualification(scores: DealQualification[]): QualificationPipelineSummary {
  return {
    scored: scores.length,
    backingForecast: scores.filter((score) => score.backsForecast).length,
    clearingEffortGate: scores.filter((score) => score.clearsEffortGate).length,
    blocked: scores.filter((score) => score.blockers.length > 0).length,
    overStated: scores.filter((score) => score.stageGap > 0).length,
    averagePercent: scores.length === 0
      ? null
      : scores.reduce((total, score) => total + score.percentOfMax, 0) / scores.length,
    worstGaps: [...scores]
      .filter((score) => score.stageGap > 0 || score.blockers.length > 0)
      .sort((left, right) => (
        right.stageGap - left.stageGap
        || right.blockers.length - left.blockers.length
        || left.percentOfMax - right.percentOfMax
      ))
      .slice(0, 5),
  };
}
