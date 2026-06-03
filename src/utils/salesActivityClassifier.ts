import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { AccountMemoryRecord } from '../services/accountStore';

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

export type SalesActivityNextAction = {
  title: string;
  dueDate?: string;
  owner?: string;
  sourceText?: string;
};

export interface ClassifiedSalesActivity {
  accountName: string;
  opportunityName: string;
  contactName?: string;
  stakeholderName?: string;
  stakeholderRole?: string;
  competitors?: string[];
  buyingSignals?: string[];
  risks?: string[];
  timelineSignals?: string[];
  nextActions?: SalesActivityNextAction[];
  activityType: SalesActivityType;
  summary: string;
  nextAction: string;
  dueDate: string;
  tags: string[];
  rawNote: string;
  activityDate: string;
}

export type CaptureExtractionContext = {
  accounts?: Pick<AccountMemoryRecord, 'id' | 'accountName'>[];
  opportunities?: Pick<CrmLiteOpportunity, 'id' | 'accountName' | 'opportunityName' | 'productOrSolution' | 'stage'>[];
};

const activityRules: { type: SalesActivityType; tags: string[]; pattern: RegExp }[] = [
  {
    type: 'Tender / procurement',
    tags: ['procurement', 'tender'],
    pattern: /\b(tender|procurement|rfp|rfq|bid|purchasing|purchase order|po|buyer|legal review)\b/i,
  },
  {
    type: 'Quote / proposal',
    tags: ['proposal', 'quote'],
    pattern: /\b(proposal|quote|quotation|pricing|commercial offer|offer|sent price|revised price|revised quote)\b/i,
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
  /\b([A-Z][A-Za-z0-9+/-]*(?:\s+(?:[A-Z][A-Za-z0-9+/-]*|\d+)){0,4}\s+Phase\s+\d+)\b/,
];

const accountPatterns = [
  /\b(?:account|customer|client|company)\s*[:-]\s*([^.\n;]+)/i,
  /\b(?:met|meeting|spoke|call|called)\s+with\s+(?:Dr\.?|Mr\.?|Ms\.?|Mrs\.?)?\s*[A-Z][A-Za-z.' -]{1,60}\s+at\s+([A-Z][A-Z0-9&.-]{1,20})(?:\b|[.\n;,])/i,
  /\bat\s+([A-Z][A-Z0-9&.-]{1,20})(?:\b|[.\n;,])/,
  /\b(?:from|with|for)\s+([A-Z][A-Za-z0-9&.,' -]{2,60})(?:[.\n;,]|$)/,
];

const knownCompetitors = ['Incumbent Vendor', 'Global Vendor', 'Legacy Supplier', 'Competing Platform', 'Other Vendor'];

export function classifySalesActivity(
  rawNote: string,
  activityDate = todayDate(),
  context: CaptureExtractionContext = {}
): ClassifiedSalesActivity {
  const cleanedNote = rawNote.trim();
  const matchedRule = activityRules.find((rule) => rule.pattern.test(cleanedNote));
  const activityType = matchedRule?.type || 'Other';
  const entities = extractB2BEntities(cleanedNote, context);
  const nextActions = extractNextActions(cleanedNote, activityDate);
  const fallbackNextAction = extractNextAction(cleanedNote);
  const firstAction = nextActions[0];
  const nextAction = firstAction?.title || fallbackNextAction;
  const dueDate = firstAction?.dueDate || extractDueDate(cleanedNote, activityDate);
  const competitors = extractCompetitors(cleanedNote);
  const buyingSignals = extractBuyingSignals(cleanedNote);
  const timelineSignals = extractTimelineSignals(cleanedNote);
  const risks = extractRisks(cleanedNote);
  const tags = buildTags(cleanedNote, matchedRule?.tags || [], Boolean(nextAction), Boolean(dueDate), {
    competitors,
    buyingSignals,
    timelineSignals,
    risks,
  });

  return {
    accountName: entities.accountName,
    opportunityName: entities.opportunityName,
    contactName: entities.contactName,
    stakeholderName: entities.stakeholderName,
    stakeholderRole: entities.stakeholderRole,
    competitors,
    buyingSignals,
    risks,
    timelineSignals,
    nextActions,
    activityType,
    summary: summarize(cleanedNote, activityType, entities.accountName),
    nextAction,
    dueDate,
    tags,
    rawNote: cleanedNote,
    activityDate,
  };
}

export function extractB2BEntities(rawNote: string, context: CaptureExtractionContext = {}) {
  const contact = extractContact(rawNote);
  const accountSuggestion = suggestAccountAndContact(rawNote, context.accounts, context.opportunities);
  const opportunitySuggestion = suggestOpportunityFromNote(rawNote, context.opportunities);
  const opportunityName = opportunitySuggestion?.opportunityName || extractFirstMatch(rawNote, opportunityPatterns);

  return {
    accountName: accountSuggestion.accountName || extractFirstMatch(rawNote, accountPatterns),
    opportunityName,
    contactName: accountSuggestion.contactName || contact.name,
    stakeholderName: accountSuggestion.contactName || contact.name,
    stakeholderRole: contact.role,
  };
}

export function extractNextActions(rawNote: string, activityDate: string): SalesActivityNextAction[] {
  const actionSection = rawNote.match(/\b(?:need to|next actions?:?|to do:?)\s+(.+)$/i)?.[1] || rawNote;
  const candidates = actionSection
    .split(/\s+(?:and|then|;)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const actions = candidates
    .map((candidate) => candidate.match(/\b(send|share|prepare|schedule|confirm|call|follow up|follow-up|reply|update|clarify)\b[\s\S]*/i)?.[0] || '')
    .filter(Boolean)
    .map((sourceText) => {
      const dueDate = extractDueDate(sourceText, activityDate);
      return {
        title: cleanActionTitle(sourceText),
        dueDate: dueDate || undefined,
        sourceText: limitActionSource(sourceText),
      };
    })
    .filter((action) => action.title.length > 0);

  return dedupeByTitle(actions).slice(0, 5);
}

export function extractCompetitors(rawNote: string) {
  const found = new Set<string>();
  const competitorPattern = /\b(?:competitor|competing against|versus|vs\.?)\s+([A-Z][A-Z0-9&.-]{2,30})\b/gi;
  for (const match of rawNote.matchAll(competitorPattern)) {
    found.add(match[1].trim().replace(/[.,;:]$/, ''));
  }
  for (const competitor of knownCompetitors) {
    if (new RegExp(`\\b${escapeRegExp(competitor)}\\b`, 'i').test(rawNote)) {
      found.add(competitor);
    }
  }
  return Array.from(found);
}

export function extractBuyingSignals(rawNote: string) {
  const signals: string[] = [];
  if (/\bbudget\s+(?:approval|approved|confirmed|secured)\b/i.test(rawNote)) signals.push('Budget approved');
  if (/\b(?:confirmed|approved)\s+(?:budget|funding)\b/i.test(rawNote)) signals.push('Budget approved');
  if (/\bpo\b|purchase order/i.test(rawNote)) signals.push('Purchase order signal');
  if (/\bdecision maker (?:confirmed|identified)\b/i.test(rawNote)) signals.push('Decision maker identified');
  if (/\bconfirmed next step\b|next step confirmed/i.test(rawNote)) signals.push('Next step confirmed');
  if (/\bprocurement (?:approved|confirmed|engaged)\b/i.test(rawNote)) signals.push('Procurement engaged');
  return uniqueList(signals);
}

export function extractTimelineSignals(rawNote: string) {
  const signals: string[] = [];
  if (/\bnext quarter\b/i.test(rawNote)) signals.push('Next quarter');
  if (/\bthis quarter\b/i.test(rawNote)) signals.push('This quarter');
  if (/\bnext month\b/i.test(rawNote)) signals.push('Next month');
  if (/\bthis month\b/i.test(rawNote)) signals.push('This month');
  if (/\btender date\b/i.test(rawNote)) signals.push('Tender date mentioned');
  if (/\bclose(?:s|d)?\s+(?:by|in)\s+q[1-4]\b/i.test(rawNote)) signals.push('Quarter close timing');
  return uniqueList(signals);
}

export function suggestAccountAndContact(
  rawNote: string,
  accounts: CaptureExtractionContext['accounts'] = [],
  opportunities: CaptureExtractionContext['opportunities'] = []
) {
  const contact = extractContact(rawNote);
  const normalizedNote = normalize(rawNote);
  const accountFromAt = extractFirstMatch(rawNote, accountPatterns);
  const matchedAccount = accounts.find((account) => normalize(account.accountName) && normalizedNote.includes(normalize(account.accountName)));
  const matchedOpportunityAccount = opportunities.find((opportunity) => normalize(opportunity.accountName) && normalizedNote.includes(normalize(opportunity.accountName)));

  return {
    accountName: matchedAccount?.accountName || matchedOpportunityAccount?.accountName || accountFromAt,
    contactName: contact.name,
  };
}

export function suggestOpportunityFromNote(
  rawNote: string,
  opportunities: CaptureExtractionContext['opportunities'] = []
) {
  const noteTokens = meaningfulTokens(rawNote);
  const best = opportunities
    .map((opportunity) => {
      const opportunityTokens = meaningfulTokens(`${opportunity.opportunityName} ${opportunity.productOrSolution || ''}`);
      const overlap = opportunityTokens.filter((token) => noteTokens.includes(token)).length;
      const accountMentioned = normalize(rawNote).includes(normalize(opportunity.accountName));
      const partial = hasPartialPhrase(rawNote, opportunity.opportunityName);
      return { opportunity, score: overlap + (accountMentioned ? 2 : 0) + (partial ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (best && best.score >= 2) return best.opportunity;
  return null;
}

export function extractDueDate(rawNote: string, activityDate: string) {
  const lower = rawNote.toLowerCase();
  const anchor = parseDateKey(activityDate);

  if (/\btoday\b/.test(lower)) return formatDate(anchor);
  if (/\btomorrow\b/.test(lower)) return addDays(anchor, 1);
  if (/\bnext week\b/.test(lower)) return addDays(anchor, 7);

  const nextWeekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextWeekdayMatch) return nextWeekday(anchor, nextWeekdayMatch[1]);

  const weekdayMatch = lower.match(/\b(?:by|on|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) return upcomingWeekday(anchor, weekdayMatch[1]);

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

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function summarize(rawNote: string, activityType: SalesActivityType, accountName: string) {
  const protectedNote = rawNote.replace(/\bDr\.\s+/g, 'Dr<dot> ');
  const firstSentence = protectedNote
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .find(Boolean)?.replace(/Dr<dot>/g, 'Dr.') || rawNote;
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

function extractContact(rawNote: string) {
  const match = rawNote.match(/\b(?:met|meeting|spoke|call|called)\s+with\s+((?:Dr\.?|Mr\.?|Ms\.?|Mrs\.?)\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})(?:\s+at\b|\s+from\b|[.,;]|$)/i);
  const name = match?.[1]?.trim() || '';
  const role = name.match(/^(Dr\.?|Doctor)\b/i) ? 'Doctor' : '';
  return { name, role };
}

function extractNextAction(rawNote: string) {
  for (const pattern of nextActionPatterns) {
    const match = rawNote.match(pattern)?.[1]?.trim();
    if (match) return cleanActionTitle(match);
  }
  return '';
}

function cleanExtractedPhrase(value: string) {
  return value
    .replace(/^(to|the|a|an)\s+/i, '')
    .replace(/\s+(today|tomorrow|next week|by|on)$/i, '')
    .replace(/[.,;:]$/g, '')
    .trim()
    .slice(0, 140);
}

function cleanActionTitle(value: string) {
  return cleanSentence(value)
    .replace(/^(need to|to|please|we should|i should)\s+/i, '')
    .replace(/\s+\b(?:by|on|next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|quarter)\b.*$/i, '')
    .trim()
    .replace(/^(send)\s+(.+)$/i, (_, verb: string, object: string) => `${capitalize(verb)} ${object}`)
    .replace(/^(follow up)\s+(.+)$/i, (_, verb: string, object: string) => `${capitalize(verb)} ${object}`)
    .slice(0, 160);
}

function cleanSentence(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[.;]$/g, '').trim();
}

function limitActionSource(value: string) {
  const cleaned = cleanSentence(value);
  const weekdayMatch = cleaned.match(/^(.+?\b(?:by|on|next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i);
  if (weekdayMatch) return weekdayMatch[1].trim();
  return cleaned.split(/(?<=[.!?])\s+/)[0].trim();
}

function extractRisks(rawNote: string) {
  const risks: string[] = [];
  if (/\bcompetitor\b|still in the loop/i.test(rawNote)) risks.push('Competitor still active');
  if (/\blead time\b/i.test(rawNote)) risks.push('Lead time concern');
  if (/\bno response|waiting|unclear|not confirmed\b/i.test(rawNote)) risks.push('Unclear response or confirmation');
  if (/\bprocurement\b/i.test(rawNote) && !/\bconfirmed procurement|procurement owner confirmed\b/i.test(rawNote)) risks.push('Procurement path needs follow-up');
  return uniqueList(risks);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(date.getUTCDate() + days);
  return formatDate(next);
}

function nextWeekday(date: Date, weekday: string) {
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = weekdays.indexOf(weekday);
  const daysUntilTarget = (target - date.getUTCDay() + 7) % 7 || 7;
  return addDays(date, daysUntilTarget);
}

function upcomingWeekday(date: Date, weekday: string) {
  return nextWeekday(date, weekday);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function normalizeYear(year: string) {
  if (year.length === 2) return 2000 + Number(year);
  return Number(year);
}

function buildTags(
  rawNote: string,
  baseTags: string[],
  hasNextAction: boolean,
  hasDueDate: boolean,
  extracted: { competitors: string[]; buyingSignals: string[]; timelineSignals: string[]; risks: string[] }
) {
  const tags = new Set(baseTags);
  if (hasNextAction) tags.add('next-action');
  if (hasDueDate) tags.add('due-date');
  if (extracted.competitors.length) tags.add('competitor');
  if (extracted.buyingSignals.length) tags.add('buying-signal');
  if (extracted.timelineSignals.length) tags.add('timeline');
  if (extracted.risks.length || /\b(no response|waiting|unclear|blocked|risk|concern)\b/i.test(rawNote)) tags.add('risk-signal');
  if (/\b(decision maker|budget owner|timeline|criteria|procurement path)\b/i.test(rawNote)) tags.add('decision-context');
  return Array.from(tags);
}

function dedupeByTitle(actions: SalesActivityNextAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = normalize(action.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meaningfulTokens(value: string) {
  const stopWords = new Set(['phase', 'project', 'opportunity', 'workflow', 'discussion', 'deal', 'the', 'and', 'for', 'with', 'next']);
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function hasPartialPhrase(note: string, opportunityName: string) {
  const noteNormalized = normalize(note);
  const opportunityNormalized = normalize(opportunityName);
  if (!noteNormalized || !opportunityNormalized) return false;
  return noteNormalized.includes(opportunityNormalized) || opportunityNormalized.includes(noteNormalized);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
