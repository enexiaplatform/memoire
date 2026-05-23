import type {
  DecisionRecommendation,
  ForecastEvidenceCategory,
  PipelineDefenseDeal,
} from '../data/pipelineDefenseBrief';

export type RiskFlag = {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
  reason: string;
};

export type DealRiskSuggestion = {
  forecastEvidenceCategory: ForecastEvidenceCategory;
  decisionRecommendation: DecisionRecommendation;
  riskFlags: RiskFlag[];
  suggestedAction: string;
  explanation: string[];
};

const weakEvidenceTerms = [
  'interested',
  'possible',
  'no confirmed',
  'unclear',
  'waiting',
  'no response',
  'pending',
  'assumption',
  'not confirmed',
];

const strongEvidenceTerms = [
  'confirmed next step',
  'confirmed timeline',
  'decision maker identified',
  'procurement owner confirmed',
  'po',
  'purchase order',
  'tender date confirmed',
  'technical evaluation completed',
  'shortlist date',
  'customer-confirmed',
];

const downgradeTerms = [
  'cannot defend',
  'unclear',
  'not confirmed',
  'do not over-forecast',
  'do not over forecast',
  'unsupported',
  'remove from active forecast',
];

export function analyzePipelineDefenseDeal(deal: PipelineDefenseDeal): DealRiskSuggestion {
  const riskFlags = detectRiskFlags(deal);
  const forecastEvidenceCategory = suggestForecastEvidenceCategory(deal);
  const decisionRecommendation = suggestDecisionRecommendation(deal);
  const suggestedAction = suggestNextAction(deal);
  const explanation = buildExplanation(deal, riskFlags, forecastEvidenceCategory, decisionRecommendation);

  return {
    forecastEvidenceCategory,
    decisionRecommendation,
    riskFlags,
    suggestedAction,
    explanation,
  };
}

export function suggestForecastEvidenceCategory(deal: PipelineDefenseDeal): ForecastEvidenceCategory {
  const flags = detectRiskFlags(deal);
  const highFlags = flags.filter((flag) => flag.severity === 'high').length;
  const evidenceText = joinText(deal.evidence);
  const allText = getDealText(deal);
  const hasEvidence = deal.evidence.some((item) => item.trim().length > 0);
  const weakEvidence = !hasEvidence || containsAny(allText, weakEvidenceTerms);
  const strongEvidenceCount = countMatches(allText, strongEvidenceTerms);
  const downgradeLanguage = containsAny(deal.pipelineReviewAnswer, downgradeTerms);
  const unsupportedObjection = deal.objectionDebt.status === 'Unsupported';

  if ((!hasEvidence && highFlags >= 2) || (weakEvidence && highFlags >= 3) || (unsupportedObjection && !hasEvidence)) {
    return 'Unsupported';
  }

  if (downgradeLanguage && (weakEvidence || highFlags >= 1)) {
    return 'Unsupported';
  }

  if (strongEvidenceCount >= 2 && highFlags === 0 && !weakEvidence) {
    return 'Defensible';
  }

  if (strongEvidenceCount >= 1 && highFlags <= 1 && evidenceText.trim().length > 0) {
    return 'Weak but recoverable';
  }

  if (weakEvidence || highFlags > 0) {
    return 'Hope-based';
  }

  return 'Weak but recoverable';
}

export function suggestDecisionRecommendation(deal: PipelineDefenseDeal): DecisionRecommendation {
  const flags = detectRiskFlags(deal);
  const category = suggestForecastEvidenceCategory(deal);
  const allText = getDealText(deal);
  const hasObjectionDebt = flags.some((flag) => flag.id === 'objection-debt');
  const highFlags = flags.filter((flag) => flag.severity === 'high').length;
  const downgradeLanguage = containsAny(deal.pipelineReviewAnswer, downgradeTerms);

  if (category === 'Defensible') {
    return 'Defend';
  }

  if (category === 'Unsupported' && (downgradeLanguage || highFlags >= 2 || containsAny(allText, ['remove', 'downgrade']))) {
    return 'Downgrade';
  }

  if (hasObjectionDebt || highFlags >= 2) {
    return 'Rescue';
  }

  if (category === 'Hope-based') {
    return 'Monitor';
  }

  return 'Monitor';
}

