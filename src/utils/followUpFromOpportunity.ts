import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { FollowUpContext } from '../types/v31';

// Builds a revive-focused Follow-up Composer context from a quiet deal:
// latest interaction summary and pain points come from activities linked by
// opportunity id or account name.
export function buildReviveFollowUpContext(
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
): FollowUpContext {
  const normalize = (value?: string) => (value || '').trim().toLowerCase();
  const accountKey = normalize(opportunity.accountName);
  const relatedActivities = activities
    .filter((activity) => activity.linkedOpportunityId === opportunity.id
      || (accountKey !== '' && (normalize(activity.accountName) === accountKey || normalize(activity.linkedAccountName) === accountKey)))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  return {
    accountName: opportunity.accountName || 'Needs confirmation',
    contactName: opportunity.decisionMaker || '',
    opportunityName: opportunity.opportunityName || '',
    lastInteractionSummary: relatedActivities[0]?.summary || '',
    objections: [],
    painPoints: relatedActivities.flatMap((activity) => activity.risks || []).filter(Boolean),
    nextAction: opportunity.nextAction || 'Book the next customer touch.',
    goal: 'revive_stale_deal',
    tone: 'consultative',
    length: 'medium',
  };
}
