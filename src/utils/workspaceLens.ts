export const workspaceLenses = ['combined', 'b2b', 'solo'] as const;

export type WorkspaceLens = (typeof workspaceLenses)[number];

const LENS_STORAGE_KEY = 'memoire.workspaceLens.v1';
export const WORKSPACE_LENS_CHANGED_EVENT = 'memoire:workspace-lens-changed';

/**
 * Workspace lenses (Commercial OS direction 7.7): one data model, one
 * product - the lens only re-weights emphasis. B2B leads with deals and
 * sales templates; Solo leads with money and whole-business templates;
 * Combined keeps the neutral order. Nothing is hidden and no data changes
 * shape, so switching lenses is always safe.
 */
export function getWorkspaceLens(): WorkspaceLens {
  try {
    if (typeof localStorage === 'undefined') return 'combined';
    const stored = localStorage.getItem(LENS_STORAGE_KEY) as WorkspaceLens | null;
    return stored && workspaceLenses.includes(stored) ? stored : 'combined';
  } catch {
    return 'combined';
  }
}

export function setWorkspaceLens(lens: string) {
  if (!workspaceLenses.includes(lens as WorkspaceLens)) return;
  try {
    localStorage.setItem(LENS_STORAGE_KEY, lens);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(WORKSPACE_LENS_CHANGED_EVENT));
  } catch {
    // Lens preference is best-effort only.
  }
}

export function workspaceLensLabel(lens: WorkspaceLens) {
  return {
    combined: 'Combined commercial',
    b2b: 'B2B sales',
    solo: 'Solo business',
  }[lens];
}

const SOLO_FIRST_TEMPLATE_IDS = ['payment-update', 'delivery-update', 'partnership-discussion', 'content-published', 'experiment-learning'];

/** Reorders capture templates by lens without adding or removing any. */
export function orderTemplatesForLens<T extends { id: string }>(templates: T[], lens: WorkspaceLens): T[] {
  if (lens !== 'solo') return templates;
  const soloFirst = templates.filter((template) => SOLO_FIRST_TEMPLATE_IDS.includes(template.id));
  const rest = templates.filter((template) => !SOLO_FIRST_TEMPLATE_IDS.includes(template.id));
  return [...soloFirst, ...rest];
}

/** Reorders cockpit answers by lens: B2B leads with deals, Solo with money. */
export function orderCockpitForLens<T extends { id: string }>(answers: T[], lens: WorkspaceLens): T[] {
  if (lens !== 'b2b') return answers;
  const deals = answers.filter((answer) => answer.id === 'deals');
  const rest = answers.filter((answer) => answer.id !== 'deals');
  return [...deals, ...rest];
}

const REVIEW_SECTION_ORDER: Record<WorkspaceLens, string[]> = {
  // Neutral order: money first (the pivot's money-spine), priorities last.
  combined: ['money', 'outcomes', 'initiatives', 'signals', 'commitments', 'priorities'],
  // B2B reviews open on deals closed and promises kept - the Monday-review posture.
  b2b: ['outcomes', 'commitments', 'money', 'signals', 'initiatives', 'priorities'],
  // Solo reviews open on where the money sits and which bet stalled.
  solo: ['money', 'initiatives', 'signals', 'outcomes', 'commitments', 'priorities'],
};

/**
 * Reorders Weekly Business Review sections by lens (direction 7.7: review
 * format follows the lens). Same reorder-only guarantee as templates and
 * the cockpit: every section survives, unknown ids keep their relative
 * order after the known ones - a lens can never hide part of the review.
 */
export function orderReviewSectionsForLens<T extends { id: string }>(sections: T[], lens: WorkspaceLens): T[] {
  const order = REVIEW_SECTION_ORDER[lens];
  const known = sections
    .filter((section) => order.includes(section.id))
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const unknown = sections.filter((section) => !order.includes(section.id));
  return [...known, ...unknown];
}

/**
 * Onboarding emphasis per lens (direction 7.7): the guided-workflow welcome
 * speaks the user's language. Copy only - the steps, the data model, and
 * the workflow itself are identical for every lens.
 */
export function onboardingEmphasisForLens(lens: WorkspaceLens): { intro: string; workflowLine: string } {
  return {
    combined: {
      intro: "Memoire is a Personal Business Activity OS used beside CRM, spreadsheets, and notes. Let's walk through Capture → Today → Pipeline Defense.",
      workflowLine: 'Capture first evidence - Review Today - Prepare Pipeline Defense Brief',
    },
    b2b: {
      intro: "Memoire keeps your deals from going quiet between pipeline reviews. Let's walk through Capture → Today → Pipeline Defense.",
      workflowLine: 'Capture a customer touch - Review Today - Defend your pipeline',
    },
    solo: {
      intro: "Memoire keeps your whole commercial motion in one place - conversations, offers, money. Let's walk through Capture → Today → Review.",
      workflowLine: 'Capture what happened - See where the money sits - Know what to do next',
    },
  }[lens];
}
