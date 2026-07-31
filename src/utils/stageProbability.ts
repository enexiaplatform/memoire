import type { CrmLiteOpportunity, OpportunityStage } from '../services/opportunityStore';

/**
 * What a stage is worth, as a convention.
 *
 * Every CRM carries this table and it is worth being precise about what it is.
 * It is **not** a prediction: nothing here learns from won and lost deals, and
 * nothing here scores a specific customer. It is a shared convention that makes
 * two things possible - a weighted pipeline number that means the same thing on
 * Monday as on Friday, and a way to notice that a declared number and a stage
 * are telling different stories.
 *
 * That second use is the one Memoire cares about. Salesforce shows you the
 * probability you typed. Memoire compares it to where the deal actually is and
 * says so when they disagree, because "80%, still in Discovery" is the shape of
 * a forecast that misses.
 *
 * `On hold` has no default on purpose. A paused deal's odds depend on why it
 * paused, which is a judgement the stage cannot make.
 */
export const STAGE_PROBABILITY: Record<OpportunityStage, number | null> = {
  Lead: 5,
  Discovery: 10,
  Qualification: 20,
  'Technical discussion': 30,
  Demo: 40,
  Proposal: 60,
  Negotiation: 75,
  Procurement: 90,
  Won: 100,
  Lost: 0,
  'On hold': null,
};

/**
 * How far a declared probability may sit above its stage before it is called
 * out. Twenty points is roughly two stages: below that it is a judgement call,
 * above it the number and the evidence are describing different deals.
 */
export const OPTIMISM_TOLERANCE = 20;

export type ProbabilitySource = 'declared' | 'stage' | 'unknown';

export type ResolvedProbability = {
  /** The number to use. Null only when the stage has no default and none was declared. */
  value: number | null;
  source: ProbabilitySource;
  /** What the stage alone would say. */
  stageDefault: number | null;
  /** What the operator typed, if they typed anything. */
  declared: number | null;
};

export function defaultProbabilityForStage(stage: OpportunityStage): number | null {
  return STAGE_PROBABILITY[stage] ?? null;
}

/**
 * The declared number wins. A seller who has looked at a deal and typed 40%
 * knows something the stage table does not, and overwriting that with a
 * convention would be the app telling them they are wrong by default.
 */
export function resolveProbability(
  opportunity: Pick<CrmLiteOpportunity, 'stage' | 'pipelineProbability'>,
): ResolvedProbability {
  const stageDefault = defaultProbabilityForStage(opportunity.stage);
  const declared = typeof opportunity.pipelineProbability === 'number'
    ? clampProbability(opportunity.pipelineProbability)
    : null;

  if (declared !== null) return { value: declared, source: 'declared', stageDefault, declared };
  if (stageDefault !== null) return { value: stageDefault, source: 'stage', stageDefault, declared };
  return { value: null, source: 'unknown', stageDefault, declared };
}

/**
 * A closed deal whose probability still reads like an open one.
 *
 * Won at 60% or lost at 30% is not a forecasting subtlety, it is a record that
 * was never finished, and it quietly corrupts every weighted number downstream.
 */
export function isClosedProbabilityStale(
  opportunity: Pick<CrmLiteOpportunity, 'stage' | 'status' | 'pipelineProbability'>,
): boolean {
  const declared = typeof opportunity.pipelineProbability === 'number' ? opportunity.pipelineProbability : null;
  if (declared === null) return false;
  if (opportunity.status === 'Won' || opportunity.stage === 'Won') return declared !== 100;
  if (opportunity.status === 'Lost' || opportunity.stage === 'Lost') return declared !== 0;
  return false;
}

/**
 * The declared number is further ahead than the stage supports.
 *
 * Only flags optimism. A deal marked less likely than its stage is a seller
 * being careful, and nagging someone for being careful is how a warning learns
 * to be ignored.
 */
export function isProbabilityOptimistic(
  opportunity: Pick<CrmLiteOpportunity, 'stage' | 'status' | 'pipelineProbability'>,
  tolerance = OPTIMISM_TOLERANCE,
): boolean {
  if (opportunity.status !== 'Active') return false;
  const { declared, stageDefault } = resolveProbability(opportunity);
  if (declared === null || stageDefault === null) return false;
  return declared - stageDefault > tolerance;
}

/** One sentence naming the gap, for a seller to accept or correct. */
export function probabilityGapText(
  opportunity: Pick<CrmLiteOpportunity, 'stage' | 'status' | 'pipelineProbability'>,
): string {
  if (isClosedProbabilityStale(opportunity)) {
    const closedAs = opportunity.status === 'Won' || opportunity.stage === 'Won' ? 'Won' : 'Lost';
    const expected = closedAs === 'Won' ? 100 : 0;
    return `This deal is ${closedAs} but still reads ${opportunity.pipelineProbability}%. Closed deals are ${expected}%.`;
  }
  if (isProbabilityOptimistic(opportunity)) {
    const { declared, stageDefault } = resolveProbability(opportunity);
    return `${declared}% is ahead of ${opportunity.stage}, which normally runs at ${stageDefault}%. Either the stage is behind the deal, or the number is.`;
  }
  return '';
}

/**
 * The weighted value of one deal, using the resolved probability.
 *
 * A deal with no probability and no stage default contributes nothing rather
 * than its full value: counting an unqualified number at 100% is how a pipeline
 * total stops being believable.
 */
export function weightedValue(
  opportunity: Pick<CrmLiteOpportunity, 'stage' | 'pipelineProbability' | 'estimatedValue'>,
): number {
  const { value } = resolveProbability(opportunity);
  if (value === null || typeof opportunity.estimatedValue !== 'number') return 0;
  return (opportunity.estimatedValue * value) / 100;
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
