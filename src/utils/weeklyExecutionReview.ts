import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import { getActionOutcomesForOpportunity } from '../services/actionOutcomeStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { isBusinessDateOverdue, toLocalDateKey, todayDateKey } from './safeDate.ts';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { getActionOutcomesInPeriod, summarizeActionOutcome } from './actionOutcomeLoop';
import {
  analyzeMeddicLiteOpportunity,
  type MeddicLiteDealCategory,
  type MeddicLiteFieldKey,
  type MeddicLiteReview,
} from './meddicLite';
import { getObjectionsForOpportunity } from './objectionLedger';
import {
  generateOpportunityActionPlan,
  type OpportunityRecommendedAction,
} from './opportunityActionPlan';
import { getStakeholdersForOpportunity } from './stakeholderGraph';

export type ExecutionReviewPeriodType = 'week' | 'month';

export type ExecutionDealMovement =
  | 'Improved'
  | 'Worsened'
  | 'Still unclear'
  | 'Needs rescue'
  | 'Consider downgrade'
  | 'Stable / monitor';

export type ExecutionSummary = {
  recommendedActionsCount: number;
  /**
   * Distinct deals that need an action - the real signal. The raw
   * recommendedActionsCount runs into the hundreds on an imported pipeline
   * (every deal generates several generic actions), which describes the data
   * volume, not the work to prioritise.
   */
  dealsNeedingActionCount: number;
  completedActionsCount: number;
  dismissedActionsCount: number;
  unresolvedCriticalActionsCount: number;
  improvedOutcomeCount: number;
  worsenedOutcomeCount: number;
  unclearOutcomeCount: number;
};

export type ExecutionDealMovementItem = {
  opportunityId: string;
  accountName: string;
  opportunityName: string;
  movement: ExecutionDealMovement;
  reason: string;
  meddicCategory: MeddicLiteDealCategory;
  lastOutcome?: string;
};

export type WeeklyExecutionReview = {
  periodType: ExecutionReviewPeriodType;
  periodLabel: string;
  executionSummary: ExecutionSummary;
  dealMovement: ExecutionDealMovementItem[];
  executionQualitySignals: string[];
  personalSalesLearning: string[];
  nextWeekFocus: string[];
  unresolvedCriticalActions: OpportunityRecommendedAction[];
  periodOutcomes: ActionOutcomeRecord[];
};

export function generateWeeklyExecutionReview(input: {
  periodType: ExecutionReviewPeriodType;
  periodLabel: string;
  period: { start: string; end: string };
  opportunities: CrmLiteOpportunity[];
  actionOutcomes?: ActionOutcomeRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}): WeeklyExecutionReview {
  const opportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');
  const actionOutcomes = input.actionOutcomes || [];
  const stakeholders = input.stakeholders || [];
  const objections = input.objections || [];
  const activities = input.activities || [];
  const periodOutcomes = getActionOutcomesInPeriod(actionOutcomes, input.period);
  const completedOutcomes = periodOutcomes.filter((outcome) => outcome.status === 'Done');
  const dismissedOutcomes = periodOutcomes.filter((outcome) => outcome.status === 'Dismissed');
  const improvedOutcomes = completedOutcomes.filter((outcome) => ['Improved', 'Resolved'].includes(outcome.outcomeType));
  const worsenedOutcomes = completedOutcomes.filter((outcome) => ['Worsened', 'Downgrade recommended'].includes(outcome.outcomeType));
  const unclearOutcomes = completedOutcomes.filter((outcome) => ['Still unclear', 'No change'].includes(outcome.outcomeType));

  const opportunityReviews = opportunities.map((opportunity) => buildOpportunityExecutionContext({
    opportunity,
    actionOutcomes,
    stakeholders,
    objections,
    activities,
  }));
  const recommendedActions = opportunityReviews.flatMap((review) => review.recommendedActions);
  const unresolvedCriticalActions = recommendedActions
    .filter((action) => action.priority === 'High')
    .filter((action) => !hasClosedOutcomeForAction(action, actionOutcomes))
    .slice(0, 10);
  const dealMovement = opportunityReviews
    .map((review) => classifyDealMovement(review, periodOutcomes))
    .sort((a, b) => movementRank(b.movement) - movementRank(a.movement))
    .slice(0, 8);

  const executionSummary = {
    recommendedActionsCount: recommendedActions.length,
    dealsNeedingActionCount: new Set(recommendedActions.map((action) => action.opportunityId)).size,
    completedActionsCount: completedOutcomes.length,
    dismissedActionsCount: dismissedOutcomes.length,
    unresolvedCriticalActionsCount: unresolvedCriticalActions.length,
    improvedOutcomeCount: improvedOutcomes.length,
    worsenedOutcomeCount: worsenedOutcomes.length,
    unclearOutcomeCount: unclearOutcomes.length,
  };

  const gapCounts = countRepeatedGaps(opportunityReviews);
  const executionQualitySignals = buildExecutionQualitySignals({
    executionSummary,
    gapCounts,
    unresolvedCriticalActions,
    objections,
    recommendedActions,
  });
  const personalSalesLearning = buildPersonalLearning({
    executionSummary,
    gapCounts,
    executionQualitySignals,
    objections,
  });
  const nextWeekFocus = buildNextWeekFocus({
    executionSummary,
    dealMovement,
    gapCounts,
    unresolvedCriticalActions,
    objections,
  });

  return {
    periodType: input.periodType,
    periodLabel: input.periodLabel,
    executionSummary,
    dealMovement,
    executionQualitySignals,
    personalSalesLearning,
    nextWeekFocus,
    unresolvedCriticalActions,
    periodOutcomes,
  };
}

