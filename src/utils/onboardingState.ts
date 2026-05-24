export const ONBOARDING_STORAGE_KEY = 'memoire.onboarding.v1';

export type OnboardingStep =
  | 'hasSeenWelcome'
  | 'hasCompletedFirstCapture'
  | 'hasCreatedFirstOpportunity'
  | 'hasCreatedFirstAccount'
  | 'hasGeneratedFirstDefenseBrief';

export type OnboardingState = {
  hasSeenWelcome: boolean;
  hasCompletedFirstCapture: boolean;
  hasCreatedFirstOpportunity: boolean;
  hasCreatedFirstAccount: boolean;
  hasGeneratedFirstDefenseBrief: boolean;
  dismissedAt: string;
  updatedAt: string;
};

export const defaultOnboardingState: OnboardingState = {
  hasSeenWelcome: false,
  hasCompletedFirstCapture: false,
  hasCreatedFirstOpportunity: false,
  hasCreatedFirstAccount: false,
  hasGeneratedFirstDefenseBrief: false,
  dismissedAt: '',
  updatedAt: '',
};

export function loadOnboardingState(): OnboardingState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return makeState();
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return makeState();
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return normalizeOnboardingState(parsed);
  } catch {
    return makeState();
  }
}

export function saveOnboardingState(state: OnboardingState) {
  const next = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  try {
    if (typeof window === 'undefined' || !window.localStorage) return next;
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Onboarding is guidance only. Ignore storage errors.
  }

  return next;
}

export function markOnboardingStepComplete(step: OnboardingStep) {
  const current = loadOnboardingState();
  return saveOnboardingState({
    ...current,
    [step]: true,
  });
}

export function dismissOnboarding() {
  const current = loadOnboardingState();
  return saveOnboardingState({
    ...current,
    dismissedAt: new Date().toISOString(),
  });
}

export function resetOnboarding() {
  const next = makeState();
  saveOnboardingState(next);
  return next;
}

function normalizeOnboardingState(value: Partial<OnboardingState>) {
  return {
    hasSeenWelcome: Boolean(value.hasSeenWelcome),
    hasCompletedFirstCapture: Boolean(value.hasCompletedFirstCapture),
    hasCreatedFirstOpportunity: Boolean(value.hasCreatedFirstOpportunity),
    hasCreatedFirstAccount: Boolean(value.hasCreatedFirstAccount),
    hasGeneratedFirstDefenseBrief: Boolean(value.hasGeneratedFirstDefenseBrief),
    dismissedAt: typeof value.dismissedAt === 'string' ? value.dismissedAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  };
}

function makeState() {
  return {
    ...defaultOnboardingState,
    updatedAt: new Date().toISOString(),
  };
}
