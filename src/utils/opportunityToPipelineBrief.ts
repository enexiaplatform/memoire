import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief.ts';
import { createPipelineDefenseBrief, type PipelineDefenseBrief } from './pipelineDefenseStorage.ts';
import type { CrmLiteOpportunity } from '../services/opportunityStore.ts';
import type { ObjectionRecord } from '../services/objectionStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import type { StakeholderRecord } from '../services/stakeholderStore.ts';
import type { ActionOutcomeRecord } from '../services/actionOutcomeStore.ts';
import type { SalesAssetRecord } from '../services/salesAssetStore.ts';
import { getObjectionsForOpportunity, summarizeObjectionsForPipeline } from './objectionLedger.ts';
import { analyzeMeddicLiteOpportunity, getMeddicLiteDefenseAnswer, getMeddicLiteGapsSummary } from './meddicLite.ts';
import { buildMeddicStakeholderMap } from './meddicStakeholderMap.ts';
import { generateOpportunityActionPlan, generateOpportunityActionsMarkdown } from './opportunityActionPlan.ts';
import { formatActionOutcomeForBrief } from './actionOutcomeLoop.ts';
import { formatExecutionLearningForBrief } from './weeklyExecutionReview.ts';
import { formatRelevantPlaybookPatternForBrief } from './salesPlaybook.ts';
import { formatRelevantProofAssetsForBrief } from './salesAssetSuggestions.ts';
import { compareSafeBusinessDate, sanitizeBusinessDate } from './safeDate.ts';

export type OpportunityBriefMetadata = {
  title?: string;
  weekLabel?: string;
  salesOwner?: string;
  scope?: string;
};

export function mapOpportunityToPipelineDefenseDeal(
  opportunity: CrmLiteOpportunity,
  objections: ObjectionRecord[] = [],
  stakeholders: StakeholderRecord[] = [],
  activities: SalesActivityRecord[] = [],
  actionOutcomes: ActionOutcomeRecord[] = [],
  salesAssets: SalesAssetRecord[] = [],
  allOpportunities: CrmLiteOpportunity[] = [opportunity],
): PipelineDefenseDeal {
  const missingContext = splitTextList(opportunity.missingContext);
  const evidence = splitTextList(opportunity.evidence);
  const riskType = deriveRiskTypes(opportunity, missingContext);
  const opportunityObjections = getObjectionsForOpportunity(objections, opportunity);
  const meddicReview = analyzeMeddicLiteOpportunity({ opportunity, stakeholders, objections, activities });
  const stakeholderMap = buildMeddicStakeholderMap({ opportunity, stakeholders, objections, activities });
  const actionPlan = generateOpportunityActionPlan({ opportunity, meddicReview, stakeholders, objections, activities });
  const meddicGaps = meddicReview.gaps.map((gap) => `MEDDIC-lite: ${gap}`);
  const stakeholderGaps = stakeholderMap.missingRoles.map((gap) => `MEDDIC stakeholder map: ${gap.role} missing - ${gap.reason}`);
  const stakeholderEvidence = stakeholderMap.briefStatusLines.map((line) => `MEDDIC stakeholder map: ${line}`);
  const objectionDebt = buildObjectionDebt(opportunity, opportunityObjections, meddicReview);
  const nextDefenseActions = buildNextDefenseActions(actionPlan);
  const lastActionOutcome = formatActionOutcomeForBrief(actionOutcomes, opportunity);
  const executionLearning = formatExecutionLearningForBrief({
    opportunity,
    outcomes: actionOutcomes,
    stakeholders,
    objections,
    activities,
    meddicReview,
    recommendedActions: actionPlan,
  });
  const relevantPlaybookPattern = formatRelevantPlaybookPatternForBrief({
    opportunity,
    opportunities: allOpportunities,
    stakeholders,
    objections,
    activities,
    actionOutcomes,
  });
  const relevantProofAssets = formatRelevantProofAssetsForBrief({
    opportunity,
    assets: salesAssets,
    objections: opportunityObjections,
  });

  return {
    id: `opp-${opportunity.id}`,
    account: opportunity.accountName || 'Unknown account',
    opportunity: opportunity.opportunityName || 'Untitled opportunity',
    pipelineContext: buildPipelineContext(opportunity),
    dealTruth: buildDealTruth(opportunity, missingContext, meddicReview.category),
    riskType: Array.from(new Set([...riskType, ...meddicGaps.slice(0, 4)])).slice(0, 10),
    evidence: [...(evidence.length > 0 ? evidence : ['No concrete customer evidence has been captured on the opportunity yet.']), ...stakeholderEvidence].slice(0, 12),
    missingContext: Array.from(new Set([
      ...(missingContext.length > 0 ? missingContext : deriveDefaultMissingContext(opportunity)),
      ...meddicGaps,
      ...stakeholderGaps,
    ])).slice(0, 10),
    objectionDebt: {
      ...objectionDebt,
      requiredAction: [lastActionOutcome, executionLearning, relevantPlaybookPattern, relevantProofAssets, objectionDebt.requiredAction, nextDefenseActions].filter(Boolean).join('\n'),
    },
    forecastEvidenceCategory: opportunity.forecastEvidenceCategory,
    recommendedAction: buildRecommendedAction(opportunity, actionPlan, lastActionOutcome, executionLearning, relevantPlaybookPattern, relevantProofAssets),
    pipelineReviewAnswer: `${buildPipelineReviewAnswer(opportunity, missingContext)} ${getMeddicLiteDefenseAnswer(meddicReview)} ${formatStakeholderMapForBrief(stakeholderMap)} ${lastActionOutcome} ${executionLearning} ${relevantPlaybookPattern} ${relevantProofAssets}`.trim(),
    decisionRecommendation: opportunity.decisionRecommendation,
    estimatedValue: opportunity.estimatedValue,
    currency: opportunity.currency,
    nextActionDate: sanitizeBusinessDate(opportunity.nextActionDate),
    lastSignalDate: findLatestSignalDate(opportunity, activities),
    sourceType: 'opportunity',
    sourceOpportunityId: opportunity.id,
  };
}