export function generateExecutionReviewMarkdown(review: WeeklyExecutionReview) {
  const summary = review.executionSummary;
  const improved = review.dealMovement.filter((item) => item.movement === 'Improved');
  const rescue = review.dealMovement.filter((item) => item.movement === 'Needs rescue');
  const downgrade = review.dealMovement.filter((item) => item.movement === 'Consider downgrade');

  return [
    `${capitalize(review.periodType)} Execution Review`,
    '',
    `Period: ${review.periodLabel}`,
    '',
    'Execution:',
    `- Completed actions: ${summary.completedActionsCount}`,
    `- Unresolved critical actions: ${summary.unresolvedCriticalActionsCount}`,
    `- Improved outcomes: ${summary.improvedOutcomeCount}`,
    `- Unclear outcomes: ${summary.unclearOutcomeCount}`,
    `- Worsened outcomes: ${summary.worsenedOutcomeCount}`,
    '',
    'Deal Movement:',
    `- Improved: ${formatMovementList(improved)}`,
    `- Needs rescue: ${formatMovementList(rescue)}`,
    `- Consider downgrade: ${formatMovementList(downgrade)}`,
    '',
    'Learning:',
    ...review.personalSalesLearning.map((item) => `- ${item}`),
    '',
    'Next Week Focus:',
    ...review.nextWeekFocus.map((item) => `- ${item}`),
  ].join('\n');
}

export function getCurrentExecutionWeekRange(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysFromMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: toDateKey(start),
    end: toDateKey(end),
    label: `${formatShortDate(toDateKey(start))} - ${formatShortDate(toDateKey(end))}`,
  };
}

export function formatExecutionLearningForBrief(input: {
  opportunity: CrmLiteOpportunity;
  outcomes?: ActionOutcomeRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  meddicReview?: MeddicLiteReview;
  recommendedActions?: OpportunityRecommendedAction[];
}) {
  const context = buildOpportunityExecutionContext({
    opportunity: input.opportunity,
    actionOutcomes: input.outcomes || [],
    stakeholders: input.stakeholders || [],
    objections: input.objections || [],
    activities: input.activities || [],
    meddicReview: input.meddicReview,
    recommendedActions: input.recommendedActions,
  });
  const latestCompleted = context.outcomes.find((outcome) => outcome.status === 'Done');
  const unresolvedCritical = context.recommendedActions
    .filter((action) => action.priority === 'High')
    .filter((action) => !hasClosedOutcomeForAction(action, input.outcomes || []))[0];
  const posture = deriveReviewPosture(context);

  const lines = [
    latestCompleted ? `Last completed outcome: ${summarizeActionOutcome(latestCompleted)}` : '',
    unresolvedCritical ? `Unresolved critical action: ${unresolvedCritical.title}.` : '',
    `Review posture: ${posture}.`,
  ].filter(Boolean);

  return lines.length > 0 ? `Execution learning since last review:\n- ${lines.join('\n- ')}` : '';
}

