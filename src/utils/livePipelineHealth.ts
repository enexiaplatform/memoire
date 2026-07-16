import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import type { SalesAssetRecord } from '../services/salesAssetStore';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import { mapOpportunityToPipelineDefenseDeal } from './opportunityToPipelineBrief';
import { buildPipelineDefenseCenter } from './pipelineDefenseCenter.ts';

export type LivePipelineHealthInput = {
  opportunities: CrmLiteOpportunity[];
  objections?: ObjectionRecord[];
  stakeholders?: StakeholderRecord[];
  activities?: SalesActivityRecord[];
  actionOutcomes?: ActionOutcomeRecord[];
  salesAssets?: SalesAssetRecord[];
  opportunityOutcomes?: OpportunityOutcomeRecord[];
  today?: string;
};

/**
 * The single source of pipeline health, measured from the LIVE pipeline.
 *
 * Today used to score readiness from the latest saved brief - a snapshot that
 * could be stale, absent, or (before the sample purge) not even the seller's
 * data. That is how one workspace reported 0% readiness on Today while
 * Opportunities showed 119 of 122 deals weak: the two surfaces were not
 * measuring the same pipeline.
 *
 * Live opportunities go through the same opportunity -> deal mapper the brief
 * generator uses, then the same classifier, so a brief generated right now and
 * this reading agree by construction. Only active deals count: a won, lost, or
 * on-hold deal is not something to defend.
 *
 * Derived, never stored.
 */
export function buildLivePipelineHealth(input: LivePipelineHealthInput) {
  const activeOpportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');
  const deals = activeOpportunities.map((opportunity) => mapOpportunityToPipelineDefenseDeal(
    opportunity,
    input.objections || [],
    input.stakeholders || [],
    input.activities || [],
    input.actionOutcomes || [],
    input.salesAssets || [],
    activeOpportunities,
  ));

  return {
    ...buildPipelineDefenseCenter(deals, input.today, input.opportunityOutcomes || []),
    /** How many live deals the reading is measured from - shown, never implied. */
    measuredDealCount: activeOpportunities.length,
  };
}