export function detectRiskFlags(deal: PipelineDefenseDeal): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const missingContextText = joinText(deal.missingContext);
  const riskText = joinText(deal.riskType);
  const allContextText = `${missingContextText} ${riskText}`.toLowerCase();
  const evidenceText = joinText(deal.evidence);
  const allText = getDealText(deal);

  addMissingContextFlag(flags, allContextText, 'decision-maker', 'Missing decision maker', 'high', ['decision maker', 'decision owner', 'active decision']);
  addMissingContextFlag(flags, allContextText, 'budget-owner', 'Missing budget owner', 'medium', ['budget owner', 'budget approval']);
  addMissingContextFlag(flags, allContextText, 'procurement-path', 'Missing procurement path', 'high', ['procurement path', 'procurement timeline', 'tender']);
  addMissingContextFlag(flags, allContextText, 'decision-timeline', 'Missing decision timeline', 'high', ['timeline', 'timing', 'decision date']);
  addMissingContextFlag(flags, allContextText, 'next-action', 'Missing next action', 'high', ['next action', 'next customer action', 'next communication', 'follow-up', 'follow up']);
  addMissingContextFlag(flags, allContextText, 'decision-criteria', 'Missing decision criteria', 'medium', ['criteria', 'technical evaluation']);

  if (hasObjectionDebt(deal)) {
    flags.push({
      id: 'objection-debt',
      label: 'Unresolved objection debt',
      severity: deal.objectionDebt.status === 'Context gap' ? 'medium' : 'high',
      reason: 'Objection debt is present and needs proof, response, or a customer-confirmed next step.',
    });
  }

  if (!deal.evidence.some((item) => item.trim().length > 0)) {
    flags.push({
      id: 'empty-evidence',
      label: 'No evidence entered',
      severity: 'high',
      reason: 'The deal has no supporting evidence, so it should not be defended without more context.',
    });
  } else if (containsAny(evidenceText, weakEvidenceTerms)) {
    flags.push({
      id: 'weak-evidence',
      label: 'Weak evidence language',
      severity: 'medium',
      reason: 'Evidence uses uncertain language such as interested, possible, unclear, waiting, or no confirmed.',
    });
  }

  if (containsAny(deal.pipelineReviewAnswer, downgradeTerms)) {
    flags.push({
      id: 'review-answer-risk',
      label: 'Pipeline answer is not defensible',
      severity: 'high',
      reason: 'The pipeline review answer says the deal is unclear, not confirmed, unsupported, or should not be over-forecast.',
    });
  }

  if (containsAny(allText, ['no response', 'waiting', 'stalled'])) {
    flags.push({
      id: 'stalled-follow-up',
      label: 'Stalled follow-up signal',
      severity: 'medium',
      reason: 'The deal text indicates waiting, no response, or a stalled next step.',
    });
  }

  return dedupeFlags(flags);
}

