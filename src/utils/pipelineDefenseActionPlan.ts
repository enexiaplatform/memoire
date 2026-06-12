import type { PipelineDefenseDeal } from '../data/pipelineDefenseBrief';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';

export type ActionPriority = 'Critical' | 'High' | 'Medium' | 'Low';

export type ActionType =
  | 'Rescue'
  | 'Clarify'
  | 'Downgrade'
  | 'Follow-up'
  | 'Collect evidence'
  | 'Resolve objection'
  | 'Prepare defense answer';

export type PipelineDefenseActionItem = {
  id: string;
  dealId: string;
  account: string;
  opportunity: string;
  title: string;
  detail: string;
  reason: string;
  priority: ActionPriority;
  actionType: ActionType;
  suggestedOwner: string;
  suggestedDueTiming: string;
};

const missingContextTerms = [
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
  'technical criteria',
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
  'follow-up',
  'follow up',
  'objection',
  'procurement',
];

export function generatePipelineDefenseActionPlan(brief: PipelineDefenseBrief | null): PipelineDefenseActionItem[] {
  if (!brief) return [];

  return brief.deals.flatMap((deal) => generateDealActions(deal));
}

export function groupActionItemsByPriority(items: PipelineDefenseActionItem[]) {
  return {
    Critical: items.filter((item) => item.priority === 'Critical'),
    High: items.filter((item) => item.priority === 'High'),
    Medium: items.filter((item) => item.priority === 'Medium'),
    Low: items.filter((item) => item.priority === 'Low'),
  };
}

