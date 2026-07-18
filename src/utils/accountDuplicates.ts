import { accountKey } from './accountIdentity.ts';

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
