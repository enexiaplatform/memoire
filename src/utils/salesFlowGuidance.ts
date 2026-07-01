import type { CrmLiteOpportunity, OpportunityStage } from '../services/opportunityStore';
import { sanitizeBusinessDate } from './safeDate.ts';

export type SalesFlowCheckpointStatus = 'Needs action' | 'Ready to advance' | 'Completed' | 'Paused' | 'Closed';

export type SalesFlowStep = {
  id: string;
  label: string;
  outcome: string;
};

export type OpportunitySalesFlowGuidance = {
  step: SalesFlowStep;
  stepIndex: number;
  totalSteps: number;
  progressPercent: number;
  status: SalesFlowCheckpointStatus;
  missingCheckpoints: string[];
  suggestedAction: string;
  reason: string;
  nextStepLabel: string;
};

export const salesFlowSteps: SalesFlowStep[] = [
  { id: 'lead', label: 'Lead', outcome: 'A relevant account and first customer conversation are identified.' },
  { id: 'discovery', label: 'Discovery', outcome: 'The customer problem, impact, and decision owner are understood.' },
  { id: 'qualification', label: 'Qualification', outcome: 'Value, budget ownership, timing, and fit are credible.' },
  { id: 'validation', label: 'Technical validation', outcome: 'Success criteria, proof, and validation ownership are agreed.' },
  { id: 'proposal', label: 'Proposal', outcome: 'Scope, commercial assumptions, and the approval milestone are confirmed.' },
  { id: 'negotiation', label: 'Negotiation', outcome: 'Open objections and decision terms have an owner and resolution path.' },
  { id: 'procurement', label: 'Procurement', outcome: 'Procurement steps, owner, and expected PO date are confirmed.' },
  { id: 'handoff', label: 'PO / Handoff', outcome: 'The order is handed to delivery and payment follow-up with clear ownership.' },
];

const stageToStepId: Record<OpportunityStage, string> = {
  Lead: 'lead',
  Discovery: 'discovery',
  Qualification: 'qualification',
  'Technical discussion': 'validation',
  Demo: 'validation',
  Proposal: 'proposal',
  Negotiation: 'negotiation',
  Procurement: 'procurement',
  Won: 'handoff',
  Lost: 'handoff',
  'On hold': 'qualification',
};

export function buildOpportunitySalesFlowGuidance(opportunity: CrmLiteOpportunity): OpportunitySalesFlowGuidance {
  const stepIndex = Math.max(0, salesFlowSteps.findIndex((step) => step.id === stageToStepId[opportunity.stage]));
  const step = salesFlowSteps[stepIndex];
  const missingCheckpoints = getMissingCheckpoints(opportunity, step.id);
  const nextStepLabel = salesFlowSteps[stepIndex + 1]?.label || 'Delivery and payment follow-up';
  const status = getCheckpointStatus(opportunity, missingCheckpoints);
  const suggestedAction = getSuggestedAction(opportunity, step.id, missingCheckpoints);
  const reason = buildReason(step, missingCheckpoints, nextStepLabel, status);

  return {
    step,
    stepIndex,
    totalSteps: salesFlowSteps.length,
    progressPercent: Math.round(((stepIndex + 1) / salesFlowSteps.length) * 100),
    status,
    missingCheckpoints,
    suggestedAction,
    reason,
    nextStepLabel,
  };
}