export function generateActionPlanMarkdown(brief: PipelineDefenseBrief | null, items: PipelineDefenseActionItem[]) {
  const grouped = groupActionItemsByPriority(items);
  const lines = [
    '# Weekly Pipeline Defense Action Plan',
    '',
    `- Brief: ${brief?.title || 'Pipeline Defense Brief'}`,
    `- Week: ${brief?.weekLabel || 'Current Week'}`,
    `- Sales owner: ${brief?.salesOwner || 'Sales owner'}`,
    '',
  ];

  if (items.length === 0) {
    lines.push('No action items generated.', '');
    return `${lines.join('\n').trim()}\n`;
  }

  for (const priority of ['Critical', 'High', 'Medium', 'Low'] as ActionPriority[]) {
    lines.push(`## ${priority}`, '');
    const priorityItems = grouped[priority];
    if (priorityItems.length === 0) {
      lines.push('No action items.', '');
      continue;
    }

    for (const item of priorityItems) {
      lines.push(
        `### ${item.title}`,
        `- Account: ${item.account}`,
        `- Opportunity: ${item.opportunity}`,
        `- Type: ${item.actionType}`,
        `- Detail: ${item.detail}`,
        `- Reason: ${item.reason}`,
        `- Owner: ${item.suggestedOwner}`,
        `- Due: ${item.suggestedDueTiming}`,
        '',
      );
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

function generateDealActions(deal: PipelineDefenseDeal): PipelineDefenseActionItem[] {
  const actions: PipelineDefenseActionItem[] = [];
  const hasObjectionDebt = [
    deal.objectionDebt.objection,
    deal.objectionDebt.evidence,
    deal.objectionDebt.requiredAction,
  ].some((value) => value.trim().length > 0);
  const missingContextText = joinText(deal.missingContext);
  const evidenceText = joinText(deal.evidence);
  const riskTypeText = joinText(deal.riskType);
  const hasWeakEvidence = containsAny(evidenceText, weakEvidenceTerms);
  const hasMissingContext = containsAny(missingContextText, missingContextTerms);
  const hasRiskTypeCleanup = containsAny(riskTypeText, riskTypeTerms);

  if (deal.forecastEvidenceCategory === 'Unsupported') {
    actions.push(createAction(deal, 'unsupported-forecast', 'Critical', 'Downgrade', `Downgrade unsupported forecast for ${deal.account}`, 'Remove this deal from active forecast unless current customer evidence and a confirmed next action can be captured this week.', 'Unsupported forecast evidence is not defensible in a pipeline review.', 'Before pipeline review'));
  }

  if (deal.decisionRecommendation === 'Defend' && hasObjectionDebt) {
    actions.push(createAction(deal, 'defend-objection', 'Critical', 'Resolve objection', `Resolve objection before defending ${deal.account}`, deal.objectionDebt.requiredAction || 'Define the proof required to resolve the open objection before defending this deal.', 'The deal is marked Defend while objection debt is still present.', 'Today'));
  }

  if (deal.decisionRecommendation !== 'Defend' && hasObjectionDebt) {
    actions.push(createAction(deal, 'resolve-objection', 'High', 'Resolve objection', `Resolve objection for ${deal.account}`, deal.objectionDebt.requiredAction || 'Define the proof required to resolve the open objection before review.', 'Unresolved objection debt should be paid down before pipeline review.', 'This week'));
  }

  if (!deal.pipelineReviewAnswer.trim()) {
    actions.push(createAction(deal, 'missing-review-answer', 'Critical', 'Prepare defense answer', `Prepare defense answer for ${deal.account}`, 'Write the answer you will use in pipeline review: what is known, what is missing, and what decision should be made.', 'The deal has no clear pipeline review answer.', 'Before pipeline review'));
  }

  if (!deal.recommendedAction.trim()) {
    actions.push(createAction(deal, 'missing-action', 'Critical', 'Clarify', `Define next action for ${deal.account}`, 'Add the next customer-facing action, owner, and timing for this week.', 'The deal has no recommended action.', 'Today'));
  }

  if (deal.forecastEvidenceCategory === 'Hope-based') {
    actions.push(createAction(deal, 'hope-based', 'High', 'Clarify', `Confirm next customer action for ${deal.account}`, 'Get a customer-confirmed next action, decision owner, or timeline before defending this deal.', 'Hope-based deals need stronger customer evidence before review.', 'This week'));
  }

  if (deal.decisionRecommendation === 'Rescue') {
    actions.push(createAction(deal, 'rescue', 'High', 'Rescue', `Rescue ${deal.account} this week`, deal.recommendedAction || 'Complete the rescue motion and make the owner and due timing explicit.', 'The deal is marked Rescue and needs action before review.', 'This week'));
  }

  if (deal.decisionRecommendation === 'Downgrade') {
    actions.push(createAction(deal, 'downgrade', 'High', 'Downgrade', `Decide downgrade path for ${deal.account}`, deal.recommendedAction || 'Decide whether to remove this deal from active forecast or define the proof required to keep it.', 'The deal is marked Downgrade and needs a clean review decision.', 'Before pipeline review'));
  }

  if (hasMissingContext) {
    actions.push(createAction(deal, 'missing-context', 'High', 'Clarify', `Clarify decision context for ${deal.account}`, 'Confirm decision maker, budget owner, procurement path, timeline, next customer action, or technical criteria.', 'Missing decision context makes the deal harder to defend.', 'This week'));
  }

  if (deal.forecastEvidenceCategory === 'Weak but recoverable') {
    actions.push(createAction(deal, 'weak-recoverable', 'Medium', 'Collect evidence', `Collect evidence for ${deal.account}`, 'Capture the strongest customer-confirmed evidence that supports the current forecast.', 'Weak but recoverable deals need proof before confidence improves.', 'This week'));
  }

  if (hasWeakEvidence) {
    actions.push(createAction(deal, 'weak-evidence', 'Medium', 'Collect evidence', `Replace weak evidence for ${deal.account}`, 'Replace unclear, waiting, possible, interested, no response, or not confirmed language with customer-confirmed proof.', 'The evidence contains weak or uncertain language.', 'This week'));
  }

  if (hasRiskTypeCleanup) {
    actions.push(createAction(deal, 'risk-type-follow-up', 'Medium', deriveRiskTypeActionType(riskTypeText), `Follow up on risk for ${deal.account}`, 'Turn the risk type into a specific action with owner and due timing.', 'Risk type mentions follow-up, objection, or procurement risk.', 'This week'));
  }

  if (deal.forecastEvidenceCategory === 'Defensible' && deal.missingContext.some(Boolean)) {
    actions.push(createAction(deal, 'defensible-minor-context', 'Low', 'Prepare defense answer', `Polish defense answer for ${deal.account}`, 'Make sure the remaining missing context is named and does not weaken the defense answer.', 'The deal is Defensible but still has minor missing context.', 'Before review'));
  }

  if (deal.forecastEvidenceCategory === 'Defensible' && !actions.some((action) => action.actionType === 'Prepare defense answer')) {
    actions.push(createAction(deal, 'defense-answer', 'Low', 'Prepare defense answer', `Prepare defense answer for ${deal.account}`, 'Keep the confirmed evidence, next customer action, and decision rationale ready for review.', 'Defensible deals still need a crisp review answer.', 'Before review'));
  }

  return dedupeActions(actions);
}

function createAction(
  deal: PipelineDefenseDeal,
  suffix: string,
  priority: ActionPriority,
  actionType: ActionType,
  title: string,
  detail: string,
  reason: string,
  suggestedDueTiming: string,
): PipelineDefenseActionItem {
  return {
    id: `${deal.id}-${suffix}`,
    dealId: deal.id,
    account: deal.account || 'Unknown Account',
    opportunity: deal.opportunity || 'Unknown Opportunity',
    title,
    detail,
    reason,
    priority,
    actionType,
    suggestedOwner: deal.objectionDebt.owner || 'Sales owner',
    suggestedDueTiming,
  };
}

function deriveRiskTypeActionType(riskTypeText: string): ActionType {
  if (riskTypeText.includes('objection')) return 'Resolve objection';
  if (riskTypeText.includes('procurement')) return 'Clarify';
  return 'Follow-up';
}

function dedupeActions(actions: PipelineDefenseActionItem[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.dealId}-${action.actionType}-${action.priority}-${action.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function joinText(items: string[]) {
  return items.filter(Boolean).join(' ').toLowerCase();
}

function containsAny(value: string, terms: string[]) {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}
