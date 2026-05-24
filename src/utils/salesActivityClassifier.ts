export type SalesActivityType =
  | 'Customer meeting'
  | 'Follow-up'
  | 'Demo / technical discussion'
  | 'Quote / proposal'
  | 'Tender / procurement'
  | 'Internal coordination'
  | 'Objection handling'
  | 'Admin / CRM'
  | 'Other';

export interface ClassifiedSalesActivity {
  accountName: string;
  opportunityName: string;
  activityType: SalesActivityType;
  summary: string;
  nextAction: string;
  dueDate: string;
  tags: string[];
  rawNote: string;
  activityDate: string;
}

const activityRules: { type: SalesActivityType; tags: string[]; pattern: RegExp }[] = [
  {
    type: 'Tender / procurement',
    tags: ['procurement', 'tender'],
    pattern: /\b(tender|procurement|rfp|rfq|bid|purchasing|purchase order|po|buyer|legal review)\b/i,
  },
  {
    type: 'Quote / proposal',
    tags: ['proposal', 'quote'],
    pattern: /\b(proposal|quote|quotation|pricing|commercial offer|offer|sent price|revised price)\b/i,
  },
  {
    type: 'Demo / technical discussion',
    tags: ['demo', 'technical'],
    pattern: /\b(demo|technical|poc|trial|validation|integration|spec|evaluation|configuration|implementation)\b/i,
  },
  {
    type: 'Objection handling',
    tags: ['objection', 'risk'],
    pattern: /\b(objection|concern|blocked|blocker|risk|too expensive|price issue|lead time|no budget|competitor|not convinced)\b/i,
  },
  {
    type: 'Internal coordination',
    tags: ['internal', 'coordination'],
    pattern: /\b(internal|sync|aligned with|coordinate|coordinated|handoff|sales ops|manager|finance team|technical team)\b/i,
  },
  {
    type: 'Admin / CRM',
    tags: ['admin', 'crm'],
    pattern: /\b(crm|admin|updated record|logged|data cleanup|forecast field|pipeline hygiene)\b/i,
  },
  {
    type: 'Follow-up',
    tags: ['follow-up'],
    pattern: /\b(follow up|follow-up|chase|remind|check in|next step|next action|send|call back|reply)\b/i,
  },
  {
    type: 'Customer meeting',
    tags: ['customer-meeting'],
    pattern: /\b(meeting|met|call|called|spoke|workshop|visited|discussion with|customer)\b/i,
  },
];

const nextActionPatterns = [
  /\b(?:need to|next action is to|action is to|i will|we will|to do:?)\s+([^.\n;]+)/i,
  /\b(?:send|share|prepare|schedule|confirm|call|follow up|follow-up|reply|update)\s+([^.\n;]+)/i,
];

const opportunityPatterns = [
  /\b(?:opportunity|deal|project|pipeline|for)\s*[:-]\s*([^.\n;]+)/i,
  /\b(?:proposal|quote|tender|demo|poc)\s+(?:for|with)\s+([^.\n;]+)/i,
];

const accountPatterns = [
  /\b(?:account|customer|client|company)\s*[:-]\s*([^.\n;]+)/i,
  /\b(?:at|from|with|for)\s+([A-Z][A-Za-z0-9&.,' -]{2,60})(?:[.\n;,]|$)/,
];

export function classifySalesActivity(rawNote: string, activityDate = todayDate()): ClassifiedSalesActivity {
  const cleanedNote = rawNote.trim();
  const matchedRule = activityRules.find((rule) => rule.pattern.test(cleanedNote));
  const activityType = matchedRule?.type || 'Other';
  const accountName = extractFirstMatch(cleanedNote, accountPatterns);
  const opportunityName = extractFirstMatch(cleanedNote, opportunityPatterns);
  const nextAction = extractNextAction(cleanedNote);
  const dueDate = extractDueDate(cleanedNote, activityDate);
  const tags = buildTags(cleanedNote, matchedRule?.tags || [], Boolean(nextAction), Boolean(dueDate));

  return {
    accountName,
    opportunityName,
    activityType,
    summary: summarize(cleanedNote, activityType, accountName),
    nextAction,
    dueDate,
    tags,
    rawNote: cleanedNote,
    activityDate,
  };
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function summarize(rawNote: string, activityType: SalesActivityType, accountName: string) {
  const firstSentence = rawNote
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .find(Boolean) || rawNote;
  const compact = firstSentence.replace(/\s+/g, ' ').trim();
  const summary = compact.length > 180 ? `${compact.slice(0, 177)}...` : compact;
  if (summary) return summary;
  return accountName ? `${activityType} with ${accountName}` : activityType;
}

function extractFirstMatch(rawNote: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = rawNote.match(pattern)?.[1]?.trim();
    if (match) return cleanExtractedPhrase(match);
  }
  return '';
}

function extractNextAction(rawNote: string) {
  for (const pattern of nextActionPatterns) {
    const match = rawNote.match(pattern)?.[1]?.trim();
    if (match) return cleanExtractedPhrase(match);
  }
  return '';
}

function cleanExtractedPhrase(value: string) {
  return value
    .replace(/^(to|the|a|an)\s+/i, '')
    .replace(/\s+(today|tomorrow|next week|by|on)$/i, '')
    .trim()
    .slice(0, 140);
}

function extractDueDate(rawNote: string, activityDate: string) {
  const lower = rawNote.toLowerCase();
  const anchor = new Date(`${activityDate}T00:00:00`);

  if (/\btoday\b/.test(lower)) return formatDate(anchor);
  if (/\btomorrow\b/.test(lower)) return addDays(anchor, 1);
  if (/\bnext week\b/.test(lower)) return addDays(anchor, 7);

  const weekday = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekday) return nextWeekday(anchor, weekday[1]);

  const isoDate = rawNote.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (isoDate) return isoDate;

  const slashDate = rawNote.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const month = Number(slashDate[1]);
    const day = Number(slashDate[2]);
    const year = slashDate[3] ? normalizeYear(slashDate[3]) : anchor.getFullYear();
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (Number.isFinite(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }

  return '';
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return formatDate(next);
}

function nextWeekday(date: Date, weekday: string) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = weekdays.indexOf(weekday);
  const daysUntilTarget = (target - date.getDay() + 7) % 7 || 7;
  return addDays(date, daysUntilTarget);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalizeYear(year: string) {
  if (year.length === 2) return 2000 + Number(year);
  return Number(year);
}

function buildTags(rawNote: string, baseTags: string[], hasNextAction: boolean, hasDueDate: boolean) {
  const tags = new Set(baseTags);
  if (hasNextAction) tags.add('next-action');
  if (hasDueDate) tags.add('due-date');
  if (/\b(no response|waiting|unclear|blocked|risk|concern)\b/i.test(rawNote)) tags.add('risk-signal');
  if (/\b(decision maker|budget owner|timeline|criteria|procurement path)\b/i.test(rawNote)) tags.add('decision-context');
  return Array.from(tags);
}
