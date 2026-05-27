import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { analyzeMeddicLiteOpportunity, type MeddicLiteFieldKey } from './meddicLite';
import { getObjectionsForOpportunity } from './objectionLedger';
import { generateOpportunityActionPlan } from './opportunityActionPlan';
import { getStakeholdersForOpportunity } from './stakeholderGraph';
import type { WeeklyExecutionReview } from './weeklyExecutionReview';

export type SalesPlaybookPatternCategory =
  | 'Objection Pattern'
  | 'Stakeholder Gap'
  | 'MEDDIC Gap'
  | 'Proof Asset Needed'
  | 'Winning Move'
  | 'Repeated Mistake'
  | 'Follow-up Risk'
  | 'Competitor Risk'
  | 'Procurement Risk'
  | 'Documentation / Compliance Pattern';

export type SalesPlaybookSeverity = 'High' | 'Medium' | 'Low';

export type SalesPlaybookPattern = {
  id: string;
  title: string;
  category: SalesPlaybookPatternCategory;
  severity: SalesPlaybookSeverity;
  frequency: number;
  evidence: string[];
  whyItMatters: string;
  suggestedPlaybookResponse: string;
  reusableAction: string;
  relatedAccounts: string[];
  relatedOpportunities: string[];
  relatedObjectionTypes: string[];
  detectedAt: string;
};

export type SalesPlaybookSummary = {
  totalPatterns: number;
  highSeverityCount: number;
  objectionPatternCount: number;
  stakeholderGapCount: number;
  proofAssetCount: number;
  winningMoveCount: number;
};

export const playbookPatternCategories: SalesPlaybookPatternCategory[] = [
  'Objection Pattern',
  'Stakeholder Gap',
  'MEDDIC Gap',
  'Proof Asset Needed',
  'Winning Move',
  'Repeated Mistake',
  'Follow-up Risk',
  'Competitor Risk',
  'Procurement Risk',
  'Documentation / Compliance Pattern',
];

export const playbookSeverities: SalesPlaybookSeverity[] = ['High', 'Medium', 'Low'];

export function generateSalesPlaybookPatterns(input: {
  opportunities: CrmLiteOpportunity[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  actionOutcomes?: ActionOutcomeRecord[];
  executionReview?: WeeklyExecutionReview;
  limit?: number;
}): SalesPlaybookPattern[] {
  const opportunities = input.opportunities.filter((opportunity) => opportunity.status === 'Active');
  const stakeholders = input.stakeholders || [];
  const objections = input.objections || [];
  const activities = input.activities || [];
  const actionOutcomes = input.actionOutcomes || [];
  const detectedAt = new Date().toISOString();
  const patterns: SalesPlaybookPattern[] = [];
  const contexts = opportunities.map((opportunity) => buildOpportunityContext(opportunity, stakeholders, objections, activities));

  patterns.push(...buildObjectionPatterns(objections, detectedAt));
  patterns.push(...buildStakeholderGapPatterns(contexts, detectedAt));
  patterns.push(...buildMeddicGapPatterns(contexts, detectedAt));
  patterns.push(...buildProofAssetPatterns(contexts, objections, activities, detectedAt));
  patterns.push(...buildWinningMovePatterns(actionOutcomes, detectedAt));
  patterns.push(...buildRepeatedMistakePatterns(actionOutcomes, input.executionReview, detectedAt));
  patterns.push(...buildFollowUpRiskPatterns(opportunities, activities, detectedAt));
  patterns.push(...buildCompetitorRiskPatterns(objections, activities, contexts, detectedAt));
  patterns.push(...buildProcurementRiskPatterns(contexts, objections, detectedAt));

  return mergeDuplicatePatterns(patterns)
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.frequency - a.frequency || a.title.localeCompare(b.title))
    .slice(0, input.limit || 24);
}

export function summarizeSalesPlaybook(patterns: SalesPlaybookPattern[]): SalesPlaybookSummary {
  return {
    totalPatterns: patterns.length,
    highSeverityCount: patterns.filter((pattern) => pattern.severity === 'High').length,
    objectionPatternCount: patterns.filter((pattern) => pattern.category === 'Objection Pattern').length,
    stakeholderGapCount: patterns.filter((pattern) => pattern.category === 'Stakeholder Gap').length,
    proofAssetCount: patterns.filter((pattern) => pattern.category === 'Proof Asset Needed' || pattern.category === 'Documentation / Compliance Pattern').length,
    winningMoveCount: patterns.filter((pattern) => pattern.category === 'Winning Move').length,
  };
}

