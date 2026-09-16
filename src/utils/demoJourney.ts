import { trackProductEvent } from './productAnalytics';

export const DEMO_JOURNEY_PROGRESS_KEY = 'memoire.demoJourney.progress';
export const DEMO_JOURNEY_COMPLETED_KEY = 'memoire.demoJourney.completed';
export const DEMO_JOURNEY_UPDATED_EVENT = 'memoire:demo-journey-updated';

export type DemoJourneyStepId = 'review-today' | 'paste-evidence' | 'record-the-week' | 'finish-review';

/**
 * The demo's route to its point, in one line.
 *
 * This sentence used to live in the guided-workflow modal, which was the only
 * place the demo's shape was written down in words rather than as four step
 * records. That modal was dead code - it mounted inactive and could only be
 * woken from Settings - and deleting it took the sentence with it. It belongs
 * here, beside the steps it describes, and it is rendered on the demo card so
 * it is a promise to a reader rather than a string kept alive for a contract.
 */
export const DEMO_JOURNEY_PATH_SUMMARY = 'Today - Capture - Plan - Review';

/**
 * The last two steps used to be "Open Pipeline Defense" and "Copy the Manager
 * Summary", and both of them stopped being reachable when that surface was
 * removed on 2026-09-16. A demo that cannot finish is worse than a shorter one:
 * the card would have sat at two of four for the length of the sandbox and
 * `demo_completed` would never have fired again. The four steps now walk the
 * loop the product actually runs - see the day, record what was said, promise
 * the week, close it - and each of them is completed by doing the thing, on a
 * page that exists.
 */

export type DemoJourneyCompletion = {
  completedAt: string;
  reason: string;
};

export type DemoJourneyProgress = {
  completedStepIds: DemoJourneyStepId[];
  completion: DemoJourneyCompletion | null;
};

export type DemoJourneyStep = {
  id: DemoJourneyStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
};

export const demoJourneySteps: DemoJourneyStep[] = [
  {
    id: 'review-today',
    title: 'Open Today',
    description: 'See Top 3 actions, proactive nudges, overdue follow-ups, and missing evidence before Monday pipeline review.',
    href: '/app/today',
    cta: 'Open Today',
  },
  {
    id: 'paste-evidence',
    title: 'Paste sales evidence',
    description: 'Use Capture as evidence input: paste a note or email thread, then confirm account, contact, opportunity, next action, and due date.',
    href: '/app/capture?mode=email',
    cta: 'Paste email/thread',
  },
  {
    id: 'record-the-week',
    title: 'Finish something on the Plan',
    description: "Tick a promise on this week's board and record what actually happened - who you spoke to and what was said.",
    href: '/app/timeline',
    cta: 'Open the Plan',
  },
  {
    id: 'finish-review',
    title: 'Close the week',
    description: 'Confirm what you commit to next week. That is the review: the week has an owner and a written answer.',
    href: '/app/reviews',
    cta: 'Open Review',
  },
];

const demoJourneyStepIds = new Set<DemoJourneyStepId>(demoJourneySteps.map((step) => step.id));

export function getDemoJourneyProgress(): DemoJourneyProgress {
  if (typeof window === 'undefined') return { completedStepIds: [], completion: null };

  try {
    const raw = window.localStorage.getItem(DEMO_JOURNEY_PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DemoJourneyProgress>;
      const completedStepIds = Array.isArray(parsed.completedStepIds)
        ? parsed.completedStepIds.filter((id): id is DemoJourneyStepId => demoJourneyStepIds.has(id as DemoJourneyStepId))
        : [];
      return {
        completedStepIds,
        completion: normalizeCompletion(parsed.completion),
      };
    }
  } catch {
    // Fall through to the legacy completion marker.
  }

  const legacyCompletion = getLegacyDemoJourneyCompletion();
  return legacyCompletion
    ? { completedStepIds: demoJourneySteps.map((step) => step.id), completion: legacyCompletion }
    : { completedStepIds: [], completion: null };
}

export function getDemoJourneyCompletion(): DemoJourneyCompletion | null {
  return getDemoJourneyProgress().completion;
}

export function markDemoJourneyStepComplete(stepId: DemoJourneyStepId, reason: string) {
  if (typeof window === 'undefined') return getDemoJourneyProgress();

  const current = getDemoJourneyProgress();
  const completedStepIds = current.completedStepIds.includes(stepId)
    ? current.completedStepIds
    : [...current.completedStepIds, stepId];
  const completion = stepId === 'finish-review'
    ? current.completion || { completedAt: new Date().toISOString(), reason }
    : current.completion;
  const progress = { completedStepIds, completion };

  try {
    window.localStorage.setItem(DEMO_JOURNEY_PROGRESS_KEY, JSON.stringify(progress));
    if (completion) {
      window.localStorage.setItem(DEMO_JOURNEY_COMPLETED_KEY, JSON.stringify(completion));
    }
    window.dispatchEvent(new CustomEvent(DEMO_JOURNEY_UPDATED_EVENT));
  } catch {
    // Demo progress is a local helper only.
  }

  if (!current.completion && completion) {
    trackProductEvent('demo_completed', 'demo-local');
  }

  return progress;
}

export function markDemoJourneyComplete(reason: string) {
  return markDemoJourneyStepComplete('finish-review', reason).completion;
}

function getLegacyDemoJourneyCompletion(): DemoJourneyCompletion | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DEMO_JOURNEY_COMPLETED_KEY);
    if (!raw) return null;
    return normalizeCompletion(JSON.parse(raw) as Partial<DemoJourneyCompletion>);
  } catch {
    return null;
  }
}

function normalizeCompletion(value: Partial<DemoJourneyCompletion> | null | undefined) {
  if (!value?.completedAt || !value.reason) return null;
  return {
    completedAt: value.completedAt,
    reason: value.reason,
  };
}

export function clearDemoJourneyCompletion() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(DEMO_JOURNEY_PROGRESS_KEY);
    window.localStorage.removeItem(DEMO_JOURNEY_COMPLETED_KEY);
    window.dispatchEvent(new CustomEvent(DEMO_JOURNEY_UPDATED_EVENT));
  } catch {
    // Ignore local cleanup failures.
  }
}
