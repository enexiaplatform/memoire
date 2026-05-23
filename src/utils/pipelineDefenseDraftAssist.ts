import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';

export type DraftAssistType =
  | 'Deal truth'
  | 'Pipeline review answer'
  | 'Recommended action'
  | 'Objection handling note'
  | 'Manager question';

export type DraftAssistResult = {
  type: DraftAssistType;
  content: string;
  explanation: string;
  targetField?: 'dealTruth' | 'pipelineReviewAnswer' | 'recommendedAction';
};

export const draftAssistTypes: DraftAssistType[] = [
  'Deal truth',
  'Pipeline review answer',
  'Recommended action',
  'Objection handling note',
  'Manager question',
];

export function generatePipelineDefenseDraft(deal: PipelineDefenseDeal, draftType: DraftAssistType): DraftAssistResult {
  switch (draftType) {
    case 'Deal truth':
      return generateDealTruthDraft(deal);
    case 'Pipeline review answer':
      return generatePipelineReviewAnswerDraft(deal);
    case 'Recommended action':
      return generateRecommendedActionDraft(deal);
    case 'Objection handling note':
      return generateObjectionHandlingDraft(deal);
    case 'Manager question':
      return generateManagerQuestionDraft(deal);
  }
}

export function generateDealTruthDraft(deal: PipelineDefenseDeal): DraftAssistResult {
  const missingContext = formatList(deal.missingContext, 'missing context is not captured');
  const evidence = formatList(deal.evidence, 'no concrete evidence is captured');
  const risk = formatList(deal.riskType, 'risk is not clearly labeled');

  return {
    type: 'Deal truth',
    targetField: 'dealTruth',
    content: `${deal.account || 'This account'} has a ${deal.opportunity || 'pipeline opportunity'} that should be treated conservatively. Known context: ${valueOrFallback(deal.pipelineContext, 'pipeline context is not yet clear')}. Current risk: ${risk}. Evidence available: ${evidence}. Unknowns to resolve: ${missingContext}. Until those gaps are clarified, this deal should not be over-claimed in review.`,
    explanation: 'Local mock draft generated from account, opportunity, pipeline context, risk type, evidence, and missing context.',
  };
}

export function generatePipelineReviewAnswerDraft(deal: PipelineDefenseDeal): DraftAssistResult {
  const decision = deal.decisionRecommendation || 'Monitor';
  const category = deal.forecastEvidenceCategory || 'Weak but recoverable';
  const nextAction = valueOrFallback(deal.recommendedAction, 'capture the next customer-confirmed action before review');

  return {
    type: 'Pipeline review answer',
    targetField: 'pipelineReviewAnswer',
    content: `I would classify ${deal.account || 'this account'} as ${category} and recommend ${decision}. The opportunity is ${deal.opportunity || 'not clearly named'}, but the review answer depends on customer-confirmed evidence, decision context, and the next action. This week I should ${nextAction}. If that proof is not captured, I should avoid defending this as clean pipeline.`,
    explanation: 'Local mock draft generated from forecast category, decision recommendation, opportunity, and recommended action.',
  };
}

export function generateRecommendedActionDraft(deal: PipelineDefenseDeal): DraftAssistResult {
  const objectionAction = deal.objectionDebt.requiredAction.trim();
  const missingContext = firstVisible(deal.missingContext);
  const evidenceGap = deal.evidence.some(Boolean) ? '' : ' and collect supporting customer evidence';
  const action = objectionAction
    || (missingContext ? `confirm ${missingContext.toLowerCase()} with the customer or account owner` : `confirm the next customer action${evidenceGap}`);

  return {
    type: 'Recommended action',
    targetField: 'recommendedAction',
    content: `${action}. Capture the owner, expected timing, and proof needed before the next pipeline review.`,
    explanation: 'Local mock draft generated from objection debt, missing context, and evidence gaps.',
  };
}

export function generateObjectionHandlingDraft(deal: PipelineDefenseDeal): DraftAssistResult {
  const hasObjection = [
    deal.objectionDebt.objection,
    deal.objectionDebt.evidence,
    deal.objectionDebt.requiredAction,
  ].some((value) => value.trim().length > 0);

  if (!hasObjection) {
    return {
      type: 'Objection handling note',
      content: `No explicit objection debt is captured for ${deal.account || 'this deal'}. Before review, confirm whether there is a customer objection, technical blocker, procurement concern, or support gap that should be documented.`,
      explanation: 'Local mock draft found no objection debt fields with content, so it generated a conservative capture prompt.',
    };
  }

  return {
    type: 'Objection handling note',
    content: `Objection to resolve: ${valueOrFallback(deal.objectionDebt.objection, 'objection is not clearly named')}. Current evidence: ${valueOrFallback(deal.objectionDebt.evidence, 'no objection evidence captured')}. Required proof/action: ${valueOrFallback(deal.objectionDebt.requiredAction, 'define the proof needed')}. Owner: ${valueOrFallback(deal.objectionDebt.owner, 'unassigned')}. Do not defend this deal cleanly until the objection has a response, proof, or customer-confirmed next step.`,
    explanation: 'Local mock draft generated from objection debt fields. It is copy-only because there is no single safe target field.',
  };
}

export function generateManagerQuestionDraft(deal: PipelineDefenseDeal): DraftAssistResult {
  const missingContext = firstVisible(deal.missingContext);
  const objection = deal.objectionDebt.objection.trim();
  const baseQuestion = missingContext
    ? `What proof do we have for ${missingContext.toLowerCase()}, and what happens if we cannot confirm it this week?`
    : objection
      ? `What proof resolves "${objection}", and who owns getting that proof before review?`
      : `What customer-confirmed evidence makes ${deal.account || 'this deal'} defensible this week?`;

  return {
    type: 'Manager question',
    content: baseQuestion,
    explanation: 'Local mock draft generated from missing context and objection debt. It is copy-only because manager questions do not map to a safe deal field.',
  };
}

function formatList(items: string[], fallback: string) {
  const visibleItems = items.filter((item) => item.trim().length > 0);
  if (visibleItems.length === 0) return fallback;
  return visibleItems.join(', ');
}

function firstVisible(items: string[]) {
  return items.find((item) => item.trim().length > 0)?.trim() || '';
}

function valueOrFallback(value: string, fallback: string) {
  return value.trim().length > 0 ? value : fallback;
}