export function getTopSalesPlaybookPattern(patterns: SalesPlaybookPattern[]) {
  return [...patterns].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.frequency - a.frequency)[0];
}

export function generatePlaybookPatternMarkdown(pattern: SalesPlaybookPattern) {
  return [
    `${pattern.title}`,
    `Category: ${pattern.category}`,
    `Severity: ${pattern.severity}`,
    `Frequency: ${pattern.frequency}`,
    pattern.relatedAccounts.length ? `Accounts: ${pattern.relatedAccounts.join(', ')}` : '',
    pattern.relatedOpportunities.length ? `Opportunities: ${pattern.relatedOpportunities.join(', ')}` : '',
    '',
    'Evidence:',
    ...pattern.evidence.map((item) => `- ${item}`),
    '',
    `Why it matters: ${pattern.whyItMatters}`,
    `Suggested response: ${pattern.suggestedPlaybookResponse}`,
    `Reusable action: ${pattern.reusableAction}`,
  ].filter((line) => line !== '').join('\n');
}

export function formatRelevantPlaybookPatternForBrief(input: {
  opportunity: CrmLiteOpportunity;
  opportunities: CrmLiteOpportunity[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
  actionOutcomes?: ActionOutcomeRecord[];
}) {
  const patterns = generateSalesPlaybookPatterns({
    opportunities: input.opportunities,
    stakeholders: input.stakeholders || [],
    objections: input.objections || [],
    activities: input.activities || [],
    actionOutcomes: input.actionOutcomes || [],
    limit: 20,
  });
  const account = normalize(input.opportunity.accountName);
  const opportunityName = normalize(input.opportunity.opportunityName);
  const relevant = patterns.find((pattern) => (
    pattern.relatedAccounts.some((item) => normalize(item) === account) ||
    pattern.relatedOpportunities.some((item) => normalize(item) === opportunityName)
  )) || patterns[0];

  if (!relevant) return '';
  return [
    'Relevant Playbook Pattern:',
    `- ${relevant.title}`,
    `- Response: ${relevant.suggestedPlaybookResponse}`,
    `- Reusable action: ${relevant.reusableAction}`,
  ].join('\n');
}

function buildOpportunityContext(
  opportunity: CrmLiteOpportunity,
  stakeholders: StakeholderRecord[],
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
) {
  const relatedStakeholders = getStakeholdersForOpportunity(stakeholders, opportunity);
  const relatedObjections = getObjectionsForOpportunity(objections, opportunity);
  const relatedActivities = getRelatedActivities(opportunity, activities);
  const meddicReview = analyzeMeddicLiteOpportunity({
    opportunity,
    stakeholders: relatedStakeholders,
    objections: relatedObjections,
    activities: relatedActivities,
  });
  const actionPlan = generateOpportunityActionPlan({
    opportunity,
    meddicReview,
    stakeholders: relatedStakeholders,
    objections: relatedObjections,
    activities: relatedActivities,
  });

  return {
    opportunity,
    stakeholders: relatedStakeholders,
    objections: relatedObjections,
    activities: relatedActivities,
    meddicReview,
    actionPlan,
  };
}

function buildObjectionPatterns(objections: ObjectionRecord[], detectedAt: string): SalesPlaybookPattern[] {
  const openObjections = objections.filter((objection) => objection.status !== 'Resolved');
  const groups = groupBy(openObjections, (objection) => objection.objectionType || 'Other');
  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([type, items]): SalesPlaybookPattern => ({
      id: `objection-${slugify(type)}`,
      title: `${type} objections repeat across deals`,
      category: 'Objection Pattern',
      severity: items.some((item) => item.impact === 'High') || items.length >= 3 ? 'High' : items.length >= 2 ? 'Medium' : 'Low',
      frequency: items.length,
      evidence: items.slice(0, 4).map((item) => `${item.accountName || 'No account'} / ${item.opportunityName || 'No opportunity'}: ${item.objectionText}`),
      whyItMatters: 'Recurring objections create commercial debt that weakens forecast defense unless proof and response paths are prepared.',
      suggestedPlaybookResponse: `Prepare a repeatable response path for ${type.toLowerCase()} objections before the next customer review.`,
      reusableAction: `Create a short ${type.toLowerCase()} proof/response checklist and attach it to active opportunities.`,
      relatedAccounts: unique(items.map((item) => item.accountName).filter(Boolean)),
      relatedOpportunities: unique(items.map((item) => item.opportunityName).filter(Boolean)),
      relatedObjectionTypes: [type],
      detectedAt,
    }));
}

