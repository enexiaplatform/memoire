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
  estimatedValue?: number | null;
  currency?: string;
  nextActionDate?: string;
  lastSignalDate?: string;
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
  salesOwner: 'Sales owner',
  scope: 'Demo review pipeline',
  pipelinePeriod: 'Current quarter / FY review period',
};

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

export const missingContextLabels = [
  'Decision maker',
  'Decision timeline',
  'Procurement path',
  'Next communication date',
  'Technical evaluation criteria',
  'Budget owner',
];
