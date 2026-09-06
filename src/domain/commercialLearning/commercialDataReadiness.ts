import type { CrmLiteOpportunity } from '../../services/opportunityStore';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import type { StakeholderRecord } from '../../services/stakeholderStore';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { isAtLeast, type EvidenceStrength } from './learningPatterns.ts';
import {
  deriveStakeholderInvolvement,
  involvementFor,
} from './stakeholderInvolvement.ts';
import type { PersonalLearningResult } from './derivePersonalLearning.ts';

/**
 * Whether Memoire currently has enough connected history to reason about this
 * business.
 *
 * ## What this is not
 *
 * A data-quality dashboard. There is no grid, no bulk editor, no completeness
 * percentage per record, and no score. The product's objective is commercial
 * intelligence; this exists only to answer one honest question the seller will
 * otherwise ask in the form "why does Memoire only know about 12 of my deals?"
 *
 * ## Denominators are the whole design
 *
 * "1 of 1,741 stakeholders are linked to a deal" is a true number and a useless
 * one: 1,700 of those are an imported contact list that was never about an
 * active opportunity, so the ratio measures the import rather than the work.
 * Every rate below is therefore taken against the population it is actually
 * about - activities on customers who *have* a deal, and opportunities that are
 * *open* - which is the only version of these numbers that can be acted on.
 *
 * ## Readiness comes from Learning, never from a second estimate
 *
 * The per-pattern cohort counts are read straight off `derivePersonalLearning`.
 * A parallel calculation here would drift within a release and the two surfaces
 * would then disagree about whether the same pattern was ready.
 */

export type PatternReadiness = {
  patternId: string;
  label: string;
  /** Closed deals whose history can answer this question. Learning's own count. */
  observableDeals: number;
  strength: EvidenceStrength;
  /** True once the pattern has enough on both sides to say anything at all. */
  forming: boolean;
};

export type CommercialDataReadiness = {
  activitiesTotal: number;
  activitiesAccountLinked: number;
  /**
   * Activities on a customer that has at least one deal. The honest
   * denominator for opportunity linkage: a touch on a customer with no deal at
   * all cannot be linked to one and should not count against the rate.
   */
  activitiesLinkableToOpportunity: number;
  activitiesOpportunityLinked: number;

  stakeholdersTotal: number;
  /** Open deals, which is the population that can have people evidenced on it. */
  openOpportunities: number;
  openOpportunitiesWithInvolvement: number;

  closedDeals: number;
  patternReadiness: PatternReadiness[];
  patternsForming: number;

  evidenceCount: number;
  commitmentsCount: number;
  eventHistoryCount: number;
};

export function buildCommercialDataReadiness(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  stakeholders: StakeholderRecord[];
  learning: PersonalLearningResult;
  evidenceCount: number;
  commitmentsCount: number;
  eventHistoryCount: number;
  includeSampleRecords?: boolean;
}): CommercialDataReadiness {
  const includeSamples = input.includeSampleRecords === true;
  const visible = <T extends { isSample?: boolean; source?: string }>(record: T) =>
    includeSamples || (record.isSample !== true && record.source !== 'demo');

  const activities = input.activities.filter(visible);
  const opportunities = input.opportunities.filter(visible);
  const stakeholders = input.stakeholders.filter(visible);

  const accountsWithDeals = new Set(
    opportunities.map((item) => normalizeEntityName(item.accountName)).filter(Boolean),
  );

  const accountLinked = activities.filter((activity) => (
    (activity.linkedAccountName || activity.accountName || '').trim().length > 0
  ));
  const linkable = accountLinked.filter((activity) => accountsWithDeals.has(
    normalizeEntityName(activity.linkedAccountName || activity.accountName || ''),
  ));
  const opportunityLinked = activities.filter(
    (activity) => activity.linkStatus === 'Linked' && Boolean(activity.linkedOpportunityId),
  );

  const involvement = deriveStakeholderInvolvement({
    stakeholders,
    activities,
    includeSampleRecords: includeSamples,
  });
  const open = opportunities.filter((item) => item.status === 'Active');
  const openWithPeople = open.filter((item) => involvementFor(involvement, item.id).length > 0);

  const patternReadiness = input.learning.patterns.map((pattern) => ({
    patternId: pattern.patternId,
    label: pattern.label,
    observableDeals: pattern.sample,
    strength: pattern.strength,
    forming: isAtLeast(pattern.strength, 'early'),
  }));

  return {
    activitiesTotal: activities.length,
    activitiesAccountLinked: accountLinked.length,
    activitiesLinkableToOpportunity: linkable.length,
    activitiesOpportunityLinked: opportunityLinked.length,

    stakeholdersTotal: stakeholders.length,
    openOpportunities: open.length,
    openOpportunitiesWithInvolvement: openWithPeople.length,

    closedDeals: input.learning.closedDealsConsidered,
    patternReadiness,
    patternsForming: patternReadiness.filter((pattern) => pattern.forming).length,

    evidenceCount: input.evidenceCount,
    commitmentsCount: input.commitmentsCount,
    eventHistoryCount: input.eventHistoryCount,
  };
}

/**
 * One sentence for the seller, or none.
 *
 * Returns null when there is nothing worth saying - a workspace with no
 * activities on customers who have deals is not being told about a linkage
 * rate, because the answer is "start capturing", not "your data is 0% linked".
 */
export function readinessHeadline(readiness: CommercialDataReadiness): string | null {
  if (readiness.activitiesLinkableToOpportunity === 0) return null;

  const linked = readiness.activitiesOpportunityLinked;
  const linkable = readiness.activitiesLinkableToOpportunity;
  if (linked >= linkable) {
    return `Every touch you have recorded on a customer with a deal is attached to one.`;
  }

  return `${linked} of ${linkable} touches on customers with deals are attached to a specific deal. `
    + `The rest stay with the customer, which is where Memoire leaves anything it cannot place.`;
}
