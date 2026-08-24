/**
 * Whether this person has ever been shown the door into Memoire.
 *
 * Before this existed the answer was "no, and nobody noticed": `OnboardingModal`
 * mounted on every `/app` route with `active: false` and could only be woken by
 * a replay event from Settings, so a brand-new account went straight from the
 * verify-email screen to a Today page of empty modules with no idea what the
 * product wanted from them. The one surviving piece of guidance - the First Week
 * Path strip - only rendered *after* the workspace had records, which is to say
 * only after the hardest step had already been taken alone.
 *
 * The rule here is deliberately two-sided. Seeing the welcome is not enough to
 * retire it, and neither is having records: a workspace with data does not need
 * a welcome even if the flag was never written (someone who imported a CSV
 * before signing in), and an empty workspace should not be dragged back to the
 * welcome every morning after the person chose to skip it. So the decision
 * needs both the stored answer and the state of the workspace, and it is a pure
 * function of the two so the contract can test it without a browser.
 *
 * The stored answer is per account. One browser can hold two logins - the
 * founder's own workspace and a test account is the common case - and a flag
 * without an owner meant the second person to sign in inherited the first
 * person's "already seen this".
 */

export const FIRST_RUN_STORAGE_KEY = 'memoire.firstRun.v1';

/** Which door the person walked through. Recorded to learn from, never to gate. */
export type FirstRunChoice = 'real-work' | 'sample-workspace' | 'import-csv' | 'skipped';

export type FirstRunState = {
  /** Which account answered. A different owner means the answer does not apply. */
  userKey: string;
  startedAt?: string;
  completedAt?: string;
  choice?: FirstRunChoice;
};

/**
 * The account this answer belongs to.
 *
 * Anonymous browser-only sessions share the `local` key on purpose: they have
 * no identity to key on, and they are the same person on the same machine.
 */
export function firstRunUserKey(user?: { id?: string | null; email?: string | null } | null) {
  return user?.id || user?.email || 'local';
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function readFirstRunState(): FirstRunState | null {
  if (!canUseStorage()) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FIRST_RUN_STORAGE_KEY) || 'null') as Partial<FirstRunState> | null;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.userKey !== 'string') return null;
    return {
      userKey: parsed.userKey,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : undefined,
      completedAt: typeof parsed.completedAt === 'string' ? parsed.completedAt : undefined,
      choice: isFirstRunChoice(parsed.choice) ? parsed.choice : undefined,
    };
  } catch {
    return null;
  }
}

function writeFirstRunState(state: FirstRunState): FirstRunState {
  if (canUseStorage()) {
    try {
      window.localStorage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The welcome is guidance, not data. A full quota must never stop someone
      // reaching their workspace - the worst case is being welcomed twice.
    }
  }
  return state;
}

/** Records that the welcome was opened, so a reload mid-flow is not a fresh arrival. */
export function markFirstRunStarted(userKey: string): FirstRunState {
  const existing = readFirstRunState();
  if (existing?.userKey === userKey && existing.startedAt) return existing;
  return writeFirstRunState({ userKey, startedAt: new Date().toISOString() });
}

/** Records the door taken - including the one marked "skipped" - and retires the welcome. */
export function completeFirstRun(userKey: string, choice: FirstRunChoice): FirstRunState {
  const existing = readFirstRunState();
  return writeFirstRunState({
    userKey,
    startedAt: existing?.userKey === userKey ? existing.startedAt : new Date().toISOString(),
    completedAt: new Date().toISOString(),
    choice,
  });
}

/** Settings' "Show me the welcome again". Forgets the answer; the workspace test still applies. */
export function restartFirstRun(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(FIRST_RUN_STORAGE_KEY);
  } catch {
    // See writeFirstRunState.
  }
}

/**
 * Should this arrival be sent to the welcome?
 *
 * Pure, and pure on purpose: this is the decision that can put a redirect in
 * front of the whole product, so it is testable without a DOM.
 *
 * - A workspace with any record has already started; the First Week Path picks
 *   it up from wherever it actually is.
 * - Sample data is somebody looking around, and the sample workspace has its own
 *   guidance. Welcoming them into a workspace that is not theirs teaches the
 *   wrong loop.
 * - An answer from a different account is not an answer.
 */
export function shouldOpenFirstRun(input: {
  userKey: string;
  hasAnyRecord: boolean;
  sampleDataActive: boolean;
  state: FirstRunState | null;
  /**
   * True when the workspace load failed rather than came back empty.
   *
   * The two are indistinguishable downstream - both leave the caller holding
   * no records - and only one of them is a new user. `loadDashboardData`
   * deliberately rejects rather than hand back a partial workspace, so a cloud
   * that does not answer produces exactly the same empty shape as a brand-new
   * account. Today read that shape and sent an operator with twenty-seven deals
   * to "Record it once. Nothing goes quiet after that."
   *
   * A failed load is never a first run.
   */
  loadFailed?: boolean;
}): boolean {
  if (input.loadFailed) return false;
  if (input.hasAnyRecord) return false;
  if (input.sampleDataActive) return false;
  if (input.state?.userKey === input.userKey && input.state.completedAt) return false;
  return true;
}

function isFirstRunChoice(value: unknown): value is FirstRunChoice {
  return value === 'real-work' || value === 'sample-workspace' || value === 'import-csv' || value === 'skipped';
}
