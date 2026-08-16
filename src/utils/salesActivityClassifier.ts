import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { AccountMemoryRecord } from '../services/accountStore';
import type { CaptureAccountAlias, CaptureCorrectionEvent } from '../services/captureCorrectionMemoryStore';
import type { IngestionSourceType } from './ingestionSource.ts';
import { sanitizeBusinessDate, todayDateKey, toLocalDateKey } from './safeDate.ts';
import { resolveCaptureEntities } from './captureEntityResolution.ts';

export type SalesActivityType =
  | 'Customer meeting'
  | 'Follow-up'
  | 'Demo / technical discussion'
  | 'Quote / proposal'
  | 'Tender / procurement'
  | 'Internal coordination'
  | 'Objection handling'
  | 'Admin / CRM'
  | 'Payment / invoice'
  | 'Delivery / fulfillment'
  | 'Partnership'
  | 'Marketing / content'
  | 'Product / build'
  | 'Learning / research'
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
  sourceType?: IngestionSourceType;
  sourceLabel?: string;
  sourceTimestamp?: string;
  sourceHash?: string;
  originalExcerpt?: string;
}

export type CaptureExtractionContext = {
  accounts?: Pick<AccountMemoryRecord, 'id' | 'accountName'>[];
  opportunities?: Pick<CrmLiteOpportunity, 'id' | 'accountName' | 'opportunityName' | 'productOrSolution' | 'stage'>[];
  corrections?: CaptureCorrectionEvent[];
  aliases?: CaptureAccountAlias[];
  source?: {
    sourceType: IngestionSourceType;
    sourceLabel: string;
    sourceTimestamp?: string;
    safeHash?: string;
    originalExcerpt?: string;
  };
};

const activityRules: { type: SalesActivityType; tags: string[]; pattern: RegExp }[] = [
  // Whole-business activity types (Business Activity OS): money, delivery,
  // partnership, marketing, product, and learning work all land in the same
  // ledger. Order matters - more specific commercial states match first.
  {
    type: 'Payment / invoice',
    tags: ['payment', 'money'],
    pattern: /\b(payment received|paid|invoice|invoiced|payment due|payment term|deposit|remittance|bank transfer|overdue payment|collect payment)\b/i,
  },
  {
    type: 'Delivery / fulfillment',
    tags: ['delivery', 'fulfillment'],
    pattern: /\b(delivered|delivery|shipment|shipped|installation|installed|fulfillment|handover|go-live|kickoff completed|onboarding session)\b/i,
  },
  {
    type: 'Partnership',
    tags: ['partnership'],
    pattern: /\b(partnership|partner call|co-sell|referral|alliance|distributor agreement|reseller)\b/i,
  },
  {
    type: 'Marketing / content',
    tags: ['marketing', 'content'],
    pattern: /\b(published|content|post|linkedin|newsletter|campaign|outreach batch|webinar|case study published)\b/i,
  },
  {
    type: 'Product / build',
    tags: ['product', 'build'],
    pattern: /\b(shipped feature|built|prototype|product update|release|bugfix|saas|deployed)\b/i,
  },
  {
    type: 'Learning / research',
    tags: ['learning', 'research'],
    pattern: /\b(research|researched|market study|learning|course|experiment result|interviewed|customer discovery|market learning)\b/i,
  },
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
  // The gerund, which is how a note written in a hurry states the promise:
  // "Sending the support proof Friday." Nothing above reads it, so the note on
  // the product's own landing page - the one a buyer is shown before they sign
  // up - produced no next action at all.
  /\b(?:[Ss]ending|[Ss]haring|[Pp]reparing|[Ss]cheduling|[Cc]onfirming|[Cc]alling|[Rr]eplying|[Uu]pdating|[Cc]hasing|[Ff]ollowing up)\s+([^.\n;]+)/,
];

const opportunityPatterns = [
  /\b(?:opportunity|deal|project|pipeline|for)\s*[:-]\s*([^.\n;]+)/i,
  /\b(?:proposal|quote|tender|demo|poc)\s+(?:for|with)\s+([^.\n;]+)/i,
  /\b([A-Z][A-Za-z0-9+/-]*(?:\s+(?:[A-Z][A-Za-z0-9+/-]*|\d+)){0,4}\s+Phase\s+\d+)\b/,
];