function buildStakeholderGapPatterns(contexts: ReturnType<typeof buildOpportunityContext>[], detectedAt: string): SalesPlaybookPattern[] {
  const missingChampion = contexts.filter((context) => fieldStatus(context.meddicReview, 'champion') === 'Missing');
  const missingEconomicBuyer = contexts.filter((context) => fieldStatus(context.meddicReview, 'economicBuyer') === 'Missing');
  const resistantStakeholders = contexts.filter((context) => context.stakeholders.some((stakeholder) => stakeholder.stakeholderRole === 'Blocker' || stakeholder.stance === 'Resistant'));
  const patterns: SalesPlaybookPattern[] = [];

  if (missingChampion.length > 0) {
    patterns.push(buildContextPattern({
      id: 'stakeholder-missing-champion',
      title: 'Champion is not confirmed before review',
      category: 'Stakeholder Gap',
      severity: missingChampion.length >= 2 ? 'High' : 'Medium',
      contexts: missingChampion,
      detectedAt,
      whyItMatters: 'Deals without an internal supporter are harder to defend and easier to stall.',
      suggestedPlaybookResponse: 'Ask who inside the customer organization benefits most and whether they will actively support next steps.',
      reusableAction: 'Before proposal or negotiation, map one named champion and capture their reason to support the project.',
    }));
  }

  if (missingEconomicBuyer.length > 0) {
    patterns.push(buildContextPattern({
      id: 'stakeholder-missing-economic-buyer',
      title: 'Economic buyer missing in active opportunities',
      category: 'Stakeholder Gap',
      severity: missingEconomicBuyer.length >= 2 ? 'High' : 'Medium',
      contexts: missingEconomicBuyer,
      detectedAt,
      whyItMatters: 'Budget authority gaps create late-stage surprises and hope-based forecasts.',
      suggestedPlaybookResponse: 'Confirm who owns final budget approval and what they need to see before sign-off.',
      reusableAction: 'Add an economic buyer check to every late discovery, proposal, or negotiation call.',
    }));
  }

  if (resistantStakeholders.length > 0) {
    patterns.push(buildContextPattern({
      id: 'stakeholder-resistant-contact',
      title: 'Resistant stakeholder or blocker needs a response path',
      category: 'Stakeholder Gap',
      severity: 'High',
      contexts: resistantStakeholders,
      detectedAt,
      whyItMatters: 'A blocker can slow procurement even when technical users are supportive.',
      suggestedPlaybookResponse: 'Clarify the blocker concern, required proof, and who can neutralize the risk internally.',
      reusableAction: 'Create a blocker plan: concern, proof needed, owner, and next customer conversation.',
    }));
  }

  return patterns;
}

