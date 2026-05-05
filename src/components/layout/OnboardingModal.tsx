import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getFounderWorkspaceState, readLocalMemory } from '../../features/v31/localStore';
import {
  CAPTURE_SAVED_EVENT,
  CAPTURE_STRUCTURED_EVENT,
  ASK_ANSWER_READY_EVENT,
  ASK_GUIDED_QUESTION_EVENT,
  FOLLOWUP_DRAFT_READY_EVENT,
  GUIDED_WORKFLOW_SAMPLE_NOTE,
  REPLAY_GUIDED_WORKFLOW_EVENT,
  USE_SAMPLE_NOTE_EVENT,
  type GuidedCaptureSavedDetail,
  type GuidedWorkflowPreference,
  type GuidedWorkflowState,
  type GuidedWorkflowStep,
} from '../../features/onboarding/guidedWorkflow';

type WorkflowMode = 'welcome' | 'workflow';

interface WorkflowStepConfig {
  step: GuidedWorkflowStep;
  title: string;
  instruction: string;
  why: string;
  route?: string;
  primaryLabel: string;
}

const standardSteps: WorkflowStepConfig[] = [
  {
    step: 'capture',
    title: 'Capture',
    instruction: 'Start by capturing what happened with a customer.',
    why: 'Raw notes become usable Sales Memory only after Memoire has the interaction.',
    route: '/app/today',
    primaryLabel: 'Use sample note',
  },
  {
    step: 'structure',
    title: 'Structure',
    instruction: 'Structure the raw note into account memory, blocker, and next action.',
    why: 'This turns one conversation into objects Memoire can remember and use.',
    route: '/app/today',
    primaryLabel: 'I structured it',
  },
  {
    step: 'review_preview',
    title: 'Review Preview',
    instruction: 'Review what Memoire extracted before saving.',
    why: 'You stay in control of the Account, Contact, Blocker, Next Action, and Missing Context.',
    route: '/app/today',
    primaryLabel: 'Continue',
  },
  {
    step: 'save_memory',
    title: 'Save to Sales Memory',
    instruction: 'Save this interaction so it becomes part of Account Memory and can create a Next Action.',
    why: 'This closes the loop from customer interaction to usable memory.',
    route: '/app/today',
    primaryLabel: 'I saved it',
  },
  {
    step: 'open_account_memory',
    title: 'Open Account Memory',
    instruction: 'This is Living Account Memory: account story, last interaction, blockers, and next action.',
    why: 'Before a follow-up, you can recall the customer context without rebuilding it from memory.',
    primaryLabel: 'Open Account Memory',
  },
  {
    step: 'ask_account',
    title: 'Ask about this Account',
    instruction: 'Ask Memoire using this account context.',
    why: 'Ask Memoire should answer from selected Sales Memory, not like a generic chatbot.',
    primaryLabel: 'Ask: What should I do next?',
  },
  {
    step: 'draft_followup',
    title: 'Draft Follow-up',
    instruction: 'Turn account memory into a follow-up message.',
    why: 'A remembered customer story should become concrete sales action.',
    primaryLabel: 'I generated a draft',
  },
  {
    step: 'finish',
    title: 'Finish',
    instruction: 'You completed your first Sales Memory Loop.',
    why: 'One customer interaction became Account Memory, blocker context, Next Action, askable knowledge, and a follow-up draft.',
    route: '/app/today',
    primaryLabel: 'Go to Today',
  },
];

const founderSteps: WorkflowStepConfig[] = [
  {
    step: 'capture',
    title: 'Start from Today',
    instruction: 'Today shows actions and account memories that need attention.',
    why: 'This is where daily revenue movement starts.',
    route: '/app/today',
    primaryLabel: 'Open a real account',
  },
  {
    step: 'open_account_memory',
    title: 'Open a real account',
    instruction: 'Open an account with a real blocker.',
    why: 'Demo Workspace lets you test Memoire with sample sales context before adding real data.',
    primaryLabel: 'Open Account Memory',
  },
  {
    step: 'review_preview',
    title: 'Review Account Memory',
    instruction: 'Review the account story, blockers, and next action.',
    why: 'Living Memory should make the account immediately recallable before follow-up.',
    primaryLabel: 'Continue',
  },
  {
    step: 'ask_account',
    title: 'Ask Memoire',
    instruction: 'Ask Memoire using this account context.',
    why: 'The answer should be grounded in the account, blockers, and actions already in memory.',
    primaryLabel: 'Ask: What is blocking this deal?',
  },
  {
    step: 'draft_followup',
    title: 'Draft Follow-up',
    instruction: 'Use the account context to draft a follow-up.',
    why: 'Founder data should convert into action without becoming an email automation tool.',
    primaryLabel: 'I generated a draft',
  },
  {
    step: 'journey',
    title: 'Explore Journey',
    instruction: 'Journey shows where the sales memory loop is working or broken.',
    why: 'It makes Memoire feel like one end-to-end Sales Memory System.',
    route: '/app/journey',
    primaryLabel: 'Open Journey',
  },
  {
    step: 'finish',
    title: 'Finish',
    instruction: 'You have walked through a real Sales Memory Loop using founder data.',
    why: 'Use Today, Account Memory, Ask Memoire, and Journey as one daily workflow.',
    route: '/app/today',
    primaryLabel: 'Go to Today',
  },
];

