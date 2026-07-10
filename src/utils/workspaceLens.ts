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
