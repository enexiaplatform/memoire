import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getFounderWorkspaceState } from '../../features/v31/localStore';

type OnboardingMode = 'welcome' | 'tour';

interface OnboardingPreference {
  onboardingCompleted?: boolean;
  onboardingDismissedAt?: string;
  onboardingSkippedCount?: number;
  dontShowAgain?: boolean;
}

interface TourStep {
  title: string;
  description: string;
  outcome: string;
}

const ONBOARDING_EVENT = 'memoire:replay-onboarding';

const tourSteps: TourStep[] = [
  {
    title: 'Start with Today',
    description: 'Today shows the revenue actions, broken loops, and account memories that need your attention.',
    outcome: 'What should I do today to move revenue forward?',
  },
  {
    title: 'Capture every customer interaction',
    description: 'After a call, meeting, or message, capture a quick note. Memoire can structure it into account memory, blockers, and next actions.',
    outcome: 'Raw notes become usable sales memory.',
  },
  {
    title: 'See your sales memory loop',
    description: 'Journey shows where each account or opportunity is moving, missing context, or broken.',
    outcome: 'Memoire is an end-to-end sales memory loop, not disconnected screens.',
  },
  {
    title: 'Open Living Account Memory',
    description: 'Each account keeps the current story, blockers, notes, contacts, actions, and memory health in one place.',
    outcome: "I don't need to remember every account manually.",
  },
  {
    title: 'Ask with context',
    description: 'Ask Memoire about all memory, a specific account, or a specific opportunity. It answers from your sales context.',
    outcome: 'This is not a generic chatbot. It uses my sales memory.',
  },
];

function readPreference(storageKey: string): OnboardingPreference {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}') as OnboardingPreference;
  } catch {
    return {};
  }
}

function writePreference(storageKey: string, next: OnboardingPreference) {
  localStorage.setItem(storageKey, JSON.stringify(next));
}

export function OnboardingModal() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<OnboardingMode>('welcome');
  const [stepIndex, setStepIndex] = useState(0);

  const storageKey = useMemo(() => {
    const userKey = user?.id || user?.email || 'anonymous';
    return `memoire_onboarding_v1:${userKey}`;
  }, [user?.email, user?.id]);

  const founderWorkspace = isOpen ? getFounderWorkspaceState() : null;

  useEffect(() => {
    if (!user) return;
    const preference = readPreference(storageKey);
    if (!preference.onboardingCompleted && !preference.dontShowAgain) {
      setMode('welcome');
      setStepIndex(0);
      setIsOpen(true);
    }
  }, [storageKey, user]);

  useEffect(() => {
    const replay = () => {
      setMode('tour');
      setStepIndex(0);
      setIsOpen(true);
    };

    window.addEventListener(ONBOARDING_EVENT, replay);
    return () => window.removeEventListener(ONBOARDING_EVENT, replay);
  }, []);

  if (!isOpen || !user) return null;

  const preference = readPreference(storageKey);
  const currentStep = tourSteps[stepIndex];
  const isLastStep = stepIndex === tourSteps.length - 1;

  const skip = () => {
    writePreference(storageKey, {
      ...preference,
      onboardingDismissedAt: new Date().toISOString(),
      onboardingSkippedCount: (preference.onboardingSkippedCount || 0) + 1,
    });
    setIsOpen(false);
  };

  const dontShowAgain = () => {
    writePreference(storageKey, {
      ...preference,
      onboardingCompleted: true,
      dontShowAgain: true,
      onboardingDismissedAt: new Date().toISOString(),
    });
    setIsOpen(false);
  };

  const finish = () => {
    writePreference(storageKey, {
      ...preference,
      onboardingCompleted: true,
      onboardingDismissedAt: new Date().toISOString(),
    });
    setIsOpen(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">
              {mode === 'welcome' ? 'First-Time Setup' : `Step ${stepIndex + 1} of ${tourSteps.length}`}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy">
              {mode === 'welcome' ? 'Welcome to Memoire' : currentStep.title}
            </h2>
            {mode === 'welcome' && (
              <p className="mt-1 text-sm font-semibold text-gray-700">Your personal Sales Memory System.</p>
            )}
          </div>
          <button
            type="button"
            onClick={skip}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Skip onboarding"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === 'welcome' ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-gray-600">
              Memoire helps you capture customer interactions, turn them into account memory and next actions, and ask your sales memory what to do next.
            </p>

            {founderWorkspace && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-900">
                Henry Founder Workspace is loaded. You can start from Today, then open Journey or Account Memory to see real sales data in action.
              </div>
            )}

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Core Loop</p>
              <p className="mt-2 text-sm font-semibold text-navy">
                Capture - Structure - Memory - Opportunity - Action - Ask - Learning
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-2">
              {tourSteps.map((step, index) => (
                <span
                  key={step.title}
                  className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-brand-blue' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-5">
              <p className="text-sm leading-6 text-gray-700">{currentStep.description}</p>
              <div className="mt-4 flex items-start gap-3 rounded-lg bg-white p-4 ring-1 ring-gray-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                <p className="text-sm font-semibold text-navy">{currentStep.outcome}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={mode === 'welcome' ? dontShowAgain : skip}
            className="text-sm font-semibold text-gray-500 hover:text-gray-800"
          >
            {mode === 'welcome' ? "Don't show again" : 'Skip'}
          </button>

          {mode === 'welcome' ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={skip}
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('tour');
                  setStepIndex(0);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
              >
                Start guided tour
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
                disabled={stepIndex === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <button
                type="button"
                onClick={isLastStep ? finish : () => setStepIndex((index) => index + 1)}
                className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
              >
                {isLastStep ? 'Finish' : 'Next'}
                {!isLastStep && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { ONBOARDING_EVENT };