function buildOpportunityExecutionContext(input: {
  opportunity: CrmLiteOpportunity;
  actionOutcomes: ActionOutcomeRecord[];
  stakeholders: StakeholderRecord[];
  objections: ObjectionRecord[];
  activities: SalesActivityRecord[];
  meddicReview?: MeddicLiteReview;
  recommendedActions?: OpportunityRecommendedAction[];
}) {
  const stakeholders = getStakeholdersForOpportunity(input.stakeholders, input.opportunity);
  const objections = getObjectionsForOpportunity(input.objections, input.opportunity);
  const activities = getRelatedActivities(input.opportunity, input.activities);
  const meddicReview = input.meddicReview || analyzeMeddicLiteOpportunity({
    opportunity: input.opportunity,
    stakeholders,
    objections,
    activities,
  });
  const recommendedActions = input.recommendedActions || generateOpportunityActionPlan({
    opportunity: input.opportunity,
    meddicReview,
    stakeholders,
    objections,
    activities,
  });

  return {
    opportunity: input.opportunity,
    stakeholders,
    objections,
    activities,
    meddicReview,
    recommendedActions,
    outcomes: getActionOutcomesForOpportunity(input.actionOutcomes, input.opportunity),
  };
}

function classifyDealMovement(
  context: ReturnType<typeof buildOpportunityExecutionContext>,
  periodOutcomes: ActionOutcomeRecord[],
): ExecutionDealMovementItem {
  const periodOpportunityOutcomes = periodOutcomes.filter((outcome) => context.outcomes.some((item) => item.id === outcome.id));
  const latestPeriodOutcome = periodOpportunityOutcomes[0];
  const hasImproved = periodOpportunityOutcomes.some((outcome) => ['Improved', 'Resolved'].includes(outcome.outcomeType));
  const hasWorsened = periodOpportunityOutcomes.some((outcome) => ['Worsened', 'Downgrade recommended'].includes(outcome.outcomeType));
  const hasUnclear = periodOpportunityOutcomes.some((outcome) => ['Still unclear', 'No change'].includes(outcome.outcomeType));
  const openHighImpactObjection = context.objections.some((objection) => objection.status === 'Open' && objection.impact === 'High');
  const unresolvedCritical = context.recommendedActions
    .filter((action) => action.priority === 'High')
    .filter((action) => !hasClosedOutcomeForAction(action, context.outcomes));
  const staleNextAction = isBusinessDateOverdue(context.opportunity.nextActionDate, todayKey());
  const decisionProcessWeak = fieldStatus(context.meddicReview, 'decisionProcess') !== 'Strong';
  const missingBuyerOrChampion = fieldStatus(context.meddicReview, 'economicBuyer') === 'Missing' || fieldStatus(context.meddicReview, 'champion') === 'Missing';

  let movement: ExecutionDealMovement = 'Stable / monitor';
  let reason = 'No major negative execution signal is visible this period.';

  if (hasImproved) {
    movement = 'Improved';
    reason = latestPeriodOutcome ? summarizeActionOutcome(latestPeriodOutcome) : 'Recent action outcome improved or resolved a deal issue.';
  } else if (hasWorsened) {
    movement = 'Worsened';
    reason = latestPeriodOutcome ? summarizeActionOutcome(latestPeriodOutcome) : 'Recent action outcome worsened the deal or suggested downgrade.';
  } else if (context.meddicReview.category === 'Unsupported' || context.opportunity.decisionRecommendation === 'Downgrade') {
    movement = 'Consider downgrade';
    reason = 'MEDDIC-lite or opportunity recommendation indicates this deal is not defensible yet.';
  } else if (context.meddicReview.category === 'Hope-based' || context.opportunity.decisionRecommendation === 'Rescue' || openHighImpactObjection || staleNextAction || unresolvedCritical.length >= 2) {
    movement = 'Needs rescue';
    reason = openHighImpactObjection
      ? 'A high-impact open objection still needs resolution.'
      : staleNextAction
        ? 'The next action is stale and needs follow-up.'
        : 'Critical MEDDIC/stakeholder actions remain unresolved.';
  } else if (hasUnclear || decisionProcessWeak || missingBuyerOrChampion) {
    movement = 'Still unclear';
    reason = hasUnclear
      ? 'Recent action outcome did not create a clear improvement.'
      : 'Buyer, champion, or decision process remains incomplete.';
  }

  return {
    opportunityId: context.opportunity.id,
    accountName: context.opportunity.accountName || 'No account',
    opportunityName: context.opportunity.opportunityName || 'Untitled opportunity',
    movement,
    reason,
    meddicCategory: context.meddicReview.category,
    lastOutcome: latestPeriodOutcome ? summarizeActionOutcome(latestPeriodOutcome) : undefined,
  };
}

