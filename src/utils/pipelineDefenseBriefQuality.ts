import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';

export type BriefReadinessStatus =
  | 'Review-ready'
  | 'Needs cleanup'
  | 'High risk / not defensible';

export type BriefQualityIssue = {
  id: string;
  dealId?: string;
  account?: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
  suggestedCleanupAction: string;
};

export type BriefQualityAnalysis = {
  status: BriefReadinessStatus;
  totalDeals: number;
  highRiskIssues: number;
  mediumRiskIssues: number;
  lowRiskIssues: number;
  issues: BriefQualityIssue[];
  cleanupActions: string[];
};

const missingDecisionTerms = [
  'decision maker',
  'decision owner',
  'active decision',
  'budget owner',
  'budget approval',
  'procurement path',
  'procurement timeline',
  'timeline',
  'timing',
  'next action',
  'next customer action',
  'next communication',
  'technical evaluation',
  'criteria',
];

const weakEvidenceTerms = [
  'unclear',
  'waiting',
  'possible',
  'interested',
  'no response',
  'no confirmed',
  'not confirmed',
  'pending',
];

const riskTypeTerms = [
  'procurement',
  'objection',
  'forecast',
  'follow-up',
  'follow up',
];

const concreteEvidenceTerms = [
  'confirmed',
  'customer-confirmed',
  'po',
  'purchase order',
  'tender date',
  'decision maker identified',
  'technical evaluation completed',
  'next step',
];

export function analyzePipelineDefenseBriefQuality(brief: PipelineDefenseBrief | null): BriefQualityAnalysis {
  const deals = brief?.deals || [];
  const issues = deals.length === 0
    ? [createBriefIssue()]
    : deals.flatMap(analyzeDealQuality);

  const analysisWithoutStatus = {
    totalDeals: deals.length,
    highRiskIssues: countBySeverity(issues, 'high'),
    mediumRiskIssues: countBySeverity(issues, 'medium'),
    lowRiskIssues: countBySeverity(issues, 'low'),
    issues,
    cleanupActions: getBriefCleanupActionsFromIssues(issues),
  };

  const status = getBriefReadinessStatus({
    ...analysisWithoutStatus,
    status: 'Needs cleanup',
  });

  return {
    ...analysisWithoutStatus,
    status,
  };
}

export function getBriefReadinessStatus(analysis: BriefQualityAnalysis): BriefReadinessStatus {
  if (analysis.totalDeals === 0) {
    return 'Needs cleanup';
  }

  const unsupportedOrHopeIssues = analysis.issues.filter((issue) => (
    issue.id.includes('unsupported-forecast') || issue.id.includes('hope-forecast')
  )).length;
  const unsupportedOrHopeRatio = unsupportedOrHopeIssues / analysis.totalDeals;

  if (analysis.highRiskIssues >= 2 || unsupportedOrHopeRatio > 0.4) {
    return 'High risk / not defensible';
  }

  if (analysis.highRiskIssues > 0 || analysis.mediumRiskIssues > 0 || analysis.lowRiskIssues > 0) {
    return 'Needs cleanup';
  }

  return 'Review-ready';
}

export function getBriefCleanupActions(analysis: BriefQualityAnalysis): string[] {
  return getBriefCleanupActionsFromIssues(analysis.issues);
}

