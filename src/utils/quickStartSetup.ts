import { getReportingCurrency, isSupportedCurrency, SUPPORTED_CURRENCIES } from './money.ts';

export const QUICK_START_KEY = 'memoire.quickStart.v1';

export type QuickStartFieldId = 'sells' | 'sellsTo' | 'cycle' | 'currency' | 'focus';

export type QuickStartAnswers = Record<QuickStartFieldId, string>;

export type QuickStartOption = { value: string; label: string };

export type QuickStartQuestion = {
  id: QuickStartFieldId;
  label: string;
  help: string;
  options: QuickStartOption[];
};

export const quickStartQuestions: QuickStartQuestion[] = [
  {
    id: 'sells',
    label: 'What do you sell?',
    help: 'Sets the language Memoire uses for your deals.',
    options: [
      { value: 'physical', label: 'Physical products / equipment' },
      { value: 'services', label: 'Professional services' },
      { value: 'software', label: 'Software / subscriptions' },
      { value: 'consulting', label: 'Consulting / advisory' },
      { value: 'other', label: 'Something else' },
    ],
  },
  {
    id: 'sellsTo',
    label: 'Who do you sell to?',
    help: 'Solo operators often sell to a mix - pick the main one.',
    options: [
      { value: 'businesses', label: 'Businesses (B2B)' },
      { value: 'individuals', label: 'Individual clients' },
      { value: 'both', label: 'Both businesses and individuals' },
    ],
  },
  {
    id: 'cycle',
    label: 'How long is a typical deal?',
    help: 'Tunes how soon a quiet deal should worry you.',
    options: [
      { value: 'short', label: 'Under 1 month' },
      { value: 'medium', label: '1-3 months' },
      { value: 'long', label: '3-6 months' },
      { value: 'very-long', label: '6+ months' },
    ],
  },
  {
    id: 'currency',
    label: 'Reporting currency',
    help: 'Totals and charts are shown in this currency.',
    options: SUPPORTED_CURRENCIES.map((currency) => ({ value: currency, label: currency })),
  },
  {
    id: 'focus',
    label: "What matters most right now?",
    help: 'Sets where Memoire sends you first.',
    options: [
      { value: 'silence', label: 'Stop deals going silent' },
      { value: 'capture', label: 'Get my notes and pipeline in one place' },
      { value: 'pipeline', label: 'See my pipeline and where money is' },
      { value: 'review', label: 'Prepare for a pipeline review' },
    ],
  },
];

export function defaultQuickStartAnswers(): QuickStartAnswers {
  return {
    sells: 'physical',
    sellsTo: 'businesses',
    cycle: 'medium',
    currency: isSupportedCurrency(getReportingCurrency()) ? getReportingCurrency() : 'VND',
    focus: 'silence',
  };
}

export function loadQuickStart(): { answers: QuickStartAnswers; completedAt: string | null } {
  if (typeof localStorage === 'undefined') return { answers: defaultQuickStartAnswers(), completedAt: null };
  try {
    const raw = localStorage.getItem(QUICK_START_KEY);
    if (!raw) return { answers: defaultQuickStartAnswers(), completedAt: null };
    const parsed = JSON.parse(raw) as { answers?: Partial<QuickStartAnswers>; completedAt?: string };
    return {
      answers: { ...defaultQuickStartAnswers(), ...(parsed.answers || {}) },
      completedAt: parsed.completedAt || null,
    };
  } catch {
    return { answers: defaultQuickStartAnswers(), completedAt: null };
  }
}

export function saveQuickStart(answers: QuickStartAnswers) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(QUICK_START_KEY, JSON.stringify({ answers, completedAt: new Date().toISOString() }));
  } catch {
    // ignore storage failures
  }
}

export function isQuickStartComplete(): boolean {
  return Boolean(loadQuickStart().completedAt);
}

export type QuickStartPlan = {
  headline: string;
  summary: string;
  steps: string[];
  focusRoute: string;
  focusLabel: string;
};

const FOCUS_ROUTES: Record<string, { route: string; label: string }> = {
  silence: { route: '/app/opportunities?filter=goingSilent', label: 'Review deals going quiet' },
  capture: { route: '/app/capture', label: 'Capture your first update' },
  pipeline: { route: '/app/opportunities', label: 'Open your pipeline' },
  review: { route: '/app/pipeline-defense', label: 'Start a Pipeline Defense brief' },
};

/** Turns the chosen options into a plain-language basic setup and a first step. */
export function buildQuickStartPlan(answers: QuickStartAnswers): QuickStartPlan {
  const audience = answers.sellsTo === 'individuals'
    ? 'individual clients'
    : answers.sellsTo === 'both'
      ? 'businesses and individual clients'
      : 'businesses';
  const cycleLabel = quickStartQuestions.find((q) => q.id === 'cycle')?.options.find((o) => o.value === answers.cycle)?.label || '';
  const sellsLabel = quickStartQuestions.find((q) => q.id === 'sells')?.options.find((o) => o.value === answers.sells)?.label || 'your work';
  const focus = FOCUS_ROUTES[answers.focus] || FOCUS_ROUTES.silence;

  const cycleNote = answers.cycle === 'short'
    ? 'Short cycles mean a quiet deal is a fast warning - Memoire flags silence early.'
    : answers.cycle === 'very-long'
      ? 'Long cycles need patient follow-up - Memoire keeps every deal on your radar between touches.'
      : 'Memoire watches for deals going quiet so none slip between follow-ups.';

  return {
    headline: 'Your Memoire is set up',
    summary: `Selling ${sellsLabel.toLowerCase()} to ${audience}, ${cycleLabel.toLowerCase()} deals, reported in ${answers.currency}. ${cycleNote}`,
    steps: [
      'Capture a customer update - a note or a pasted email thread.',
      'Memoire structures it into account, contact, next action, and due date.',
      'When a deal goes quiet, draft a follow-up and log the touch in one click.',
    ],
    focusRoute: focus.route,
    focusLabel: focus.label,
  };
}
