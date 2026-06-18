import { trackProductEvent } from './productAnalytics';

export const DEMO_JOURNEY_PROGRESS_KEY = 'memoire.demoJourney.progress';
export const DEMO_JOURNEY_COMPLETED_KEY = 'memoire.demoJourney.completed';
export const DEMO_JOURNEY_UPDATED_EVENT = 'memoire:demo-journey-updated';

export type DemoJourneyStepId = 'review-signals' | 'open-defense' | 'finish-review-pack';

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
    id: 'review-signals',
    title: 'Review pipeline signals',
    description: 'See which sample deals are defensible, weak, stale, or missing evidence before weekly review.',
    href: '/app/dashboard',
    cta: 'Review signals',
  },
  {
    id: 'open-defense',
    title: 'Open Pipeline Defense',
    description: 'Review the manager-ready Defend, Rescue, and Downgrade recommendation built from the sample pipeline.',
    href: '/app/pipeline-defense',
    cta: 'Open Pipeline Defense',
  },
  {
    id: 'finish-review-pack',
    title: 'Take the review output',
    description: 'Copy the Manager Summary or save the Review Pack to complete the demo aha moment.',
    href: '/app/pipeline-defense#manager-summary',
    cta: 'Copy or save output',
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
  const completion = stepId === 'finish-review-pack'
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
  return markDemoJourneyStepComplete('finish-review-pack', reason).completion;
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