function formatStakeholderMapForBrief(map: ReturnType<typeof buildMeddicStakeholderMap>) {
  if (map.items.length === 0) {
    return 'Stakeholder map is empty. Add Champion, Economic Buyer, Technical Buyer, or Procurement owner to make the forecast defensible.';
  }
  return `Stakeholder evidence: ${map.briefStatusLines.slice(0, 5).join(' ')}`;
}

function findLatestSignalDate(opportunity: CrmLiteOpportunity, activities: SalesActivityRecord[]) {
  return activities
    .filter((activity) => (
      activity.linkedOpportunityId === opportunity.id
      || activity.opportunityName === opportunity.opportunityName
      || activity.accountName === opportunity.accountName
    ))
    .map((activity) => sanitizeBusinessDate(activity.activityDate))
    .filter(Boolean)
    .sort((left, right) => compareSafeBusinessDate(right, left))[0] || '';
}

function buildRecommendedAction(
  opportunity: CrmLiteOpportunity,
  actions: ReturnType<typeof generateOpportunityActionPlan>,
  lastActionOutcome = '',
  executionLearning = '',
  relevantPlaybookPattern = '',
  relevantProofAssets = '',
) {
  const base = opportunity.nextAction || actions[0]?.title || 'Clarify the next customer action before defending this opportunity.';
  const nextDefenseActions = buildNextDefenseActions(actions);
  return [base, lastActionOutcome, executionLearning, relevantPlaybookPattern, relevantProofAssets, nextDefenseActions].filter(Boolean).join('\n');
}

function buildNextDefenseActions(actions: ReturnType<typeof generateOpportunityActionPlan>) {
  if (actions.length === 0) return '';
  return `Next defense actions:\n${generateOpportunityActionsMarkdown(actions.slice(0, 4))}`;
}

