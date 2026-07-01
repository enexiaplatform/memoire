import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { formatSafeBusinessDate, isBusinessDateOverdue, sanitizeBusinessDate } from './safeDate.ts';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { getObjectionsForOpportunity } from './objectionLedger';
import {
  analyzeMeddicLiteOpportunity,
  type MeddicLiteFieldKey,
  type MeddicLiteReview,
} from './meddicLite';
import { getStakeholdersForOpportunity } from './stakeholderGraph';

export type OpportunityActionPriority = 'High' | 'Medium' | 'Low';

export type OpportunityActionSourceType =
  | 'MEDDIC Gap'
  | 'Stakeholder'
  | 'Objection'
  | 'Stale Next Action'
  | 'Timeline'
  | 'Competition';

export type OpportunityRecommendedAction = {
  id: string;
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  title: string;
  priority: OpportunityActionPriority;
  reason: string;
  sourceType: OpportunityActionSourceType;
  relatedGap?: string;
  relatedStakeholderName?: string;
  relatedObjectionId?: string;
  suggestedDueDate?: string;
  suggestedOwner?: string;
  copyText: string;
};

export function generateOpportunityActionPlan(input: {
  opportunity: CrmLiteOpportunity;
  meddicReview?: MeddicLiteReview;
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}): OpportunityRecommendedAction[] {
  const opportunity = input.opportunity;
  const stakeholders = getStakeholdersForOpportunity(input.stakeholders || [], opportunity);
  const objections = getObjectionsForOpportunity(input.objections || [], opportunity);
  const activities = getRelatedActivities(opportunity, input.activities || []);
  const meddicReview = input.meddicReview || analyzeMeddicLiteOpportunity({
    opportunity,
    stakeholders,
    objections,
    activities,
  });

  const actions: OpportunityRecommendedAction[] = [];

  addMeddicGapActions(actions, opportunity, meddicReview);
  addStakeholderActions(actions, opportunity, stakeholders, meddicReview);
  addObjectionActions(actions, opportunity, objections);
  addStaleNextAction(actions, opportunity, activities);
  addTimelineActions(actions, opportunity, meddicReview);
  addCompetitionActions(actions, opportunity, meddicReview, objections, activities);

  if (actions.length === 0) {
    actions.push(createAction(opportunity, {
      id: 'maintain-defense',
      title: `Prepare defense answer for ${opportunity.opportunityName}`,
      priority: 'Low',
      reason: 'This deal has enough structure to maintain review readiness.',
      sourceType: 'MEDDIC Gap',
      suggestedDueDate: addDays(3),
    }));
  }

  return dedupeActions(actions)
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || sourceRank(b.sourceType) - sourceRank(a.sourceType))
    .slice(0, 8);
}

export function generatePipelineOpportunityActions(input: {
  opportunities: CrmLiteOpportunity[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  limit?: number;
}): OpportunityRecommendedAction[] {
  return input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .flatMap((opportunity) => generateOpportunityActionPlan({
      opportunity,
      stakeholders: input.stakeholders || [],
      objections: input.objections || [],
      activities: input.activities || [],
    }).slice(0, 3))
    .sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))
    .slice(0, input.limit || 8);
}

export function generateOpportunityActionsMarkdown(actions: OpportunityRecommendedAction[]) {
  if (actions.length === 0) return 'No recommended deal actions.';
  return actions
    .map((action, index) => `${index + 1}. [${action.priority}] ${action.title}\n   - Account: ${action.accountName}\n   - Opportunity: ${action.opportunityName}\n   - Source: ${action.sourceType}\n   - Reason: ${action.reason}${action.suggestedDueDate ? `\n   - Suggested due: ${action.suggestedDueDate}` : ''}`)
    .join('\n');
}

export function formatOpportunityActionCopy(action: OpportunityRecommendedAction) {
  return action.copyText;
}

