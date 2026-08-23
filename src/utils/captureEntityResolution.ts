import type { AccountMemoryRecord } from '../services/accountStore';
import type { CaptureAccountAlias, CaptureCorrectionEvent } from '../services/captureCorrectionMemoryStore';
import { normalizeEntityName as normalize } from './accountIdentity.ts';

type AccountContext = Pick<AccountMemoryRecord, 'id' | 'accountName'>;
type OpportunityContext = {
  id: string;
  accountName: string;
  opportunityName: string;
  productOrSolution?: string;
  stage?: string;
};

export type CaptureEntityResolution = {
  accountName: string;
  contactName: string;
  opportunityName: string;
  suggestedOpportunityId: string;
  needsConfirmation: boolean;
  accountMatchSource: 'master' | 'alias' | 'correction' | 'explicit' | 'none';
  matchedAlias?: string;
};

export function resolveCaptureEntities(input: {
  rawNote: string;
  accountName?: string;
  contactName?: string;
  opportunityName?: string;
  suggestedOpportunityId?: string;
  accounts?: AccountContext[];
  opportunities?: OpportunityContext[];
  corrections?: CaptureCorrectionEvent[];
  aliases?: CaptureAccountAlias[];
}): CaptureEntityResolution {
  const accounts = input.accounts || [];
  const opportunities = input.opportunities || [];
  const rawNote = input.rawNote.trim();
  const contactName = resolveContact(rawNote, input.contactName || '');
  const account = resolveAccount(
    rawNote,
    input.accountName || '',
    contactName,
    accounts,
    opportunities,
    input.corrections || [],
    input.aliases || [],
  );
  const opportunity = resolveOpportunity({
    rawNote,
    candidateName: input.opportunityName || '',
    candidateId: input.suggestedOpportunityId || '',
    accountName: account.accountName,
    opportunities,
    corrections: input.corrections || [],
  });

  return {
    accountName: account.accountName,
    contactName,
    opportunityName: opportunity?.opportunityName || '',
    suggestedOpportunityId: opportunity?.id || '',
    needsConfirmation: !account.accountName
      || account.source === 'correction'
      || Boolean(input.opportunityName && !opportunity),
    accountMatchSource: account.source,
    ...(account.matchedAlias ? { matchedAlias: account.matchedAlias } : {}),
  };
}

function resolveAccount(
  rawNote: string,
  candidate: string,
  contactName: string,
  accounts: AccountContext[],
  opportunities: OpportunityContext[],
  corrections: CaptureCorrectionEvent[],
  aliases: CaptureAccountAlias[],
): { accountName: string; source: CaptureEntityResolution['accountMatchSource']; matchedAlias?: string } {
  const knownAccounts = uniqueAccounts([
    ...accounts.map((account) => account.accountName),
    ...opportunities.map((opportunity) => opportunity.accountName),
  ]);
  const mentionedKnown = knownAccounts
    .filter((accountName) => includesPhrase(rawNote, accountName))
    .sort((left, right) => right.length - left.length)[0];
  if (mentionedKnown) return { accountName: mentionedKnown, source: 'master' };

  const canonicalCandidate = knownAccounts.find((accountName) => sameName(accountName, candidate));
  if (canonicalCandidate && includesPhrase(rawNote, candidate)) return { accountName: canonicalCandidate, source: 'master' };

  const alias = aliases
    .filter((item) => includesPhrase(rawNote, item.alias))
    .sort((left, right) => right.alias.length - left.alias.length)[0];
  if (alias) {
    const canonical = knownAccounts.find((accountName) => sameName(accountName, alias.canonicalAccountName));
    return {
      accountName: canonical || cleanEntity(alias.canonicalAccountName),
      source: 'alias',
      matchedAlias: alias.alias,
    };
  }

  const correctedAccount = resolveAccountFromCorrection(rawNote, contactName, corrections, knownAccounts);
  if (correctedAccount) return { accountName: correctedAccount, source: 'correction' };

  const explicit = extractExplicitAccount(rawNote);
  if (explicit && !looksLikePerson(explicit) && !sameName(explicit, contactName)) {
    return { accountName: knownAccounts.find((accountName) => sameName(accountName, explicit)) || explicit, source: 'explicit' };
  }

  if (candidate && includesPhrase(rawNote, candidate) && !looksLikePerson(candidate) && !sameName(candidate, contactName)) {
    return { accountName: cleanEntity(candidate), source: 'explicit' };
  }
  return { accountName: '', source: 'none' };
}

