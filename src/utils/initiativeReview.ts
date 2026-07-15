import type { OperatingContextRecord } from '../services/operatingContextStore.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore.ts';
import { classifyInitiativeHealth, type InitiativeHealth } from './proactiveNudges.ts';
import { readInitiativeExperiment, type InitiativeDecision } from './initiativeExperiment.ts';
import { formatSafeBusinessDate } from './safeDate.ts';

export type InitiativeReviewItem = {
  id: string;
  title: string;
  contextType: OperatingContextRecord['contextType'];
  health: InitiativeHealth['status'];
  reason: string;
  hypothesis: string;
  expectedSignal: string;
  currentSignal: string;
  decision: InitiativeDecision;
  nextAction: string;
  nextDate: string;
};

export type InitiativeReview = {
  openCount: number;
  stalled: InitiativeReviewItem[];
  decidedToChange: InitiativeReviewItem[];
  healthy: InitiativeReviewItem[];
};

type InitiativeReviewInput = {
  operatingContexts: OperatingContextRecord[];
  activities: SalesActivityRecord[];
  today?: string;
};

/**
 * The initiative/experiment read-model: where each open initiative stands and
 * why. Health (overdue step / quiet / active) is measured from the activity
 * ledger by the same classifier the nudges and Weekly Review use; the
 * experiment fields (hypothesis, expected/current signal, decision) are read
 * from the operating-context payload. Shared by the Ask Memoire initiative
 * answer; derived, never stored.
 */
export function buildInitiativeReview(input: InitiativeReviewInput): InitiativeReview {
  const items: InitiativeReviewItem[] = [];

  input.operatingContexts.forEach((context) => {
    const health = classifyInitiativeHealth(context, input.activities, input.today);
    if (health.status === 'closed' || !context.title?.trim()) return;
    const experiment = readInitiativeExperiment(context.payload);
    items.push({
      id: context.id,
      title: context.title,
      contextType: context.contextType,
      health: health.status,
      reason: health.status === 'overdue-step'
        ? `Next step dated ${formatSafeBusinessDate(context.nextDate)} has passed.`
        : health.status === 'quiet'
          ? health.lastMention
            ? `No captured activity since ${formatSafeBusinessDate(health.lastMention)}.`
            : 'No captured activity since it was created.'
          : 'Active - captured activity is keeping it alive.',
      hypothesis: experiment.hypothesis,
      expectedSignal: experiment.expectedSignal,
      currentSignal: experiment.currentSignal,
      decision: experiment.decision,
      nextAction: context.nextAction,
      nextDate: context.nextDate,
    });
  });

  const stalled = items.filter((item) => item.health === 'overdue-step' || item.health === 'quiet');
  // Decided to adjust or stop but still open and NOT already stalled: a
  // decision without follow-through is its own loose end. Excluding stalled
  // ones keeps this disjoint from `stalled`, so a single initiative is never
  // listed under both - the same rule the Weekly Review uses.
  const decidedToChange = items.filter((item) => item.health === 'active'
    && (item.decision === 'adjust' || item.decision === 'stop'));
  const healthy = items.filter((item) => item.health === 'active');

  return { openCount: items.length, stalled, decidedToChange, healthy };
}