function addMeddicGapActions(actions: OpportunityRecommendedAction[], opportunity: CrmLiteOpportunity, review: MeddicLiteReview) {
  const status = (key: MeddicLiteFieldKey) => review.fields.find((field) => field.key === key)?.status || 'Missing';
  const firstGap = (key: MeddicLiteFieldKey) => review.fields.find((field) => field.key === key)?.gaps[0] || '';

  if (status('economicBuyer') === 'Missing' || status('economicBuyer') === 'Partial') {
    actions.push(createAction(opportunity, {
      id: 'confirm-economic-buyer',
      title: `Confirm economic buyer for ${opportunity.opportunityName}`,
      priority: status('economicBuyer') === 'Missing' ? 'High' : 'Medium',
      reason: status('economicBuyer') === 'Missing'
        ? 'MEDDIC-lite shows no mapped economic buyer or final budget owner.'
        : 'Buyer authority is partially captured but not validated as final approval power.',
      sourceType: 'MEDDIC Gap',
      relatedGap: firstGap('economicBuyer') || 'Economic buyer not validated.',
      suggestedDueDate: addDays(3),
    }));
  }

  if (status('champion') === 'Missing' || status('champion') === 'Partial') {
    actions.push(createAction(opportunity, {
      id: 'identify-champion',
      title: status('champion') === 'Missing'
        ? `Identify champion for ${opportunity.opportunityName}`
        : `Strengthen champion support for ${opportunity.opportunityName}`,
      priority: status('champion') === 'Missing' ? 'High' : 'Medium',
      reason: 'MEDDIC-lite cannot defend the deal strongly without an internal supporter.',
      sourceType: 'Stakeholder',
      relatedGap: firstGap('champion') || 'Champion support is not strong enough.',
      suggestedDueDate: addDays(4),
    }));
  }

  if (status('decisionProcess') !== 'Strong') {
    actions.push(createAction(opportunity, {
      id: 'clarify-decision-process',
      title: `Clarify procurement decision process for ${opportunity.opportunityName}`,
      priority: 'High',
      reason: 'Decision process, timing, or next customer action is not fully defensible.',
      sourceType: 'Timeline',
      relatedGap: firstGap('decisionProcess') || 'Decision process not fully mapped.',
      suggestedDueDate: addDays(3),
    }));
  }

  if (status('decisionCriteria') === 'Missing') {
    actions.push(createAction(opportunity, {
      id: 'ask-decision-criteria',
      title: `Ask customer for technical decision criteria`,
      priority: 'Medium',
      reason: 'The deal lacks clear technical or commercial criteria for vendor comparison.',
      sourceType: 'MEDDIC Gap',
      relatedGap: firstGap('decisionCriteria') || 'Decision criteria unclear.',
      suggestedDueDate: addDays(5),
    }));
  }

  if (status('metrics') === 'Missing' || status('metrics') === 'Partial') {
    actions.push(createAction(opportunity, {
      id: 'quantify-business-impact',
      title: `Quantify business impact for ${opportunity.opportunityName}`,
      priority: status('metrics') === 'Missing' ? 'Medium' : 'Low',
      reason: 'Metrics are not strong enough to explain why the customer must act now.',
      sourceType: 'MEDDIC Gap',
      relatedGap: firstGap('metrics') || 'Business impact is not explicit.',
      suggestedDueDate: addDays(7),
    }));
  }
}

