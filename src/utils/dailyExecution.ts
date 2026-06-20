export const DAILY_EXECUTION_STORAGE_PREFIX = 'memoire.dailyExecution.v1';

export type DailyExecutionStatus = 'Done' | 'Deferred';

export type DailyExecutionDecision = {
  actionId: string;
  status: DailyExecutionStatus;
  updatedAt: string;
};

export type DailyExecutionState = {
  dateKey: string;
  decisions: DailyExecutionDecision[];
};

export function getDailyExecutionDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function createDailyExecutionState(date = new Date()): DailyExecutionState {
  return {
    dateKey: getDailyExecutionDateKey(date),
    decisions: [],
  };
}

export function normalizeDailyExecutionState(
  value: unknown,
  date = new Date(),
): DailyExecutionState {
  const dateKey = getDailyExecutionDateKey(date);
  if (!value || typeof value !== 'object') return createDailyExecutionState(date);
  const candidate = value as Partial<DailyExecutionState>;
  if (candidate.dateKey !== dateKey || !Array.isArray(candidate.decisions)) {
    return createDailyExecutionState(date);
  }

  const decisions = candidate.decisions
    .map(normalizeDecision)
    .filter((decision): decision is DailyExecutionDecision => Boolean(decision))
    .slice(-50);

  return { dateKey, decisions };
}

export function applyDailyExecutionDecision(
  state: DailyExecutionState,
  actionId: string,
  status: DailyExecutionStatus,
  date = new Date(),
): DailyExecutionState {
  const normalized = normalizeDailyExecutionState(state, date);
  const updatedAt = date.toISOString();
  return {
    ...normalized,
    decisions: [
      ...normalized.decisions.filter((decision) => decision.actionId !== actionId),
      { actionId, status, updatedAt },
    ].slice(-50),
  };
}

export function removeDailyExecutionDecision(
  state: DailyExecutionState,
  actionId: string,
  date = new Date(),
): DailyExecutionState {
  const normalized = normalizeDailyExecutionState(state, date);
  return {
    ...normalized,
    decisions: normalized.decisions.filter((decision) => decision.actionId !== actionId),
  };
}

export function loadDailyExecutionState(scope: string, date = new Date()): DailyExecutionState {
  if (!canUseStorage()) return createDailyExecutionState(date);
  const key = getStorageKey(scope);

  try {
    const state = normalizeDailyExecutionState(
      JSON.parse(window.localStorage.getItem(key) || 'null'),
      date,
    );
    window.localStorage.setItem(key, JSON.stringify(state));
    return state;
  } catch {
    return createDailyExecutionState(date);
  }
}

export function saveDailyExecutionDecision(
  scope: string,
  state: DailyExecutionState,
  actionId: string,
  status: DailyExecutionStatus,
  date = new Date(),
) {
  const next = applyDailyExecutionDecision(state, actionId, status, date);
  persistState(scope, next);
  return next;
}

export function clearDailyExecutionDecision(
  scope: string,
  state: DailyExecutionState,
  actionId: string,
  date = new Date(),
) {
  const next = removeDailyExecutionDecision(state, actionId, date);
  persistState(scope, next);
  return next;
}

export function clearDailyExecutionState(scope: string) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(getStorageKey(scope));
  } catch {
    // Daily execution state is convenience-only.
  }
}

function normalizeDecision(value: unknown): DailyExecutionDecision | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DailyExecutionDecision>;
  if (typeof candidate.actionId !== 'string' || !candidate.actionId.trim()) return null;
  if (candidate.status !== 'Done' && candidate.status !== 'Deferred') return null;
  if (typeof candidate.updatedAt !== 'string') return null;
  return {
    actionId: candidate.actionId.trim(),
    status: candidate.status,
    updatedAt: candidate.updatedAt,
  };
}

function getStorageKey(scope: string) {
  const safeScope = scope.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96) || 'guest';
  return `${DAILY_EXECUTION_STORAGE_PREFIX}.${safeScope}`;
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function persistState(scope: string, state: DailyExecutionState) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(getStorageKey(scope), JSON.stringify(state));
  } catch {
    // Daily execution state is convenience-only; source records remain untouched.
  }
}
