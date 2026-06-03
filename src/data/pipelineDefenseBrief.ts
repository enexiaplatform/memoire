export type ForecastEvidenceCategory =
  | 'Defensible'
  | 'Weak but recoverable'
  | 'Hope-based'
  | 'Unsupported';

export type DecisionRecommendation =
  | 'Defend'
  | 'Downgrade'
  | 'Rescue'
  | 'Monitor'
  | 'Deprioritize';

export type ActionType = 'Rescue' | 'Clarify' | 'Downgrade' | 'Follow-up' | 'Collect evidence';

export const forecastEvidenceCategories: ForecastEvidenceCategory[] = [
  'Defensible',
  'Weak but recoverable',
  'Hope-based',
  'Unsupported',
];

export const decisionRecommendations: DecisionRecommendation[] = [
  'Defend',
  'Downgrade',
  'Rescue',
  'Monitor',
  'Deprioritize',
];

export type PipelineDefenseDeal = {
  id: string;
  account: string;
  opportunity: string;
  pipelineContext: string;
  dealTruth: string;
  riskType: string[];
  evidence: string[];
  missingContext: string[];
  objectionDebt: {
    objection: string;
    evidence: string;
    requiredAction: string;
    owner: string;
    status: 'Open' | 'Context gap' | 'Unsupported';
  };
  forecastEvidenceCategory: ForecastEvidenceCategory;
  recommendedAction: string;
  pipelineReviewAnswer: string;
  decisionRecommendation: DecisionRecommendation;
  assumption?: string;
  sourceType?: 'opportunity';
  sourceOpportunityId?: string;
};

export const objectionDebtStatuses: PipelineDefenseDeal['objectionDebt']['status'][] = [
  'Open',
  'Context gap',
  'Unsupported',
];

export type PipelineDefenseAction = {
  id: string;
  type: ActionType;
  account: string;
  opportunity: string;
  action: string;
  whyThisWeek: string;
  owner: string;
};

export type PipelineDefenseQuestion = {
  id: string;
  question: string;
  dealHint?: string;
};

export const pipelineDefenseBriefMeta = {
  week: 'Sample review week',
  salesOwner: 'Henry',
  scope: 'Demo review pipeline',
  pipelinePeriod: 'Current quarter / FY review period',
};

