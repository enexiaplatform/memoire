import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import type { OpportunityOutcomeRecord } from '../services/opportunityOutcomeStore';
import { convertMoney, formatBaseCurrencyAmount, formatCurrencyAmount } from './money.ts';
import { analyzePersonalSalesLearning, type PersonalSalesLearningWarning } from './personalSalesLearning.ts';
import { formatSafeBusinessDate, isValidBusinessDate, todayDateKey } from './safeDate.ts';

export const PIPELINE_DEFENSE_CATEGORIES = [
  'Defend now',
  'Rescue before review',
  'Downgrade / de-risk',
  'Missing evidence',
  'No recent signal',
] as const;

export type PipelineDefenseCategory = (typeof PIPELINE_DEFENSE_CATEGORIES)[number];
export type PipelineDefenseDecision = 'Defend' | 'Rescue' | 'Downgrade' | 'Monitor';

export type ManagerReadyDealBrief = {
  deal: PipelineDefenseDeal;
  category: PipelineDefenseCategory;
  decision: PipelineDefenseDecision;
  account: string;
  opportunity: string;
  forecastPosition: string;
  evidence: string[];
  missingContext: string[];
  objectionDebt: string;
  nextAction: string;
  dueDateLabel: string;
  moneyLabel: string;
  pipelineReviewAnswer: string;
  learningWarning?: PersonalSalesLearningWarning;
  copyText: string;
  needsConfirmation: boolean;
};

export function buildPipelineDefenseCenter(
  deals: PipelineDefenseDeal[],
  today = todayDateKey(),
  opportunityOutcomes: OpportunityOutcomeRecord[] = [],
) {
  const learning = analyzePersonalSalesLearning({ outcomes: opportunityOutcomes, deals });
  const items = deals.map((deal) => buildManagerReadyDealBrief(
    deal,
    today,
    learning.warnings.find((warning) => warning.opportunityId === (deal.sourceOpportunityId || deal.id)),
  ));
  const groups = PIPELINE_DEFENSE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  }));
  const gaps = buildMissingEvidenceGaps(deals).slice(0, 3);
  const completedChecks = items.reduce((total, item) => total + countReadyChecks(item), 0);
  const readinessScore = items.length === 0 ? 0 : Math.round(completedChecks / (items.length * 7) * 100);

  return {
    items,
    groups,
    readinessScore,
    defendableDeals: items.filter((item) => item.decision === 'Defend').length,
    rescueDeals: items.filter((item) => item.decision === 'Rescue').length,
    downgradeCandidates: items.filter((item) => item.decision === 'Downgrade').length,
    topMissingEvidenceGaps: gaps,
    learning,
  };
}

export function buildManagerReadyDealBrief(
  deal: PipelineDefenseDeal,
  today = todayDateKey(),
  learningWarning?: PersonalSalesLearningWarning,
): ManagerReadyDealBrief {
  const account = deal.account.trim() || 'Needs confirmation';
  const opportunity = deal.opportunity.trim() || 'Needs confirmation';
  const evidence = deal.evidence.map((item) => item.trim()).filter(Boolean);
  const missingContext = buildDealMissingContext(deal);
  const decision = getPipelineDefenseDecision(deal);
  const category = getPrimaryDefenseCategory(deal, today);
  const stage = extractStage(deal.pipelineContext);
  const forecastPosition = `${deal.forecastEvidenceCategory}${stage ? ` · ${stage}` : ' · Stage needs confirmation'}`;
  const objectionDebt = deal.objectionDebt.objection.trim()
    ? `${deal.objectionDebt.status}: ${deal.objectionDebt.objection.trim()}`
    : 'Needs confirmation — no objection context captured';
  const nextAction = firstLine(deal.recommendedAction) || 'Missing evidence — next action not captured';
  const dueDateLabel = isValidBusinessDate(deal.nextActionDate)
    ? formatSafeBusinessDate(deal.nextActionDate)
    : `${formatSafeBusinessDate(deal.nextActionDate)} · Missing evidence`;
  const moneyLabel = formatDealMoney(deal);
  const needsConfirmation = account === 'Needs confirmation'
    || opportunity === 'Needs confirmation'
    || moneyLabel.includes('Missing evidence')
    || !isValidBusinessDate(deal.nextActionDate);
  const pipelineReviewAnswer = deal.pipelineReviewAnswer.trim()
    || buildFallbackPipelineReviewAnswer(decision, missingContext, nextAction);

  const copyText = [
    `Account: ${account}`,
    `Opportunity: ${opportunity}`,
    `Forecast position: ${forecastPosition}`,
    `Current decision: ${decision}`,
    `Money: ${moneyLabel}`,
    `Evidence supporting forecast: ${evidence.join('; ') || 'Missing evidence — no customer proof captured'}`,
    `Missing MEDDIC context: ${missingContext.join('; ') || 'No explicit MEDDIC gap captured'}`,
    `Objection debt: ${objectionDebt}`,
    `Next action: ${nextAction}`,
    `Due date: ${dueDateLabel}`,
    `Pipeline review answer: ${pipelineReviewAnswer}`,
    learningWarning ? `Outcome learning risk signal: ${learningWarning.warning}` : '',
    needsConfirmation ? 'Data quality: Needs confirmation' : '',
  ].filter(Boolean).join('\n');

  return {
    deal, category, decision, account, opportunity, forecastPosition, evidence, missingContext,
    objectionDebt, nextAction, dueDateLabel, moneyLabel, pipelineReviewAnswer, learningWarning, copyText, needsConfirmation,
  };
}