function buildMeddicGapPatterns(contexts: ReturnType<typeof buildOpportunityContext>[], detectedAt: string): SalesPlaybookPattern[] {
  const missingMetrics = contexts.filter((context) => fieldStatus(context.meddicReview, 'metrics') !== 'Strong');
  const missingCriteria = contexts.filter((context) => fieldStatus(context.meddicReview, 'decisionCriteria') === 'Missing');
  const unclearProcess = contexts.filter((context) => fieldStatus(context.meddicReview, 'decisionProcess') !== 'Strong');
  const patterns: SalesPlaybookPattern[] = [];

  if (missingMetrics.length > 0) {
    patterns.push(buildContextPattern({
      id: 'meddic-missing-metrics',
      title: 'Business impact is not measurable enough',
      category: 'MEDDIC Gap',
      severity: missingMetrics.length >= 3 ? 'High' : 'Medium',
      contexts: missingMetrics,
      detectedAt,
      whyItMatters: 'Without measurable impact, urgency is easy to lose and internal budget defense becomes weak.',
      suggestedPlaybookResponse: 'Connect the project to cost, compliance risk, throughput, downtime, or decision deadline.',
      reusableAction: 'Ask: what happens if the customer does not solve this issue this quarter?',
    }));
  }

  if (missingCriteria.length > 0) {
    patterns.push(buildContextPattern({
      id: 'meddic-missing-decision-criteria',
      title: 'Technical decision criteria are not captured',
      category: 'MEDDIC Gap',
      severity: missingCriteria.length >= 2 ? 'Medium' : 'Low',
      contexts: missingCriteria,
      detectedAt,
      whyItMatters: 'Vendor comparison becomes subjective when criteria are not explicit.',
      suggestedPlaybookResponse: 'Ask the customer to define the technical, compliance, service, and commercial criteria used to compare vendors.',
      reusableAction: 'Capture decision criteria before sending the next quote or demo recap.',
    }));
  }

  if (unclearProcess.length > 0) {
    patterns.push(buildContextPattern({
      id: 'meddic-unclear-decision-process',
      title: 'Decision process is unclear before proposal',
      category: 'Procurement Risk',
      severity: unclearProcess.length >= 2 ? 'High' : 'Medium',
      contexts: unclearProcess,
      detectedAt,
      whyItMatters: 'Unclear process makes timing, committee ownership, and procurement risk hard to defend.',
      suggestedPlaybookResponse: 'Map the exact steps from technical fit to PO, including committee, procurement, and approval timing.',
      reusableAction: 'Ask for the decision path before forecasting a close period.',
    }));
  }

  return patterns;
}

function buildProofAssetPatterns(
  contexts: ReturnType<typeof buildOpportunityContext>[],
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
  detectedAt: string,
): SalesPlaybookPattern[] {
  const proofTerms = /proof|validation|iq\/oq|iq-oq|oq\/pq|compliance|documentation|reference|certificate|local support/i;
  const proofContexts = contexts.filter((context) => (
    proofTerms.test(context.opportunity.evidence)
    || proofTerms.test(context.opportunity.objectionDebt)
    || context.objections.some((objection) => proofTerms.test(`${objection.objectionType} ${objection.objectionText} ${objection.requiredProof}`))
    || context.activities.some((activity) => proofTerms.test(`${activity.rawNote} ${activity.summary} ${(activity.risks || []).join(' ')}`))
  ));
  const documentationObjections = objections.filter((objection) => /Documentation|Compliance|validation|Local support/i.test(`${objection.objectionType} ${objection.objectionText} ${objection.requiredProof}`));
  const proofActivities = activities.filter((activity) => proofTerms.test(`${activity.rawNote} ${activity.summary}`));
  const patterns: SalesPlaybookPattern[] = [];

  if (proofContexts.length > 0 || documentationObjections.length > 0 || proofActivities.length > 0) {
    patterns.push({
      id: 'proof-assets-validation-compliance',
      title: 'Proof assets needed for validation, compliance, or local support',
      category: documentationObjections.length > 0 ? 'Documentation / Compliance Pattern' : 'Proof Asset Needed',
      severity: documentationObjections.some((item) => item.impact === 'High') || proofContexts.length >= 2 ? 'High' : 'Medium',
      frequency: Math.max(1, proofContexts.length + documentationObjections.length),
      evidence: [
        ...proofContexts.slice(0, 3).map((context) => `${context.opportunity.accountName} / ${context.opportunity.opportunityName}: proof or compliance appears in deal context.`),
        ...documentationObjections.slice(0, 2).map((objection) => `${objection.accountName}: ${objection.requiredProof || objection.objectionText}`),
      ].slice(0, 5),
      whyItMatters: 'Proof gaps slow technical validation and make pipeline review answers less defensible.',
      suggestedPlaybookResponse: 'Prepare a reusable proof pack before late-stage customer reviews.',
      reusableAction: 'Build a proof asset folder: validation docs, local support proof, references, SLA, and compliance notes.',
      relatedAccounts: unique([...proofContexts.map((context) => context.opportunity.accountName), ...documentationObjections.map((item) => item.accountName)].filter(Boolean)),
      relatedOpportunities: unique([...proofContexts.map((context) => context.opportunity.opportunityName), ...documentationObjections.map((item) => item.opportunityName)].filter(Boolean)),
      relatedObjectionTypes: unique(documentationObjections.map((item) => item.objectionType)),
      detectedAt,
    });
  }

  return patterns;
}

