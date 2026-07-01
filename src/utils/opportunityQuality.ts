import type { Interaction, Objection, Opportunity as LegacyOpportunity, SalesAction } from '../types/v31';
import type { CrmLiteOpportunity, ForecastEvidenceCategory } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import { getObjectionsForOpportunity } from './objectionLedger';
import { sumMoneyInBase } from './money';
import { compareSafeBusinessDate, isBusinessDateOverdue, isValidBusinessDate } from './safeDate.ts';

export type OpportunityQualityStatus = 'Healthy' | 'Needs cleanup' | 'High risk';
export type OpportunityQualitySeverity = 'low' | 'medium' | 'high';

export interface OpportunityQualityIssue {
  id: string;
  label: string;
  severity: OpportunityQualitySeverity;
  reason: string;
  suggestedAction: string;
}

export interface OpportunityQualityReview {
  opportunityId: string;
  status: OpportunityQualityStatus;
  accountName: string;
  opportunityTitle: string;
  issues: OpportunityQualityIssue[];
  primaryAction: string;
  linkedActivityCount?: number;
  lastLinkedActivityDate?: string;
}

export interface CrmPipelineQualityAnalysis {
  totalOpportunities: number;
  activeOpportunities: number;
  estimatedActiveValue: number;
  defensibleDeals: number;
  weakHopeUnsupportedDeals: number;
  missingNextActionCount: number;
  objectionDebtCount: number;
  missingDecisionMakerCount: number;
  missingClosePeriodCount: number;
  unsupportedHopeBasedCount: number;
  rescueDowngradeCount: number;
  staleOpportunityCount: number;
  activeValueByForecastCategory: Record<ForecastEvidenceCategory, number>;
  reviews: OpportunityQualityReview[];
  cleanupActions: string[];
}

export function analyzeOpportunityQuality(opportunity: CrmLiteOpportunity, linkedActivities: SalesActivityRecord[] = []): OpportunityQualityReview {
  const issues: OpportunityQualityIssue[] = [];
  const evidenceText = `${opportunity.evidence} ${opportunity.missingContext}`.toLowerCase();
  const lastLinkedActivityDate = linkedActivities
    .map((activity) => activity.activityDate)
    .filter(isValidBusinessDate)
    .sort(compareSafeBusinessDate)
    .at(-1) || '';

  if (!opportunity.nextAction.trim()) {
    issues.push({
      id: 'missing-next-action',
      label: 'Missing next action',
      severity: 'high',
      reason: 'The deal has no clear next step for the seller or customer.',
      suggestedAction: 'Add one concrete next action with owner and timing.',
    });
  }

  if (!opportunity.decisionMaker.trim()) {
    issues.push({
      id: 'missing-decision-maker',
      label: 'Missing decision maker',
      severity: 'medium',
      reason: 'The decision owner is not captured, so the deal is harder to defend.',
      suggestedAction: 'Confirm the decision maker or buying committee before review.',
    });
  }

  if (!opportunity.expectedClosePeriod.trim()) {
    issues.push({
      id: 'missing-close-period',
      label: 'Missing close period',
      severity: 'medium',
      reason: 'There is no clear forecast timing for this opportunity.',
      suggestedAction: 'Add the expected close period or downgrade timing confidence.',
    });
  }

  if (opportunity.objectionDebt.trim()) {
    issues.push({
      id: 'objection-debt',
      label: 'Objection debt',
      severity: opportunity.decisionRecommendation === 'Defend' ? 'high' : 'medium',
      reason: 'Unresolved objection debt is captured for this opportunity.',
      suggestedAction: 'Prepare proof, escalation, or a customer response plan.',
    });
  }

  if (opportunity.forecastEvidenceCategory === 'Unsupported') {
    issues.push({
      id: 'unsupported-forecast',
      label: 'Unsupported forecast',
      severity: 'high',
      reason: 'The forecast evidence category is Unsupported.',
      suggestedAction: 'Collect customer evidence or downgrade the forecast.',
    });
  }

  if (opportunity.forecastEvidenceCategory === 'Hope-based') {
    issues.push({
      id: 'hope-based-forecast',
      label: 'Hope-based forecast',
      severity: opportunity.missingContext.trim() ? 'high' : 'medium',
      reason: 'The deal depends on soft evidence rather than confirmed customer action.',
      suggestedAction: 'Replace hope-based evidence with a confirmed next step, date, or owner.',
    });
  }

  if (['Rescue', 'Downgrade', 'Deprioritize'].includes(opportunity.decisionRecommendation)) {
    issues.push({
      id: 'review-decision-risk',
      label: `${opportunity.decisionRecommendation} recommended`,
      severity: opportunity.decisionRecommendation === 'Rescue' ? 'high' : 'medium',
      reason: 'The current recommendation signals the deal needs a manager-visible decision.',
      suggestedAction: `Prepare a concise reason to ${opportunity.decisionRecommendation.toLowerCase()} this deal.`,
    });
  }

  if (opportunity.status === 'Active' && isBusinessDateOverdue(opportunity.nextActionDate)) {
    issues.push({
      id: 'stale-next-action',
      label: 'Past-due next action',
      severity: 'medium',
      reason: 'The next action date is already past.',
      suggestedAction: 'Refresh the next action date or close the loop.',
    });
  }

  if (!opportunity.nextActionDate && lastLinkedActivityDate && daysSince(lastLinkedActivityDate) > 14) {
    issues.push({
      id: 'stale-linked-activity',
      label: 'Old linked activity',
      severity: 'medium',
      reason: 'The latest linked activity is more than 14 days old and no next action date is set.',
      suggestedAction: 'Refresh this opportunity with a current customer touch or add a next action date.',
    });
  }

  if (weakEvidenceTerms.test(evidenceText)) {
    issues.push({
      id: 'weak-evidence-language',
      label: 'Weak evidence language',
      severity: 'medium',
      reason: 'Evidence or missing context includes unclear, pending, or unconfirmed language.',
      suggestedAction: 'Replace soft evidence with a confirmed customer action or proof point.',
    });
  }

  if (!opportunity.productOrSolution.trim()) {
    issues.push({
      id: 'missing-solution',
      label: 'Missing solution context',
      severity: 'low',
      reason: 'The product or solution is not captured.',
      suggestedAction: 'Add the product or solution so review context is easier to scan.',
    });
  }

  return {
    opportunityId: opportunity.id,
    status: getOpportunityStatus(issues),
    accountName: opportunity.accountName || 'No account',
    opportunityTitle: opportunity.opportunityName || 'Untitled opportunity',
    issues,
    primaryAction: getPrimaryAction(issues),
    linkedActivityCount: linkedActivities.length,
    lastLinkedActivityDate,
  };
}