const accountPatterns = [
  /\b(?:account|customer|client|company)\s*[:-]\s*([^.\n;]+)/i,
  // "Called Minh at Dai Viet Steel today" - the company is what follows "at",
  // and the name in front of it is a person. Without this, the pattern below
  // captured the lot and created an account called "Minh at Dai Viet Steel";
  // the next note about the same customer named a different colleague and
  // created a second one. Case-sensitive, because the capital letter is the
  // only thing separating a company from the words around it.
  /\b(?:[Mm]et|[Vv]isited|[Cc]alled|[Ss]aw|[Ee]mailed|[Ss]poke\s+(?:to|with))\s+(?:with\s+)?(?:Dr\.?|Mr\.?|Ms\.?|Mrs\.?)?\s*[A-Z][A-Za-z.'-]{1,30}(?:\s+[A-Z][A-Za-z.'-]{1,30}){0,3}\s+(?:at|from|of)\s+([A-Z][A-Za-z0-9&.' -]{2,60}?)(?=\s+(?:today|yesterday|this\s+\w+|last\s+\w+|about\b|on\s+\d)|[.\n;,]|$)/,
  // The same sentence with the person's job title in the middle of it: "Met
  // Kenji Sato, procurement manager at Sakura Manufacturing". The pattern above
  // needs the company to follow the name directly, so an appositive - which is
  // how anybody introduces a contact they have just met - left the whole note
  // attached to nobody. The role is required to be lowercase and short, so this
  // reads a job title rather than swallowing half a sentence.
  /\b(?:[Mm]et|[Vv]isited|[Cc]alled|[Ss]aw|[Ee]mailed|[Ss]poke\s+(?:to|with))\s+(?:with\s+)?(?:Dr\.?|Mr\.?|Ms\.?|Mrs\.?)?\s*[A-Z][A-Za-z.'-]{1,30}(?:\s+[A-Z][A-Za-z.'-]{1,30}){0,3}\s*,\s*[a-z][a-z/&' -]{2,40}?\s+(?:at|from|of)\s+([A-Z][A-Za-z0-9&.' -]{2,60}?)(?=\s+(?:today|yesterday|this\s+\w+|last\s+\w+|about\b|on\s+\d)|[.\n;,]|$)/,
  // Case-sensitive: `/i` made the leading `[A-Z]` meaningless, so "Met the
  // buyer today" proposed an account called "the buyer".
  /\b(?:[Mm]et|[Vv]isited|[Cc]alled)\s+([A-Z][A-Za-z0-9&.' -]{2,60}?)\s+(?:today|yesterday|this\s+(?:morning|afternoon|week)|on\s+\d)/,
  // The same verbs when a dash or a comma ends the clause instead of a time
  // word: "Called Halden Industrial - Dana Reyes likes the proposal". That is
  // the note printed on the product's own landing page, and it attached to
  // nobody. A run of capitalised words, so it stops before the person does.
  /\b(?:[Mm]et|[Vv]isited|[Cc]alled)\s+([A-Z][A-Za-z0-9&'-]{1,30}(?:\s+[A-Z][A-Za-z0-9&'-]{1,30}){0,3})\s*(?:[-–—,:]|\.\s|$)/,
  /\b(?:met|meeting|spoke|call|called)\s+with\s+(?:Dr\.?|Mr\.?|Ms\.?|Mrs\.?)?\s*[A-Z][A-Za-z.' -]{1,60}\s+at\s+([A-Z][A-Z0-9&.-]{1,20})(?:\b|[.\n;,])/i,
  /\bat\s+([A-Z][A-Z0-9&.-]{1,20})(?:\b|[.\n;,])/,
  // The weakest fallback, and it used to run to the end of the sentence: it
  // read up to the next comma or full stop, so "Quote for Northstar Foods went
  // out yesterday." proposed a customer called "Northstar Foods went out
  // yesterday", and "Spoke with John, our own logistics lead, about the
  // shipment." proposed one called "John, our own logistics lead, about the
  // shipment". Both were created as accounts, with a thread and a merge
  // candidate each. A company name is a run of capitalised words, so the run is
  // what is taken, and it stops at the first ordinary word.
  /\b(?:from|for)\s+([A-Z][A-Za-z0-9&'-]{1,30}(?:\s+[A-Z][A-Za-z0-9&'-]{1,30}){0,4})/,
  // "with" needs at least two capitalised words: "with John" is a colleague far
  // more often than it is a company, and one wrong account is more expensive to
  // undo than one missed suggestion is to type.
  /\bwith\s+([A-Z][A-Za-z0-9&'-]{1,30}(?:\s+[A-Z][A-Za-z0-9&'-]{1,30}){1,4})/,
];

