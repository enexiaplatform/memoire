import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { PipelineDefenseBrief } from './pipelineDefenseStorage';

export type FirstWeekStepId = 'capture' | 'organize' | 'review';

export type FirstWeekStep = {
  id: FirstWeekStepId;
  label: string;
  hint: string;
  href: string;
  cta: string;
  done: boolean;
};

export type FirstWeekPath = {
  steps: FirstWeekStep[];
  done: number;
  total: number;
  complete: boolean;
  nextStep: FirstWeekStep | null;
};

/**
 * The three commercial-loop milestones a new operator needs to establish, in
 * order: capture something, give it a deal to belong to, turn it into a review.
 * Purely derived from workspace data already loaded - no stored progress, no new
 * data entry. The strip that renders this folds away for good once all three are
 * true (`complete`), so it only ever guides a workspace that has not yet closed
 * the loop. Money-spine: every step moves the activity toward a money position.
 */
export function buildFirstWeekPath(input: {
  activities: SalesActivityRecord[];
  opportunities: CrmLiteOpportunity[];
  briefs: PipelineDefenseBrief[];
}): FirstWeekPath {
  const captured = input.activities.length > 0;
  const organized = input.opportunities.length > 0;
  // The starter brief is a template (isSample) - only a real brief with deals
  // counts as a prepared review, the same rule Today uses for meaningful data.
  const reviewed = input.briefs.some((brief) => !brief.isSample && brief.deals.length > 0);

  const steps: FirstWeekStep[] = [
    {
      id: 'capture',
      label: 'Capture an activity',
      hint: 'Paste a note or an email so Memoire has something to watch.',
      href: '/app/capture',
      cta: 'Capture',
      done: captured,
    },
    {
      id: 'organize',
      label: 'Give it a deal to belong to',
      hint: 'Attach it to an opportunity so the money has a home.',
      href: '/app/opportunities',
      cta: 'Open deals',
      done: organized,
    },
    {
      id: 'review',
      label: 'Prepare your first review',
      hint: 'Turn the pipeline into a manager-ready defense brief.',
      href: '/app/pipeline-defense',
      cta: 'Open Pipeline Defense',
      done: reviewed,
    },
  ];

  const done = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || null;

  return {
    steps,
    done,
    total: steps.length,
    complete: done === steps.length,
    nextStep,
  };
}