export function suggestNextAction(deal: PipelineDefenseDeal): string {
  const flags = detectRiskFlags(deal);
  const category = suggestForecastEvidenceCategory(deal);
  const hasObjection = flags.some((flag) => flag.id === 'objection-debt');
  const missingDecision = flags.some((flag) => flag.id === 'decision-maker');
  const missingTimeline = flags.some((flag) => flag.id === 'decision-timeline');
  const missingNextAction = flags.some((flag) => flag.id === 'next-action');
  const missingProcurement = flags.some((flag) => flag.id === 'procurement-path');
  const noEvidence = flags.some((flag) => flag.id === 'empty-evidence');

  if (category === 'Unsupported' && noEvidence) {
    return 'Downgrade or remove from the active forecast unless current customer evidence and a confirmed next action can be captured this week.';
  }

  if (hasObjection) {
    return `Rescue by resolving the objection debt: ${deal.objectionDebt.requiredAction || 'define the required proof, owner, and customer-confirmed next step.'}`;
  }

  if (missingDecision || missingTimeline || missingNextAction || missingProcurement) {
    const gaps = flags
      .filter((flag) => ['decision-maker', 'decision-timeline', 'next-action', 'procurement-path'].includes(flag.id))
      .map((flag) => flag.label.toLowerCase())
      .join(', ');
    return `Clarify ${gaps} before defending this deal in pipeline review.`;
  }

  if (category === 'Defensible') {
    return 'Defend the deal, keeping the confirmed next customer action and evidence visible in review.';
  }

  return deal.recommendedAction || 'Monitor and collect stronger customer-confirmed evidence before increasing forecast confidence.';
}

function buildExplanation(
  deal: PipelineDefenseDeal,
  riskFlags: RiskFlag[],
  forecastEvidenceCategory: ForecastEvidenceCategory,
  decisionRecommendation: DecisionRecommendation,
) {
  const explanation: string[] = [];
  const strongEvidenceCount = countMatches(getDealText(deal), strongEvidenceTerms);
  const highFlags = riskFlags.filter((flag) => flag.severity === 'high').length;

  if (riskFlags.length === 0) {
    explanation.push('No major rule flags were detected.');
  } else {
    explanation.push(`${riskFlags.length} rule flag${riskFlags.length === 1 ? '' : 's'} detected, including ${highFlags} high-risk flag${highFlags === 1 ? '' : 's'}.`);
  }

  if (strongEvidenceCount > 0) {
    explanation.push(`Found ${strongEvidenceCount} strong evidence signal${strongEvidenceCount === 1 ? '' : 's'}, such as confirmed next steps, decision ownership, procurement proof, or completed technical evaluation.`);
  }

  explanation.push(`Forecast evidence suggestion: ${forecastEvidenceCategory}.`);
  explanation.push(`Decision recommendation suggestion: ${decisionRecommendation}.`);
  explanation.push('Suggestions are deterministic and must be applied manually.');

  return explanation;
}

function addMissingContextFlag(
  flags: RiskFlag[],
  text: string,
  id: string,
  label: string,
  severity: RiskFlag['severity'],
  terms: string[],
) {
  if (!containsAny(text, terms)) return;
  flags.push({
    id,
    label,
    severity,
    reason: `${label} appears in missing context or risk type, which makes the deal harder to defend.`,
  });
}

function hasObjectionDebt(deal: PipelineDefenseDeal) {
  return [
    deal.objectionDebt.objection,
    deal.objectionDebt.evidence,
    deal.objectionDebt.requiredAction,
  ].some((value) => value.trim().length > 0);
}

function dedupeFlags(flags: RiskFlag[]) {
  const seen = new Set<string>();
  return flags.filter((flag) => {
    if (seen.has(flag.id)) return false;
    seen.add(flag.id);
    return true;
  });
}

function getDealText(deal: PipelineDefenseDeal) {
  return [
    deal.pipelineContext,
    deal.dealTruth,
    joinText(deal.riskType),
    joinText(deal.evidence),
    joinText(deal.missingContext),
    deal.objectionDebt.objection,
    deal.objectionDebt.evidence,
    deal.objectionDebt.requiredAction,
    deal.recommendedAction,
    deal.pipelineReviewAnswer,
    deal.assumption || '',
  ].join(' ').toLowerCase();
}

function joinText(items: string[]) {
  return items.filter(Boolean).join(' ').toLowerCase();
}

function containsAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function countMatches(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.filter((term) => {
    if (term === 'po') return /\bpo\b/.test(normalized);
    return normalized.includes(term);
  }).length;
}