const knownCompetitors = ['Incumbent Vendor', 'Global Vendor', 'Legacy Supplier', 'Competing Platform', 'Other Vendor'];

export function classifySalesActivity(
  rawNote: string,
  activityDate = todayDate(),
  context: CaptureExtractionContext = {}
): ClassifiedSalesActivity {
  const cleanedNote = rawNote.trim();
  // Specific whole-business states (payment, delivery, partnership, content,
  // build, learning) win before the generic meeting shortcut - "partner call"
  // is a Partnership record, not a customer meeting.
  const specificBusinessTypes = new Set<SalesActivityType>([
    'Payment / invoice',
    'Delivery / fulfillment',
    'Partnership',
    'Marketing / content',
    'Product / build',
    'Learning / research',
  ]);
  const businessRule = activityRules.find((rule) => specificBusinessTypes.has(rule.type) && rule.pattern.test(cleanedNote));
  const meetingRule = activityRules.find((rule) => rule.type === 'Customer meeting');
  const matchedRule = businessRule
    || (meetingRule?.pattern.test(cleanedNote)
      ? meetingRule
      : activityRules.find((rule) => rule.pattern.test(cleanedNote)));
  const activityType = matchedRule?.type || 'Other';
  const entities = extractB2BEntities(cleanedNote, context);
  const nextActions = extractNextActions(cleanedNote, activityDate);
  const fallbackNextAction = extractNextAction(cleanedNote);
  const firstAction = nextActions[0];
  const nextAction = firstAction?.title || fallbackNextAction;
  // Scoped to the promise. See `commitmentScope`: the whole note also contains
  // the day the touch happened, and that is not a deadline.
  const dueDate = firstAction?.dueDate || extractDueDate(commitmentScope(cleanedNote), activityDate);
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
    // When the rules read nothing out of the note, the summary is the only
    // structured trace of it there is, so it keeps the whole note rather than
    // the opening sentence. See `summarize`.
    summary: summarize(cleanedNote, activityType, entities.accountName, {
      keepWhole: !nextAction && !dueDate && !entities.accountName,
    }),
    nextAction,
    dueDate,
    tags,
    rawNote: cleanedNote,
    activityDate,
    ...(context.source ? {
      sourceType: context.source.sourceType,
      sourceLabel: context.source.sourceLabel,
      sourceTimestamp: context.source.sourceTimestamp,
      sourceHash: context.source.safeHash,
      originalExcerpt: context.source.originalExcerpt,
    } : {}),
  };
}

export function extractB2BEntities(rawNote: string, context: CaptureExtractionContext = {}) {
  const contact = extractContact(rawNote);
  const accountSuggestion = suggestAccountAndContact(rawNote, context.accounts, context.opportunities);
  const opportunitySuggestion = suggestOpportunityFromNote(rawNote, context.opportunities);
  const resolution = resolveCaptureEntities({
    rawNote,
    accountName: accountSuggestion.accountName || extractFirstMatch(rawNote, accountPatterns),
    contactName: accountSuggestion.contactName || contact.name,
    opportunityName: opportunitySuggestion?.opportunityName || extractFirstMatch(rawNote, opportunityPatterns),
    suggestedOpportunityId: opportunitySuggestion?.id,
    accounts: context.accounts,
    opportunities: context.opportunities,
    corrections: context.corrections,
    aliases: context.aliases,
  });

  return {
    accountName: resolution.accountName,
    opportunityName: resolution.opportunityName,
    contactName: resolution.contactName,
    stakeholderName: resolution.contactName,
    stakeholderRole: contact.role,
  };
}

/**
 * Whether the verb that started this candidate is standing behind a negation.
 *
 * "No reply yet", "no update from them", "they never replied", "still waiting,
 * no confirmation" - all of them contain a verb this file otherwise reads as a
 * promise. The check looks at the few words in front of the match in the
 * original note, because by the time a candidate is sliced out the negation has
 * been left behind.
 */
