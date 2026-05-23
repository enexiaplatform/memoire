import type { Interaction, Objection, Opportunity, SalesAction } from '../types/v31';

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

interface PipelineQualityInput {
  opportunities: Opportunity[];
  interactions: Interaction[];
  actions: SalesAction[];
  objections: Objection[];
}

const weakEvidenceTerms = /unclear|waiting|possible|interested|no response|not confirmed|maybe|pending/i;

export function analyzeOpportunityPipelineQuality(input: PipelineQualityInput): PipelineQualityAnalysis {
  const reviews = input.opportunities.map((opportunity) =>
    analyzeOpportunityQuality(opportunity, {
      interactions: input.interactions.filter((interaction) => interaction.opportunity_id === opportunity.id),
      actions: input.actions.filter((action) => action.opportunity_id === opportunity.id),
      objections: input.objections.filter((objection) => objection.opportunity_id === opportunity.id),
    })
  );

  const highRiskCount = reviews.filter((review) => review.status === 'High risk').length;
  const needsCleanupCount = reviews.filter((review) => review.status === 'Needs cleanup').length;
  const healthyCount = reviews.filter((review) => review.status === 'Healthy').length;
  const missingNextActionCount = reviews.filter((review) =>
    review.issues.some((issue) => issue.id === 'missing-next-action')
  ).length;
  const openObjectionCount = reviews.filter((review) =>
    review.issues.some((issue) => issue.id === 'open-objection' || issue.id === 'blocker-without-action')
  ).length;
  const staleOpportunityCount = reviews.filter((review) =>
    review.issues.some((issue) => issue.id === 'stale-opportunity')
  ).length;
  const lowConfidenceCount = reviews.filter((review) =>
    review.issues.some((issue) => issue.id === 'low-confidence')
  ).length;

  return {
    totalOpportunities: input.opportunities.length,
    healthyCount,
    needsCleanupCount,
    highRiskCount,
    missingNextActionCount,
    openObjectionCount,
    staleOpportunityCount,
    lowConfidenceCount,
    reviews,
    cleanupActions: getPipelineCleanupActions(reviews),
  };
}

function analyzeOpportunityQuality(
  opportunity: Opportunity,
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

  if (opportunity.urgency === 'high' && opportunity.confidence !== 'high') {
    issues.push({
      id: 'urgent-but-uncertain',
      label: 'Urgent but uncertain',
      severity: 'medium',
      reason: 'The deal is urgent, but confidence is not high enough to defend it cleanly.',
      suggestedAction: 'Confirm decision path and next customer action this week.',
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

  const status = getOpportunityStatus(issues);
  return {
    opportunityId: opportunity.id,
    status,
    accountName: opportunity.account?.name || 'No account',
    opportunityTitle: opportunity.title,
    issues,
    primaryAction: getPrimaryAction(opportunity, issues),
  };
}

function hasRecentTouch(opportunity: Opportunity, interactions: Interaction[]) {
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

function getPrimaryAction(opportunity: Opportunity, issues: OpportunityQualityIssue[]) {
  if (issues.length === 0) return 'Keep current cadence and prepare the review answer.';
  const highIssue = issues.find((issue) => issue.severity === 'high');
  if (highIssue) return highIssue.suggestedAction;
  if (opportunity.stage === 'proposal' || opportunity.stage === 'negotiation') {
    return 'Confirm decision path, timeline, and next customer action before review.';
  }
  return issues[0].suggestedAction;
}

function getPipelineCleanupActions(reviews: OpportunityQualityReview[]) {
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