function resolveAccountFromCorrection(
  rawNote: string,
  contactName: string,
  corrections: CaptureCorrectionEvent[],
  knownAccounts: string[],
) {
  if (!contactName || !includesPhrase(rawNote, contactName)) return '';
  const contactCorrection = corrections.find((event) => (
    event.fieldName === 'contactName' && sameName(event.correctedValue, contactName)
  ));
  if (!contactCorrection) return '';
  const accountCorrection = corrections.find((event) => (
    event.fieldName === 'accountName'
    && event.rawNoteExcerpt === contactCorrection.rawNoteExcerpt
    && event.correctedValue
    && !looksLikePerson(event.correctedValue)
  ));
  if (!accountCorrection) return '';
  return knownAccounts.find((accountName) => sameName(accountName, accountCorrection.correctedValue))
    || cleanEntity(accountCorrection.correctedValue);
}

/**
 * The named person in a note.
 *
 * The lookahead used to demand that the name be followed by "at"/"from", a
 * comma, a full stop or the end of the note, which meant "Ms. Huyen is the
 * buyer" resolved to nobody - the most ordinary sentence a seller writes. Any
 * word boundary is enough; the honorific and the capitalisation are what
 * identify the name, and the greedy trailing groups are already bounded to three
 * words.
 */
function resolveContact(rawNote: string, candidate: string) {
  const explicit = rawNote.match(/\b((?:Ms|Mr|Mrs|Dr)\.?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})\b/)?.[1] || '';
  if (explicit) return normalizeHonorific(cleanEntity(explicit));

  // A bare first name, identified by its position rather than by a title: it
  // sits between a contact verb and the company it belongs to. Requiring an
  // honorific left "Called Minh at Dai Viet Steel" with no contact at all,
  // while the company half of the same sentence was being filed as the account
  // name - so the one note produced no person and a wrong customer. The company
  // must start with a capital too, which is what stops "called Minh at 9am".
  const positional = rawNote.match(
    /\b(?:[Mm]et|[Vv]isited|[Cc]alled|[Ss]aw|[Ee]mailed|[Ss]poke\s+(?:to|with))\s+(?:with\s+)?([A-Z][A-Za-z'-]{1,30}(?:\s+[A-Z][A-Za-z'-]{1,30}){0,2})\s+(?:at|from|of)\s+[A-Z]/,
  )?.[1] || '';
  if (positional && !looksLikeOrganization(positional)) return cleanEntity(positional);

  if (candidate && includesPhrase(rawNote, candidate) && !looksLikeOrganization(candidate)) return cleanEntity(candidate);
  return '';
}

function resolveOpportunity(input: {
  rawNote: string;
  candidateName: string;
  candidateId: string;
  accountName: string;
  opportunities: OpportunityContext[];
  corrections: CaptureCorrectionEvent[];
}) {
  const realMention = pickMentionedOpportunity(
    input.rawNote,
    input.opportunities.filter((opportunity) => opportunityFitsAccount(opportunity, input.accountName)),
  );
  if (realMention) return realMention;

  const suppressCandidate = input.corrections.some((event) => (
    event.fieldName === 'opportunityName'
    && !event.correctedValue
    && sameName(event.originalValue, input.candidateName)
  ));
  if (suppressCandidate) return null;

  const byId = input.opportunities.find((opportunity) => opportunity.id === input.candidateId);
  if (byId && opportunityFitsAccount(byId, input.accountName)) return byId;

  const byCandidate = input.opportunities.find((opportunity) => (
    sameName(opportunity.opportunityName, input.candidateName) && opportunityFitsAccount(opportunity, input.accountName)
  ));
  if (byCandidate) return byCandidate;

  const explicitName = extractExplicitOpportunity(input.rawNote);
  if (explicitName && input.candidateName && sameName(explicitName, input.candidateName)) {
    return {
      id: '',
      accountName: input.accountName,
      opportunityName: cleanEntity(explicitName),
      productOrSolution: '',
      stage: 'Discovery',
    };
  }
  return null;
}

