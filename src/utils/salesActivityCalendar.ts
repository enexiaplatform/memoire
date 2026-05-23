import type { SalesPriority, StructuredSalesCapture } from '../types/v31';

export type SalesActivityCategory =
  | 'Call'
  | 'Meeting'
  | 'Email'
  | 'Proposal'
  | 'Follow-up'
  | 'Objection'
  | 'Customer insight'
  | 'Admin'
  | 'Note';

export type SalesActivityPeriod = 'week' | 'month';

export interface SalesActivityRecord {
  id: string;
  source: 'manual' | 'quick-capture' | 'sales-memory';
  sourceCaptureId?: string;
  occurredAt: string;
  rawText: string;
  summary: string;
  category: SalesActivityCategory;
  account?: string;
  contact?: string;
  opportunity?: string;
  nextAction?: string;
  objection?: string;
  riskSignal?: string;
  urgency?: SalesPriority;
  confidence?: SalesPriority;
}

export interface SalesActivityRecap {
  totalActivities: number;
  categoryCounts: Record<SalesActivityCategory, number>;
  topAccounts: { account: string; count: number }[];
  actionItems: string[];
  riskSignals: string[];
  recapLines: string[];
}

export interface SalesActivityRange {
  start: Date;
  end: Date;
  label: string;
}

const ACTIVITY_STORAGE_KEY = 'memoire.salesActivityCalendar.v1';

const categoryList: SalesActivityCategory[] = [
  'Call',
  'Meeting',
  'Email',
  'Proposal',
  'Follow-up',
  'Objection',
  'Customer insight',
  'Admin',
  'Note',
];

