import { classifyObjectionType } from '../../utils/objectionLedger.ts';
import { extractDueDate, extractNextActions } from '../../utils/salesActivityClassifier.ts';
import {
  personContactCuePattern,
  resolveCaptureEntities,
} from '../../utils/captureEntityResolution.ts';
import type { EvidenceDirection } from './commercialEvidence.ts';
import { normalizeEntityName } from '../../utils/accountIdentity.ts';
import { parseLocalizedAmount } from '../../utils/numberFormat.ts';
import { isSupportedCurrency } from '../../utils/money.ts';
import { sanitizeBusinessDate } from '../../utils/safeDate.ts';
import type {
  CapturedFact,
  CaptureParseContext,
  CaptureParseInput,
  CaptureTarget,
  FactCertainty,
  ReviewableChangeSet,
  UnsupportedFinding,
} from './capturedFacts.ts';

/**
 * The deterministic capture parser.
 *
 * It reads one messy note and proposes the commercial facts it can defend.
 * Everything it produces is reviewable; nothing it produces is written.
 *
 * ## Precision over coverage
 *
 * Five fact kinds, each with a canonical destination that already exists. The
 * parser is allowed - expected - to find nothing. A note that produces no
 * structured proposal is a correct outcome and a better one than a proposal the
 * operator has to go and undo, because the second kind teaches people to stop
 * reading the list.
 *
 * ## What it reuses
 *
 * Almost everything. Entity resolution, the objection taxonomy, the next-action
 * extractor, the date reader and the localised amount parser are all existing,
 * tested modules. This file is the part that was missing: turning their output
 * into *proposals with evidence* instead of into a record.
 */

// ------------------------------------------------------------------- money

/** Magnitude words, in the two languages the product's notes are written in. */
const MAGNITUDES: { pattern: string; multiplier: number }[] = [
  { pattern: 'billion|bn|tỷ|ty\\b', multiplier: 1_000_000_000 },
  { pattern: 'million|mn|triệu|tr\\b', multiplier: 1_000_000 },
  { pattern: 'thousand|nghìn|nghin|k\\b', multiplier: 1_000 },
  // Bare `b` and `m` last: a single letter is the weakest signal here and must
  // not out-match "bn" or "mn" earlier in the same token.
  { pattern: 'b\\b', multiplier: 1_000_000_000 },
  { pattern: 'm\\b', multiplier: 1_000_000 },
];

const CURRENCY_SYMBOLS: Record<string, string> = { '₫': 'VND', $: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };

/**
 * Words that make a number money.
 *
 * Required whenever the note does not name a currency, because a bare "400M" in
 * a sales note is money and a bare "400" is a quantity. Without this gate the
 * parser proposed a deal value of 400 from "400 units of the filter".
 */
const MONEY_CONTEXT = /\b(po|purchase order|value|worth|deal|quote|quotation|price|priced|budget|contract|order|revenue|amount|offer|invoice|deposit)\b/i;

/** Cues that a number is an estimate rather than a figure anyone has agreed. */
const APPROXIMATE = /\b(around|about|approx\w*|roughly|circa|likely|maybe|perhaps|somewhere|ballpark|khoảng|tầm|~)\b|~/i;

// -------------------------------------------------------------- commitments

