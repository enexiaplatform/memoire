export const DEMO_JOURNEY_COMPLETED_KEY = 'memoire.demoJourney.completed';
export const DEMO_JOURNEY_UPDATED_EVENT = 'memoire:demo-journey-updated';

export type DemoJourneyCompletion = {
  completedAt: string;
  reason: string;
};

export type DemoJourneyStep = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

export const demoJourneySteps: DemoJourneyStep[] = [
  {
    title: 'Review Dashboard signals',
    description: 'See the command center story: weak deals, objections, asset gaps, and this week review readiness.',
    href: '/app/dashboard',
    cta: 'Open Dashboard',
  },
  {
    title: 'Open Opportunities',
    description: 'Inspect a weak recoverable deal with MEDDIC gaps, stakeholders, objections, and recommended actions.',
    href: '/app/opportunities',
    cta: 'Open Opportunities',
  },
  {
    title: 'Capture a quick update',
    description: 'Add a sales note and see how Memoire extracts account, stakeholder, next actions, and risks.',
    href: '/app/capture',
    cta: 'Open Capture',
  },
  {
    title: 'Generate Pipeline Defense Brief',
    description: 'Open Pipeline Defense to see Defend, Rescue, and Downgrade recommendations for review.',
    href: '/app/pipeline-defense',
    cta: 'Open Pipeline Defense',
  },
  {
    title: 'Copy Manager Summary',
    description: 'Copy the manager-ready review summary for the weekly pipeline conversation.',
    href: '/app/pipeline-defense',
    cta: 'Copy in Pipeline Defense',
  },
  {
    title: 'Save Review Pack',
    description: 'Save the weekly review snapshot as your personal sales memory.',
    href: '/app/pipeline-defense',
    cta: 'Save Review Pack',
  },
];

export function getDemoJourneyCompletion(): DemoJourneyCompletion | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DEMO_JOURNEY_COMPLETED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DemoJourneyCompletion>;
    if (!parsed.completedAt || !parsed.reason) return null;
    return {
      completedAt: parsed.completedAt,
      reason: parsed.reason,
    };
  } catch {
    return null;
  }
}

export function markDemoJourneyComplete(reason: string) {
  if (typeof window === 'undefined') return null;

  const completion: DemoJourneyCompletion = {
    completedAt: new Date().toISOString(),
    reason,
  };

  try {
    window.localStorage.setItem(DEMO_JOURNEY_COMPLETED_KEY, JSON.stringify(completion));
    window.dispatchEvent(new CustomEvent(DEMO_JOURNEY_UPDATED_EVENT));
  } catch {
    // Demo completion is a local helper only.
  }

  return completion;
}

export function clearDemoJourneyCompletion() {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(DEMO_JOURNEY_COMPLETED_KEY);
    window.dispatchEvent(new CustomEvent(DEMO_JOURNEY_UPDATED_EVENT));
  } catch {
    // Ignore local cleanup failures.
  }
}