function countRepeatedGaps(contexts: ReturnType<typeof buildOpportunityExecutionContext>[]) {
  return contexts.reduce(
    (counts, context) => {
      if (fieldStatus(context.meddicReview, 'economicBuyer') === 'Missing') counts.missingEconomicBuyer += 1;
      if (fieldStatus(context.meddicReview, 'champion') === 'Missing') counts.missingChampion += 1;
      if (fieldStatus(context.meddicReview, 'decisionProcess') !== 'Strong') counts.unclearDecisionProcess += 1;
      if (context.objections.some((objection) => objection.status === 'Open' && /documentation|compliance|validation/i.test(objection.objectionType))) counts.documentationObjections += 1;
      if (context.objections.some((objection) => objection.status === 'Open' && objection.objectionType === 'Competitor')) counts.competitorRisks += 1;
      return counts;
    },
    {
      missingEconomicBuyer: 0,
      missingChampion: 0,
      unclearDecisionProcess: 0,
      documentationObjections: 0,
      competitorRisks: 0,
    },
  );
}

function buildExecutionQualitySignals(input: {
  executionSummary: ExecutionSummary;
  gapCounts: ReturnType<typeof countRepeatedGaps>;
  unresolvedCriticalActions: OpportunityRecommendedAction[];
  objections: ObjectionRecord[];
  recommendedActions: OpportunityRecommendedAction[];
}) {
  const signals = [
    input.executionSummary.unclearOutcomeCount > input.executionSummary.improvedOutcomeCount
      ? 'Several completed actions still have unclear outcomes; follow-up quality may need tightening.'
      : '',
    input.unresolvedCriticalActions.length > 0
      ? `${input.unresolvedCriticalActions.length} high-priority deal action${input.unresolvedCriticalActions.length === 1 ? '' : 's'} remain unresolved.`
      : '',
    input.gapCounts.missingEconomicBuyer >= 2
      ? 'Economic buyer gaps repeat across active deals.'
      : '',
    input.gapCounts.missingChampion >= 2
      ? 'Champion gaps repeat across active deals.'
      : '',
    input.gapCounts.documentationObjections >= 2
      ? 'Documentation or validation proof is a recurring objection theme.'
      : '',
    input.gapCounts.unclearDecisionProcess >= 2
      ? 'Procurement or decision process is unclear across several opportunities.'
      : '',
    input.gapCounts.competitorRisks > 0 && input.recommendedActions.some((action) => action.sourceType === 'Competition')
      ? 'Competitor risk is present and needs an explicit response plan.'
      : '',
  ].filter(Boolean);

  return signals.length > 0 ? dedupe(signals).slice(0, 6) : ['Execution quality is stable; keep capturing outcomes after important deal actions.'];
}

function buildPersonalLearning(input: {
  executionSummary: ExecutionSummary;
  gapCounts: ReturnType<typeof countRepeatedGaps>;
  executionQualitySignals: string[];
  objections: ObjectionRecord[];
}) {
  const openObjections = input.objections.filter((objection) => objection.status === 'Open');
  const notes = [
    openObjections.length > 0
      ? 'You are capturing objections, but several remain unresolved.'
      : '',
    input.gapCounts.missingChampion + input.gapCounts.missingEconomicBuyer >= 2
      ? 'Champion and economic buyer gaps are repeating; map buying power earlier.'
      : '',
    input.executionSummary.unclearOutcomeCount > 0
      ? 'Some actions were completed but outcomes remain unclear; ask for a sharper customer confirmation after each action.'
      : '',
    input.gapCounts.documentationObjections > 0
      ? 'Proof/documentation gaps are visible; prepare reusable evidence assets before the next review.'
      : '',
    input.executionSummary.improvedOutcomeCount > 0
      ? 'Completed actions are improving some deals; keep linking outcomes back to the opportunity.'
      : '',
    input.executionQualitySignals[0] || '',
  ].filter(Boolean);

  return dedupe(notes).slice(0, 5);
}