function analyzeDealQuality(deal: PipelineDefenseDeal): BriefQualityIssue[] {
  const issues: BriefQualityIssue[] = [];
  const missingContextText = joinText(deal.missingContext);
  const evidenceText = joinText(deal.evidence);
  const riskTypeText = joinText(deal.riskType);
  const hasObjectionDebt = [
    deal.objectionDebt.objection,
    deal.objectionDebt.evidence,
    deal.objectionDebt.requiredAction,
  ].some((value) => value.trim().length > 0);

  if (deal.forecastEvidenceCategory === 'Unsupported') {
    issues.push(createDealIssue(deal, 'unsupported-forecast', 'Unsupported forecast evidence', 'high', 'This deal is marked Unsupported, so it is not defensible in review without new evidence.', 'Downgrade or remove this deal unless customer-confirmed evidence and a next action are captured.'));
  }

  if (deal.forecastEvidenceCategory === 'Hope-based' && deal.missingContext.some(Boolean)) {
    issues.push(createDealIssue(deal, 'hope-forecast-with-gaps', 'Hope-based forecast with missing context', 'high', 'Hope-based deals with known context gaps should not be defended as clean pipeline.', 'Clarify the missing context or downgrade this deal before review.'));
  }

  if (hasObjectionDebt && deal.decisionRecommendation === 'Defend') {
    issues.push(createDealIssue(deal, 'defend-with-objection-debt', 'Defend recommendation has unresolved objection debt', 'high', 'The deal is marked Defend while objection debt is still present.', 'Resolve the objection debt or change the decision recommendation before review.'));
  }

  if (!deal.pipelineReviewAnswer.trim()) {
    issues.push(createDealIssue(deal, 'missing-review-answer', 'Missing pipeline review answer', 'high', 'The deal has no clear review answer for Henry to use in pipeline review.', 'Write a concise pipeline review answer explaining defend, rescue, monitor, or downgrade.'));
  }

  if (!deal.recommendedAction.trim()) {
    issues.push(createDealIssue(deal, 'missing-next-action', 'Missing next action', 'high', 'The deal has no recommended action for this week.', 'Add the next customer-facing action, owner, and timing before review.'));
  }

  if (deal.decisionRecommendation === 'Downgrade') {
    issues.push(createDealIssue(deal, 'should-downgrade', 'Deal should be downgraded', 'high', 'The deal is already marked Downgrade and needs an explicit review decision.', 'Decide whether to remove this deal from active forecast or define the proof required to keep it.'));
  }

  if (deal.decisionRecommendation === 'Rescue') {
    issues.push(createDealIssue(deal, 'should-rescue', 'Deal should be rescued this week', 'high', 'The deal is marked Rescue and needs immediate cleanup before review.', 'Complete the rescue action or make the rescue owner and deadline explicit.'));
  }

  if (containsAny(missingContextText, missingDecisionTerms)) {
    issues.push(createDealIssue(deal, 'missing-decision-context', 'Missing decision context', 'medium', 'The deal is missing decision owner, budget, procurement, timing, next action, or technical criteria context.', 'Ask for the missing decision context before defending this deal.'));
  }

  if (containsAny(evidenceText, weakEvidenceTerms)) {
    issues.push(createDealIssue(deal, 'weak-evidence-language', 'Weak evidence language', 'medium', 'Evidence includes unclear, waiting, possible, interested, no response, or not confirmed language.', 'Replace weak evidence with customer-confirmed proof or lower confidence in review.'));
  }

  if (containsAny(riskTypeText, riskTypeTerms)) {
    issues.push(createDealIssue(deal, 'risk-type-cleanup', 'Risk type needs cleanup', 'medium', 'Risk type mentions procurement, objection, forecast, or follow-up risk.', 'Convert the risk type into a specific cleanup action before pipeline review.'));
  }

  if (!deal.pipelineContext.trim()) {
    issues.push(createDealIssue(deal, 'missing-pipeline-context', 'Missing pipeline context', 'low', 'Pipeline period, stage, or source context is missing.', 'Add pipeline period, stage, and source context.'));
  }

  if (isVague(deal.dealTruth)) {
    issues.push(createDealIssue(deal, 'vague-deal-truth', 'Deal truth is short or vague', 'low', 'The deal truth is too short or uses vague language.', 'Rewrite the deal truth with what is known, assumed, and still missing.'));
  }

  if (deal.evidence.some(Boolean) && !containsAny(evidenceText, concreteEvidenceTerms)) {
    issues.push(createDealIssue(deal, 'evidence-not-concrete', 'Evidence is present but not concrete', 'low', 'Evidence exists, but it does not include clear customer-confirmed signals.', 'Add concrete proof such as confirmed next step, decision owner, PO, tender date, or completed technical evaluation.'));
  }

  return issues;
}

function getBriefCleanupActionsFromIssues(issues: BriefQualityIssue[]) {
  const actions = issues.map((issue) => issue.suggestedCleanupAction);
  return Array.from(new Set(actions)).slice(0, 8);
}

function createBriefIssue(): BriefQualityIssue {
  return {
    id: 'empty-brief',
    label: 'No deals available for review',
    severity: 'high',
    reason: 'A brief with zero deals cannot support a pipeline review.',
    suggestedCleanupAction: 'Add deals manually, import deals, or reset to sample data before review.',
  };
}

function createDealIssue(
  deal: PipelineDefenseDeal,
  id: string,
  label: string,
  severity: BriefQualityIssue['severity'],
  reason: string,
  suggestedCleanupAction: string,
): BriefQualityIssue {
  return {
    id: `${deal.id}-${id}`,
    dealId: deal.id,
    account: deal.account || 'Unknown Account',
    label,
    severity,
    reason,
    suggestedCleanupAction,
  };
}

function countBySeverity(issues: BriefQualityIssue[], severity: BriefQualityIssue['severity']) {
  return issues.filter((issue) => issue.severity === severity).length;
}

function isVague(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.length < 40 || containsAny(normalized, ['unclear', 'unknown', 'tbd', 'maybe', 'possible']);
}

function joinText(items: string[]) {
  return items.filter(Boolean).join(' ').toLowerCase();
}

function containsAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => {
    if (term === 'po') return /\bpo\b/.test(normalized);
    return normalized.includes(term);
  });
}