export function generatePipelineDefenseBriefFromOpportunities(
  opportunities: CrmLiteOpportunity[],
  metadata: OpportunityBriefMetadata = {},
  objections: ObjectionRecord[] = [],
  stakeholders: StakeholderRecord[] = [],
  activities: SalesActivityRecord[] = [],
  actionOutcomes: ActionOutcomeRecord[] = [],
  salesAssets: SalesAssetRecord[] = [],
): PipelineDefenseBrief {
  return createPipelineDefenseBrief({
    title: metadata.title || `Pipeline Defense Brief - Opportunities - ${formatDateLabel(new Date())}`,
    weekLabel: metadata.weekLabel || getCurrentWeekLabel(),
    salesOwner: metadata.salesOwner || 'Sales owner',
    scope: metadata.scope || 'Selected opportunities',
    deals: opportunities.map((opportunity) => mapOpportunityToPipelineDefenseDeal(opportunity, objections, stakeholders, activities, actionOutcomes, salesAssets, opportunities)),
  });
}

function buildPipelineContext(opportunity: CrmLiteOpportunity) {
  const parts = [
    opportunity.stage ? `Stage: ${opportunity.stage}` : '',
    opportunity.expectedClosePeriod ? `Expected close: ${opportunity.expectedClosePeriod}` : '',
    opportunity.productOrSolution ? `Product / solution: ${opportunity.productOrSolution}` : '',
    opportunity.status && opportunity.status !== 'Active' ? `Status: ${opportunity.status}` : '',
  ].filter(Boolean);

  return parts.length > 0 ? parts.join('. ') : 'Pipeline context needs stage, close period, and solution detail.';
}

function buildDealTruth(opportunity: CrmLiteOpportunity, missingContext: string[], meddicCategory: string) {
  const knownParts = [
    `${opportunity.accountName || 'This account'} has ${opportunity.opportunityName || 'an opportunity'} at ${opportunity.stage || 'an unclear stage'}.`,
    `MEDDIC-lite review: ${meddicCategory}.`,
    opportunity.evidence ? `Captured evidence: ${firstSentence(opportunity.evidence)}` : 'Customer evidence is not yet strong enough to defend on its own.',
    opportunity.objectionDebt ? `Unresolved objection/context debt: ${firstSentence(opportunity.objectionDebt)}` : '',
  ].filter(Boolean);

  const unknowns = missingContext.length > 0
    ? `Open context gaps: ${missingContext.slice(0, 4).join(', ')}.`
    : 'No explicit missing-context list is captured, but decision proof should still be checked.';

  return `${knownParts.join(' ')} ${unknowns}`.trim();
}

function buildPipelineReviewAnswer(opportunity: CrmLiteOpportunity, missingContext: string[]) {
  const recommendation = opportunity.decisionRecommendation || 'Monitor';
  const category = opportunity.forecastEvidenceCategory || 'Weak but recoverable';
  const nextAction = opportunity.nextAction || 'confirm the next customer action';
  const gap = missingContext[0] || (opportunity.objectionDebt ? 'the unresolved objection' : 'the remaining forecast evidence');

  if (recommendation === 'Defend' && category === 'Defensible') {
    return `I can defend this deal on current evidence, with one caveat: I still need to ${nextAction} this week to keep the forecast grounded.`;
  }

  if (recommendation === 'Downgrade' || category === 'Unsupported') {
    return `I should downgrade or de-risk this deal until ${gap} is resolved and a customer-confirmed next step exists. I do not have enough evidence to defend it in review.`;
  }

  if (recommendation === 'Rescue' || opportunity.objectionDebt) {
    return `I can rescue this deal only if I ${nextAction} before review. Evidence is still incomplete because ${gap} is not resolved.`;
  }

  return `I should monitor this deal for now. It is ${category.toLowerCase()} and needs ${nextAction} before I call it defensible.`;
}