function readPreference(storageKey: string): GuidedWorkflowPreference {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || '{}') as GuidedWorkflowPreference;
  } catch {
    return {};
  }
}

function writePreference(storageKey: string, next: GuidedWorkflowPreference) {
  localStorage.setItem(storageKey, JSON.stringify(next));
}

export function OnboardingModal() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<WorkflowMode>('welcome');
  const [workflow, setWorkflow] = useState<GuidedWorkflowState>({
    active: false,
    currentStep: 'welcome',
    completed: false,
    skipped: false,
  });
  const [savedMemory, setSavedMemory] = useState<GuidedCaptureSavedDetail | null>(null);
  const [structuredReady, setStructuredReady] = useState(false);
  const [draftReady, setDraftReady] = useState(false);

  const storageKey = useMemo(() => {
    const userKey = user?.id || user?.email || 'anonymous';
    return `memoire_guided_workflow_v1:${userKey}`;
  }, [user?.email, user?.id]);

  const founderWorkspace = workflow.active || mode === 'welcome' ? getFounderWorkspaceState() : null;
  const founderAccountId = founderWorkspace ? getFounderSuggestedAccountId() : null;
  const founderMode = Boolean(founderWorkspace);
  const steps = founderMode ? founderSteps : standardSteps;
  const currentIndex = Math.max(0, steps.findIndex((step) => step.step === workflow.currentStep));
  const currentStep = steps[currentIndex] || steps[0];

  useEffect(() => {
    if (!user) return;
    const preference = readPreference(storageKey);
    if (!preference.guidedWorkflowCompleted && !preference.dontShowGuidedWorkflowAgain) {
      setMode('welcome');
      setWorkflow({
        active: true,
        currentStep: 'welcome',
        completed: false,
        skipped: false,
        founderMode,
      });
    }
  }, [founderMode, storageKey, user]);

  useEffect(() => {
    const replay = () => startWorkflow();
    window.addEventListener(REPLAY_GUIDED_WORKFLOW_EVENT, replay);
    return () => window.removeEventListener(REPLAY_GUIDED_WORKFLOW_EVENT, replay);
  });

  useEffect(() => {
    const onStructured = () => {
      setStructuredReady(true);
      if (!founderMode && workflow.currentStep === 'structure') {
        setWorkflow((current) => ({ ...current, currentStep: 'review_preview' }));
      }
    };
    const onSaved = (event: Event) => {
      const detail = (event as CustomEvent<GuidedCaptureSavedDetail>).detail;
      setSavedMemory(detail);
      if (!founderMode) {
        setWorkflow((current) => ({ ...current, currentStep: 'open_account_memory' }));
      }
    };
    const onDraft = () => {
      setDraftReady(true);
      if (workflow.currentStep === 'draft_followup') {
        setWorkflow((current) => ({ ...current, currentStep: founderMode ? 'journey' : 'finish' }));
      }
    };
    const onAskReady = () => {
      if (workflow.currentStep !== 'ask_account') return;
      const accountId = savedMemory?.accountId || founderAccountId;
      if (accountId) navigate(`/app/accounts/${accountId}`);
      setWorkflow((current) => ({ ...current, currentStep: 'draft_followup' }));
    };

    window.addEventListener(CAPTURE_STRUCTURED_EVENT, onStructured);
    window.addEventListener(CAPTURE_SAVED_EVENT, onSaved as EventListener);
    window.addEventListener(ASK_ANSWER_READY_EVENT, onAskReady);
    window.addEventListener(FOLLOWUP_DRAFT_READY_EVENT, onDraft);
    return () => {
      window.removeEventListener(CAPTURE_STRUCTURED_EVENT, onStructured);
      window.removeEventListener(CAPTURE_SAVED_EVENT, onSaved as EventListener);
      window.removeEventListener(ASK_ANSWER_READY_EVENT, onAskReady);
      window.removeEventListener(FOLLOWUP_DRAFT_READY_EVENT, onDraft);
    };
  }, [founderAccountId, founderMode, navigate, savedMemory?.accountId, workflow.currentStep]);

  useEffect(() => {
    if (mode !== 'workflow' || !workflow.active || !currentStep.route) return;
    if (location.pathname !== currentStep.route) navigate(currentStep.route);
  }, [currentStep.route, location.pathname, mode, navigate, workflow.active]);

  if (!workflow.active || !user) return null;

  const preference = readPreference(storageKey);

  function startWorkflow() {
    const nextFounderMode = Boolean(getFounderWorkspaceState());
    setMode('workflow');
    setStructuredReady(false);
    setDraftReady(false);
    setSavedMemory(null);
    setWorkflow({
      active: true,
      currentStep: 'capture',
      completed: false,
      skipped: false,
      startedAt: new Date().toISOString(),
      sampleMode: !nextFounderMode,
      founderMode: nextFounderMode,
    });
    navigate('/app/today');
  }

  function skip() {
    writePreference(storageKey, {
      ...preference,
      guidedWorkflowDismissedAt: new Date().toISOString(),
      guidedWorkflowSkippedAt: new Date().toISOString(),
      guidedWorkflowSkippedCount: (preference.guidedWorkflowSkippedCount || 0) + 1,
    });
    setWorkflow((current) => ({ ...current, active: false, skipped: true }));
  }

  function dontShowAgain() {
    writePreference(storageKey, {
      ...preference,
      dontShowGuidedWorkflowAgain: true,
      guidedWorkflowCompleted: true,
      guidedWorkflowDismissedAt: new Date().toISOString(),
    });
    setWorkflow((current) => ({ ...current, active: false, completed: true }));
  }

  function finish(destination: '/app/today' | '/app/journey' = '/app/today') {
    writePreference(storageKey, {
      ...preference,
      guidedWorkflowCompleted: true,
      guidedWorkflowDismissedAt: new Date().toISOString(),
    });
    setWorkflow((current) => ({
      ...current,
      active: false,
      completed: true,
      completedAt: new Date().toISOString(),
    }));
    navigate(destination);
  }

  function goToStep(step: GuidedWorkflowStep) {
    setWorkflow((current) => ({ ...current, currentStep: step }));
  }

  function goNext() {
    const next = steps[currentIndex + 1];
    if (!next) return;
    goToStep(next.step);
  }

  function goBack() {
    const previous = steps[currentIndex - 1];
    if (!previous) {
      setMode('welcome');
      goToStep('welcome');
      return;
    }
    goToStep(previous.step);
  }

  function primaryAction() {
    switch (currentStep.step) {
      case 'capture':
        if (founderMode) {
          goToStep('open_account_memory');
          return;
        }
        window.dispatchEvent(new CustomEvent(USE_SAMPLE_NOTE_EVENT, { detail: { note: GUIDED_WORKFLOW_SAMPLE_NOTE } }));
        goToStep('structure');
        return;
      case 'structure':
        if (structuredReady) goToStep('review_preview');
        return;
      case 'review_preview':
        goNext();
        return;
      case 'save_memory':
        if (savedMemory) goNext();
        return;
      case 'open_account_memory': {
        const accountId = savedMemory?.accountId || founderAccountId;
        if (accountId) navigate(`/app/accounts/${accountId}`);
        goNext();
        return;
      }
      case 'ask_account': {
        const accountId = savedMemory?.accountId || founderAccountId;
        if (accountId) navigate(`/app/ask?scope=account&accountId=${accountId}`);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(ASK_GUIDED_QUESTION_EVENT, {
            detail: { question: founderMode ? 'What is blocking this deal?' : 'What should I do next?' },
          }));
        }, 300);
        return;
      }
      case 'draft_followup':
        if (draftReady) goNext();
        return;
      case 'journey':
        navigate('/app/journey');
        goNext();
        return;
      case 'finish':
        finish('/app/today');
        return;
      default:
        goNext();
    }
  }

  if (mode === 'welcome' || workflow.currentStep === 'welcome') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 p-4 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-lg bg-white p-6 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">Guided Workflow</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-navy">
                {founderMode ? 'Demo Workspace is loaded.' : 'Welcome to Memoire'}
              </h2>
              <p className="mt-1 text-sm font-semibold text-gray-700">
                {founderMode ? 'Walk through a real Sales Memory Loop.' : 'Create your first Sales Memory Loop.'}
              </p>
            </div>
            <button
              type="button"
              onClick={skip}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Skip guided workflow"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-sm leading-6 text-gray-600">
              {founderMode
                ? "Let's walk through a real account using your founder data."
                : "Memoire turns customer interactions into account memory, next actions, and askable sales context. Let's walk through one complete workflow."}
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Workflow</p>
              <p className="mt-2 text-sm font-semibold text-navy">
                Capture - Structure - Memory - Action - Ask - Follow-up - Today
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={dontShowAgain} className="text-sm font-semibold text-gray-500 hover:text-gray-800">
              Don't show again
            </button>
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
                onClick={startWorkflow}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy/90"
              >
                Start guided workflow
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-blue">
            Step {currentIndex + 1} of {steps.length}
          </p>
          <h2 className="mt-1 text-lg font-bold text-navy">{currentStep.title}</h2>
        </div>
        <button
          type="button"
          onClick={skip}
          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Skip guided workflow"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-4 flex gap-1.5">
        {steps.map((step, index) => (
          <span key={step.step} className={`h-1.5 flex-1 rounded-full ${index <= currentIndex ? 'bg-brand-blue' : 'bg-gray-200'}`} />
        ))}
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Instruction</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{currentStep.instruction}</p>
        </div>
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Why this matters</p>
          <p className="mt-1 text-sm leading-6 text-gray-700">{currentStep.why}</p>
        </div>
        {currentStep.step === 'review_preview' && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            Review Account, Contact, Objection / Blocker, Next Action, and Missing Context in the Structured Preview.
          </div>
        )}
        {currentStep.step === 'save_memory' && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
            Click Save to Sales Memory in Quick Capture. After it saves, Memoire will show your next links.
          </div>
        )}
        {currentStep.step === 'finish' && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">
            <p className="font-semibold">One customer interaction became:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Account Memory</li>
              <li>Blocker context</li>
              <li>Next Action</li>
              <li>Askable knowledge</li>
              <li>Follow-up draft</li>
            </ul>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex flex-col gap-2 sm:flex-row">
          {!founderMode && currentStep.step === 'capture' && (
            <button
              type="button"
              onClick={() => goToStep('structure')}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              I'll use my own
            </button>
          )}
          <button type="button" onClick={skip} className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 hover:bg-gray-50">
            Skip
          </button>
          {currentStep.step === 'finish' && (
            <button
              type="button"
              onClick={() => finish('/app/journey')}
              className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-brand-blue hover:border-brand-blue/40"
            >
              Explore Journey
            </button>
          )}
          <button
            type="button"
            onClick={primaryAction}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-3 py-2 text-sm font-bold text-white hover:bg-navy/90"
          >
            {currentStep.primaryLabel}
            {currentStep.step === 'finish' ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {currentStep.step === 'draft_followup' && !draftReady && (
        <p className="mt-3 text-xs leading-5 text-gray-500">
          Use the Draft Follow-up button on Account Memory. If Memoire does not have enough context yet, you can continue and return later.
        </p>
      )}
      {currentStep.step === 'ask_account' && (
        <p className="mt-3 text-xs leading-5 text-gray-500">
          On Ask Memoire, use the selected account context and ask {founderMode ? '"What is blocking this deal?"' : '"What should I do next?"'}.
        </p>
      )}
      {currentStep.step === 'finish' && (
        <div className="mt-3 flex gap-2">
          <Link to="/app/today" onClick={() => finish('/app/today')} className="text-xs font-bold text-brand-blue">
            Go to Today
          </Link>
        </div>
      )}
    </div>
  );
}

function getFounderSuggestedAccountId() {
  const memory = readLocalMemory();
  const preferred = memory.accounts.find((account) => account.name.toLowerCase().includes('apex pharma'))
    || memory.accounts.find((account) => account.name.toLowerCase().includes('northstar labs'));
  return preferred?.id || memory.accounts[0]?.id || null;
}

export { REPLAY_GUIDED_WORKFLOW_EVENT as ONBOARDING_EVENT };