function buildFallbackPipelineReviewAnswer(
  decision: PipelineDefenseDecision,
  missingContext: string[],
  nextAction: string,
) {
  const gap = missingContext[0] || 'customer evidence and confirmed decision context';
  if (decision === 'Defend') {
    return `I can defend this deal if we keep the next action current: ${nextAction}. Evidence is usable, but I will still call out any missing context directly.`;
  }
  if (decision === 'Rescue') {
    return `I can rescue this deal only if we close the ${gap} gap before review. Next action: ${nextAction}.`;
  }
  if (decision === 'Downgrade') {
    return `I should downgrade or de-risk this deal until ${gap} is confirmed. I do not have enough evidence to defend it in review.`;
  }
  return `I should monitor this deal. It needs ${nextAction} and clearer evidence before I call it defensible.`;
}

export function getPipelineDefenseDecision(deal: PipelineDefenseDeal): PipelineDefenseDecision {
  if (deal.decisionRecommendation === 'Defend' && deal.forecastEvidenceCategory === 'Defensible') return 'Defend';
  if (deal.decisionRecommendation === 'Downgrade' || deal.decisionRecommendation === 'Deprioritize' || deal.forecastEvidenceCategory === 'Unsupported') return 'Downgrade';
  if (deal.decisionRecommendation === 'Rescue' || deal.forecastEvidenceCategory === 'Hope-based' || deal.forecastEvidenceCategory === 'Weak but recoverable') return 'Rescue';
  return 'Monitor';
}

export function getPrimaryDefenseCategory(deal: PipelineDefenseDeal, today: string): PipelineDefenseCategory {
  const decision = getPipelineDefenseDecision(deal);
  if (decision === 'Defend') return 'Defend now';
  if (decision === 'Downgrade') return 'Downgrade / de-risk';
  if (decision === 'Rescue') return 'Rescue before review';
  if (buildDealMissingContext(deal).length > 0) return 'Missing evidence';
  if (!isRecentSignal(deal.lastSignalDate, today)) return 'No recent signal';
  return 'Defend now';
}

function formatDealMoney(deal: PipelineDefenseDeal) {
  if (deal.estimatedValue === null || deal.estimatedValue === undefined || !deal.currency) {
    return 'Missing evidence — amount or currency not captured';
  }
  const converted = convertMoney(deal.estimatedValue, deal.currency);
  if (converted === null) return `${formatCurrencyAmount(deal.estimatedValue, deal.currency)} · Needs confirmation`;
  return `${formatCurrencyAmount(deal.estimatedValue, deal.currency)} · ${formatBaseCurrencyAmount(converted)}`;
}

function buildDealMissingContext(deal: PipelineDefenseDeal) {
  const gaps = deal.missingContext.map((item) => item.trim()).filter(Boolean);
  if (!deal.account.trim()) gaps.push('Account');
  if (!deal.opportunity.trim()) gaps.push('Opportunity');
  if (deal.estimatedValue === null || deal.estimatedValue === undefined || !deal.currency) gaps.push('Money');
  if (!isValidBusinessDate(deal.nextActionDate)) gaps.push('Next action due date');
  if (deal.evidence.every((item) => !item.trim())) gaps.push('Forecast evidence');
  return Array.from(new Set(gaps));
}

function buildMissingEvidenceGaps(deals: PipelineDefenseDeal[]) {
  const counts = new Map<string, number>();
  deals.forEach((deal) => buildDealMissingContext(deal).forEach((gap) => counts.set(gap, (counts.get(gap) || 0) + 1)));
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function countReadyChecks(item: ManagerReadyDealBrief) {
  return [
    item.account !== 'Needs confirmation', item.opportunity !== 'Needs confirmation',
    !item.moneyLabel.includes('Missing evidence') && !item.moneyLabel.includes('Needs confirmation'),
    !item.dueDateLabel.includes('Missing evidence') && !item.dueDateLabel.includes('Needs date correction'),
    item.evidence.length > 0, item.missingContext.length === 0,
    Boolean(item.pipelineReviewAnswer.trim()),
  ].filter(Boolean).length;
}

function isRecentSignal(value: string | undefined, today: string) {
  if (!isValidBusinessDate(value) || !isValidBusinessDate(today)) return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${value}T00:00:00Z`)) / 86_400_000;
  return age >= 0 && age <= 30;
}

function extractStage(context: string) {
  return context.match(/stage\s*:\s*([^.;\n]+)/i)?.[1]?.trim() || '';
}

function firstLine(value: string) {
  return value.split('\n').map((line) => line.trim()).find(Boolean) || '';
}
