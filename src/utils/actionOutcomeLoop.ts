import type { ActionOutcomeRecord } from '../services/actionOutcomeStore';
import { todayDateKey } from './safeDate.ts';
import { actionOutcomeMatchesAction, getActionOutcomesForOpportunity } from '../services/actionOutcomeStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { ObjectionRecord } from '../services/objectionStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { StakeholderRecord } from '../services/stakeholderStore';
import { generateOpportunityActionPlan, type OpportunityRecommendedAction } from './opportunityActionPlan';

export type ActionOutcomeSignal = {
  id: string;
  label: string;
  tone: 'green' | 'amber' | 'red' | 'blue' | 'gray';
  detail: string;
};

export type OpportunityOutcomeLoopAnalysis = {
  latestCompletedActions: ActionOutcomeRecord[];
  dismissedActions: ActionOutcomeRecord[];
  unresolvedCriticalActions: OpportunityRecommendedAction[];
  staleActions: OpportunityRecommendedAction[];
  improvedSignals: ActionOutcomeSignal[];
  worsenedSignals: ActionOutcomeSignal[];
  unclearSignals: ActionOutcomeSignal[];
  dealNeedsReview: boolean;
  lastActionOutcome?: ActionOutcomeRecord;
  lastActionOutcomeSummary: string;
};

export function analyzeOpportunityOutcomeLoop(input: {
  opportunity: CrmLiteOpportunity;
  recommendedActions?: OpportunityRecommendedAction[];
  outcomes?: ActionOutcomeRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}): OpportunityOutcomeLoopAnalysis {
  const recommendedActions = input.recommendedActions || generateOpportunityActionPlan({
    opportunity: input.opportunity,
    stakeholders: input.stakeholders || [],
    objections: input.objections || [],
    activities: input.activities || [],
  });
  const opportunityOutcomes = getActionOutcomesForOpportunity(input.outcomes || [], input.opportunity);
  const activeOutcomes = opportunityOutcomes.filter((outcome) => outcome.status !== 'Dismissed');
  const completed = activeOutcomes.filter((outcome) => outcome.status === 'Done').sort(byUpdatedDesc);
  const dismissed = opportunityOutcomes.filter((outcome) => outcome.status === 'Dismissed').sort(byUpdatedDesc);
  const unresolvedCriticalActions = recommendedActions
    .filter((action) => action.priority === 'High')
    .filter((action) => !opportunityOutcomes.some((outcome) => actionOutcomeMatchesAction(outcome, action) && ['Done', 'Dismissed'].includes(outcome.status)))
    .slice(0, 5);
  const staleActions = recommendedActions
    .filter((action) => action.suggestedDueDate && action.suggestedDueDate < todayKey())
    .filter((action) => !opportunityOutcomes.some((outcome) => actionOutcomeMatchesAction(outcome, action) && ['Done', 'Dismissed'].includes(outcome.status)))
    .slice(0, 5);

  const improvedSignals = completed
    .filter((outcome) => ['Improved', 'Resolved'].includes(outcome.outcomeType))
    .map((outcome) => outcomeToSignal(outcome, 'green'));
  const worsenedSignals = completed
    .filter((outcome) => ['Worsened', 'Downgrade recommended'].includes(outcome.outcomeType))
    .map((outcome) => outcomeToSignal(outcome, 'red'));
  const unclearSignals = completed
    .filter((outcome) => ['Still unclear', 'No change'].includes(outcome.outcomeType))
    .map((outcome) => outcomeToSignal(outcome, 'amber'));
  const lastActionOutcome = opportunityOutcomes[0];

  return {
    latestCompletedActions: completed.slice(0, 5),
    dismissedActions: dismissed.slice(0, 5),
    unresolvedCriticalActions,
    staleActions,
    improvedSignals,
    worsenedSignals,
    unclearSignals,
    dealNeedsReview: unresolvedCriticalActions.length > 0 || staleActions.length > 0 || worsenedSignals.length > 0 || unclearSignals.length > 1,
    lastActionOutcome,
    lastActionOutcomeSummary: lastActionOutcome ? summarizeActionOutcome(lastActionOutcome) : 'No action outcome has been captured yet.',
  };
}

export function analyzePipelineOutcomeLoop(input: {
  opportunities: CrmLiteOpportunity[];
  outcomes?: ActionOutcomeRecord[];
  stakeholders?: StakeholderRecord[];
  objections?: ObjectionRecord[];
  activities?: SalesActivityRecord[];
}) {
  const analyses = input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .map((opportunity) => ({
      opportunity,
      analysis: analyzeOpportunityOutcomeLoop({
        opportunity,
        outcomes: input.outcomes || [],
        stakeholders: input.stakeholders || [],
        objections: input.objections || [],
        activities: input.activities || [],
      }),
    }));

  const unresolvedCriticalActions = analyses.flatMap(({ analysis }) => analysis.unresolvedCriticalActions).slice(0, 8);
  const latestCompletedActions = analyses.flatMap(({ analysis }) => analysis.latestCompletedActions).sort(byUpdatedDesc).slice(0, 8);
  const negativeOrUnclearOutcomes = latestCompletedActions
    .filter((outcome) => ['Worsened', 'Still unclear', 'No change', 'Downgrade recommended'].includes(outcome.outcomeType))
    .slice(0, 8);

  return {
    analyses,
    unresolvedCriticalActions,
    latestCompletedActions,
    negativeOrUnclearOutcomes,
    dealsNeedingReview: analyses.filter(({ analysis }) => analysis.dealNeedsReview).length,
  };
}

export function getActionOutcomesInPeriod(outcomes: ActionOutcomeRecord[], period: { start: string; end: string }) {
  return outcomes.filter((outcome) => {
    const completed = outcome.completedAt || '';
    const updated = outcome.updatedAt.slice(0, 10);
    const created = outcome.createdAt.slice(0, 10);
    return isInRange(completed, period) || isInRange(updated, period) || isInRange(created, period);
  });
}

export function summarizeActionOutcome(outcome: ActionOutcomeRecord) {
  const date = outcome.completedAt || outcome.updatedAt.slice(0, 10);
  const note = outcome.outcomeNote ? ` ${outcome.outcomeNote}` : '';
  return `${date}: ${outcome.actionTitle} - ${outcome.outcomeType}.${note}`.trim();
}

export function formatActionOutcomeForBrief(outcomes: ActionOutcomeRecord[], opportunity: CrmLiteOpportunity) {
  const latest = getActionOutcomesForOpportunity(outcomes, opportunity)[0];
  return latest ? `Last action outcome:\n- ${summarizeActionOutcome(latest)}` : '';
}

function outcomeToSignal(outcome: ActionOutcomeRecord, tone: ActionOutcomeSignal['tone']): ActionOutcomeSignal {
  return {
    id: outcome.id,
    label: outcome.outcomeType,
    tone,
    detail: `${outcome.accountName} / ${outcome.opportunityName}: ${outcome.actionTitle}${outcome.outcomeNote ? ` - ${outcome.outcomeNote}` : ''}`,
  };
}

function isInRange(value: string, period: { start: string; end: string }) {
  return Boolean(value && value >= period.start && value <= period.end);
}

function byUpdatedDesc(a: ActionOutcomeRecord, b: ActionOutcomeRecord) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function todayKey() {
  return todayDateKey();
}