export function analyzePipelineQuality(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[] = [], objections: ObjectionRecord[] = []): CrmPipelineQualityAnalysis {
  const reviews = opportunities.map((opportunity) => {
    const review = analyzeOpportunityQuality(opportunity, activities.filter((activity) => activity.linkedOpportunityId === opportunity.id));
    const openLedgerObjections = getObjectionsForOpportunity(objections, opportunity).filter((objection) => objection.status === 'Open');
    if (openLedgerObjections.length === 0) return review;
    return {
      ...review,
      status: openLedgerObjections.some((objection) => objection.impact === 'High') ? 'High risk' as const : review.status,
      issues: [
        ...review.issues,
        {
          id: 'ledger-objection-debt',
          label: 'Open ledger objection',
          severity: openLedgerObjections.some((objection) => objection.impact === 'High') ? 'high' as const : 'medium' as const,
          reason: `${openLedgerObjections.length} structured objection${openLedgerObjections.length === 1 ? '' : 's'} still open in the Objection Ledger.`,
          suggestedAction: 'Resolve required proof or response plan before defending this opportunity.',
        },
      ],
    };
  });
  const activeOpportunities = opportunities.filter((opportunity) => opportunity.status === 'Active');
  const activeValueByForecastCategory = makeEmptyForecastValueMap();

  activeOpportunities.forEach((opportunity) => {
    activeValueByForecastCategory[opportunity.forecastEvidenceCategory] += sumMoneyInBase([{
      amount: opportunity.estimatedValue,
      currency: opportunity.currency,
    }]);
  });

  const cleanupActions = getCrmPipelineCleanupActions(opportunities, reviews);

  return {
    totalOpportunities: opportunities.length,
    activeOpportunities: activeOpportunities.length,
    estimatedActiveValue: sumMoneyInBase(activeOpportunities.map((opportunity) => ({
      amount: opportunity.estimatedValue,
      currency: opportunity.currency,
    }))),
    defensibleDeals: opportunities.filter((opportunity) => opportunity.forecastEvidenceCategory === 'Defensible').length,
    weakHopeUnsupportedDeals: opportunities.filter((opportunity) =>
      ['Weak but recoverable', 'Hope-based', 'Unsupported'].includes(opportunity.forecastEvidenceCategory)
    ).length,
    missingNextActionCount: opportunities.filter((opportunity) => !opportunity.nextAction.trim()).length,
    objectionDebtCount: new Set([
      ...opportunities.filter((opportunity) => Boolean(opportunity.objectionDebt.trim())).map((opportunity) => opportunity.id),
      ...objections.filter((objection) => objection.status === 'Open' || objection.status === 'Addressed').map((objection) => objection.opportunityId || `${objection.accountName}|${objection.opportunityName}`),
    ]).size,
    missingDecisionMakerCount: opportunities.filter((opportunity) => !opportunity.decisionMaker.trim()).length,
    missingClosePeriodCount: opportunities.filter((opportunity) => !opportunity.expectedClosePeriod.trim()).length,
    unsupportedHopeBasedCount: opportunities.filter((opportunity) =>
      ['Hope-based', 'Unsupported'].includes(opportunity.forecastEvidenceCategory)
    ).length,
    rescueDowngradeCount: opportunities.filter((opportunity) =>
      ['Rescue', 'Downgrade'].includes(opportunity.decisionRecommendation)
    ).length,
    staleOpportunityCount: reviews.filter((review) =>
      review.issues.some((issue) => issue.id === 'stale-next-action')
    ).length,
    activeValueByForecastCategory,
    reviews,
    cleanupActions,
  };
}