/** The note's author promising something. */
const FIRST_PERSON = /^\s*(?:i|i'?ll|i'?m|we|we'?ll|my|our)\b|\bi\s+(?:promised|agreed|will|need to|have to|must|said i)\b/i;

/** Somebody inside the seller's own organisation. */
const INTERNAL_CUE = /\b(?:internally|our (?:team|engineer|technical team|lab|office)|colleague|my manager)\b/i;

/** Departments a customer answer usually comes from, written as people do. */
const CUSTOMER_ROLE = /\b(purchasing|procurement|qc|quality|finance|legal|production|maintenance|engineering|the customer|the client|they)\b/i;

/**
 * A customer saying when they will decide.
 *
 * This is the single most useful sentence in a B2B note and Memoire had no
 * field for it. It is not an "expected close date" - nothing in the record
 * means that - it is the customer committing to answer by a day, which is
 * exactly what the three-party commitment model is for. Reading it as a
 * customer commitment puts it straight into the silence and overdue rules
 * without inventing a new field for the parser to fill.
 */
const DECISION_INTENT = /\b(purchasing|procurement|qc|quality|finance|legal|production|the customer|the client|they)\s+(?:wants?\s+to|will|plans?\s+to|intends?\s+to|expects?\s+to|aims?\s+to|is\s+going\s+to)\s+(decide|make\s+a\s+decision|sign|approve|confirm|come\s+back|revert|respond)\b/i;

/** Someone coming to site, or a dated thing happening to the deal. */
const EVENT_INTENT = /\b([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})\s+(?:will\s+|is\s+going\s+to\s+)?(visit|visits|visiting|come|comes|coming|attend|attends|be\s+on\s+site|be\s+here)\b/u;

/**
 * A business event that is scheduled without a person in front of it.
 *
 * "Site acceptance test on 14 October" is a date the whole deal turns on, and
 * the person-subject pattern above could not see it. What makes this safe is
 * that all three parts are required: a named kind of event, a scheduling
 * preposition, and a date the note actually contains. Two of the three is not
 * enough - "payment is due on 30 October" has a preposition and a date and is
 * not an event, and "the audit went badly" has an event noun and is not a plan.
 *
 * The noun list stays short and concrete for the same reason the fact kinds do.
 * Anything vaguer - "meeting", "call", "review" - would turn every dated
 * sentence in a working note into a calendar entry.
 */
const SCHEDULED_EVENT_NOUN = /\b((?:site|factory|customer)\s+(?:acceptance\s+test|visit|trial|audit|inspection)|acceptance\s+test|technical\s+(?:review|audit|training|visit)|trial\s+run|site\s+visit|plant\s+visit|factory\s+visit|kick-?off(?:\s+meeting)?|handover|commissioning|installation|inspection|audit|training|workshop|walk-?through|demo(?:nstration)?|trial|pilot)\b/i;

/** Acronyms, case-sensitively: lowercase "fat" and "sat" are ordinary words. */
const SCHEDULED_EVENT_ACRONYM = /\b(FAT|SAT)\b/;

/** What turns a noun and a date into a booking rather than a mention. */
const SCHEDULING_PREPOSITION = /\b(?:on|scheduled\s+(?:for|on)|set\s+for|booked\s+for|planned\s+for|takes?\s+place\s+on|happening\s+on|arranged\s+for)\b/i;

// -------------------------------------------------------- technical outcome

/**
 * What was being evaluated. Required - a result word on its own is not a trial.
 *
 * Bare "test", "sample" and "validation" are deliberately absent: they appear
 * in ordinary commercial sentences ("we should test the price", "validation of
 * the PO") often enough that including them would turn opinion into evidence.
 */
const EVALUATION_NOUN = /\b((?:site|factory)\s+acceptance\s+test|acceptance\s+test|technical\s+(?:evaluation|review|validation|test|result|acceptance)|proof\s+of\s+concept|trial\s+run|test\s+run|sample\s+test|qualification\s+run|validation\s+run|trial|pilot|demo(?:nstration)?|evaluation|samples?)\b/i;
const EVALUATION_ACRONYM = /\b(FAT|SAT|POC)\b/;

const RESULT_NEGATIVE = /\b(failed|fails|failure|did\s+not\s+pass|didn'?t\s+pass|rejected|unsuccessful|not\s+accepted|was\s+not\s+accepted|out\s+of\s+spec|did\s+not\s+meet|didn'?t\s+meet|poor|negative)\b/i;

/** Result words that say the verdict outright. */
const RESULT_POSITIVE_EXACT = /\b(passed|was\s+successful|successful|succeeded|accepted|approved|cleared|signed\s*-?\s*off|met\s+(?:the\s+)?spec|no\s+issues)\b/i;

/** Result words that report the same verdict loosely. Read, but never `exact`. */
const RESULT_POSITIVE_LOOSE = /\b(look(?:s|ed)?\s+good|went\s+well|going\s+well|worked\s+well|good\s+results?|results?\s+(?:are|were)\s+good|positive)\b/i;

/**
 * Words that withdraw the claim the sentence appears to make.
 *
 * "Trial looks promising" is optimism, not acceptance, and the whole reason
 * this list exists is that the difference matters commercially: a deal defended
 * on a technical acceptance that never happened is the exact failure the
 * evidence record was built to prevent. "May" and "might" are left out on
 * purpose - "the trial passed in May" must not read as a hedge.
 */
const RESULT_HEDGE = /\b(promising|seems|appears|hopefully|so\s+far|early\s+(?:days|signs)|on\s+track|should\s+(?:pass|be)|expected\s+to|likely\s+to|probably|we\s+think)\b/i;

const RESULT_IN_PROGRESS = /\b(ongoing|in\s+progress|still\s+running|under\s?way|not\s+finished|still\s+going|continues|pending|has\s+started|starting)\b/i;

const RESULT_CONCLUDED = /\b(is\s+complete|are\s+complete|completed|finished|is\s+done|wrapped\s+up)\b/i;

// ---------------------------------------------------------------------- parse

export function parseCapture(input: CaptureParseInput): ReviewableChangeSet {
  const raw = input.rawCapture.trim();
  const captureDate = sanitizeBusinessDate(input.captureDate) || input.captureDate;
  // A confirmed scope wins over anything the text implies. The operator has
  // already answered the question this would otherwise guess at.
  const target: CaptureTarget = input.scope
    ? {
      accountName: input.scope.accountName,
      opportunityId: input.scope.opportunityId,
      opportunityName: input.scope.opportunityName,
    }
    : resolveTarget(raw, input.context);

  const facts: CapturedFact[] = [];
  const unsupported: UnsupportedFinding[] = [];
  const sentences = splitSentences(raw);

  facts.push(...objectionFacts(sentences, target));
  facts.push(...stakeholderFacts(raw, target, input.context));
  facts.push(...commitmentFacts(raw, sentences, captureDate, target));
  facts.push(...valueFacts(sentences, target, input.context));

  // Evidence runs before events on purpose. A sentence reporting a result is
  // not booking a date, and "Trial passed on 10 September" would otherwise be
  // read as both a finding and a calendar entry.
  const evidence = evidenceFacts(sentences, captureDate, target);
  facts.push(...evidence);
  facts.push(...eventFacts(sentences, captureDate, target, new Set(
    evidence.filter((fact) => fact.kind === 'commercial_evidence' && fact.direction !== 'neutral')
      .map((fact) => fact.evidence),
  )));

  collectUnsupported(sentences, facts, unsupported);

  return {
    rawCapture: input.rawCapture,
    captureDate,
    target,
    facts: markDuplicates(facts, input.context),
    unsupported,
  };
}

// --------------------------------------------------------------------- target

/**
 * Which customer and deal the note is about.
 *
 * Reuses the existing resolver, including the aliases and corrections the
 * operator has already taught it. When it cannot decide, the target is left
 * blank rather than guessed: a capture filed against the wrong customer is
 * worse than one filed against none, because the second is obvious.
 */
function resolveTarget(raw: string, context: CaptureParseContext): CaptureTarget {
  const resolution = resolveCaptureEntities({
    rawNote: raw,
    accountName: '',
    contactName: '',
    opportunityName: '',
    accounts: context.accounts,
    opportunities: context.opportunities,
  });

  // Only a customer the workspace already has. The resolver returns its best
  // reading of the text, and on "Met Rohto QC today" that reading is "Rohto QC"
  // - a department, not an account - while on "Met Anna Vu today" it is a
  // person's name. Filing a capture against an invented customer is how a book
  // grows duplicates that nobody can merge later, so the name has to be one on
  // the books or the field stays empty for the operator to fill.
  const accountName = matchKnownAccount(raw, resolution.accountName || '', context);

  const match = context.opportunities.find((opportunity) =>
    normalizeEntityName(opportunity.opportunityName) === normalizeEntityName(resolution.opportunityName || '')
    && normalizeEntityName(opportunity.accountName) === normalizeEntityName(accountName));

  // Exactly one open deal on a resolved customer is not a guess - it is the
  // only answer. More than one, and the operator picks.
  const forAccount = accountName
    ? context.opportunities.filter((item) => normalizeEntityName(item.accountName) === normalizeEntityName(accountName))
    : [];
  const sole = forAccount.length === 1 ? forAccount[0] : null;
  const chosen = match || sole;

  return {
    accountName,
    opportunityId: chosen?.id || null,
    opportunityName: chosen?.opportunityName || resolution.opportunityName || '',
  };
}

/**
 * The customer this note is about, from the ones the workspace already has.
 *
 * Two ways in, strongest first: the account's whole name written in the note,
 * or its leading word - the part people actually type. "Rohto Vietnam" is
 * "Rohto" in every note anybody writes. The leading word has to be long enough
 * to mean something, because a three-letter token matches half the language.
 *
 * When two customers match equally well, none is chosen. An ambiguous customer
 * is a question for the operator, and answering it wrongly files the whole
 * capture against the wrong book.
 */
export function matchKnownAccount(
  raw: string,
  resolved: string,
  context: Pick<CaptureParseContext, 'accounts'>,
): string {
  const note = normalizeEntityName(raw);
  const resolvedKey = normalizeEntityName(resolved);

  const scored = context.accounts
    .map((account) => {
      const key = normalizeEntityName(account.accountName);
      if (!key) return null;
      if (key === resolvedKey) return { name: account.accountName, score: key.length + 100 };
      if (containsWords(note, key)) return { name: account.accountName, score: key.length + 50 };
      const lead = key.split(' ')[0];
      if (lead.length >= 4 && containsWords(note, lead)) return { name: account.accountName, score: lead.length };
      return null;
    })
    .filter((entry): entry is { name: string; score: number } => entry !== null)
    .sort((left, right) => right.score - left.score);

  if (scored.length === 0) return '';
  if (scored.length > 1 && scored[0].score === scored[1].score) return '';
  return scored[0].name;
}

/** Whether `needle` appears in `haystack` on word boundaries, both normalised. */
function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `)
    || haystack.startsWith(`${needle} `)
    || haystack.endsWith(` ${needle}`)
    || haystack === needle;
}

// ----------------------------------------------------------------- objections

function objectionFacts(sentences: string[], target: CaptureTarget): CapturedFact[] {
  const CONCERN = /\b(concern(?:ed|s)?|worried|worry|still\s+(?:need|needs|needed|require)|not\s+convinced|blocker|blocked|objection|too\s+expensive|hesitant|reservation|unhappy|pushed?\s+back|clarification)\b/i;

  return sentences
    .filter((sentence) => CONCERN.test(sentence))
    .slice(0, 3)
    .map((sentence, index) => ({
      id: `objection-${index}`,
      kind: 'objection' as const,
      // The shared taxonomy. Capture keeps no second list of these, so an
      // objection read from a note classifies exactly as one typed by hand.
      objectionType: classifyObjectionType(concernClause(sentence)),
      text: trimTo(concernClause(sentence), 160),
      evidence: cleanSentence(sentence),
      // A concern is read from how somebody phrased it, never stated outright.
      certainty: 'inferred' as FactCertainty,
      target,
      status: 'proposed' as const,
    }));
}

/**
 * The half of the sentence that carries the concern.
 *
 * Sellers write the good news and the problem in one breath: "Trial looks good
 * but they still need clarification on GPT verification." Recording the whole
 * sentence as the objection puts "Trial looks good" into the objection ledger,
 * where it reads as a blocker, and it drags the classifier towards `Other`
 * because half the words are about something else.
 *
 * The evidence keeps the whole sentence, so nothing is hidden from the review.
 */
function concernClause(sentence: string): string {
  const split = sentence.split(/\b(?:but|however|although|though|except that)\b/i);
  const clause = split.length > 1 ? split[split.length - 1] : sentence;
  return cleanSentence(clause).replace(/^[,\s]+/, '');
}

// ---------------------------------------------------------------- stakeholders

/**
 * People named in the note, with the title the note gave them.
 *
 * The role stays out of this entirely. "Met John from purchasing" says John was
 * there and works in purchasing; it does not say he approves anything, and the
 * MEDDIC role is a judgement the operator makes on the stakeholder record. This
 * is the one place the parser is most tempted to overclaim and the one place it
 * would do the most damage - a forecast defended by an economic buyer nobody
 * ever confirmed.
 */
function stakeholderFacts(raw: string, target: CaptureTarget, context: CaptureParseContext): CapturedFact[] {
  // The cue is spelled both ways rather than carrying an `i` flag: the capital
  // letter is the only thing separating a person's name from the ordinary words
  // around it, and case-folding the whole pattern would make "met the team"
  // propose a stakeholder called "The".
  // The cue half comes from the one shared list (see `personContactCues`), so
  // "had a chat with" and "sat down with" work here and in the contact resolver
  // at the same time instead of in whichever of the two somebody remembered.
  //
  // `\p{Lu}` rather than `[A-Z]` for the name: the ASCII class quietly refused
  // every accented first letter, so "Sat down with Émile" proposed nobody.
  const NAMED = new RegExp(
    `\\b${personContactCuePattern()}\\s+`
    + `(\\p{Lu}[\\p{L}'-]+(?:\\s+\\p{Lu}[\\p{L}'-]+){0,2})\\b`
    + `(?:\\s*,?\\s*(?:the\\s+|from\\s+|in\\s+|at\\s+)?([a-z][\\p{L}\\s/-]{2,30}?))?`
    + `(?=[.,;]|\\s+(?:and|but|today|yesterday)\\b|$)`,
    'gu',
  );

  const facts: CapturedFact[] = [];
  const seen = new Set<string>();

  for (const match of raw.matchAll(NAMED)) {
    const name = (match[1] || '').trim();
    if (!name || seen.has(normalizeEntityName(name))) continue;
    // A department is not a person. "Met Rohto QC" names a team, and creating
    // a stakeholder called QC would put a job function in the people list.
    if (isDepartmentWord(name)) continue;
    // The account itself is not a person either.
    if (target.accountName && normalizeEntityName(name) === normalizeEntityName(target.accountName)) continue;
    seen.add(normalizeEntityName(name));

    const roleTitle = cleanRoleTitle(match[2] || '');
    facts.push({
      id: `stakeholder-${facts.length}`,
      kind: 'stakeholder',
      name,
      roleTitle,
      evidence: cleanSentence(match[0]),
      certainty: roleTitle ? 'inferred' : 'exact',
      target,
      status: 'proposed',
    });
    if (facts.length >= 3) break;
  }

  void context;
  return facts;
}

// ---------------------------------------------------------------- commitments

function commitmentFacts(
  raw: string,
  sentences: string[],
  captureDate: string,
  target: CaptureTarget,
): CapturedFact[] {
  const facts: CapturedFact[] = [];

  // A customer saying when they will answer. Read first, so the sentence that
  // carries it is not also read as the seller's own next action.
  const decisionSentences = new Set<string>();
  for (const sentence of sentences) {
    const intent = sentence.match(DECISION_INTENT);
    if (!intent) continue;
    decisionSentences.add(sentence);
    const dueDate = extractDueDate(sentence, captureDate);
    facts.push({
      id: `commitment-decision-${facts.length}`,
      kind: 'commitment',
      party: 'customer',
      ownerLabel: capitalise(intent[1]),
      text: `${capitalise(intent[2].replace(/\s+/g, ' '))}`,
      dueDate: dueDate || '',
      evidence: cleanSentence(sentence),
      // The date is the customer's stated intent, not an agreement. That is
      // still the most useful thing in the note, and it is still not a promise
      // anyone made to you.
      certainty: dueDate ? 'inferred' : 'ambiguous',
      target,
      status: 'proposed',
    });
  }

  // The promises the note actually contains, from the existing extractor.
  for (const action of extractNextActions(raw, captureDate)) {
    const source = action.sourceText || action.title;
    if ([...decisionSentences].some((sentence) => sentence.includes(source.slice(0, 20)))) continue;

    // Who owes it is decided from the whole sentence, not from the fragment the
    // extractor returns. That fragment starts at the verb - "send the validation
    // explanation by Friday" - so the words that say whose promise it is ("I
    // promised to", "our technical team will") are exactly the ones missing
    // from it.
    const sentence = sentences.find((candidate) => candidate.includes(source.slice(0, 24))) || source;
    const party = commitmentParty(sentence);

    facts.push({
      id: `commitment-${facts.length}`,
      kind: 'commitment',
      party: party.party,
      ownerLabel: party.ownerLabel,
      text: trimTo(action.title, 160),
      dueDate: action.dueDate || '',
      evidence: cleanSentence(sentence),
      certainty: party.certainty,
      target,
      status: 'proposed',
    });
    if (facts.length >= 6) break;
  }

  return facts;
}

/**
 * Who owes it.
 *
 * First person is the only one read outright; everything else is inferred from
 * how the sentence is built, and an unattributable promise stays yours. That is
 * the safe default: a promise wrongly filed as your own costs you a chase, and
 * one wrongly filed as the customer's makes the product tell you to wait for
 * somebody who never agreed to anything.
 */
function commitmentParty(source: string): { party: 'self' | 'customer' | 'internal'; ownerLabel: string; certainty: FactCertainty } {
  if (INTERNAL_CUE.test(source)) return { party: 'internal', ownerLabel: '', certainty: 'inferred' };
  if (FIRST_PERSON.test(source)) return { party: 'self', ownerLabel: 'You', certainty: 'exact' };

  const role = source.match(CUSTOMER_ROLE);
  const named = source.match(/\b([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+){0,2})\s+(?:will|agreed\s+to|promised\s+to|is\s+going\s+to)\b/u);
  if (named) return { party: 'customer', ownerLabel: named[1], certainty: 'inferred' };
  if (role) return { party: 'customer', ownerLabel: capitalise(role[1]), certainty: 'inferred' };

  return { party: 'self', ownerLabel: 'You', certainty: 'inferred' };
}

// --------------------------------------------------------------------- value

function valueFacts(
  sentences: string[],
  target: CaptureTarget,
  context: CaptureParseContext,
): CapturedFact[] {
  const facts: CapturedFact[] = [];

  for (const sentence of sentences) {
    const money = readMoney(sentence);
    if (!money) continue;

    // The currency comes from the note, then from the deal it is about, and
    // otherwise it is the workspace's - and then the fact is ambiguous and
    // says so, because a number in the wrong currency is wrong by a factor of
    // twenty-six thousand and looks entirely reasonable on screen.
    const deal = target.opportunityId
      ? context.opportunities.find((item) => item.id === target.opportunityId)
      : undefined;
    const currency = money.currency || deal?.currency || context.reportingCurrency;
    const currencyKnown = Boolean(money.currency || deal?.currency);

    facts.push({
      id: `value-${facts.length}`,
      kind: 'opportunity_value',
      amount: money.amount,
      currency,
      approximate: money.approximate,
      evidence: cleanSentence(sentence),
      certainty: !currencyKnown ? 'ambiguous' : money.approximate ? 'inferred' : 'exact',
      target,
      status: 'proposed',
    });
    if (facts.length >= 2) break;
  }

  return facts;
}

/** An amount and, when the note gave one, its currency. */
function readMoney(sentence: string): { amount: number; currency: string; approximate: boolean } | null {
  const magnitudes = MAGNITUDES.map((entry) => entry.pattern).join('|');
  const pattern = new RegExp(
    String.raw`([$€£₫¥]|\b(?:VND|USD|EUR|GBP|SGD|JPY|KRW|CNY|AUD|CAD|CHF|THB|MYR|IDR|PHP|INR)\b)?\s*` +
    String.raw`(\d[\d.,]*)\s*(${magnitudes})?\s*` +
    String.raw`([$€£₫¥]|\b(?:VND|USD|EUR|GBP|SGD|JPY|KRW|CNY|AUD|CAD|CHF|THB|MYR|IDR|PHP|INR)\b)?`,
    'i',
  );

  const match = sentence.match(pattern);
  if (!match) return null;

  const rawCurrency = (match[1] || match[4] || '').trim();
  const currency = rawCurrency ? (CURRENCY_SYMBOLS[rawCurrency] || rawCurrency.toUpperCase()) : '';
  const magnitude = (match[3] || '').toLowerCase();
  const multiplier = magnitude
    ? MAGNITUDES.find((entry) => new RegExp(`^(?:${entry.pattern})`, 'i').test(magnitude))?.multiplier || 1
    : 1;

  // A number with neither a currency nor a magnitude is a quantity until the
  // sentence says otherwise.
  if (!currency && !magnitude) return null;
  if (!currency && !MONEY_CONTEXT.test(sentence)) return null;
  if (currency && !isSupportedCurrency(currency) && !CURRENCY_SYMBOLS[rawCurrency]) return null;

  const base = parseLocalizedAmount(match[2]);
  if (base === null || base <= 0) return null;

  const amount = base * multiplier;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { amount, currency, approximate: APPROXIMATE.test(sentence) };
}

// ------------------------------------------------------------------ evidence

type EvidenceReading = {
  direction: EvidenceDirection;
  certainty: FactCertainty;
  summary: string;
};

/**
 * A technical result the note states, read into the one evidence category.
 *
 * Two words have to be present before anything is proposed: what was evaluated,
 * and how it went. A result word alone ("it passed") names no subject, and a
 * subject alone ("the trial") reports no outcome; either on its own would make
 * the parser confident about a sentence it has only half understood.
 *
 * One fact per note. A second finding of the same kind on the same day would
 * immediately supersede the first, and picking a winner between two sentences
 * the operator wrote minutes apart is a judgement the parser has no basis for.
 */
function evidenceFacts(
  sentences: string[],
  captureDate: string,
  target: CaptureTarget,
): CapturedFact[] {
  for (const sentence of sentences) {
    const noun = sentence.match(EVALUATION_ACRONYM)?.[1] || sentence.match(EVALUATION_NOUN)?.[1];
    if (!noun) continue;

    const reading = readTechnicalOutcome(sentence, capitalise(noun.trim()));
    if (!reading) continue;

    return [{
      id: 'evidence-0',
      kind: 'commercial_evidence',
      category: 'technical_outcome',
      direction: reading.direction,
      summary: reading.summary,
      evidence: cleanSentence(sentence),
      certainty: reading.certainty,
      target,
      status: 'proposed',
    }];
  }

  void captureDate;
  return [];
}

/**
 * Which way the sentence points, and how sure the wording lets us be.
 *
 * The order of the branches is the whole safeguard, and the first two are the
 * ones that matter: a sentence carrying both a failure and a pass, and a
 * sentence carrying a hedge in front of a positive, are both read as `neutral`
 * with `ambiguous` certainty rather than resolved by guessing. "Do not claim
 * technical acceptance from vague positivity" is a rule about the second, and
 * "trial failed on the third run but the retest passed" is why there is a
 * first.
 */
function readTechnicalOutcome(sentence: string, noun: string): EvidenceReading | null {
  const negative = RESULT_NEGATIVE.test(sentence);
  const positiveExact = RESULT_POSITIVE_EXACT.test(sentence);
  const positiveLoose = RESULT_POSITIVE_LOOSE.test(sentence);
  const positive = positiveExact || positiveLoose;
  const hedged = RESULT_HEDGE.test(sentence);

  const inconclusive: EvidenceReading = {
    direction: 'neutral',
    certainty: 'ambiguous',
    summary: `${noun} not yet conclusive`,
  };

  if (negative && positive) return inconclusive;
  if (hedged && positive) return inconclusive;

  if (negative) {
    return {
      direction: 'negative',
      certainty: hedged ? 'ambiguous' : 'exact',
      summary: `${noun} did not pass`,
    };
  }
  if (positiveExact) return { direction: 'positive', certainty: 'exact', summary: `${noun} passed` };
  if (positiveLoose) return { direction: 'positive', certainty: 'inferred', summary: `${noun} passed` };

  if (RESULT_IN_PROGRESS.test(sentence)) {
    return { direction: 'neutral', certainty: 'inferred', summary: `${noun} still in progress` };
  }
  if (RESULT_CONCLUDED.test(sentence)) {
    return { direction: 'neutral', certainty: 'inferred', summary: `${noun} completed, outcome not stated` };
  }
  if (hedged) return inconclusive;

  return null;
}

// -------------------------------------------------------------------- events

function eventFacts(
  sentences: string[],
  captureDate: string,
  target: CaptureTarget,
  /** Sentences already read as a result. A verdict is not a booking. */
  reportedResults: Set<string>,
): CapturedFact[] {
  const facts: CapturedFact[] = [];

  for (const sentence of sentences) {
    if (reportedResults.has(cleanSentence(sentence))) continue;

    // Either a person is coming, or a named kind of business event is booked.
    // The second half is what "Site acceptance test on 14 October" needed: the
    // pattern used to require a capitalised human subject, so an event nobody
    // was named in front of produced nothing at all.
    const intent = sentence.match(EVENT_INTENT) || matchScheduledEvent(sentence);
    if (!intent) continue;
    const date = extractDueDate(sentence, captureDate);
    // Without a date it is not a scheduled event; it is a sentence. The plan
    // needs a day or it has nowhere to draw it.
    if (!date) continue;
    // A date already gone is history, not a plan. Without this, a note written
    // up a fortnight late would put last month's audit on next week's board.
    if (date < captureDate) continue;

    facts.push({
      id: `event-${facts.length}`,
      kind: 'scheduled_event',
      label: trimTo(cleanSentence(sentence), 120),
      date,
      evidence: cleanSentence(sentence),
      certainty: 'inferred',
      target,
      status: 'proposed',
    });
    if (facts.length >= 2) break;
  }

  return facts;
}

/**
 * A booked business event with no person in front of it.
 *
 * All three parts are required together. The noun says what kind of thing it
 * is, the preposition says it is being scheduled rather than described, and the
 * caller separately requires a date the note actually contains. Dropping any
 * one of them turns "payment is due on 30 October" into a site visit.
 */
function matchScheduledEvent(sentence: string): RegExpMatchArray | null {
  const noun = sentence.match(SCHEDULED_EVENT_ACRONYM) || sentence.match(SCHEDULED_EVENT_NOUN);
  if (!noun) return null;
  const after = sentence.slice((noun.index ?? 0) + noun[0].length);
  return SCHEDULING_PREPOSITION.test(after) ? noun : null;
}

// -------------------------------------------------------------- unsupported

/**
 * Things the note plainly says that have nowhere canonical to go.
 *
 * Listed, not dropped and not bent into a field that nearly fits. The
 * temptation with a positive trial result is to write it into the evidence box
 * or invent a "signal" record; both make the parser look better and the data
 * model worse. Saying "I read this and there is nowhere to put it" is the
 * honest answer, and it is also the list that decides what to build next.
 */
function collectUnsupported(sentences: string[], facts: CapturedFact[], out: UnsupportedFinding[]) {
  const TRIAL = /\b(trial|pilot|test|poc|sample)\b[^.]{0,60}\b(look|looks|looked|went|going|result|results|fine|good|well|positive|successful|failed|poor|bad)\b/i;
  const COMPETITOR = /\b(competitor|incumbent|also (?:talking|quoting)|versus|vs\.?)\b/i;

  // A trial result now has a canonical home, so it is only listed as
  // unsupported when the reader could not actually make a finding out of it -
  // which is the honest version of "I read this and got nothing from it".
  const readAsEvidence = facts.some((fact) => fact.kind === 'commercial_evidence');

  for (const sentence of sentences) {
    if (!readAsEvidence && TRIAL.test(sentence) && !out.some((item) => item.label === 'Trial result')) {
      out.push({ label: 'Trial result', evidence: cleanSentence(sentence) });
    }
    if (COMPETITOR.test(sentence) && !out.some((item) => item.label === 'Competitor mentioned')) {
      out.push({ label: 'Competitor mentioned', evidence: cleanSentence(sentence) });
    }
  }
}

// --------------------------------------------------------------- duplicates

/**
 * Proposals the workspace can already answer.
 *
 * Marked rather than removed. A fact that vanishes looks like the parser missed
 * it, and the operator writes it in by hand - which is the duplicate this check
 * existed to prevent.
 *
 * The equivalence tests are deliberately strict. A near-miss stays `proposed`,
 * because two similar objections are a judgement the operator makes and a
 * wrongly suppressed one is a blocker nobody ever sees.
 */
function markDuplicates(facts: CapturedFact[], context: CaptureParseContext): CapturedFact[] {
  return facts.map((fact) => {
    if (fact.kind === 'stakeholder') {
      const existing = context.stakeholders.find((person) =>
        normalizeEntityName(person.name) === normalizeEntityName(fact.name)
        && normalizeEntityName(person.accountName) === normalizeEntityName(fact.target.accountName));
      return existing ? { ...fact, status: 'already_recorded' as const, duplicateOf: existing.id } : fact;
    }

    if (fact.kind === 'objection') {
      const existing = context.objections.find((objection) =>
        objection.status !== 'Resolved'
        && normalizeEntityName(objection.accountName) === normalizeEntityName(fact.target.accountName)
        && sameText(objection.objectionText, fact.text));
      return existing ? { ...fact, status: 'already_recorded' as const, duplicateOf: existing.id } : fact;
    }

    if (fact.kind === 'commitment') {
      const existing = context.openCommitments.find((commitment) =>
        normalizeEntityName(commitment.accountName) === normalizeEntityName(fact.target.accountName)
        && sameText(commitment.commitmentText, fact.text));
      return existing ? { ...fact, status: 'already_recorded' as const, duplicateOf: existing.id } : fact;
    }

    if (fact.kind === 'commercial_evidence') {
      // The same finding, in the same scope, pointing the same way. A record
      // pointing the *other* way is deliberately not a duplicate: a retest that
      // passed after a failure is the most commercially important thing a note
      // can say, and suppressing it as "already recorded" would bury it.
      const existing = context.evidence.find((record) =>
        record.category === fact.category
        && record.direction === fact.direction
        && normalizeEntityName(record.accountName) === normalizeEntityName(fact.target.accountName)
        && (record.opportunityId || null) === (fact.target.opportunityId || null)
        && sameText(record.summary, fact.summary));
      return existing ? { ...fact, status: 'already_recorded' as const, duplicateOf: existing.id } : fact;
    }

    if (fact.kind === 'opportunity_value') {
      const deal = context.opportunities.find((item) => item.id === fact.target.opportunityId);
      // Only when it is the same number in the same currency. A different
      // amount is the point of the fact.
      const same = deal && deal.estimatedValue === fact.amount
        && (deal.currency || '').toUpperCase() === fact.currency.toUpperCase();
      return same ? { ...fact, status: 'already_recorded' as const, duplicateOf: deal.id } : fact;
    }

    return fact;
  });
}

// -------------------------------------------------------------------- helpers

function splitSentences(raw: string): string[] {
  return raw
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function cleanSentence(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function trimTo(value: string, max: number) {
  const cleaned = cleanSentence(value);
  return cleaned.length > max ? `${cleaned.slice(0, max - 1).trimEnd()}…` : cleaned;
}

function capitalise(value: string) {
  const cleaned = cleanSentence(value);
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function sameText(left: string, right: string) {
  return normalizeEntityName(left) === normalizeEntityName(right);
}

const DEPARTMENT_WORDS = new Set([
  'qc', 'qa', 'purchasing', 'procurement', 'finance', 'legal', 'production',
  'maintenance', 'engineering', 'quality', 'sales', 'marketing', 'management',
]);

/**
 * Whether this "name" is really a team.
 *
 * Any department word anywhere in it is enough. "Met Rohto QC today" reads as a
 * two-word name and it is a customer plus a function - creating a person called
 * "Rohto QC" puts a department in the people list, where it then counts as
 * stakeholder coverage the deal has not got.
 */
function isDepartmentWord(name: string) {
  return name.split(/\s+/).some((word) => DEPARTMENT_WORDS.has(word.toLowerCase()));
}

/** A job title as written, or nothing. Never a MEDDIC role. */
function cleanRoleTitle(value: string) {
  const cleaned = cleanSentence(value).replace(/[.,;]$/, '');
  if (!cleaned || cleaned.length > 40) return '';
  // "today", "yesterday" and friends follow a name as often as a title does.
  if (/^(today|yesterday|this|last|next|again|earlier|briefly)\b/i.test(cleaned)) return '';
  return cleaned;
}
