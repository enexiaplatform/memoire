export const SALES_OPERATING_SETUP_KEY = 'memoire.salesOperatingSetup.v1';

export type SalesOperatingSetupSectionId =
  | 'salesTarget'
  | 'gtmTarget'
  | 'rtmTarget'
  | 'pnlRequired'
  | 'salesCycle'
  | 'dailyActivityLog';

export type SalesOperatingSetupValues = Record<SalesOperatingSetupSectionId, string>;

export type SalesOperatingSetupSection = {
  id: SalesOperatingSetupSectionId;
  title: string;
  shortTitle: string;
  required: boolean;
  prompt: string;
  placeholder: string;
  intelligenceOutput: string;
};

export type SalesOperatingSetupState = {
  values: SalesOperatingSetupValues;
  updatedAt: string;
  completedAt: string;
  skippedAt: string;
};

export type SalesOperatingSetupProgress = {
  completedRequired: number;
  requiredCount: number;
  completedOptional: number;
  percent: number;
  status: 'Not started' | 'In progress' | 'Ready';
};

export const salesOperatingSetupSections: SalesOperatingSetupSection[] = [
  {
    id: 'salesTarget',
    title: 'Sales Target',
    shortTitle: 'Target',
    required: true,
    prompt: 'What number should Memoire help you move toward?',
    placeholder: 'Example: 5B VND revenue this quarter, 20 qualified opportunities, 8 closed-won deals, split by product or territory.',
    intelligenceOutput: 'Gap-to-target, forecast pressure, and activity needed to hit plan.',
  },
  {
    id: 'gtmTarget',
    title: 'GTM Target',
    shortTitle: 'GTM',
    required: true,
    prompt: 'Who are you prioritizing, and what market message matters most?',
    placeholder: 'Example: mid-market pharma distributors in Vietnam, priority pain is stock availability and implementation support.',
    intelligenceOutput: 'ICP focus, segment priority, outreach angles, and market signals to watch.',
  },
  {
    id: 'rtmTarget',
    title: 'RTM Target',
    shortTitle: 'RTM',
    required: true,
    prompt: 'Which route to market should each target move through?',
    placeholder: 'Example: key accounts direct, provincial coverage through distributors, online inbound for small clinics.',
    intelligenceOutput: 'Direct vs partner split, channel coverage gaps, and route-specific next actions.',
  },
  {
    id: 'pnlRequired',
    title: 'P&L Guardrails',
    shortTitle: 'P&L',
    required: false,
    prompt: 'What financial guardrails matter if profitability needs to be tracked?',
    placeholder: 'Example: gross margin above 35%, CAC under 20M VND, partner commission capped at 8%, marketing budget 300M VND.',
    intelligenceOutput: 'Margin risk, budget pressure, and revenue that looks good but is not healthy.',
  },
  {
    id: 'salesCycle',
    title: 'Sales Cycle',
    shortTitle: 'Cycle',
    required: true,
    prompt: 'How does a deal usually move from lead to closed-won?',
    placeholder: 'Example: lead -> discovery -> technical validation -> proposal -> procurement -> PO. Average cycle 75 days.',
    intelligenceOutput: 'Stage health, stuck-deal warnings, conversion risk, and next-step suggestions.',
  },
  {
    id: 'dailyActivityLog',
    title: 'Daily Activity Log Intelligence',
    shortTitle: 'Daily Log',
    required: true,
    prompt: 'What should the team submit daily so Memoire can learn from execution?',
    placeholder: 'Example: meetings, calls, proposals sent, objections, competitor signals, next actions, stuck deals, customer insight.',
    intelligenceOutput: 'Activity quality, ICP alignment, risk trends, forecast confidence, and tomorrow priorities.',
  },
];

export const defaultSalesOperatingSetupValues: SalesOperatingSetupValues = {
  salesTarget: '',
  gtmTarget: '',
  rtmTarget: '',
  pnlRequired: '',
  salesCycle: '',
  dailyActivityLog: '',
};