function extractExplicitAccount(rawNote: string) {
  const patterns = [
    /\b(?:spoke|met|meeting|call(?:ed)?)\s+with\s+(?:Ms|Mr|Mrs|Dr)\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}\s+(?:at|from)\s+([A-Z][A-Za-z0-9&.' -]{1,60})/i,
    /\bcall\s+(?:Ms|Mr|Mrs|Dr)\.?\s+[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,2}\s+from\s+([A-Z][A-Za-z0-9&.' -]{1,60})/i,
    // The same shape without an honorific. Most of the world does not write
    // one: "Called Minh at Dai Viet Steel", "Met Sarah from Northwind". The two
    // patterns above only fire on "Ms."/"Mr.", so these notes fell through to
    // the catch-all below and filed the person and the company as one account.
    // Case-sensitive on purpose - see the classifier's account patterns.
    /\b(?:[Mm]et|[Vv]isited|[Cc]alled|[Ss]aw|[Ee]mailed|[Ss]poke\s+(?:to|with))\s+(?:with\s+)?[A-Z][A-Za-z.'-]{1,30}(?:\s+[A-Z][A-Za-z.'-]{1,30}){0,3}\s+(?:at|from|of)\s+([A-Z][A-Za-z0-9&.' -]{1,60}?)(?=\s+(?:today|yesterday|this\s+\w+|last\s+\w+|about\b|on\s+\d)|[.\n;,]|$)/,
    // Case-sensitive in the captured half: with `/i` the `[A-Z]` matched
    // anything, so "Met the buyer today." filed a customer called "the buyer"
    // - and a phantom account like that then shows up as a real customer on
    // Today, in the account count, and in the week's suggestions.
    /\b(?:[Mm]et|[Vv]isited)\s+([A-Z][A-Za-z0-9&.' -]{1,60}?)\s+(?:today|yesterday|with\b)/,
    /\bfollow\s*up\s+(?:with\s+)?([A-Z][A-Za-z0-9&.' -]{1,60}?)\s+(?:on|about|regarding)\b/i,
    /\b(?:account|customer|client|company)\s*[:-]\s*([^.;\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = rawNote.match(pattern)?.[1];
    if (match) return cleanAccountEntity(match);
  }
  return '';
}

function extractExplicitOpportunity(rawNote: string) {
  return cleanEntity(rawNote.match(/\b(?:opportunity|project|deal)\s*(?:called|named|:|-)\s*([^.;\n]+)/i)?.[1] || '');
}

function opportunityFitsAccount(opportunity: OpportunityContext, accountName: string) {
  return !accountName || !opportunity.accountName || sameName(opportunity.accountName, accountName);
}

/**
 * Stages that mean the work is finished.
 *
 * A customer you have done business with twice has two deals with the same
 * words in them, and the older one is the closed one. Ranking them together
 * meant a note about the live proposal - "they want heat recovery across six
 * Algarve hotels" - attached itself to the heat recovery job delivered in
 * March, because that one's product line was the phrase the note happened to
 * repeat. The live deal then stayed on nought touches, which is the one thing
 * this product exists to prevent, and a finished job collected an open
 * commitment it can never discharge. Repeat business is the good case, so it
 * must not be the case that breaks the link.
 */
const CLOSED_OPPORTUNITY_STAGES = new Set(['won', 'lost', 'on hold']);

/**
 * Words that sit in so many deal names that finding one in a note says nothing
 * about which deal was meant. Kept short on purpose: anything genuinely
 * describing the work - "retrofit", "algarve", "compressed" - has to stay in,
 * because those are exactly the words that tell two of a customer's deals
 * apart.
 */
const GENERIC_DEAL_WORDS = new Set([
  'project', 'projects', 'programme', 'program', 'solution', 'solutions',
  'service', 'services', 'system', 'systems', 'phase', 'stage', 'deal',
  'opportunity', 'contract', 'proposal', 'quote', 'order', 'work', 'scope',
]);

function isClosedOpportunity(opportunity: OpportunityContext) {
  return CLOSED_OPPORTUNITY_STAGES.has((opportunity.stage || '').trim().toLowerCase());
}

function opportunityWords(opportunity: OpportunityContext) {
  const source = `${opportunity.opportunityName || ''} ${opportunity.productOrSolution || ''}`;
  return new Set(
    normalize(source)
      .split(' ')
      .filter((word) => word.length >= 4 && !GENERIC_DEAL_WORDS.has(word)),
  );
}

/**
 * Per deal, the words that belong to that deal and to no other deal of the same
 * customer.
 *
 * The old rule could only see a deal whose whole name or whole product line was
 * repeated in the note, and nobody writes that way - a note says "the Algarve
 * rollout", not "Heat recovery retrofit - 6 hotels Algarve". One word that
 * only one of the customer's deals owns is the strongest signal a real note
 * actually carries, and it is safe precisely because it is computed within one
 * customer: a word shared by two of their deals is dropped here rather than
 * used to pick between them.
 */
function distinctiveWordsByOpportunity(inScope: OpportunityContext[]) {
  const wordSets = inScope.map(opportunityWords);
  const counts = new Map<string, number>();
  for (const wordSet of wordSets) {
    for (const word of wordSet) counts.set(word, (counts.get(word) || 0) + 1);
  }
  return wordSets.map((wordSet) => Array.from(wordSet).filter((word) => counts.get(word) === 1));
}

function scoreOpportunityMention(rawNote: string, opportunity: OpportunityContext, distinctiveWords: string[]) {
  let score = 0;
  if (opportunity.opportunityName && includesPhrase(rawNote, opportunity.opportunityName)) {
    score += 1000 + opportunity.opportunityName.length;
  }
  if (opportunity.productOrSolution && includesPhrase(rawNote, opportunity.productOrSolution)) {
    score += 500 + opportunity.productOrSolution.length;
  }
  score += 100 * distinctiveWords.filter((word) => includesPhrase(rawNote, word)).length;
  return score;
}

/**
 * The deal a note is about, out of the ones belonging to its customer.
 *
 * Open deals win outright whenever any of them matches; a closed deal is
 * returned only when nothing still running matches at all, which is what makes
 * "the water reuse study is finished, can we do the same at Vila do Conde"
 * still land on the study. Within a group the strongest evidence wins - a whole
 * name, then a whole product line, then distinctive words - and length is only
 * the last tie-break rather than, as before, the entire ranking.
 */
function pickMentionedOpportunity(rawNote: string, inScope: OpportunityContext[]) {
  if (!inScope.length) return undefined;
  const distinctive = distinctiveWordsByOpportunity(inScope);
  const scored = inScope
    .map((opportunity, index) => ({
      opportunity,
      score: scoreOpportunityMention(rawNote, opportunity, distinctive[index]),
      closed: isClosedOpportunity(opportunity),
    }))
    .filter((entry) => entry.score > 0);
  if (!scored.length) return undefined;
  const stillRunning = scored.filter((entry) => !entry.closed);
  const preferred = stillRunning.length ? stillRunning : scored;
  preferred.sort((left, right) => (
    right.score - left.score
    || right.opportunity.opportunityName.length - left.opportunity.opportunityName.length
  ));
  return preferred[0].opportunity;
}

function looksLikePerson(value: string) {
  return /^(?:Ms|Mr|Mrs|Dr)\.?\s+/i.test(value.trim());
}

function looksLikeOrganization(value: string) {
  return /\b(?:company|corp|corporation|inc|ltd|limited|pharma|pharmaceutical|hospital|university|clinic|labs?|group)\b/i.test(value);
}

function includesPhrase(text: string, phrase: string) {
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase && ` ${normalize(text)} `.includes(` ${normalizedPhrase} `));
}

function sameName(left: string, right: string) {
  return Boolean(left && right && normalize(left) === normalize(right));
}

function cleanEntity(value: string) {
  return value.replace(/\s+/g, ' ').replace(/[.,;:]$/g, '').trim().slice(0, 140);
}

function cleanAccountEntity(value: string) {
  return cleanEntity(value).replace(/\s+(?:about|regarding|on|to discuss)\b.*$/i, '').trim();
}

function normalizeHonorific(value: string) {
  return value.replace(/^(Ms|Mr|Mrs|Dr)\.?\s+/i, (_, title: string) => `${title}. `);
}

function uniqueAccounts(values: string[]) {
  return Array.from(new Map(values.filter(Boolean).map((value) => [normalize(value), value])).values());
}

// The shared account/entity normalizer - identical algorithm, one home, so
// Capture and Account Memory can never resolve the same name differently.