function buildNextWeekFocus(input: {
  executionSummary: ExecutionSummary;
  dealMovement: ExecutionDealMovementItem[];
  gapCounts: ReturnType<typeof countRepeatedGaps>;
  unresolvedCriticalActions: OpportunityRecommendedAction[];
  objections: ObjectionRecord[];
}) {
  const openHighImpactObjections = input.objections.filter((objection) => objection.status === 'Open' && objection.impact === 'High');
  const focus = [
    input.gapCounts.missingEconomicBuyer > 0 ? 'Confirm economic buyers on active deals.' : '',
    input.gapCounts.missingChampion > 0 ? 'Identify or strengthen champions for weak opportunities.' : '',
    openHighImpactObjections.length > 0 ? 'Resolve top high-impact objections with required proof.' : '',
    input.executionSummary.unclearOutcomeCount > 0 ? 'Follow up unclear outcomes until the customer confirms what changed.' : '',
    input.dealMovement.some((item) => item.movement === 'Needs rescue') ? 'Rescue weak but recoverable opportunities with concrete next customer actions.' : '',
    input.dealMovement.some((item) => item.movement === 'Consider downgrade') ? 'Downgrade or deprioritize unsupported deals before review.' : '',
    input.unresolvedCriticalActions.length > 0 ? 'Close the oldest unresolved critical deal actions.' : '',
  ].filter(Boolean);

  return dedupe(focus).slice(0, 5);
}

function deriveReviewPosture(context: ReturnType<typeof buildOpportunityExecutionContext>) {
  const latestCompleted = context.outcomes.find((outcome) => outcome.status === 'Done');
  const unresolvedCritical = context.recommendedActions.filter((action) => action.priority === 'High' && !hasClosedOutcomeForAction(action, context.outcomes));

  if (context.meddicReview.category === 'Unsupported' || context.opportunity.decisionRecommendation === 'Downgrade') {
    return 'Downgrade until evidence, buyer, and decision process are confirmed';
  }

  if (context.meddicReview.category === 'Hope-based' || context.opportunity.decisionRecommendation === 'Rescue' || unresolvedCritical.length > 1) {
    return 'Rescue before defending in pipeline review';
  }

  if (context.meddicReview.category === 'Defensible' && latestCompleted && ['Improved', 'Resolved'].includes(latestCompleted.outcomeType)) {
    return 'Defend, with current action outcome supporting the review answer';
  }

  return 'Monitor and confirm the next defensible proof point';
}

function getRelatedActivities(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  const account = normalize(opportunity.accountName);
  const opportunityName = normalize(opportunity.opportunityName);
  return activities.filter((activity) => (
    activity.linkedOpportunityId === opportunity.id
    || normalize(activity.linkedOpportunityName || activity.opportunityName) === opportunityName
    || normalize(activity.linkedAccountName || activity.accountName) === account
  ));
}

function hasClosedOutcomeForAction(action: OpportunityRecommendedAction, outcomes: ActionOutcomeRecord[]) {
  return outcomes.some((outcome) => (
    outcome.opportunityId === action.opportunityId
    && normalize(outcome.actionTitle) === normalize(action.title)
    && ['Done', 'Dismissed'].includes(outcome.status)
  ));
}

function fieldStatus(review: MeddicLiteReview, field: MeddicLiteFieldKey) {
  return review.fields.find((item) => item.key === field)?.status || 'Missing';
}

function movementRank(movement: ExecutionDealMovement) {
  return {
    Worsened: 6,
    'Consider downgrade': 5,
    'Needs rescue': 4,
    'Still unclear': 3,
    Improved: 2,
    'Stable / monitor': 1,
  }[movement];
}

function formatMovementList(items: ExecutionDealMovementItem[]) {
  if (items.length === 0) return 'None';
  return items.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}`).join('; ');
}

function normalize(value = '') {
  return value.trim().toLowerCase();
}

function dedupe<T>(items: T[]) {
  return Array.from(new Set(items));
}

function todayKey() {
  return todayDateKey();
}

function toDateKey(date: Date) {
  return toLocalDateKey(date);
}

function formatShortDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
