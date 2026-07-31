import { accountKey, sameAccount } from './accountIdentity.ts';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';

/**
 * Two account records, one company.
 *
 * The canonical resolver already collapses punctuation and diacritics, so
 * "VNVC" and "VNVC." are one account everywhere reads happen. What it cannot
 * collapse is a company written two genuinely different ways - "Apex Labs" and
 * "Apex Labs Ltd", "VNVC" and "VNVC Vietnam" - and those leave a seller's
 * memory split across two rows, each holding half the story.
 *
 * This finds those pairs and nothing else. It proposes; it never merges. Every
 * group carries the evidence behind it so accepting one is a judgement call
 * rather than an act of faith - the same discipline the plan suggestions use.
 */

/** Legal-form noise that says nothing about which company this is. */
const LEGAL_SUFFIX_TOKENS = new Set([
  'ltd', 'limited', 'llc', 'inc', 'incorporated', 'co', 'company', 'corp',
  'corporation', 'plc', 'gmbh', 'bv', 'nv', 'sa', 'ag', 'srl', 'spa', 'oy', 'ab',
  'pte', 'pty', 'jsc', 'jsco', 'llp', 'lp', 'sdn', 'bhd', 'kk', 'as',
  'group', 'holdings', 'holding',
  // Vietnamese forms, written out and abbreviated.
  'cong', 'ty', 'tnhh', 'cp', 'mtv', 'ctcp',
]);

export type DuplicateMember = {
  accountId: string;
  accountName: string;
  opportunityCount: number;
  activityCount: number;
  lastTouchDate: string;
};

export type DuplicateGroup = {
  key: string;
  /** Why these were put together, in words the user can check. */
  reason: string;
  confidence: 'certain' | 'likely';
  members: DuplicateMember[];
};

export type DuplicateInput = {
  accounts: Array<{ id: string; accountName: string }>;
  opportunities: Array<{ accountName: string }>;
  activities: Array<{ accountName: string; linkedAccountName?: string; activityDate: string }>;
  /** Names already merged away - never proposed again. */
  resolvedNames?: string[];
  /** Pairs the user rejected, as sorted "a|b" keys. */
  dismissedPairs?: string[];
};

export function findDuplicateAccountGroups(input: DuplicateInput): DuplicateGroup[] {
  const resolved = new Set((input.resolvedNames || []).map(accountKey).filter(Boolean));
  const dismissed = new Set(input.dismissedPairs || []);

  const accounts = input.accounts
    .filter((account) => account.accountName.trim())
    .filter((account) => !resolved.has(accountKey(account.accountName)));

  const groups = new Map<string, { reason: string; confidence: 'certain' | 'likely'; ids: Set<string> }>();

  for (let left = 0; left < accounts.length; left += 1) {
    for (let right = left + 1; right < accounts.length; right += 1) {
      const a = accounts[left];
      const b = accounts[right];
      const match = compareAccountNames(a.accountName, b.accountName);
      if (!match) continue;
      if (dismissed.has(pairKey(a.accountName, b.accountName))) continue;

      const key = pairKey(a.accountName, b.accountName);
      const existing = groups.get(key);
      if (existing) {
        existing.ids.add(a.id);
        existing.ids.add(b.id);
        continue;
      }
      groups.set(key, { reason: match.reason, confidence: match.confidence, ids: new Set([a.id, b.id]) });
    }
  }

  const byId = new Map(accounts.map((account) => [account.id, account]));

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      reason: group.reason,
      confidence: group.confidence,
      members: Array.from(group.ids)
        .map((id) => byId.get(id))
        .filter((account): account is { id: string; accountName: string } => Boolean(account))
        .map((account) => buildMember(account, input))
        .sort((a, b) => (b.opportunityCount + b.activityCount) - (a.opportunityCount + a.activityCount)),
    }))
    .filter((group) => group.members.length > 1)
    // Certain first, then the groups carrying the most at stake.
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'certain' ? -1 : 1;
      return totalRecords(b) - totalRecords(a);
    })
    .slice(0, 8);
}

/**
 * Conservative on purpose. A false merge costs the user their history under a
 * name they no longer recognise, so only two signals count: the same name once
 * legal-form noise is removed, and one name being the other plus extra words.
 */
export function compareAccountNames(left: string, right: string): { reason: string; confidence: 'certain' | 'likely' } | null {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return null;

  if (accountKey(left) === accountKey(right)) {
    return { reason: 'Identical once punctuation is ignored.', confidence: 'certain' };
  }

  if (leftTokens.join(' ') === rightTokens.join(' ')) {
    return { reason: 'The same name with a different legal form (Ltd, JSC, Co).', confidence: 'certain' };
  }

  // "DPLab" and "DP Lab", "NamKhoa" and "Nam Khoa" - the same letters in the
  // same order, written open or closed. Nobody runs two companies whose names
  // differ only by a space, and a seller types it both ways within one week.
  if (leftTokens.join('') === rightTokens.join('')) {
    return { reason: 'The same name written with and without a space.', confidence: 'certain' };
  }

  const shorter = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const longer = shorter === leftTokens ? rightTokens : leftTokens;

  // "VNVC" inside "VNVC Vietnam": every word of one, in order, starts the other.
  const isPrefix = shorter.every((token, index) => longer[index] === token);
  if (isPrefix && longer.length - shorter.length <= 2) {
    return { reason: 'One name is the other with extra words.', confidence: 'likely' };
  }

  return null;
}