export const pipelineDefenseDeals: PipelineDefenseDeal[] = [
  {
    id: 'orion-apex-validation',
    account: 'Orion Pharma',
    opportunity: 'Orion Pharma / Procurement review',
    pipelineContext: 'Tender / procurement opportunity with unclear procurement timing.',
    dealTruth:
      'The opportunity appears real, but the forecast is not defensible until the tender path, decision owner, and next communication date are confirmed.',
    riskType: ['Tender / procurement unclear', 'Missing decision timeline', 'Missing next communication date'],
    evidence: [
      'Source context indicates tender or procurement pending.',
      'No confirmed next customer action is visible in the sample.',
      'Procurement timing is not clear.',
    ],
    missingContext: ['Decision committee', 'Decision criteria', 'Procurement timeline', 'Budget approval status', 'Next communication date'],
    objectionDebt: {
      objection: 'Tender / procurement uncertainty',
      evidence: 'Tender pending context',
      requiredAction: 'Confirm evaluation timeline, decision criteria, and next communication date.',
      owner: 'Henry',
      status: 'Open',
    },
    forecastEvidenceCategory: 'Hope-based',
    recommendedAction:
      'Rescue by confirming the tender evaluation timeline, committee owner, shortlist date, and any remaining technical or commercial gaps.',
    pipelineReviewAnswer:
      'This deal is hope-based until procurement timing and decision ownership are confirmed. The opportunity is real, but this week I need a tender milestone and next communication date before defending it.',
    decisionRecommendation: 'Rescue',
    assumption: 'Exact tender date and decision committee are not verified in this prototype.',
  },
  {
    id: 'northstar-foods-proposal-review',
    account: 'Northstar Foods',
    opportunity: 'Proposal review',
    pipelineContext: 'Proposal under internal review with explicit customer concerns.',
    dealTruth:
      'Northstar Foods is engaged, but lead time and local support must be addressed before the proposal can move forward.',
    riskType: ['Unresolved technical / service objection', 'Missing decision maker', 'Missing decision timeline'],
    evidence: [
      'Customer concern: lead time and local support.',
      'Requested action: clearer implementation timeline.',
      'Decision owner and decision timing are not confirmed.',
    ],
    missingContext: ['Decision maker', 'Decision timeline', 'Internal review owner', 'Next confirmed customer date'],
    objectionDebt: {
      objection: 'Lead time and local support',
      evidence: 'Customer concern from proposal review context',
      requiredAction: 'Send implementation timeline and local support clarification.',
      owner: 'Henry',
      status: 'Open',
    },
    forecastEvidenceCategory: 'Weak but recoverable',
    recommendedAction:
      'Send the implementation timeline, clarify local support coverage, and ask who owns the final decision and when review will conclude.',
    pipelineReviewAnswer:
      'This deal is weak but recoverable. The customer named specific concerns, but decision ownership and timing are missing. This week I will address lead time and ask for the decision path.',
    decisionRecommendation: 'Rescue',
  },
  {
    id: 'samil-evaluation-follow-up',
    account: 'Samil Pharmaceutical',
    opportunity: 'Demo or evaluation follow-up',
    pipelineContext: 'Strategic account context with unclear next customer action.',
    dealTruth:
      'Samil is a meaningful account, but the current forecast needs stronger proof: evaluation criteria, decision participants, and a confirmed next step.',
    riskType: ['Missing follow-up', 'Missing decision context', 'Missing technical evaluation criteria'],
    evidence: [
      'Strategic account context exists.',
      'Specific next confirmed customer action is not visible in this sample.',
      'Decision criteria are not explicit.',
    ],
    missingContext: ['Decision maker', 'Technical evaluation criteria', 'Next customer action', 'Decision timeline', 'Budget owner'],
    objectionDebt: {
      objection: 'Technical evaluation criteria unclear',
      evidence: 'No explicit criteria in sample',
      requiredAction: 'Ask what proof is required to proceed.',
      owner: 'Henry',
      status: 'Context gap',
    },
    forecastEvidenceCategory: 'Weak but recoverable',
    recommendedAction:
      'Clarify the evaluation criteria, decision participants, and next technical or commercial milestone.',
    pipelineReviewAnswer:
      'This deal is weak but recoverable. Samil is relevant, but I need a confirmed next customer action and evaluation criteria before defending the forecast.',
    decisionRecommendation: 'Monitor',
    assumption: 'The sample does not include a confirmed current demo date or evaluation owner.',
  },
  {
    id: 'stada-pymepharco-strategic',
    account: 'STADA Pymepharco',
    opportunity: 'Strategic account opportunity',
    pipelineContext: 'Key account / strategic opportunity with stakeholder and timing risk.',
    dealTruth:
      'Strategic account importance is not the same as forecast evidence. The deal needs current stakeholder context, timing, and a concrete customer next action.',
    riskType: ['Stakeholder map incomplete', 'Decision timeline missing', 'Next customer action unclear'],
    evidence: [
      'Key account context exists.',
      'Strategic rationale exists.',
      'Current decision path is not explicit in the sample.',
    ],
    missingContext: ['Active decision maker', 'Current stakeholder alignment', 'Decision timeline', 'Procurement path', 'Next customer action'],
    objectionDebt: {
      objection: 'Stakeholder and timing clarity',
      evidence: 'Strategic account context exists, but no current decision path is visible.',
      requiredAction: 'Convert strategic plan into customer-confirmed next action.',
      owner: 'Henry',
      status: 'Context gap',
    },
    forecastEvidenceCategory: 'Weak but recoverable',
    recommendedAction:
      'Collect evidence by confirming active stakeholder ownership, target product scope, decision timing, and next customer milestone.',
    pipelineReviewAnswer:
      'This deal is weak but recoverable. The account is strategic, but I need current customer evidence before defending it.',
    decisionRecommendation: 'Monitor',
  },
  {
    id: 'summit-diagnostics-unclear-next-action',
    account: 'Summit Diagnostics',
    opportunity: 'Unclear technical B2B opportunity',
    pipelineContext: 'Relevant account with unclear current opportunity proof.',
    dealTruth:
      'Summit Diagnostics cannot be defended without a clearer opportunity state, decision path, or confirmed next customer action.',
    riskType: ['Unclear next action', 'Unsupported forecast evidence', 'Missing opportunity context'],
    evidence: [
      'Account is relevant to the sales scope.',
      'No specific current opportunity proof is visible in this sample.',
      'No next customer action is visible.',
    ],
    missingContext: ['Current opportunity', 'Decision maker', 'Decision timeline', 'Customer need', 'Technical blocker', 'Next action'],
    objectionDebt: {
      objection: 'No clear current opportunity proof',
      evidence: 'No current next action visible',
      requiredAction: 'Capture current account status or downgrade.',
      owner: 'Henry',
      status: 'Unsupported',
    },
    forecastEvidenceCategory: 'Unsupported',
    recommendedAction:
      'Downgrade or clarify. Remove from active forecast unless current customer evidence and a next action can be captured this week.',
    pipelineReviewAnswer:
      'This deal is unsupported with the current evidence. I should not defend it as forecastable unless I can capture current opportunity context and a confirmed next action this week.',
    decisionRecommendation: 'Downgrade',
  },
];