function addStakeholderActions(
  actions: OpportunityRecommendedAction[],
  opportunity: CrmLiteOpportunity,
  stakeholders: StakeholderRecord[],
  review: MeddicLiteReview,
) {
  const blocker = stakeholders.find((stakeholder) => stakeholder.stakeholderRole === 'Blocker' || stakeholder.stance === 'Resistant');
  if (blocker) {
    actions.push(createAction(opportunity, {
      id: `engage-blocker-${blocker.id}`,
      title: `Understand blocker concern from ${blocker.name}`,
      priority: 'High',
      reason: `${blocker.name} is mapped as resistant or blocking the deal.`,
      sourceType: 'Stakeholder',
      relatedStakeholderName: blocker.name,
      suggestedDueDate: addDays(3),
    }));
  }

  const allNeutral = stakeholders.length > 0 && stakeholders.every((stakeholder) => stakeholder.stance === 'Neutral' || stakeholder.stance === 'Unknown');
  if (allNeutral && !review.fields.some((field) => field.key === 'champion' && field.status === 'Strong')) {
    actions.push(createAction(opportunity, {
      id: 'strengthen-neutral-stakeholders',
      title: `Move one stakeholder from neutral to supportive`,
      priority: 'Medium',
      reason: 'All mapped stakeholders are neutral or unknown, so internal support is fragile.',
      sourceType: 'Stakeholder',
      suggestedDueDate: addDays(7),
    }));
  }
}

function addObjectionActions(actions: OpportunityRecommendedAction[], opportunity: CrmLiteOpportunity, objections: ObjectionRecord[]) {
  objections
    .filter((objection) => objection.status === 'Open')
    .slice(0, 4)
    .forEach((objection) => {
      actions.push(createAction(opportunity, {
        id: `resolve-objection-${objection.id}`,
        title: `Prepare proof for ${objection.objectionType.toLowerCase()} objection`,
        priority: objection.impact === 'High' ? 'High' : 'Medium',
        reason: objection.requiredProof || objection.objectionText,
        sourceType: objection.objectionType === 'Competitor' ? 'Competition' : 'Objection',
        relatedObjectionId: objection.id,
        relatedStakeholderName: objection.stakeholderName || undefined,
        suggestedDueDate: sanitizeBusinessDate(objection.dueDate) || addDays(objection.impact === 'High' ? 2 : 5),
      }));
    });

  if (opportunity.objectionDebt.trim() && objections.every((objection) => objection.status !== 'Open')) {
    actions.push(createAction(opportunity, {
      id: 'resolve-legacy-objection-debt',
      title: `Resolve captured objection debt`,
      priority: 'Medium',
      reason: firstSentence(opportunity.objectionDebt),
      sourceType: 'Objection',
      suggestedDueDate: addDays(5),
    }));
  }
}

function addStaleNextAction(
  actions: OpportunityRecommendedAction[],
  opportunity: CrmLiteOpportunity,
  activities: SalesActivityRecord[],
) {
  const today = todayKey();
  if (isBusinessDateOverdue(opportunity.nextActionDate, today)) {
    actions.push(createAction(opportunity, {
      id: 'follow-up-stale-next-action',
      title: `Follow up on stale next action`,
      priority: 'High',
      reason: `Opportunity next action was due ${formatSafeBusinessDate(opportunity.nextActionDate)}: ${opportunity.nextAction || 'No action text captured'}.`,
      sourceType: 'Stale Next Action',
      suggestedDueDate: today,
    }));
  }

  const staleActivity = activities.find((activity) => activity.nextAction && isBusinessDateOverdue(activity.dueDate, today));
  if (staleActivity) {
    actions.push(createAction(opportunity, {
      id: `follow-up-stale-activity-${staleActivity.id}`,
      title: `Close loop on captured follow-up`,
      priority: 'High',
      reason: `Activity next action was due ${formatSafeBusinessDate(staleActivity.dueDate)}: ${staleActivity.nextAction}.`,
      sourceType: 'Stale Next Action',
      suggestedDueDate: today,
    }));
  }

  if (!opportunity.nextAction.trim()) {
    actions.push(createAction(opportunity, {
      id: 'define-next-action',
      title: `Define next customer action`,
      priority: opportunity.forecastEvidenceCategory === 'Unsupported' ? 'High' : 'Medium',
      reason: 'No next action is captured on the opportunity.',
      sourceType: 'Stale Next Action',
      suggestedDueDate: addDays(2),
    }));
  }
}