export function pairKey(left: string, right: string) {
  return [accountKey(left), accountKey(right)].sort().join('|');
}

/** How far apart two names may be and still be worth asking about. */
export const ACCOUNT_TYPO_MAX_DISTANCE = 2;
/** Below this, one letter is a real difference between two real companies. */
const ACCOUNT_TYPO_MIN_LENGTH = 5;

/**
 * The closest existing customer to a name being typed - for asking, never for
 * merging.
 *
 * `compareAccountNames` above is deliberately blind to a one-letter slip,
 * because it feeds a merge, and a wrong merge buries a customer's history under
 * a name the seller no longer recognises. This feeds a question on a form still
 * being filled in, where being wrong costs one glance, so it can afford to
 * notice that "Trust Farma" is probably the "Trust Farm" with twelve deals on
 * it. It suggests; the seller decides, and creating a genuinely new customer
 * stays exactly one click.
 */
export function findSimilarAccountName(
  typed: string,
  candidates: string[],
  maxDistance = ACCOUNT_TYPO_MAX_DISTANCE,
): { name: string; distance: number } | null {
  const key = accountKey(typed);
  if (key.length < ACCOUNT_TYPO_MIN_LENGTH) return null;

  let best: { name: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const candidateKey = accountKey(candidate);
    if (!candidateKey || candidateKey === key) continue;
    if (Math.abs(candidateKey.length - key.length) > maxDistance) continue;

    const distance = editDistanceWithin(key, candidateKey, maxDistance);
    if (distance === null) continue;
    if (!best || distance < best.distance) best = { name: candidate, distance };
  }
  return best;
}

/** Levenshtein distance, or null once it is certain to exceed `max`. */
function editDistanceWithin(left: string, right: string, max: number): number | null {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current.push(value);
      if (value < rowMin) rowMin = value;
    }
    // Every future row is at least this good, so the answer cannot come back
    // under the limit. Bailing here keeps the scan cheap over hundreds of names.
    if (rowMin > max) return null;
    previous = current;
  }

  const distance = previous[right.length];
  return distance <= max ? distance : null;
}

/** Tokens that actually identify the company. */
function meaningfulTokens(value: string) {
  return accountKey(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !LEGAL_SUFFIX_TOKENS.has(token));
}

function buildMember(account: { id: string; accountName: string }, input: DuplicateInput): DuplicateMember {
  const key = accountKey(account.accountName);
  const opportunityCount = input.opportunities.filter((opportunity) => accountKey(opportunity.accountName) === key).length;
  const matched = input.activities.filter((activity) => (
    accountKey(activity.accountName) === key || accountKey(activity.linkedAccountName || '') === key
  ));

  return {
    accountId: account.id,
    accountName: account.accountName,
    opportunityCount,
    activityCount: matched.length,
    lastTouchDate: matched
      .map((activity) => activity.activityDate)
      .filter(Boolean)
      .sort()
      .at(-1) || '',
  };
}

function totalRecords(group: DuplicateGroup) {
  return group.members.reduce((total, member) => total + member.opportunityCount + member.activityCount, 0);
}

export type AccountNameCheck =
  | { kind: 'quiet' }
  | { kind: 'known'; name: string }
  | { kind: 'renamed'; name: string }
  | { kind: 'near'; name: string; reason: string }
  | { kind: 'new' };

/**
 * What a typed account name means, before it becomes a record.
 *
 * A customer's identity is this string, so the moment it is saved a near-miss
 * is a customer split in two - across their deals, their touches, their
 * coverage row and their contact rhythm - with nothing on screen to say so. The
 * four answers are: this is a customer you have, this is a name you merged
 * away, this looks like a customer you have, and this is new.
 *
 * It lives here rather than on a page because both places a customer can be
 * born need the same answer. It was written for the opportunity form; the
 * Accounts page created records with no check at all, which is the one place a
 * duplicate is created deliberately.
 */
export function checkAccountName(typed: string, known: string[], aliases: AccountAliasIndex): AccountNameCheck {
  const raw = (typed || '').trim();
  if (raw.length < 2) return { kind: 'quiet' };

  const resolved = resolveAccountName(raw, aliases);
  if (accountKey(resolved) !== accountKey(raw)) return { kind: 'renamed', name: resolved };

  const exact = known.find((name) => sameAccount(name, raw));
  if (exact) return { kind: 'known', name: exact };

  const strong = known
    .map((name) => ({ name, match: compareAccountNames(raw, name) }))
    .find((row) => row.match);
  if (strong?.match) return { kind: 'near', name: strong.name, reason: strong.match.reason };

  const similar = findSimilarAccountName(raw, known);
  if (similar) {
    return {
      kind: 'near',
      name: similar.name,
      reason: similar.distance === 1 ? 'One character apart.' : 'Nearly the same name.',
    };
  }

  return { kind: 'new' };
}