function buildObjectionDebt(
  opportunity: CrmLiteOpportunity,
  objections: ObjectionRecord[] = [],
  meddicReview?: ReturnType<typeof analyzeMeddicLiteOpportunity>,
): PipelineDefenseDeal['objectionDebt'] {
  const ledgerSummary = summarizeObjectionsForPipeline(objections);
  const meddicSummary = meddicReview ? getMeddicLiteGapsSummary(meddicReview) : '';
  const objection = [opportunity.objectionDebt, ledgerSummary, meddicSummary].filter(Boolean).join('\n') || deriveObjectionFromContext(opportunity);
  const highestImpact = objections.find((item) => item.impact === 'High') || objections[0];
  const meddicAction = meddicReview?.recommendedActions[0] || '';

  return {
    objection,
    evidence: ledgerSummary
      ? 'Captured in the structured Objection Ledger.'
      : opportunity.objectionDebt
        ? 'Captured in the opportunity objection debt field.'
      : 'No explicit objection debt captured; review remaining context gaps.',
    requiredAction: highestImpact?.requiredProof || meddicAction || opportunity.nextAction || 'Confirm the objection state and required proof with the customer.',
    owner: 'Sales owner',
    status: objections.some((item) => item.status === 'Open')
      ? 'Open'
      : objections.some((item) => item.status === 'Addressed')
        ? 'Open'
        : opportunity.objectionDebt
      ? 'Open'
      : opportunity.forecastEvidenceCategory === 'Unsupported'
        ? 'Unsupported'
        : 'Context gap',
  };
}

function deriveRiskTypes(opportunity: CrmLiteOpportunity, missingContext: string[]) {
  const risks = new Set<string>();
  const lowerMissing = missingContext.join(' ').toLowerCase();

  if (opportunity.objectionDebt) risks.add('Unresolved objection debt');
  if (opportunity.forecastEvidenceCategory === 'Unsupported') risks.add('Unsupported forecast evidence');
  if (opportunity.forecastEvidenceCategory === 'Hope-based') risks.add('Hope-based forecast');
  if (opportunity.decisionRecommendation === 'Downgrade') risks.add('Downgrade candidate');
  if (opportunity.decisionRecommendation === 'Rescue') risks.add('Rescue candidate');
  if (!opportunity.nextAction) risks.add('Missing next action');
  if (!opportunity.expectedClosePeriod) risks.add('Missing close period');
  if (!opportunity.decisionMaker || lowerMissing.includes('decision maker')) risks.add('Missing decision maker');
  if (!opportunity.budgetOwner || lowerMissing.includes('budget owner')) risks.add('Missing budget owner');
  if (!opportunity.procurementPath || lowerMissing.includes('procurement')) risks.add('Procurement path unclear');
  if (!opportunity.technicalCriteria || lowerMissing.includes('technical')) risks.add('Technical criteria unclear');

  return Array.from(risks).slice(0, 8);
}

function deriveDefaultMissingContext(opportunity: CrmLiteOpportunity) {
  const gaps: string[] = [];
  if (!opportunity.decisionMaker) gaps.push('Decision maker');
  if (!opportunity.budgetOwner) gaps.push('Budget owner');
  if (!opportunity.procurementPath) gaps.push('Procurement path');
  if (!opportunity.expectedClosePeriod) gaps.push('Decision timeline');
  if (!opportunity.nextAction) gaps.push('Next customer action');
  if (!opportunity.technicalCriteria) gaps.push('Technical criteria');
  return gaps.length > 0 ? gaps : ['Confirm current decision proof before review'];
}

function deriveObjectionFromContext(opportunity: CrmLiteOpportunity) {
  if (opportunity.missingContext) return `Context gap: ${firstSentence(opportunity.missingContext)}`;
  if (!opportunity.nextAction) return 'No confirmed next customer action';
  if (!opportunity.evidence) return 'No concrete evidence captured';
  return 'No explicit objection debt captured';
}

function splitTextList(value: string) {
  return value
    .split(/\n|;|\|/)
    .map((item) => item.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean);
}

function firstSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.split(/(?<=[.!?])\s+/)[0] || trimmed;
}

function getCurrentWeekLabel() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
