export const DEMO_FEEDBACK_STORAGE_KEY = 'memoire.demoFeedback.v1';

export type DemoFeedbackContext =
  | 'Demo Guide'
  | 'Pipeline Defense'
  | 'Dashboard'
  | 'Onboarding'
  | 'General';

export type DemoFeedbackUnderstanding = 'Yes' | 'Partly' | 'No';
export type DemoFeedbackUsageFrequency = 'Daily' | 'Weekly' | 'Before pipeline review' | 'Rarely' | 'Not sure';
export type DemoFeedbackWillingnessToPay = 'Yes' | 'Maybe' | 'No' | 'Not asked';
export type PipelineBriefUsefulness = 'Yes, useful' | 'Partly useful' | 'Not useful yet';

export type DemoFeedbackRecord = {
  id: string;
  context: DemoFeedbackContext;
  userPersona: string;
  understoodIn30Seconds: DemoFeedbackUnderstanding;
  mostValuableWorkflow: string;
  likelyUsageFrequency: DemoFeedbackUsageFrequency;
  willingnessToPay: DemoFeedbackWillingnessToPay;
  topAdoptionBlocker: string;
  featureRequest: string;
  freeTextFeedback: string;
  briefUsefulness?: PipelineBriefUsefulness;
  createdAt: string;
};

export type DemoFeedbackInput = Omit<DemoFeedbackRecord, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export type DemoFeedbackSummary = {
  totalEntries: number;
  byContext: Record<string, number>;
  byUsageFrequency: Record<string, number>;
  byWillingnessToPay: Record<string, number>;
  byUnderstanding: Record<string, number>;
  topValuedWorkflows: { label: string; count: number }[];
  topAdoptionBlockers: { label: string; count: number }[];
  recommendedNextBet: string;
};

export const validationInterviewScript = [
  'How do you currently prepare for pipeline review?',
  'What do you usually forget before review?',
  'Which deal information is hardest to keep updated?',
  'Would a Pipeline Defense Brief save you time?',
  'Would you import a CRM/Excel pipeline into this?',
  'Would you capture updates after meetings?',
  'What would make this worth paying for?',
  'What would make you stop using it after week 1?',
];

export const defaultDemoFeedbackInput: DemoFeedbackInput = {
  context: 'Demo Guide',
  userPersona: '',
  understoodIn30Seconds: 'Partly',
  mostValuableWorkflow: '',
  likelyUsageFrequency: 'Not sure',
  willingnessToPay: 'Not asked',
  topAdoptionBlocker: '',
  featureRequest: '',
  freeTextFeedback: '',
};

export function loadDemoFeedback(): DemoFeedbackRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_FEEDBACK_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeFeedbackRecord).filter(Boolean) as DemoFeedbackRecord[];
  } catch {
    return [];
  }
}

export function saveDemoFeedback(records: DemoFeedbackRecord[]) {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(DEMO_FEEDBACK_STORAGE_KEY, JSON.stringify(records.map(normalizeFeedbackRecord).filter(Boolean)));
    return true;
  } catch {
    return false;
  }
}

export function createDemoFeedback(input: DemoFeedbackInput) {
  const record = normalizeFeedbackRecord({
    ...input,
    id: input.id || `feedback-${Date.now()}`,
    createdAt: input.createdAt || new Date().toISOString(),
  }) as DemoFeedbackRecord;

  saveDemoFeedback([record, ...loadDemoFeedback().filter((item) => item.id !== record.id)]);
  return record;
}

export function buildDemoFeedbackSummary(records: DemoFeedbackRecord[]): DemoFeedbackSummary {
  const topValuedWorkflows = topCounts(records.map((record) => record.mostValuableWorkflow));
  const topAdoptionBlockers = topCounts(records.map((record) => record.topAdoptionBlocker));

  const summary: DemoFeedbackSummary = {
    totalEntries: records.length,
    byContext: countBy(records.map((record) => record.context)),
    byUsageFrequency: countBy(records.map((record) => record.likelyUsageFrequency)),
    byWillingnessToPay: countBy(records.map((record) => record.willingnessToPay)),
    byUnderstanding: countBy(records.map((record) => record.understoodIn30Seconds)),
    topValuedWorkflows,
    topAdoptionBlockers,
    recommendedNextBet: '',
  };

  summary.recommendedNextBet = getRecommendedNextBet(records, summary);
  return summary;
}

export function generateValidationSummaryMarkdown(records: DemoFeedbackRecord[]) {
  const summary = buildDemoFeedbackSummary(records);
  const topWorkflow = summary.topValuedWorkflows[0]?.label || 'No clear signal yet';
  const mainBlockers = summary.topAdoptionBlockers.slice(0, 5).map((item) => `- ${item.label} (${item.count})`);
  const usageDistribution = Object.entries(summary.byUsageFrequency).map(([label, count]) => `- ${label}: ${count}`);
  const paySignals = Object.entries(summary.byWillingnessToPay).map(([label, count]) => `- ${label}: ${count}`);

  return [
    '# Memoire Validation Summary',
    '',
    `Feedback entries: ${summary.totalEntries}`,
    `Top valued workflow: ${topWorkflow}`,
    '',
    '## Usage Frequency',
    usageDistribution.length ? usageDistribution.join('\n') : '- No usage signal yet',
    '',
    '## Main Blockers',
    mainBlockers.length ? mainBlockers.join('\n') : '- No blocker signal yet',
    '',
    '## Willingness To Pay',
    paySignals.length ? paySignals.join('\n') : '- No pay signal yet',
    '',
    '## Recommended Next Bet',
    summary.recommendedNextBet,
  ].join('\n');
}

