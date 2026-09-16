/**
 * The Monday that owns the current week, and the weekly prep the operator does
 * before it.
 *
 * `getCurrentPipelineReviewWeekId` is the load-bearing export: Plan, Review and
 * the committed-week strip all date their week from it, so all three agree on
 * which Monday "this week" starts on.
 *
 * The checklist below is smaller than it was. Two of its six steps - generate
 * the Defense Brief, copy the manager summary - could only be completed from
 * the Pipeline Defense brief, and that surface was removed on 2026-09-16. A
 * step nobody can reach is worse than no step: the progress bar would have sat
 * at four of six forever and called the week "In progress" on a week that was
 * finished. The four that remain are all things the operator still does on
 * pages that still exist.
 */
export const PIPELINE_REVIEW_HABIT_STORAGE_KEY = 'memoire.pipelineReviewHabit.v1';
export const PIPELINE_REVIEW_HABIT_UPDATED_EVENT = 'memoire:pipeline-review-habit-updated';

export type PipelineReviewHabitStepKey =
  | 'refreshedPipelineAt'
  | 'capturedUpdatesAt'
  | 'reviewedWeakDealsAt'
  | 'checkedGapsAt';

export type PipelineReviewHabitState = {
  currentWeekId: string;
  refreshedPipelineAt?: string;
  capturedUpdatesAt?: string;
  reviewedWeakDealsAt?: string;
  checkedGapsAt?: string;
  completedAt?: string;
  lastUpdatedAt: string;
};

export type PipelineReviewReadinessStatus =
  | 'Not started'
  | 'In progress'
  | 'Almost ready'
  | 'Review ready';

export type PipelineReviewHabitStep = {
  id: PipelineReviewHabitStepKey;
  label: string;
  description: string;
  href: string;
  cta: string;
  done: boolean;
  completedAt?: string;
};

export type PipelineReviewHabitProgress = {
  state: PipelineReviewHabitState;
  steps: PipelineReviewHabitStep[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  readinessStatus: PipelineReviewReadinessStatus;
  nextStep?: PipelineReviewHabitStep;
};

const STEP_DEFINITIONS: Array<Omit<PipelineReviewHabitStep, 'done' | 'completedAt'>> = [
  {
    id: 'refreshedPipelineAt',
    label: 'Refresh pipeline',
    description: 'Import or refresh this week\'s opportunity data.',
    href: '/app/opportunities',
    cta: 'Open opportunities',
  },
  {
    id: 'capturedUpdatesAt',
    label: 'Capture missing updates',
    description: 'Record the customer signals and follow-ups not yet reflected in the pipeline.',
    href: '/app/capture',
    cta: 'Capture Update',
  },
  {
    id: 'reviewedWeakDealsAt',
    label: 'Review weak deals',
    description: 'Check weak, hope-based, unsupported, rescue, or downgrade deals before review.',
    href: '/app/opportunities',
    cta: 'Review Deals',
  },
  {
    id: 'checkedGapsAt',
    label: 'Check MEDDIC/proof gaps',
    description: 'Confirm buyer, champion, decision process, proof assets, and objection gaps.',
    href: '/app/opportunities',
    cta: 'Check Gaps',
  },
];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentPipelineReviewWeekId = (date = new Date()) => {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = local.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  local.setDate(local.getDate() + mondayOffset);
  return toDateInputValue(local);
};

const createEmptyState = (date = new Date()): PipelineReviewHabitState => ({
  currentWeekId: getCurrentPipelineReviewWeekId(date),
  lastUpdatedAt: date.toISOString(),
});

const canUseStorage = () => typeof window !== 'undefined' && Boolean(window.localStorage);

const normalizeState = (state?: Partial<PipelineReviewHabitState> | null): PipelineReviewHabitState => {
  const now = new Date();
  const currentWeekId = getCurrentPipelineReviewWeekId(now);
  if (!state || state.currentWeekId !== currentWeekId) {
    return createEmptyState(now);
  }

  return {
    currentWeekId,
    refreshedPipelineAt: state.refreshedPipelineAt,
    capturedUpdatesAt: state.capturedUpdatesAt,
    reviewedWeakDealsAt: state.reviewedWeakDealsAt,
    checkedGapsAt: state.checkedGapsAt,
    completedAt: state.completedAt,
    lastUpdatedAt: state.lastUpdatedAt ?? now.toISOString(),
  };
};

export const loadPipelineReviewHabitState = (): PipelineReviewHabitState => {
  if (!canUseStorage()) {
    return createEmptyState();
  }

  try {
    const raw = window.localStorage.getItem(PIPELINE_REVIEW_HABIT_STORAGE_KEY);
    if (!raw) {
      const initial = createEmptyState();
      window.localStorage.setItem(PIPELINE_REVIEW_HABIT_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }

    const parsed = normalizeState(JSON.parse(raw));
    if (parsed.currentWeekId !== JSON.parse(raw).currentWeekId) {
      window.localStorage.setItem(PIPELINE_REVIEW_HABIT_STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return createEmptyState();
  }
};

export const buildPipelineReviewHabitProgress = (
  inputState: PipelineReviewHabitState = loadPipelineReviewHabitState(),
): PipelineReviewHabitProgress => {
  const state = normalizeState(inputState);
  const steps = STEP_DEFINITIONS.map((step) => ({
    ...step,
    done: Boolean(state[step.id]),
    completedAt: state[step.id],
  }));
  const completedCount = steps.filter((step) => step.done).length;
  const totalCount = steps.length;
  const progressPercent = Math.round((completedCount / totalCount) * 100);
  const readinessStatus: PipelineReviewReadinessStatus =
    completedCount === 0
      ? 'Not started'
      : completedCount >= totalCount
        ? 'Review ready'
        : completedCount >= totalCount - 1
          ? 'Almost ready'
          : 'In progress';

  return {
    state,
    steps,
    completedCount,
    totalCount,
    progressPercent,
    readinessStatus,
    nextStep: steps.find((step) => !step.done),
  };
};

const persistPipelineReviewHabitState = (state: PipelineReviewHabitState) => {
  if (!canUseStorage()) {
    return state;
  }

  window.localStorage.setItem(PIPELINE_REVIEW_HABIT_STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(PIPELINE_REVIEW_HABIT_UPDATED_EVENT, { detail: state }));
  return state;
};

export const savePipelineReviewHabitState = (
  state: PipelineReviewHabitState,
): PipelineReviewHabitState => {
  const normalized = normalizeState(state);
  const now = new Date().toISOString();
  const allComplete = STEP_DEFINITIONS.every((step) => Boolean(normalized[step.id]));
  const nextState: PipelineReviewHabitState = {
    ...normalized,
    completedAt: allComplete ? normalized.completedAt ?? now : normalized.completedAt,
    lastUpdatedAt: now,
  };

  return persistPipelineReviewHabitState(nextState);
};

export const markPipelineReviewHabitStepComplete = (
  stepId: PipelineReviewHabitStepKey,
): PipelineReviewHabitState => {
  const state = loadPipelineReviewHabitState();
  const now = new Date().toISOString();
  return savePipelineReviewHabitState({
    ...state,
    [stepId]: state[stepId] ?? now,
    lastUpdatedAt: now,
  });
};

export const resetPipelineReviewHabit = (): PipelineReviewHabitState => {
  return persistPipelineReviewHabitState(createEmptyState());
};