function addTimelineActions(actions: OpportunityRecommendedAction[], opportunity: CrmLiteOpportunity, review: MeddicLiteReview) {
  const hasTimelineGap = review.gaps.some((gap) => /timing|timeline|close|process/i.test(gap));
  if (!opportunity.expectedClosePeriod || hasTimelineGap) {
    actions.push(createAction(opportunity, {
      id: 'confirm-close-timing',
      title: `Confirm close timing and decision milestone`,
      priority: !opportunity.expectedClosePeriod ? 'Medium' : 'Low',
      reason: 'Close timing or decision milestone is not strong enough for review.',
      sourceType: 'Timeline',
      relatedGap: review.gaps.find((gap) => /timing|timeline|close|process/i.test(gap)),
      suggestedDueDate: addDays(5),
    }));
  }
}

function addCompetitionActions(
  actions: OpportunityRecommendedAction[],
  opportunity: CrmLiteOpportunity,
  review: MeddicLiteReview,
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
) {
  const competitionGap = review.gaps.find((gap) => /competitor/i.test(gap));
  const competitorFromActivity = activities.flatMap((activity) => activity.competitors || [])[0];
  const openCompetitorObjection = objections.find((objection) => objection.status === 'Open' && objection.objectionType === 'Competitor');

  if (competitionGap || competitorFromActivity || openCompetitorObjection) {
    actions.push(createAction(opportunity, {
      id: 'build-competitor-response-plan',
      title: `Build response plan against competitor presence`,
      priority: openCompetitorObjection ? 'High' : 'Medium',
      reason: openCompetitorObjection?.objectionText || competitionGap || `${competitorFromActivity} is present in the deal context.`,
      sourceType: 'Competition',
      relatedGap: competitionGap,
      relatedObjectionId: openCompetitorObjection?.id,
      suggestedDueDate: addDays(4),
    }));
  }
}

function createAction(
  opportunity: CrmLiteOpportunity,
  input: Omit<OpportunityRecommendedAction, 'opportunityId' | 'accountName' | 'opportunityName' | 'copyText' | 'suggestedOwner'> & { suggestedOwner?: string },
): OpportunityRecommendedAction {
  const action = {
    ...input,
    id: `${opportunity.id}-${input.id}`,
    opportunityId: opportunity.id,
    accountName: opportunity.accountName || 'No account',
    opportunityName: opportunity.opportunityName || 'Untitled opportunity',
    suggestedOwner: input.suggestedOwner || 'Owner',
  };

  return {
    ...action,
    copyText: [
      `[${action.priority}] ${action.title}`,
      `Account: ${action.accountName}`,
      `Opportunity: ${action.opportunityName}`,
      `Source: ${action.sourceType}`,
      `Reason: ${action.reason}`,
      action.suggestedDueDate ? `Suggested due: ${action.suggestedDueDate}` : '',
    ].filter(Boolean).join('\n'),
  };
}

function getRelatedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const account = normalize(opportunity.accountName);
  const opportunityName = normalize(opportunity.opportunityName);
  return activities.filter((activity) => (
    activity.linkedOpportunityId === opportunity.id
    || normalize(activity.linkedOpportunityName) === opportunityName
    || (
      normalize(activity.linkedAccountName || activity.accountName) === account
      && normalize(activity.opportunityName).includes(opportunityName)
    )
  ));
}

function dedupeActions(actions: OpportunityRecommendedAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.opportunityId}-${action.sourceType}-${action.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function priorityRank(priority: OpportunityActionPriority) {
  return {
    High: 3,
    Medium: 2,
    Low: 1,
  }[priority];
}

function sourceRank(sourceType: OpportunityActionSourceType) {
  return {
    Objection: 6,
    Stakeholder: 5,
    'MEDDIC Gap': 4,
    'Stale Next Action': 3,
    Timeline: 2,
    Competition: 1,
  }[sourceType];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function firstSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
}
