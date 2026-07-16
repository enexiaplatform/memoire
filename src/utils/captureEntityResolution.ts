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

function resolveContact(rawNote: string, candidate: string) {
  const explicit = rawNote.match(/\b((?:Ms|Mr|Mrs|Dr)\.?\s+[A-Z][A-Za-z'-]+(?:\s+[A-Z][A-Za-z'-]+){0,2})(?=\s+(?:at|from)\b|[.,;]|$)/i)?.[1] || '';
  if (explicit) return normalizeHonorific(cleanEntity(explicit));
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
  const realMention = input.opportunities
    .filter((opportunity) => opportunityFitsAccount(opportunity, input.accountName))
    .filter((opportunity) => (
      includesPhrase(input.rawNote, opportunity.opportunityName)
      || Boolean(opportunity.productOrSolution && includesPhrase(input.rawNote, opportunity.productOrSolution))
    ))
    .sort((left, right) => right.opportunityName.length - left.opportunityName.length)[0];
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
    /\b(?:met|visited)\s+([A-Z][A-Za-z0-9&.' -]{1,60}?)\s+(?:today|yesterday|with\b)/i,
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