function buildWinningMovePatterns(actionOutcomes: ActionOutcomeRecord[], detectedAt: string): SalesPlaybookPattern[] {
  const improved = actionOutcomes.filter((outcome) => outcome.status === 'Done' && ['Improved', 'Resolved'].includes(outcome.outcomeType));
  if (improved.length === 0) return [];
  const groups = groupBy(improved, (outcome) => outcome.actionSourceType || 'Deal action');
  return Object.entries(groups).map(([sourceType, items]): SalesPlaybookPattern => ({
    id: `winning-move-${slugify(sourceType)}`,
    title: `${sourceType} actions are improving deals`,
    category: 'Winning Move',
    severity: items.length >= 2 ? 'Medium' : 'Low',
    frequency: items.length,
    evidence: items.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}: ${item.actionTitle}${item.outcomeNote ? ` - ${item.outcomeNote}` : ''}`),
    whyItMatters: 'Actions with positive outcomes should become repeatable habits instead of one-off fixes.',
    suggestedPlaybookResponse: 'Reuse this move when a similar deal shows the same risk pattern.',
    reusableAction: items[0]?.actionTitle || 'Repeat the action that produced a positive customer signal.',
    relatedAccounts: unique(items.map((item) => item.accountName)),
    relatedOpportunities: unique(items.map((item) => item.opportunityName)),
    relatedObjectionTypes: [],
    detectedAt,
  }));
}

function buildRepeatedMistakePatterns(actionOutcomes: ActionOutcomeRecord[], executionReview: WeeklyExecutionReview | undefined, detectedAt: string): SalesPlaybookPattern[] {
  const unclear = actionOutcomes.filter((outcome) => outcome.status === 'Done' && ['Still unclear', 'No change'].includes(outcome.outcomeType));
  const worsened = actionOutcomes.filter((outcome) => outcome.status === 'Done' && ['Worsened', 'Downgrade recommended'].includes(outcome.outcomeType));
  const patterns: SalesPlaybookPattern[] = [];

  if (unclear.length > 0 || (executionReview?.executionSummary.unclearOutcomeCount || 0) > 0) {
    patterns.push({
      id: 'repeated-mistake-unclear-outcomes',
      title: 'Completed actions often have unclear outcomes',
      category: 'Repeated Mistake',
      severity: unclear.length >= 2 ? 'High' : 'Medium',
      frequency: Math.max(unclear.length, executionReview?.executionSummary.unclearOutcomeCount || 0, 1),
      evidence: unclear.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}: ${item.actionTitle}`),
      whyItMatters: 'A completed action is not useful unless the customer response changes the deal truth.',
      suggestedPlaybookResponse: 'After every important action, capture what changed, what stayed unclear, and the next proof needed.',
      reusableAction: 'End follow-ups with a confirmation question: what did this resolve and what remains blocked?',
      relatedAccounts: unique(unclear.map((item) => item.accountName)),
      relatedOpportunities: unique(unclear.map((item) => item.opportunityName)),
      relatedObjectionTypes: [],
      detectedAt,
    });
  }

  if (worsened.length > 0) {
    patterns.push({
      id: 'repeated-mistake-negative-outcomes',
      title: 'Some actions worsened or triggered downgrade signals',
      category: 'Repeated Mistake',
      severity: 'High',
      frequency: worsened.length,
      evidence: worsened.slice(0, 4).map((item) => `${item.accountName} / ${item.opportunityName}: ${item.outcomeNote || item.actionTitle}`),
      whyItMatters: 'Negative outcomes should become explicit learning, not hidden pipeline drift.',
      suggestedPlaybookResponse: 'Review what assumption was wrong before repeating the same motion on similar deals.',
      reusableAction: 'Before the next action, state the assumption being tested and what outcome would change the forecast.',
      relatedAccounts: unique(worsened.map((item) => item.accountName)),
      relatedOpportunities: unique(worsened.map((item) => item.opportunityName)),
      relatedObjectionTypes: [],
      detectedAt,
    });
  }

  return patterns;
}