export interface PipelineQualityAnalysis {
  totalOpportunities: number;
  healthyCount: number;
  needsCleanupCount: number;
  highRiskCount: number;
  missingNextActionCount: number;
  openObjectionCount: number;
  staleOpportunityCount: number;
  lowConfidenceCount: number;
  reviews: OpportunityQualityReview[];
  cleanupActions: string[];
}

interface LegacyPipelineQualityInput {
  opportunities: LegacyOpportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections: Objection[];
}

const weakEvidenceTerms = /unclear|waiting|possible|interested|no response|not confirmed|maybe|pending/i;

export function analyzeOpportunityPipelineQuality(input: LegacyPipelineQualityInput): PipelineQualityAnalysis {
  const reviews = input.opportunities.map((opportunity) =>
    analyzeLegacyOpportunityQuality(opportunity, {
      interactions: input.interactions.filter((interaction) => interaction.opportunity_id === opportunity.id),
      actions: input.actions.filter((action) => action.opportunity_id === opportunity.id),
      objections: input.objections.filter((objection) => objection.opportunity_id === opportunity.id),
    })
  );

  const highRiskCount = reviews.filter((review) => review.status === 'High risk').length;
  const needsCleanupCount = reviews.filter((review) => review.status === 'Needs cleanup').length;
  const healthyCount = reviews.filter((review) => review.status === 'Healthy').length;

  return {
    totalOpportunities: input.opportunities.length,
    healthyCount,
    needsCleanupCount,
    highRiskCount,
    missingNextActionCount: reviews.filter((review) => review.issues.some((issue) => issue.id === 'missing-next-action')).length,
    openObjectionCount: reviews.filter((review) => review.issues.some((issue) => issue.id === 'open-objection' || issue.id === 'blocker-without-action')).length,
    staleOpportunityCount: reviews.filter((review) => review.issues.some((issue) => issue.id === 'stale-opportunity')).length,
    lowConfidenceCount: reviews.filter((review) => review.issues.some((issue) => issue.id === 'low-confidence')).length,
    reviews,
    cleanupActions: getLegacyPipelineCleanupActions(reviews),
  };
}

function analyzeLegacyOpportunityQuality(
  opportunity: LegacyOpportunity,
  related: { interactions: Interaction[]; actions: SalesAction[]; objections: Objection[] }
): OpportunityQualityReview {
  const issues: OpportunityQualityIssue[] = [];
  const openActions = related.actions.filter((action) => action.status === 'open');
  const openObjections = related.objections.filter((objection) => ['open', 'addressed'].includes(objection.status));
  const hasNextAction = Boolean(opportunity.next_action_text || openActions.length > 0);
  const hasRecentInteraction = hasRecentTouch(opportunity, related.interactions);
  const blocker = opportunity.blocker || openObjections.map((objection) => objection.title).join(' ');
  const latestInteraction = related.interactions[0]?.summary || '';

  if (!hasNextAction) {
    issues.push({
      id: 'missing-next-action',
      label: 'Missing next action',
      severity: 'high',
      reason: 'The opportunity has no clear next seller or customer action.',
      suggestedAction: 'Add a concrete next action with owner and timing.',
    });
  }

  if (!hasRecentInteraction) {
    issues.push({
      id: 'stale-opportunity',
      label: 'Stale opportunity',
      severity: opportunity.stage === 'proposal' || opportunity.stage === 'negotiation' ? 'high' : 'medium',
      reason: 'No recent customer touch is captured for this deal.',
      suggestedAction: 'Schedule a follow-up or confirm whether the deal is still active.',
    });
  }

  if (openObjections.length > 0) {
    issues.push({
      id: 'open-objection',
      label: 'Unresolved objection',
      severity: openObjections.some((objection) => objection.severity === 'high') ? 'high' : 'medium',
      reason: `${openObjections.length} objection${openObjections.length === 1 ? '' : 's'} still need a response path.`,
      suggestedAction: 'Prepare proof, owner alignment, or a customer-facing response for the objection.',
    });
  }

  if (blocker && !hasNextAction) {
    issues.push({
      id: 'blocker-without-action',
      label: 'Blocker without action',
      severity: 'high',
      reason: 'A blocker is captured but there is no linked next action.',
      suggestedAction: 'Create a recovery action tied directly to the blocker.',
    });
  }

  if (opportunity.confidence === 'low') {
    issues.push({
      id: 'low-confidence',
      label: 'Low confidence',
      severity: 'medium',
      reason: 'The opportunity is marked low confidence.',
      suggestedAction: 'Clarify buying criteria, decision owner, timeline, and evidence before forecasting.',
    });
  }

  if (!opportunity.account_id && !opportunity.account?.name) {
    issues.push({
      id: 'missing-account',
      label: 'Missing account link',
      severity: 'medium',
      reason: 'The opportunity is not connected to a clear account record.',
      suggestedAction: 'Attach the opportunity to an account so context and history stay together.',
    });
  }

  if (weakEvidenceTerms.test(`${latestInteraction} ${opportunity.blocker || ''}`)) {
    issues.push({
      id: 'weak-evidence',
      label: 'Weak evidence language',
      severity: 'medium',
      reason: 'Recent notes include unclear, pending, or unconfirmed language.',
      suggestedAction: 'Replace soft evidence with a confirmed customer action, date, or decision owner.',
    });
  }

  return {
    opportunityId: opportunity.id,
    status: getOpportunityStatus(issues),
    accountName: opportunity.account?.name || 'No account',
    opportunityTitle: opportunity.title,
    issues,
    primaryAction: getPrimaryAction(issues),
  };
}

