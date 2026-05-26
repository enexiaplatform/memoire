import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import { createPipelineDefenseBrief, type PipelineDefenseBrief } from './pipelineDefenseStorage';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { getObjectionsForOpportunity, summarizeObjectionsForPipeline } from './objectionLedger';
import { analyzeMeddicLiteOpportunity, getMeddicLiteDefenseAnswer, getMeddicLiteGapsSummary } from './meddicLite';
import { generateOpportunityActionPlan, generateOpportunityActionsMarkdown } from './opportunityActionPlan';

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
): PipelineDefenseDeal {
  const missingContext = splitTextList(opportunity.missingContext);
  const evidence = splitTextList(opportunity.evidence);
  const riskType = deriveRiskTypes(opportunity, missingContext);
  const opportunityObjections = getObjectionsForOpportunity(objections, opportunity);
  const meddicReview = analyzeMeddicLiteOpportunity({ opportunity, stakeholders, objections, activities });
  const actionPlan = generateOpportunityActionPlan({ opportunity, meddicReview, stakeholders, objections, activities });
  const meddicGaps = meddicReview.gaps.map((gap) => `MEDDIC-lite: ${gap}`);
  const objectionDebt = buildObjectionDebt(opportunity, opportunityObjections, meddicReview);
  const nextDefenseActions = buildNextDefenseActions(actionPlan);

  return {
    id: `opp-${opportunity.id}`,
    account: opportunity.accountName || 'Unknown account',
    opportunity: opportunity.opportunityName || 'Untitled opportunity',
    pipelineContext: buildPipelineContext(opportunity),
    dealTruth: buildDealTruth(opportunity, missingContext, meddicReview.category),
    riskType: Array.from(new Set([...riskType, ...meddicGaps.slice(0, 4)])).slice(0, 10),
    evidence: evidence.length > 0 ? evidence : ['No concrete customer evidence has been captured on the opportunity yet.'],
    missingContext: Array.from(new Set([
      ...(missingContext.length > 0 ? missingContext : deriveDefaultMissingContext(opportunity)),
      ...meddicGaps,
    ])).slice(0, 10),
    objectionDebt: {
      ...objectionDebt,
      requiredAction: [objectionDebt.requiredAction, nextDefenseActions].filter(Boolean).join('\n'),
    },
    forecastEvidenceCategory: opportunity.forecastEvidenceCategory,
    recommendedAction: buildRecommendedAction(opportunity, actionPlan),
    pipelineReviewAnswer: `${buildPipelineReviewAnswer(opportunity, missingContext)} ${getMeddicLiteDefenseAnswer(meddicReview)}`.trim(),
    decisionRecommendation: opportunity.decisionRecommendation,
    sourceType: 'opportunity',
    sourceOpportunityId: opportunity.id,
  };
}

function buildRecommendedAction(opportunity: CrmLiteOpportunity, actions: ReturnType<typeof generateOpportunityActionPlan>) {
  const base = opportunity.nextAction || actions[0]?.title || 'Clarify the next customer action before defending this opportunity.';
  const nextDefenseActions = buildNextDefenseActions(actions);
  return [base, nextDefenseActions].filter(Boolean).join('\n');
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
): PipelineDefenseBrief {
  return createPipelineDefenseBrief({
    title: metadata.title || `Pipeline Defense Brief - Opportunities - ${formatDateLabel(new Date())}`,
    weekLabel: metadata.weekLabel || getCurrentWeekLabel(),
    salesOwner: metadata.salesOwner || 'Henry',
    scope: metadata.scope || 'Selected opportunities',
    deals: opportunities.map((opportunity) => mapOpportunityToPipelineDefenseDeal(opportunity, objections, stakeholders, activities)),
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
    return `I can defend this opportunity based on the current evidence. This week I will still ${nextAction} to keep the forecast grounded.`;
  }

  if (recommendation === 'Downgrade' || category === 'Unsupported') {
    return `I should not over-forecast this opportunity. It needs downgrade or clarification until ${gap} is resolved and a customer-confirmed next step exists.`;
  }

  if (recommendation === 'Rescue' || opportunity.objectionDebt) {
    return `This opportunity needs rescue before review. The immediate action is to ${nextAction}, because ${gap} is still not resolved.`;
  }

  return `This opportunity should be monitored. It is ${category.toLowerCase()} and needs ${nextAction} before it becomes fully defensible.`;
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
    owner: 'Henry',
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
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