function buildFollowUpRiskPatterns(opportunities: CrmLiteOpportunity[], activities: SalesActivityRecord[], detectedAt: string): SalesPlaybookPattern[] {
  const today = todayKey();
  const staleOpportunities = opportunities.filter((opportunity) => opportunity.status === 'Active' && ((!opportunity.nextAction.trim()) || (opportunity.nextActionDate && opportunity.nextActionDate < today)));
  const staleActivities = activities.filter((activity) => activity.nextAction && activity.dueDate && activity.dueDate < today);
  if (staleOpportunities.length === 0 && staleActivities.length === 0) return [];

  return [{
    id: 'follow-up-risk-stale-next-actions',
    title: 'Follow-up risk appears in stale or missing next actions',
    category: 'Follow-up Risk',
    severity: staleOpportunities.length + staleActivities.length >= 3 ? 'High' : 'Medium',
    frequency: staleOpportunities.length + staleActivities.length,
    evidence: [
      ...staleOpportunities.slice(0, 3).map((opportunity) => `${opportunity.accountName} / ${opportunity.opportunityName}: ${opportunity.nextAction || 'No next action captured'}`),
      ...staleActivities.slice(0, 2).map((activity) => `${activity.accountName || activity.linkedAccountName || 'No account'}: ${activity.nextAction}`),
    ],
    whyItMatters: 'Stale or missing follow-up lets active deals go quiet before the next review.',
    suggestedPlaybookResponse: 'Treat every customer touch as incomplete until a dated next action is captured.',
    reusableAction: 'At the end of each call, write one next action with owner and date.',
    relatedAccounts: unique([...staleOpportunities.map((item) => item.accountName), ...staleActivities.map((item) => item.linkedAccountName || item.accountName)].filter(Boolean)),
    relatedOpportunities: unique([...staleOpportunities.map((item) => item.opportunityName), ...staleActivities.map((item) => item.linkedOpportunityName || item.opportunityName)].filter(Boolean)),
    relatedObjectionTypes: [],
    detectedAt,
  }];
}

function buildCompetitorRiskPatterns(
  objections: ObjectionRecord[],
  activities: SalesActivityRecord[],
  contexts: ReturnType<typeof buildOpportunityContext>[],
  detectedAt: string,
): SalesPlaybookPattern[] {
  const competitorObjections = objections.filter((objection) => objection.status !== 'Resolved' && objection.objectionType === 'Competitor');
  const competitorActivities = activities.filter((activity) => (activity.competitors || []).length > 0);
  const competitorContexts = contexts.filter((context) => context.actionPlan.some((action) => action.sourceType === 'Competition'));
  if (competitorObjections.length === 0 && competitorActivities.length === 0 && competitorContexts.length === 0) return [];

  return [{
    id: 'competitor-risk-response-gap',
    title: 'Competitor risk appears without a reusable response plan',
    category: 'Competitor Risk',
    severity: competitorObjections.some((item) => item.impact === 'High') || competitorContexts.length >= 2 ? 'High' : 'Medium',
    frequency: Math.max(1, competitorObjections.length + competitorActivities.length + competitorContexts.length),
    evidence: [
      ...competitorObjections.slice(0, 3).map((objection) => `${objection.accountName}: ${objection.objectionText}`),
      ...competitorActivities.slice(0, 2).map((activity) => `${activity.accountName || activity.linkedAccountName || 'No account'}: ${(activity.competitors || []).join(', ')}`),
    ],
    whyItMatters: 'Competitor presence weakens forecast confidence unless differentiation and proof are explicit.',
    suggestedPlaybookResponse: 'Build a competitor response plan around customer criteria, proof, and risk reduction.',
    reusableAction: 'For each competitor mention, capture competitor, customer concern, proof needed, and response owner.',
    relatedAccounts: unique([...competitorObjections.map((item) => item.accountName), ...competitorActivities.map((item) => item.linkedAccountName || item.accountName), ...competitorContexts.map((context) => context.opportunity.accountName)].filter(Boolean)),
    relatedOpportunities: unique([...competitorObjections.map((item) => item.opportunityName), ...competitorActivities.map((item) => item.linkedOpportunityName || item.opportunityName), ...competitorContexts.map((context) => context.opportunity.opportunityName)].filter(Boolean)),
    relatedObjectionTypes: ['Competitor'],
    detectedAt,
  }];
}