function createId() {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clean(value: string | null | undefined) {
  return (value || '').trim();
}

function truncate(value: string, length = 190) {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > length ? `${trimmed.slice(0, length - 1)}...` : trimmed;
}

function normalizeDay(value: Date) {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function endOfDay(value: Date) {
  const normalized = new Date(value);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(value);
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(value);
}

function detectCategory(rawText: string, structured?: StructuredSalesCapture): SalesActivityCategory {
  if (structured?.objection) return 'Objection';
  if (structured?.next_action) return 'Follow-up';
  if (structured?.type === 'call') return 'Call';
  if (structured?.type === 'meeting') return 'Meeting';
  if (structured?.type === 'email') return 'Email';
  if (structured?.type === 'proposal') return 'Proposal';

  const lower = rawText.toLowerCase();
  if (/objection|concern|blocked|risk|issue|ngai|lo lang|phản đối|phan doi/.test(lower)) return 'Objection';
  if (/follow up|next action|send|schedule|call back|gửi|gui|hẹn|hen/.test(lower)) return 'Follow-up';
  if (/call|called|spoke|phone|gọi|goi/.test(lower)) return 'Call';
  if (/meeting|met|workshop|demo|họp|hop/.test(lower)) return 'Meeting';
  if (/email|thread|inbox|reply/.test(lower)) return 'Email';
  if (/proposal|quote|quotation|tender|po|báo giá|bao gia/.test(lower)) return 'Proposal';
  if (/insight|learned|discovered|pain|context|budget|timeline/.test(lower)) return 'Customer insight';
  if (/admin|internal|crm|update/.test(lower)) return 'Admin';
  return 'Note';
}

function extractAccount(rawText: string) {
  return rawText.match(/\b(?:at|from|for|with)\s+([A-Z][A-Za-z0-9&.\- ]{2,56})(?:[.,;\n]|$)/)?.[1]?.trim() || '';
}

function buildRiskSignal(structured?: StructuredSalesCapture) {
  if (!structured) return '';
  if (structured.stuck_risk) return structured.stuck_risk;
  if (structured.objection && !structured.next_action) return 'Objection captured without a next action.';
  if (structured.confidence === 'low') return 'Low confidence interaction needs cleanup.';
  if (!structured.next_action) return 'No next action captured.';
  return '';
}

export function createSalesActivityFromCapture(
  rawText: string,
  structured: StructuredSalesCapture,
  options: { occurredAt?: string; sourceCaptureId?: string; source?: SalesActivityRecord['source'] } = {}
): SalesActivityRecord {
  const occurredAt = options.occurredAt || new Date().toISOString();
  return {
    id: options.sourceCaptureId ? `activity-${options.sourceCaptureId}` : createId(),
    source: options.source || 'quick-capture',
    sourceCaptureId: options.sourceCaptureId,
    occurredAt,
    rawText,
    summary: truncate(structured.interaction_summary || rawText),
    category: detectCategory(rawText, structured),
    account: clean(structured.account),
    contact: clean(structured.contact),
    opportunity: clean(structured.opportunity),
    nextAction: clean(structured.next_action),
    objection: clean(structured.objection),
    riskSignal: buildRiskSignal(structured),
    urgency: structured.urgency,
    confidence: structured.confidence,
  };
}

export function createSalesActivityFromText(rawText: string, occurredAt = new Date().toISOString()): SalesActivityRecord {
  const account = extractAccount(rawText);
  return {
    id: createId(),
    source: 'manual',
    occurredAt,
    rawText,
    summary: truncate(rawText),
    category: detectCategory(rawText),
    account,
    riskSignal: /no next action|waiting|unclear|no response|blocked/i.test(rawText)
      ? 'Activity may need follow-up or clarification.'
      : '',
  };
}

export function loadSalesActivities(): SalesActivityRecord[] {
  if (typeof localStorage === 'undefined') return [];
  const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<SalesActivityRecord>[];
    return parsed
      .filter((item) => item.id && item.occurredAt && item.rawText)
      .map((item) => ({
        id: item.id || createId(),
        source: item.source || 'manual',
        sourceCaptureId: item.sourceCaptureId,
        occurredAt: item.occurredAt || new Date().toISOString(),
        rawText: item.rawText || '',
        summary: item.summary || truncate(item.rawText || ''),
        category: categoryList.includes(item.category as SalesActivityCategory) ? item.category as SalesActivityCategory : 'Note',
        account: item.account,
        contact: item.contact,
        opportunity: item.opportunity,
        nextAction: item.nextAction,
        objection: item.objection,
        riskSignal: item.riskSignal,
        urgency: item.urgency,
        confidence: item.confidence,
      }))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  } catch {
    return [];
  }
}

export function saveSalesActivities(records: SalesActivityRecord[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(records));
}

export function upsertSalesActivity(record: SalesActivityRecord) {
  const existing = loadSalesActivities();
  const matchIndex = existing.findIndex((item) =>
    (record.sourceCaptureId && item.sourceCaptureId === record.sourceCaptureId) || item.id === record.id
  );
  const next = matchIndex >= 0
    ? existing.map((item, index) => index === matchIndex ? { ...item, ...record } : item)
    : [record, ...existing];
  saveSalesActivities(next.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
}

export function recordSalesActivityFromCapture(
  rawText: string,
  structured: StructuredSalesCapture,
  options: { occurredAt?: string; sourceCaptureId?: string } = {}
) {
  upsertSalesActivity(createSalesActivityFromCapture(rawText, structured, options));
}

export function getSalesActivityRange(period: SalesActivityPeriod, anchorDate = new Date()): SalesActivityRange {
  const anchor = normalizeDay(anchorDate);
  if (period === 'month') {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = endOfDay(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    return { start, end, label: formatMonth(anchor) };
  }

  const start = normalizeDay(anchor);
  const day = start.getDay();
  const daysFromMonday = (day + 6) % 7;
  start.setDate(start.getDate() - daysFromMonday);
  const end = endOfDay(new Date(start));
  end.setDate(start.getDate() + 6);
  return { start, end, label: `${formatShortDate(start)} - ${formatShortDate(end)}` };
}

export function filterSalesActivitiesByRange(records: SalesActivityRecord[], range: SalesActivityRange) {
  return records.filter((record) => {
    const occurredAt = new Date(record.occurredAt);
    return occurredAt >= range.start && occurredAt <= range.end;
  });
}

export function groupSalesActivitiesByDate(records: SalesActivityRecord[]) {
  return records.reduce<Record<string, SalesActivityRecord[]>>((groups, record) => {
    const dateKey = record.occurredAt.slice(0, 10);
    groups[dateKey] = groups[dateKey] || [];
    groups[dateKey].push(record);
    return groups;
  }, {});
}

export function buildSalesActivityRecap(records: SalesActivityRecord[]): SalesActivityRecap {
  const categoryCounts = categoryList.reduce((counts, category) => {
    counts[category] = records.filter((record) => record.category === category).length;
    return counts;
  }, {} as Record<SalesActivityCategory, number>);

  const accountCounts = records.reduce<Record<string, number>>((counts, record) => {
    const account = record.account || 'Unspecified account';
    counts[account] = (counts[account] || 0) + 1;
    return counts;
  }, {});

  const topAccounts = Object.entries(accountCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([account, count]) => ({ account, count }));

  const actionItems = records
    .map((record) => record.nextAction || '')
    .filter(Boolean)
    .slice(0, 8);

  const riskSignals = records
    .map((record) => record.riskSignal || record.objection || '')
    .filter(Boolean)
    .slice(0, 8);

  const recapLines = [
    records.length === 0
      ? 'No sales activity captured in this period yet.'
      : `${records.length} sales activities captured across ${topAccounts.length || 1} account area${topAccounts.length === 1 ? '' : 's'}.`,
    actionItems.length > 0
      ? `${actionItems.length} next action${actionItems.length === 1 ? '' : 's'} surfaced from capture notes.`
      : 'No explicit next actions captured yet.',
    riskSignals.length > 0
      ? `${riskSignals.length} risk signal${riskSignals.length === 1 ? '' : 's'} need follow-up before review.`
      : 'No major objection or stuck-deal signals captured in this period.',
  ];

  return {
    totalActivities: records.length,
    categoryCounts,
    topAccounts,
    actionItems,
    riskSignals,
    recapLines,
  };
}

export function shiftSalesActivityAnchor(anchorDate: Date, period: SalesActivityPeriod, direction: -1 | 1) {
  const next = new Date(anchorDate);
  if (period === 'week') {
    next.setDate(next.getDate() + direction * 7);
  } else {
    next.setMonth(next.getMonth() + direction);
  }
  return next;
}