export function generateInterviewScriptText() {
  return [
    'Memoire User Interview Script',
    '',
    ...validationInterviewScript.map((question, index) => `${index + 1}. ${question}`),
  ].join('\n');
}

function getRecommendedNextBet(records: DemoFeedbackRecord[], summary: DemoFeedbackSummary) {
  if (records.length === 0) return 'Collect 5-10 user interviews before choosing the next roadmap bet.';

  const haystack = records.map((record) => [
    record.mostValuableWorkflow,
    record.topAdoptionBlocker,
    record.featureRequest,
    record.freeTextFeedback,
  ].join(' ').toLowerCase()).join(' ');
  const pipelineValue = records.filter((record) => /pipeline|defense|review|manager/i.test(record.mostValuableWorkflow)).length;
  const weeklyOnly = (summary.byUsageFrequency['Before pipeline review'] || 0) + (summary.byUsageFrequency.Weekly || 0);
  const unclearPositioning = summary.byUnderstanding.No || 0;

  if (pipelineValue > 0 && /(share|link|manager|send|export)/.test(haystack)) {
    return 'Prioritize shareable Pipeline Defense links or cleaner manager-ready sharing.';
  }
  if (/(duplicate|double entry|manual|crm|salesforce|hubspot|sync|automation)/.test(haystack)) {
    return 'Prioritize CRM sync or capture automation only after validating repeated duplicate-entry pain.';
  }
  if (unclearPositioning > 0 || /(confusing|positioning|what does it do|unclear)/.test(haystack)) {
    return 'Prioritize landing, positioning, and onboarding clarity before deeper product expansion.';
  }
  if (/(asset|template|proof|proposal|objection|document)/.test(haystack)) {
    return 'Prioritize starter packs and reusable proof/assets for the strongest vertical use case.';
  }
  if (weeklyOnly >= Math.max(2, Math.ceil(records.length / 2))) {
    return 'Position Memoire as a Pipeline Review Tool first, not a daily operating system.';
  }
  return 'Keep testing demo-to-brief activation and choose the next bet from the strongest repeated blocker.';
}

function normalizeFeedbackRecord(raw: Partial<DemoFeedbackRecord> | null): DemoFeedbackRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `feedback-${Date.now()}`,
    context: isFeedbackContext(raw.context) ? raw.context : 'General',
    userPersona: String(raw.userPersona || '').trim(),
    understoodIn30Seconds: isUnderstanding(raw.understoodIn30Seconds) ? raw.understoodIn30Seconds : 'Partly',
    mostValuableWorkflow: String(raw.mostValuableWorkflow || '').trim(),
    likelyUsageFrequency: isUsageFrequency(raw.likelyUsageFrequency) ? raw.likelyUsageFrequency : 'Not sure',
    willingnessToPay: isWillingnessToPay(raw.willingnessToPay) ? raw.willingnessToPay : 'Not asked',
    topAdoptionBlocker: String(raw.topAdoptionBlocker || '').trim(),
    featureRequest: String(raw.featureRequest || '').trim(),
    freeTextFeedback: String(raw.freeTextFeedback || '').trim(),
    briefUsefulness: isBriefUsefulness(raw.briefUsefulness) ? raw.briefUsefulness : undefined,
    createdAt: typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : new Date().toISOString(),
  };
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const label = value.trim() || 'Unspecified';
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});
}

function topCounts(values: string[]) {
  return Object.entries(countBy(values.filter(Boolean)))
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

function isFeedbackContext(value: unknown): value is DemoFeedbackContext {
  return ['Demo Guide', 'Pipeline Defense', 'Dashboard', 'Onboarding', 'General'].includes(String(value));
}

function isUnderstanding(value: unknown): value is DemoFeedbackUnderstanding {
  return ['Yes', 'Partly', 'No'].includes(String(value));
}

function isUsageFrequency(value: unknown): value is DemoFeedbackUsageFrequency {
  return ['Daily', 'Weekly', 'Before pipeline review', 'Rarely', 'Not sure'].includes(String(value));
}

function isWillingnessToPay(value: unknown): value is DemoFeedbackWillingnessToPay {
  return ['Yes', 'Maybe', 'No', 'Not asked'].includes(String(value));
}

function isBriefUsefulness(value: unknown): value is PipelineBriefUsefulness {
  return ['Yes, useful', 'Partly useful', 'Not useful yet'].includes(String(value));
}