function hasRecentTouch(opportunity: LegacyOpportunity, interactions: Interaction[]) {
  const latestTouch = opportunity.last_touch_at || interactions[0]?.occurred_at;
  if (!latestTouch) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  return new Date(latestTouch) >= cutoff;
}

function getOpportunityStatus(issues: OpportunityQualityIssue[]): OpportunityQualityStatus {
  const highIssues = issues.filter((issue) => issue.severity === 'high').length;
  if (highIssues >= 1) return 'High risk';
  if (issues.length > 0) return 'Needs cleanup';
  return 'Healthy';
}

function getPrimaryAction(issues: OpportunityQualityIssue[]) {
  if (issues.length === 0) return 'Keep current cadence and prepare the review answer.';
  const highIssue = issues.find((issue) => issue.severity === 'high');
  return highIssue?.suggestedAction || issues[0].suggestedAction;
}

function getCrmPipelineCleanupActions(opportunities: CrmLiteOpportunity[], reviews: OpportunityQualityReview[]) {
  const actions = [
    opportunities.some((opportunity) => !opportunity.nextAction.trim())
      ? 'Add next actions to deals without a clear owner or timing.'
      : '',
    opportunities.some((opportunity) => Boolean(opportunity.objectionDebt.trim()))
      ? 'Resolve or prepare response paths for objection debt.'
      : '',
    opportunities.some((opportunity) => !opportunity.decisionMaker.trim())
      ? 'Confirm decision makers for deals missing buying authority.'
      : '',
    opportunities.some((opportunity) => ['Hope-based', 'Unsupported'].includes(opportunity.forecastEvidenceCategory))
      ? 'Downgrade or strengthen hope-based and unsupported forecasts.'
      : '',
    reviews.some((review) => review.issues.some((issue) => issue.id === 'stale-next-action'))
      ? 'Refresh past-due next actions before pipeline review.'
      : '',
  ].filter(Boolean);

  return actions.length > 0 ? actions : ['Pipeline quality looks clean. Prepare concise defense answers for active deals.'];
}

function getLegacyPipelineCleanupActions(reviews: OpportunityQualityReview[]) {
  const actions = [
    reviews.some((review) => review.issues.some((issue) => issue.id === 'missing-next-action'))
      ? 'Add next actions to deals without a clear owner or timing.'
      : '',
    reviews.some((review) => review.issues.some((issue) => issue.id === 'open-objection'))
      ? 'Resolve or prepare response paths for open objections.'
      : '',
    reviews.some((review) => review.issues.some((issue) => issue.id === 'stale-opportunity'))
      ? 'Refresh stale opportunities with customer follow-up or downgrade them.'
      : '',
    reviews.some((review) => review.issues.some((issue) => issue.id === 'weak-evidence'))
      ? 'Replace weak evidence with confirmed customer actions, dates, or decision owners.'
      : '',
  ].filter(Boolean);

  return actions.length > 0 ? actions : ['Pipeline quality looks clean. Prepare concise defense answers for active deals.'];
}

function makeEmptyForecastValueMap(): Record<ForecastEvidenceCategory, number> {
  return {
    Defensible: 0,
    'Weak but recoverable': 0,
    'Hope-based': 0,
    Unsupported: 0,
  };
}

function daysSince(dateKey: string) {
  const then = new Date(`${dateKey}T00:00:00`);
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}