function isNegatedAction(sourceText: string, rawNote: string) {
  const at = rawNote.indexOf(sourceText);
  if (at < 0) return false;
  const before = rawNote.slice(Math.max(0, at - 24), at).toLowerCase();
  return /\b(no|not|never|without|didn'?t|hasn'?t|haven'?t|couldn'?t|wouldn'?t|awaiting|still awaiting)\s*$/.test(before.replace(/[,;:\-\s]+$/, ' ').trimEnd() + ' ')
    || /\b(no|not|never|without|didn'?t|hasn'?t|haven'?t)\s+\w{0,12}$/.test(before);
}

export function extractNextActions(rawNote: string, activityDate: string): SalesActivityNextAction[] {
  const actionSection = rawNote.match(/\b(?:need to|next actions?:?|to do:?)\s+(.+)$/i)?.[1] || rawNote;
  const candidates = actionSection
    .split(/\s+(?:and|then|;)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const actions = candidates
    // The gerund is in here too: "Sending the support proof Friday" is a
    // promise, and until it was read the Plan got nothing from a note written
    // that way - including the note on the product's own landing page.
    .map((candidate) => candidate.match(/\b(send|share|prepare|schedule|confirm|call|follow up|follow-up|reply|update|clarify|sending|sharing|preparing|scheduling|confirming|calling|replying|updating|chasing|following up)\b[^.\n;]*/i)?.[0] || '')
    .filter(Boolean)
    // A month of ordinary notes turned "No reply yet." into a commitment called
    // "reply yet", sitting on the Plan with a date. A verb behind a negation is
    // a report of what did not happen, not a promise that it will.
    .filter((sourceText) => !isNegatedAction(sourceText, rawNote))
    .map((sourceText) => {
      // A weekday with no preposition in front of it - "Sending the support
      // proof Friday" - is a deadline when it is inside the promise itself.
      // Only here: across a whole note a bare weekday is as often the day the
      // meeting happened as the day something is due.
      const dueDate = extractDueDate(sourceText, activityDate)
        || bareWeekdayDueDate(sourceText, activityDate);
      return {
        title: cleanActionTitle(sourceText),
        dueDate: dueDate || undefined,
        sourceText: limitActionSource(sourceText),
      };
    })
    .filter((action) => action.title.length > 0);

  return dedupeByTitle(actions).slice(0, 5);
}

/**
 * Words that follow "versus" far more often than a competitor's name does. A
 * note that opens a clause with a capital ("Versus The incumbent") must not
 * name an account after an article.
 */
const competitorStopWords = new Set([
  'the', 'a', 'an', 'our', 'ours', 'their', 'theirs', 'his', 'her', 'its',
  'this', 'that', 'these', 'those', 'us', 'them', 'it', 'we', 'they',
  'another', 'other', 'others', 'local', 'current', 'existing', 'previous',
  'one', 'two', 'three', 'last', 'next', 'same', 'both', 'everyone', 'someone',
]);

export function extractCompetitors(rawNote: string) {
  const found = new Set<string>();
  // Case-sensitive on purpose, the same rule the account patterns above already
  // learned: `/i` made the leading `[A-Z]` meaningless, so "our lead time is 10
  // weeks versus the local supplier" recorded a competitor called "the" - on
  // the deal, in the tags, and in every competitor count derived from them. The
  // capital is the only thing separating a company from the words around it, so
  // the keyword carries its own casing and the name stays capitalised. Up to
  // three capitalised words, because "Nordic Freight" is one competitor and the
  // old ALL-CAPS-only tail could not hold it.
  const competitorPattern = /\b(?:[Cc]ompetitor|[Cc]ompeting against|[Cc]ompar(?:ing|ed)\s+(?:us\s+|it\s+|this\s+)?(?:against|to|with)|[Bb]enchmark(?:ing|ed)\s+against|[Uu]p against|[Vv]ersus|[Vv][Ss]\.?)\s+([A-Z][A-Za-z0-9&'-]{1,30}(?:\s+[A-Z][A-Za-z0-9&'-]{1,30}){0,2})/g;
  for (const match of rawNote.matchAll(competitorPattern)) {
    const candidate = match[1].trim().replace(/[.,;:]$/, '');
    const [firstWord] = candidate.split(/\s+/);
    if (competitorStopWords.has(firstWord.toLowerCase())) continue;
    found.add(candidate);
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
  if (/\bpayment\b/i.test(rawNote)) signals.push('Payment signal');
  if (/\bdelivery\b/i.test(rawNote)) signals.push('Delivery signal');
  if (/\bquote|quotation|commercial offer\b/i.test(rawNote)) signals.push('Quote/commercial signal');
  if (/\bdecision maker (?:confirmed|identified)\b/i.test(rawNote)) signals.push('Decision maker identified');
  if (/\bconfirmed next step\b|next step confirmed/i.test(rawNote)) signals.push('Next step confirmed');
  if (/\bprocurement (?:approved|confirmed|engaged)\b/i.test(rawNote)) signals.push('Procurement engaged');
  return uniqueList(signals);
}

export function extractTimelineSignals(rawNote: string) {
  const signals: string[] = [];
  const tenderDecision = rawNote.match(/\b(tender decision (?:is )?expected\s+[^.\n;]+)/i)?.[1];
  if (tenderDecision) signals.push(cleanSentence(tenderDecision).replace(/^./, (character) => character.toUpperCase()));
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
  const normalizedNote = normalize(rawNote);
  const best = opportunities
    .map((opportunity) => {
      const opportunityTokens = meaningfulTokens(`${opportunity.opportunityName} ${opportunity.productOrSolution || ''}`);
      const overlap = opportunityTokens.filter((token) => noteTokens.includes(token)).length;
      // The guard is the whole point: `normalize('')` is `''`, and every string
      // contains the empty string. Without it, any deal whose account name is
      // blank scored 2 against every note ever typed - which is the threshold -
      // so an unrelated deal was offered first, labelled High confidence, with
      // "note mentions opportunity" as its stated reason.
      const opportunityAccount = normalize(opportunity.accountName);
      const accountMentioned = Boolean(opportunityAccount) && normalizedNote.includes(opportunityAccount);
      const partial = hasPartialPhrase(rawNote, opportunity.opportunityName);
      return { opportunity, score: overlap + (accountMentioned ? 2 : 0) + (partial ? 3 : 0) };
    })
    .sort((a, b) => b.score - a.score)[0];

  if (best && best.score >= 2) return best.opportunity;
  return null;
}

/**
 * Words that start the part of a note where a promise lives.
 *
 * A note is two things in one paragraph: what happened, and what happens next.
 * Only the second half can carry a due date, and reading the whole note for one
 * is how "Called Minh at Dai Viet Steel today. ... I need to send the quote
 * before Friday." came out dated today - the `today` describing the call was
 * taken as the deadline for the quote, and the plan then showed the commitment
 * on the wrong day. It is the exact failure the product exists to prevent.
 */
const COMMITMENT_CUE = /\b(?:need(?:s)? to|have to|has to|must|will|going to|next actions?|to do|follow[- ]up|deadline|due|by|before|send(?:ing)?|shar(?:e|ing)|prepar(?:e|ing)|schedul(?:e|ing)|confirm(?:ing)?|repl(?:y|ying)|updat(?:e|ing)|clarify|deliver|chas(?:e|ing)|revert|quote back)\b/i;

/**
 * The part of a note that could contain a promise, or nothing.
 *
 * Deliberately returns `''` rather than the whole note when no cue is found: a
 * note with no commitment in it has no due date, and guessing one is worse than
 * leaving the field empty for the operator to fill.
 */
export function commitmentScope(rawNote: string) {
  const match = rawNote.match(COMMITMENT_CUE);
  if (!match || match.index === undefined) return '';
  return rawNote.slice(match.index);
}

export function extractDueDate(rawNote: string, activityDate: string) {
  const lower = rawNote.toLowerCase();
  const anchor = parseDateKey(activityDate);

  if (/\btoday\b/.test(lower)) return formatDate(anchor);
  if (/\btomorrow\b/.test(lower)) return addDays(anchor, 1);
  if (/\bnext week\b/.test(lower)) return addDays(anchor, 7);

  const nextWeekdayMatch = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextWeekdayMatch) return nextWeekday(anchor, nextWeekdayMatch[1]);

  // "before Friday" is how a commitment is usually written and it was in none
  // of these, so the phrase produced no date at all and the fallback below
  // picked up the "today" that belonged to the narration instead.
  const weekdayMatch = lower.match(/\b(?:by|on|this|before|after|ahead of|prior to|due|end of|no later than|not later than)\s+(?:end\s+of\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) return upcomingWeekday(anchor, weekdayMatch[1]);

  const isoDate = rawNote.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];
  if (isoDate) return sanitizeBusinessDate(isoDate);

  const namedMonthDate = readNamedMonthDate(rawNote, anchor);
  if (namedMonthDate) return namedMonthDate;

  const slashDate = rawNote.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashDate) {
    const parsed = readSlashDate(slashDate[1], slashDate[2], slashDate[3], anchor.getFullYear());
    if (parsed) return sanitizeBusinessDate(parsed);
  }

  return '';
}

const MONTH_WORDS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const MONTH_PATTERN = '(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\\.?';

/**
 * A month written as a word: "by 21 August", "before Sept 3", "due March 2nd".
 *
 * This was the one deadline format the parser could not read, and outside
 * day/month-number countries it is how a deadline is written in an email. The
 * cost was silent and exactly the failure this product exists to prevent: the
 * note "send a revised quote by 21 August" produced a next action with no date,
 * so nothing landed on the Plan, nothing was watched, and the operator was told
 * their commitment was recorded.
 *
 * A year is rarely written, so it is inferred: this year, unless that date has
 * already passed, which is how a note written in December means next January.
 */
function readNamedMonthDate(rawNote: string, anchor: Date) {
  // `(?!\d)` on the day, so "expected March 2027" - a month and a year, with no
  // day in it at all - is not read as the 20th of March.
  const dayFirst = rawNote.match(new RegExp(`\\b(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}(?:,?\\s+(\\d{4}))?`, 'i'));
  const monthFirst = rawNote.match(new RegExp(`\\b${MONTH_PATTERN}\\s+(\\d{1,2})(?!\\d)(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?`, 'i'));

  const readMatch = (monthToken: string, dayPart: string, yearPart?: string) => {
    // "may" is also the commonest modal verb in a sales note ("they may 3 or 4
    // units"), so as a month it has to be written as one: capitalised.
    if (monthToken.toLowerCase().startsWith('may') && !monthToken.startsWith('May')) return '';
    const month = MONTH_WORDS.findIndex((name) => name.startsWith(monthToken.toLowerCase().replace(/\.$/, '').slice(0, 3)));
    const day = Number(dayPart);
    if (month < 0 || !Number.isFinite(day) || day < 1 || day > 31) return '';

    const year = yearPart ? Number(yearPart) : anchor.getUTCFullYear();
    const candidate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const sanitized = sanitizeBusinessDate(candidate);
    if (!sanitized) return '';
    if (yearPart || sanitized >= formatDate(anchor)) return sanitized;
    return sanitizeBusinessDate(`${year + 1}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  };

  // Whichever form is written first in the note wins, so "21 August" is not
  // out-read by a stray "August 2026" later in the same sentence.
  const dayFirstAt = dayFirst?.index ?? Number.MAX_SAFE_INTEGER;
  const monthFirstAt = monthFirst?.index ?? Number.MAX_SAFE_INTEGER;
  if (dayFirst && dayFirstAt <= monthFirstAt) {
    const read = readMatch(dayFirst[2], dayFirst[1], dayFirst[3]);
    if (read) return read;
  }
  if (monthFirst) {
    const read = readMatch(monthFirst[1], monthFirst[2], monthFirst[3]);
    if (read) return read;
  }
  return '';
}

/**
 * Whether this operator writes the month first.
 *
 * Only the United States and a handful of places that follow it write 12/08 for
 * December 8th; the rest of the world writes the day first, and the product
 * assumed that for everybody. That was right for the operator it was written
 * for and four months wrong for a seller in Chicago typing a date into the same
 * box - the identical failure the note below describes, pointed the other way.
 *
 * The browser's own locale is the signal, because it is what that person's
 * machine already uses to render every other date they see. No new question at
 * signup, and the capture screen still shows the parsed date for confirmation
 * before anything is saved.
 */
function prefersMonthFirstDates() {
  // A browser, specifically: Node reports `en-US` on its own `navigator`, and
  // the contract scripts and the prerender step run there. Day-first stays the
  // documented default for everything that is not somebody's browser.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const locales = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  return locales.some((locale) => /^en-(US|PH)\b/i.test(locale));
}

/**
 * A slash date, read the way this operator writes one.
 *
 * This used to read `12/08/2026` as December 8th for everybody. The date input
 * sitting beside the note in the same capture form renders that same day as
 * `08/12/2026`, so the parser and the field two inches away from it disagreed by
 * four months - on a product whose whole claim is that a deal will not go quiet
 * on you.
 *
 * The ordering is only assumed when the numbers are genuinely ambiguous. A first
 * part above 12 can only be a day, and a second part above 12 can only be a
 * month, so `12/25` is read as December 25th rather than refused - a note is not
 * a form and people paste both.
 */
function readSlashDate(firstPart: string, secondPart: string, yearPart: string | undefined, fallbackYear: number) {
  const first = Number(firstPart);
  const second = Number(secondPart);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return '';

  const ambiguous = first <= 12 && second <= 12;
  const dayFirst = ambiguous ? !prefersMonthFirstDates() : second <= 12;
  const day = dayFirst ? first : second;
  const month = dayFirst ? second : first;
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';

  const year = yearPart ? normalizeYear(yearPart) : fallbackYear;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayDate() {
  return todayDateKey();
}

/**
 * The one or two sentences worth keeping.
 *
 * It used to keep the first sentence and nothing else, which is the wrong half
 * of most notes: a note opens with what happened and closes with what was
 * promised, and the promise is the part somebody comes back for. "Gọi cho anh
 * Minh... 250 triệu. Hẹn gửi báo giá trước thứ Sáu." was stored without the
 * sentence containing the commitment - and on a note the parser could not
 * otherwise read, that summary was the only record of it left.
 *
 * So the sentence carrying the promise is kept alongside the opening one, when
 * it is not already that sentence. Still bounded: a summary is a summary.
 */
function summarize(
  rawNote: string,
  activityType: SalesActivityType,
  accountName: string,
  options: { keepWhole?: boolean } = {},
) {
  const noteForSummary = rawNote.match(/\bBody excerpt:\s*([\s\S]+)/i)?.[1]?.trim() || rawNote;
  const protectedNote = noteForSummary.replace(/\b(Ms|Mr|Mrs|Dr)\.\s+/gi, '$1<dot> ');
  const sentences = protectedNote
    .split(/\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/\b(Ms|Mr|Mrs|Dr)<dot>/gi, '$1.').trim())
    .filter(Boolean);

  const firstSentence = sentences[0] || noteForSummary;
  const promiseSentence = sentences.slice(1).find((sentence) => COMMITMENT_CUE.test(sentence)) || '';
  // Compressing to the opening sentence is only safe because the fields beside
  // it hold the rest. Where the rules found no customer, no next step and no
  // date - which is what a note in any language the rules do not model looks
  // like - that assumption is false and the compression is data loss.
  const joined = options.keepWhole
    ? sentences.join(' ') || noteForSummary
    : promiseSentence ? `${firstSentence} ${promiseSentence}` : firstSentence;

  const compact = joined.replace(/\s+/g, ' ').trim();
  const summary = compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
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
  // Deliberately case-sensitive after the verb: the trailing groups are what
  // stop "Ms. Huyen is the buyer" from capturing "Huyen is the", and only
  // capitalisation can tell a name from the rest of the sentence. Requiring a
  // full stop or "at"/"from" behind the name instead - which is what this did -
  // meant the commonest sentence a seller writes resolved to nobody.
  const match = rawNote.match(/\b(?:[Ww]ith|[Cc]all(?:ed)?|[Mm]et)\s+((?:Dr|Mr|Ms|Mrs)\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2})\b/);
  // A person named by what they did, which is how a note mentions the person
  // who matters: "Dana Reyes likes the proposal", "Anke Vogt asked for the
  // BOM". Two capitalised words and a verb of opinion or request - narrow on
  // purpose, because a wrong name on a stakeholder map is worse than none.
  const byVerb = match
    ? null
    // No full stop inside a name, or "Called Nordwind Marine. They want ..."
    // reads the sentence boundary as part of the person: "Marine. They".
    : rawNote.match(/\b([A-Z][A-Za-z'-]{1,20}\s+[A-Z][A-Za-z'-]{1,20})\s+(?:likes?|wants?|asked|asks|said|says|prefers?|raised|confirmed|agreed|needs?|is\s+the\s+)/);
  const name = (match?.[1] || byVerb?.[1] || '').trim();
  const role = name.match(/^(Dr\.?|Doctor)\b/i) ? 'Doctor' : '';
  return { name, role };
}

function extractNextAction(rawNote: string) {
  for (const pattern of nextActionPatterns) {
    const found = rawNote.match(pattern);
    const match = found?.[1]?.trim();
    if (!match) continue;
    // Same rule as the list above: a verb behind a negation is a report, not a
    // promise. "No reply yet." produced a next action called "yet".
    if (typeof found?.index === 'number' && isNegatedAction(found[0], rawNote)) continue;
    return cleanActionTitle(match);
  }
  return '';
}


/**
 * A weekday at the end of a promise, with no preposition in front of it.
 *
 * "Sending the support proof Friday" is a deadline; the rules in
 * `extractDueDate` only read a weekday when something like "by" or "before"
 * introduces it. This is applied to the action phrase alone and never to a
 * whole note, because across a note a bare weekday is as often the day the
 * meeting happened as the day something is owed.
 */
function bareWeekdayDueDate(actionText: string, activityDate: string) {
  const words = actionText.toLowerCase().replace(/[.!?,]+$/, '').trim().split(/\s+/);
  const last = words[words.length - 1] || '';
  const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  if (!weekdays.includes(last)) return '';
  return upcomingWeekday(parseDateKey(activityDate), last);
}

function cleanExtractedPhrase(value: string) {
  return value
    .replace(/^(to|the|a|an)\s+/i, '')
    .replace(/\s+(today|tomorrow|next week|by|on)$/i, '')
    .replace(/[.,;:]$/g, '')
    .trim()
    .slice(0, 140);
}

/** "Sending the quote" is the same promise as "Send the quote", and a list of work reads in the imperative. */
const GERUND_TO_IMPERATIVE: Record<string, string> = {
  sending: 'Send', sharing: 'Share', preparing: 'Prepare', scheduling: 'Schedule',
  confirming: 'Confirm', calling: 'Call', replying: 'Reply', updating: 'Update', chasing: 'Chase',
};

function cleanActionTitle(value: string) {
  return cleanSentence(value)
    .replace(/^(need to|to|please|we should|i should)\s+/i, '')
    .replace(/^(sending|sharing|preparing|scheduling|confirming|calling|replying|updating|chasing)\b/i,
      (verb) => GERUND_TO_IMPERATIVE[verb.toLowerCase()] || verb)
    .replace(/^following up\b/i, 'Follow up')
    .replace(/\s+\b(?:by|on|before)\s+(?:(?:next|this)\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|quarter)\b.*$/i, '')
    .replace(/\s+\b(?:next|this)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month|quarter)\b.*$/i, '')
    // The same trim for a date written as a month, now that one is read as a
    // deadline: the title carries the promise, the due date carries the day,
    // and "Send the revised quote by 21 August · due Aug 21, 2026" says it twice.
    .replace(new RegExp(`\\s+\\b(?:by|on|before|due)\\s+(?:the\\s+)?(?:\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_PATTERN}|${MONTH_PATTERN}\\s+\\d{1,2}(?:st|nd|rd|th)?)(?:,?\\s+\\d{4})?.*$`, 'i'), '')
    .replace(/\s+\b(?:by|on|before)\s*$/i, '')
    .trim()
    // Every promise reads as an instruction, not just the two verbs that had a
    // rule of their own. A month of captures produced a list where "Send the
    // reference list" sat above "confirm the discount decision" and "prepare
    // the quote" - the same kind of thing, written three ways.
    .replace(/^[a-z]/, (letter) => letter.toUpperCase())
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
  return toLocalDateKey(date);
}

function parseDateKey(dateKey: string) {
  const safeDate = sanitizeBusinessDate(dateKey) || todayDate();
  const [year, month, day] = safeDate.split('-').map(Number);
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
  if (/\b(po|purchase order|payment|delivery|quote|quotation|commercial offer)\b/i.test(rawNote)) tags.add('commercial-signal');
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