function buildProcurementRiskPatterns(contexts: ReturnType<typeof buildOpportunityContext>[], objections: ObjectionRecord[], detectedAt: string): SalesPlaybookPattern[] {
  const procurementContexts = contexts.filter((context) => !context.opportunity.procurementPath.trim() || /tender|procurement|committee|decision process/i.test(context.opportunity.missingContext));
  const procurementObjections = objections.filter((objection) => objection.status !== 'Resolved' && /Procurement|Tender|Timing/i.test(`${objection.objectionType} ${objection.objectionText}`));
  if (procurementContexts.length === 0 && procurementObjections.length === 0) return [];

  return [{
    id: 'procurement-risk-unclear-path',
    title: 'Procurement path often remains unclear before forecast review',
    category: 'Procurement Risk',
    severity: procurementContexts.length + procurementObjections.length >= 2 ? 'High' : 'Medium',
    frequency: procurementContexts.length + procurementObjections.length,
    evidence: [
      ...procurementContexts.slice(0, 3).map((context) => `${context.opportunity.accountName} / ${context.opportunity.opportunityName}: procurement or decision process is unclear.`),
      ...procurementObjections.slice(0, 2).map((objection) => `${objection.accountName}: ${objection.objectionText}`),
    ],
    whyItMatters: 'Procurement uncertainty makes timing, budget approval, and close period fragile.',
    suggestedPlaybookResponse: 'Map decision committee, tender/procurement steps, approval owner, and timing before committing forecast.',
    reusableAction: 'Ask for the exact procurement path and write it into the opportunity before proposal review.',
    relatedAccounts: unique([...procurementContexts.map((context) => context.opportunity.accountName), ...procurementObjections.map((item) => item.accountName)].filter(Boolean)),
    relatedOpportunities: unique([...procurementContexts.map((context) => context.opportunity.opportunityName), ...procurementObjections.map((item) => item.opportunityName)].filter(Boolean)),
    relatedObjectionTypes: unique(procurementObjections.map((item) => item.objectionType)),
    detectedAt,
  }];
}

function buildContextPattern(input: {
  id: string;
  title: string;
  category: SalesPlaybookPatternCategory;
  severity: SalesPlaybookSeverity;
  contexts: ReturnType<typeof buildOpportunityContext>[];
  whyItMatters: string;
  suggestedPlaybookResponse: string;
  reusableAction: string;
  detectedAt: string;
}): SalesPlaybookPattern {
  return {
    id: input.id,
    title: input.title,
    category: input.category,
    severity: input.severity,
    frequency: input.contexts.length,
    evidence: input.contexts.slice(0, 4).map((context) => `${context.opportunity.accountName} / ${context.opportunity.opportunityName}: ${context.meddicReview.gaps.slice(0, 2).join('; ') || context.meddicReview.category}`),
    whyItMatters: input.whyItMatters,
    suggestedPlaybookResponse: input.suggestedPlaybookResponse,
    reusableAction: input.reusableAction,
    relatedAccounts: unique(input.contexts.map((context) => context.opportunity.accountName)),
    relatedOpportunities: unique(input.contexts.map((context) => context.opportunity.opportunityName)),
    relatedObjectionTypes: unique(input.contexts.flatMap((context) => context.objections.map((objection) => objection.objectionType))),
    detectedAt: input.detectedAt,
  };
}

function mergeDuplicatePatterns(patterns: SalesPlaybookPattern[]) {
  const byId = new Map<string, SalesPlaybookPattern>();
  patterns.forEach((pattern) => {
    const existing = byId.get(pattern.id);
    if (!existing) {
      byId.set(pattern.id, pattern);
      return;
    }
    byId.set(pattern.id, {
      ...existing,
      severity: severityRank(pattern.severity) > severityRank(existing.severity) ? pattern.severity : existing.severity,
      frequency: existing.frequency + pattern.frequency,
      evidence: unique([...existing.evidence, ...pattern.evidence]).slice(0, 6),
      relatedAccounts: unique([...existing.relatedAccounts, ...pattern.relatedAccounts]),
      relatedOpportunities: unique([...existing.relatedOpportunities, ...pattern.relatedOpportunities]),
      relatedObjectionTypes: unique([...existing.relatedObjectionTypes, ...pattern.relatedObjectionTypes]),
    });
  });
  return Array.from(byId.values());
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

function fieldStatus(review: ReturnType<typeof analyzeMeddicLiteOpportunity>, field: MeddicLiteFieldKey) {
  return review.fields.find((item) => item.key === field)?.status || 'Missing';
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((groups, item) => {
    const key = getKey(item);
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function severityRank(severity: SalesPlaybookSeverity) {
  return {
    High: 3,
    Medium: 2,
    Low: 1,
  }[severity];
}

function normalize(value = '') {
  return value.trim().toLowerCase();
}

function unique(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function slugify(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'pattern';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