function getMissingCheckpoints(opportunity: CrmLiteOpportunity, stepId: string) {
  const missing: string[] = [];
  const hasValue = Boolean(opportunity.estimatedValue || opportunity.fy26Value || opportunity.fy27Value);
  const nextActionDate = sanitizeBusinessDate(opportunity.nextActionDate);
  const require = (value: unknown, label: string) => {
    if (typeof value === 'string' ? !value.trim() : !value) missing.push(label);
  };

  if (opportunity.isStageInferred) missing.push('confirmed current stage');

  if (stepId === 'lead') {
    require(opportunity.accountName, 'target account');
    require(opportunity.nextAction, 'discovery action');
    require(nextActionDate, 'action date');
  }

  if (stepId === 'discovery') {
    require(opportunity.evidence, 'customer problem or buying signal');
    require(opportunity.decisionMaker, 'decision owner');
    require(opportunity.technicalCriteria, 'success criteria');
  }

  if (stepId === 'qualification') {
    if (!hasValue) missing.push('credible deal value');
    require(opportunity.budgetOwner, 'budget owner');
    require(opportunity.expectedClosePeriod, 'decision timing');
    require(opportunity.evidence, 'qualification evidence');
  }

  if (stepId === 'validation') {
    require(opportunity.technicalCriteria, 'validation criteria');
    require(opportunity.evidence, 'validation proof');
    require(nextActionDate, 'validation milestone date');
  }

  if (stepId === 'proposal') {
    if (!hasValue) missing.push('proposal value');
    require(opportunity.decisionMaker, 'approval owner');
    require(opportunity.budgetOwner, 'budget owner');
    require(nextActionDate, 'approval milestone date');
  }

  if (stepId === 'negotiation') {
    if (opportunity.objectionDebt.trim()) missing.push('open objection resolution');
    require(opportunity.decisionMaker, 'final decision owner');
    require(opportunity.procurementPath, 'procurement route');
    require(nextActionDate, 'decision date');
  }

  if (stepId === 'procurement') {
    require(opportunity.procurementPath, 'procurement steps and owner');
    require(opportunity.budgetOwner, 'commercial approval owner');
    require(opportunity.expectedClosePeriod, 'expected PO timing');
    require(nextActionDate, 'next procurement checkpoint');
  }

  if (stepId === 'handoff') {
    require(opportunity.nextAction, 'delivery or payment handoff');
    require(nextActionDate, 'handoff date');
  }

  return missing;
}

function getCheckpointStatus(opportunity: CrmLiteOpportunity, missing: string[]): SalesFlowCheckpointStatus {
  if (opportunity.status === 'Lost' || opportunity.stage === 'Lost') return 'Closed';
  if (opportunity.status === 'On hold' || opportunity.stage === 'On hold') return 'Paused';
  if (opportunity.status === 'Won' || opportunity.stage === 'Won') return missing.length ? 'Needs action' : 'Completed';
  return missing.length ? 'Needs action' : 'Ready to advance';
}

function getSuggestedAction(opportunity: CrmLiteOpportunity, stepId: string, missing: string[]) {
  if (opportunity.status === 'Lost' || opportunity.stage === 'Lost') return 'Capture the loss reason and reusable lesson.';
  if (opportunity.status === 'On hold' || opportunity.stage === 'On hold') return 'Confirm the reactivation trigger, owner, and review date.';
  if (opportunity.isStageInferred) return 'Confirm the current stage and latest customer milestone.';
  if (stepId === 'handoff') return 'Confirm delivery, payment, and customer handoff ownership.';
  if (missing.length === 0) return `Confirm the checkpoint outcome with the customer and move to the next stage.`;

  const firstGap = missing[0];
  const actions: Record<string, string> = {
    lead: 'Book discovery and confirm the customer priority.',
    discovery: firstGap.includes('decision')
      ? 'Identify the customer sponsor and decision owner.'
      : 'Capture the customer problem, impact, and success criteria.',
    qualification: firstGap.includes('budget') || firstGap.includes('value')
      ? 'Confirm business value, budget ownership, and buying urgency.'
      : 'Confirm decision timing and qualification evidence.',
    validation: 'Agree validation criteria, proof owner, and completion date.',
    proposal: 'Confirm proposal scope, approval owner, and decision date.',
    negotiation: firstGap.includes('objection')
      ? 'Resolve the highest-impact objection with proof and an owner.'
      : 'Confirm final decision terms and the route into procurement.',
    procurement: 'Confirm procurement owner, required steps, and expected PO date.',
  };

  return actions[stepId] || 'Set a dated, customer-confirmed next action.';
}

function buildReason(
  step: SalesFlowStep,
  missing: string[],
  nextStepLabel: string,
  status: SalesFlowCheckpointStatus,
) {
  if (status === 'Closed') return 'The deal is closed. Preserve the reason and lesson before leaving the flow.';
  if (status === 'Paused') return 'The deal is paused. Keep a dated reactivation trigger instead of an open-ended follow-up.';
  if (status === 'Completed') return 'Commercial commitment is recorded; keep delivery and payment ownership visible.';
  if (missing.length > 0) return `Before advancing, confirm ${missing.slice(0, 2).join(' and ')}${missing.length > 2 ? `, plus ${missing.length - 2} more` : ''}.`;
  return `${step.outcome} The deal is ready to move toward ${nextStepLabel}.`;
}