export const initialPipelineDefenseBrief = {
  meta: pipelineDefenseBriefMeta,
  deals: pipelineDefenseDeals,
};

export function createInitialPipelineDefenseDeals() {
  return pipelineDefenseDeals.map((deal) => ({
    ...deal,
    riskType: [...deal.riskType],
    evidence: [...deal.evidence],
    missingContext: [...deal.missingContext],
    objectionDebt: { ...deal.objectionDebt },
  }));
}

export const forecastEvidenceDefinitions: Array<{ category: ForecastEvidenceCategory; description: string }> = [
  {
    category: 'Defensible',
    description: 'Recent customer evidence, clear decision ownership, known objection state, and confirmed next customer action.',
  },
  {
    category: 'Weak but recoverable',
    description: 'Real opportunity with useful evidence, but one or two critical gaps must be fixed this week.',
  },
  {
    category: 'Hope-based',
    description: 'Forecast depends on assumption, vague timing, or internal optimism more than customer-confirmed evidence.',
  },
  {
    category: 'Unsupported',
    description: 'No recent customer evidence, no clear next action, or no defendable opportunity context.',
  },
];

export const managerQuestions: PipelineDefenseQuestion[] = [
  { id: 'decision-owner', question: 'Who owns the decision?' },
  { id: 'forecast-evidence', question: 'What evidence supports this forecast?' },
  { id: 'customer-action', question: 'What is the next confirmed customer action?' },
  { id: 'objection-debt', question: 'Which objection is still unpaid?' },
  { id: 'no-response', question: 'What happens if no response this week?' },
  { id: 'procurement-path', question: 'What is the procurement path?' },
  { id: 'technical-proof', question: 'What technical proof does the customer still need?' },
];

export const recommendedPipelineActions: PipelineDefenseAction[] = [
  {
    id: 'action-orion-pharma',
    type: 'Rescue',
    account: 'Orion Pharma',
    opportunity: 'Orion Pharma / Procurement review',
    action: 'Confirm tender timeline, committee owner, and next communication date.',
    whyThisWeek: 'Without this, the forecast remains hope-based.',
    owner: 'Henry',
  },
  {
    id: 'action-northstar-foods',
    type: 'Follow-up',
    account: 'Northstar Foods',
    opportunity: 'Proposal review',
    action: 'Send implementation timeline and ask for decision owner/timing.',
    whyThisWeek: 'The customer raised explicit concerns that can be addressed now.',
    owner: 'Henry',
  },
  {
    id: 'action-samil',
    type: 'Clarify',
    account: 'Samil Pharmaceutical',
    opportunity: 'Demo or evaluation follow-up',
    action: 'Confirm evaluation criteria and next customer action.',
    whyThisWeek: 'Strategic account status needs customer-confirmed evidence.',
    owner: 'Henry',
  },
  {
    id: 'action-pymepharco',
    type: 'Collect evidence',
    account: 'STADA Pymepharco',
    opportunity: 'Strategic account opportunity',
    action: 'Confirm active stakeholder, product scope, and next customer milestone.',
    whyThisWeek: 'Strategic importance alone is not forecast evidence.',
    owner: 'Henry',
  },
  {
    id: 'action-summit-diagnostics',
    type: 'Downgrade',
    account: 'Summit Diagnostics',
    opportunity: 'Unclear technical B2B opportunity',
    action: 'Capture current status or remove from active forecast.',
    whyThisWeek: 'The current evidence is unsupported.',
    owner: 'Henry',
  },
];

export const missingContextLabels = [
  'Decision maker',
  'Decision timeline',
  'Procurement path',
  'Next communication date',
  'Technical evaluation criteria',
  'Budget owner',
];