export function loadSalesOperatingSetupState(): SalesOperatingSetupState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return makeState();
    const raw = window.localStorage.getItem(SALES_OPERATING_SETUP_KEY);
    if (!raw) return makeState();
    return normalizeState(JSON.parse(raw) as Partial<SalesOperatingSetupState>);
  } catch {
    return makeState();
  }
}

export function saveSalesOperatingSetupState(state: SalesOperatingSetupState) {
  const next = completeIfReady({
    ...state,
    values: normalizeValues(state.values),
    updatedAt: new Date().toISOString(),
  });

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SALES_OPERATING_SETUP_KEY, JSON.stringify(next));
    }
  } catch {
    // Setup state is convenience-only; Memoire can continue without localStorage.
  }

  return next;
}

export function updateSalesOperatingSetupValue(id: SalesOperatingSetupSectionId, value: string) {
  const current = loadSalesOperatingSetupState();
  return saveSalesOperatingSetupState({
    ...current,
    values: {
      ...current.values,
      [id]: value,
    },
  });
}

export function skipSalesOperatingSetup() {
  return saveSalesOperatingSetupState({
    ...loadSalesOperatingSetupState(),
    skippedAt: new Date().toISOString(),
  });
}

export function resetSalesOperatingSetup() {
  return saveSalesOperatingSetupState(makeState());
}

export function buildSalesOperatingSetupProgress(state: SalesOperatingSetupState): SalesOperatingSetupProgress {
  const requiredSections = salesOperatingSetupSections.filter((section) => section.required);
  const optionalSections = salesOperatingSetupSections.filter((section) => !section.required);
  const completedRequired = requiredSections.filter((section) => hasValue(state.values[section.id])).length;
  const completedOptional = optionalSections.filter((section) => hasValue(state.values[section.id])).length;
  const percent = requiredSections.length === 0 ? 100 : Math.round((completedRequired / requiredSections.length) * 100);
  const hasAnyValue = salesOperatingSetupSections.some((section) => hasValue(state.values[section.id]));

  return {
    completedRequired,
    requiredCount: requiredSections.length,
    completedOptional,
    percent,
    status: percent === 100 ? 'Ready' : hasAnyValue ? 'In progress' : 'Not started',
  };
}

export function buildSalesOperatingSetupDigest(state: SalesOperatingSetupState) {
  return salesOperatingSetupSections
    .filter((section) => hasValue(state.values[section.id]))
    .map((section) => `${section.title}: ${state.values[section.id].trim()}`)
    .join('\n\n');
}

function normalizeState(value: Partial<SalesOperatingSetupState>) {
  return completeIfReady({
    values: normalizeValues(value.values),
    completedAt: typeof value.completedAt === 'string' ? value.completedAt : '',
    skippedAt: typeof value.skippedAt === 'string' ? value.skippedAt : '',
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  });
}

function normalizeValues(value: Partial<SalesOperatingSetupValues> | undefined): SalesOperatingSetupValues {
  return {
    salesTarget: normalizeText(value?.salesTarget),
    gtmTarget: normalizeText(value?.gtmTarget),
    rtmTarget: normalizeText(value?.rtmTarget),
    pnlRequired: normalizeText(value?.pnlRequired),
    salesCycle: normalizeText(value?.salesCycle),
    dailyActivityLog: normalizeText(value?.dailyActivityLog),
  };
}

function makeState(): SalesOperatingSetupState {
  return {
    values: { ...defaultSalesOperatingSetupValues },
    updatedAt: new Date().toISOString(),
    completedAt: '',
    skippedAt: '',
  };
}

function completeIfReady(state: SalesOperatingSetupState): SalesOperatingSetupState {
  const progress = buildSalesOperatingSetupProgress(state);
  if (progress.percent === 100 && !state.completedAt) {
    return {
      ...state,
      completedAt: new Date().toISOString(),
    };
  }

  return state;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trimStart() : '';
}

function hasValue(value: string) {
  return value.trim().length > 0;
}
