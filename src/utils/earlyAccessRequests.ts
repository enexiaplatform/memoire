export const EARLY_ACCESS_REQUESTS_KEY = 'memoire.earlyAccessRequests.v1';
export const EARLY_ACCESS_CONTACT_EMAIL = 'hello@memoire.app';

export const earlyAccessRoles = [
  'Account Executive / Sales Rep',
  'Sales Manager',
  'Founder-led sales',
  'Consultant / Freelancer',
  'Agency owner',
  'Creator / Partnerships',
  'Business Development',
  'Other',
] as const;

export const earlyAccessSegments = [
  'Pharma / Life Science / Lab',
  'Industrial / Manufacturing',
  'B2B SaaS',
  'Professional Services',
  'Agency / Consulting',
  'Creator / Partnerships',
  'Other B2B',
] as const;

export const pipelineReviewFrequencies = [
  'Weekly',
  'Monthly',
  'Before forecast calls',
  'Irregular',
  'Not sure',
] as const;

export const pipelineReviewPains = [
  'Rebuilding deal context before review',
  'Remembering client or partner follow-ups alone',
  'Weak forecast evidence',
  'Objections/proof gaps',
  'CRM is too noisy',
  'Manual Excel/Notion prep',
  'Duplicate entry',
  'Manager-ready summary',
  'Other',
] as const;

export const interestedWorkflows = [
  'Pipeline Defense Brief',
  'CSV import/refresh',
  'Quick Capture',
  'MEDDIC-lite gaps',
  'Playbook / Proof Assets',
  'Review Pack History',
  'Private working copy',
] as const;

export const budgetOwners = [
  'Personal',
  'Manager',
  'Company',
  'Not sure',
] as const;

export type EarlyAccessRequestInput = {
  name: string;
  workEmail: string;
  role: string;
  segment: string;
  currentTool: string;
  pipelineReviewFrequency: string;
  biggestPain: string;
  interestedMost: string;
  preferredUseCase: string;
  budgetOwner: string;
};

export type EarlyAccessRequestRecord = EarlyAccessRequestInput & {
  id: string;
  createdAt: string;
};

export const defaultEarlyAccessRequest: EarlyAccessRequestInput = {
  name: '',
  workEmail: '',
  role: earlyAccessRoles[0],
  segment: earlyAccessSegments[0],
  currentTool: '',
  pipelineReviewFrequency: pipelineReviewFrequencies[0],
  biggestPain: pipelineReviewPains[0],
  interestedMost: interestedWorkflows[0],
  preferredUseCase: '',
  budgetOwner: budgetOwners[0],
};

export function loadEarlyAccessRequests(): EarlyAccessRequestRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(EARLY_ACCESS_REQUESTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEarlyAccessRequestRecord) : [];
  } catch {
    return [];
  }
}

export function clearEarlyAccessRequests() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(EARLY_ACCESS_REQUESTS_KEY);
}

export function saveEarlyAccessRequest(input: EarlyAccessRequestInput): EarlyAccessRequestRecord {
  const record: EarlyAccessRequestRecord = {
    ...input,
    id: createRequestId(),
    createdAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const current = loadEarlyAccessRequests();
      window.localStorage.setItem(EARLY_ACCESS_REQUESTS_KEY, JSON.stringify([record, ...current].slice(0, 50)));
    } catch {
      // Keep the generated summary available even if localStorage is unavailable.
    }
  }

  return record;
}

export async function submitEarlyAccessRequest(input: EarlyAccessRequestInput, consent: boolean, website = '') {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch('/api/request-access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        name: input.name,
        workEmail: input.workEmail,
        role: input.role,
        currentTool: input.currentTool,
        biggestPain: input.biggestPain,
        preferredUseCase: input.preferredUseCase,
        consent,
        website,
      }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || 'We could not submit your request. Please retry.');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('The request took too long. Please check your connection and retry.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function generateAllEarlyAccessRequestsSummary(records: EarlyAccessRequestRecord[]) {
  if (records.length === 0) {
    return 'No Memoire early access requests are saved in this browser.';
  }

  return records.map((record, index) => [
    `Request ${index + 1}`,
    generateEarlyAccessRequestSummary(record),
  ].join('\n')).join('\n\n---\n\n');
}

export function generateEarlyAccessRequestSummary(record: EarlyAccessRequestRecord) {
  return [
    'Memoire Early Access Request',
    '',
    `Name: ${record.name || 'Not provided'}`,
    `Work email: ${record.workEmail || 'Not provided'}`,
    `Role: ${record.role}`,
    `Current CRM, spreadsheet, notes, or pipeline tool: ${record.currentTool || 'Not provided'}`,
    `Biggest pipeline review pain: ${record.biggestPain}`,
    `Preferred use case: ${record.preferredUseCase || 'Not provided'}`,
    `Created at: ${record.createdAt}`,
    '',
    'Privacy note: This request does not include confidential customer data.',
  ].join('\n');
}

export function generateEarlyAccessRequestsCsv(records: EarlyAccessRequestRecord[]) {
  const headers = [
    'id',
    'createdAt',
    'name',
    'workEmail',
    'role',
    'segment',
    'currentTool',
    'pipelineReviewFrequency',
    'biggestPain',
    'interestedMost',
    'preferredUseCase',
    'budgetOwner',
  ];

  return [
    headers.join(','),
    ...records.map((record) => headers.map((header) => csvCell(String(record[header as keyof EarlyAccessRequestRecord] ?? ''))).join(',')),
  ].join('\n');
}

export function generateEarlyAccessRequestsJson(records: EarlyAccessRequestRecord[]) {
  return JSON.stringify(records, null, 2);
}

export function buildEarlyAccessMailto(record: EarlyAccessRequestRecord) {
  const subject = encodeURIComponent('Memoire early access request');
  const body = encodeURIComponent(generateEarlyAccessRequestSummary(record));
  return `mailto:${EARLY_ACCESS_CONTACT_EMAIL}?subject=${subject}&body=${body}`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function createRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `early-access-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isEarlyAccessRequestRecord(value: unknown): value is EarlyAccessRequestRecord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<EarlyAccessRequestRecord>;
  return Boolean(candidate.id && candidate.createdAt);
}
