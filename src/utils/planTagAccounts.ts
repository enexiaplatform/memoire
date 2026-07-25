import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { PlanRecord } from './weeklyPlan.ts';
import { accountKey, sameAccount } from './accountIdentity.ts';
import { compareAccountNames } from './accountDuplicates.ts';
import { isBusinessDateInRange } from './safeDate.ts';

/**
 * The bracket tags an operator writes on their plan, read as the customers they
 * are actually working this week.
 *
 * Somebody who plans a week by hand ends up with twenty "[Account] do the thing"
 * lines and no accounts in the workspace, so none of that week reaches the money
 * spine: no deal, no follow-through, no P&L. Re-typing twenty account names is
 * the exact duplicate work the product exists to remove.
 *
 * Two things make this safe to act on. Tags that are only a category rather than
 * a customer ("Internal", "New Customer") are never proposed, because creating
 * an account called "New Customer" would poison the account list. And the same
 * customer written two ways ("DP Lab" and "DPLab") is proposed once, using the
 * duplicate rules the Accounts page already trusts - otherwise this feature
 * would manufacture the very duplicates the merge tool exists to clean up.
 */

/**
 * Bracket tags that classify the row rather than name a customer. Matched on the
 * canonical key, so "new customer" and "New Customer" are the same entry.
 */
const NON_ACCOUNT_TAGS = new Set([
  'internal',
  'new customer',
  'new customers',
  'personal',
  'admin',
  'todo',
  'to do',
  'misc',
  'other',
  'general',
]);

export type PlanTagAccountCandidate = {
  /** The spelling proposed for the account, the most complete one seen. */
  name: string;
  /** Every spelling that folds into this candidate, including the proposed one. */
  spellings: string[];
  /** How many plan items in range carry one of those spellings. */
  itemCount: number;
  /** A couple of the actual lines, so the operator can judge before creating. */
  sampleLabels: string[];
};

export function buildPlanTagAccountCandidates(input: {
  records: PlanRecord[];
  accounts: AccountMemoryRecord[];
  opportunities: CrmLiteOpportunity[];
  rangeStart: string;
  rangeEnd: string;
  limit?: number;
}): PlanTagAccountCandidate[] {
  const known = [
    ...input.accounts.map((account) => account.accountName),
    ...input.opportunities.map((opportunity) => opportunity.accountName),
  ].filter((name) => Boolean(name && name.trim()));

  const tagged = input.records
    .filter((record) => record.__deleted !== true && record.dismissed !== true)
    // A completion stub for a derived item carries the deal's account, which by
    // definition already exists - only the operator's own lines are candidates.
    .filter((record) => !record.derivedKey)
    .filter((record) => isBusinessDateInRange(record.date, input.rangeStart, input.rangeEnd))
    .filter((record) => Boolean(record.tag && record.tag.trim()))
    .filter((record) => !NON_ACCOUNT_TAGS.has(accountKey(record.tag)))
    // Already linked by hand, or already a real account: nothing to create.
    .filter((record) => !record.linkedAccountName && !record.linkedOpportunityId)
    .filter((record) => !known.some((name) => sameAccount(name, record.tag)));

  // Fold spellings of one customer together before proposing anything.
  const groups: { spellings: string[]; records: PlanRecord[] }[] = [];
  tagged.forEach((record) => {
    const group = groups.find((candidate) => candidate.spellings.some((spelling) => (
      sameAccount(spelling, record.tag) || compareAccountNames(spelling, record.tag)?.confidence === 'certain'
    )));
    if (group) {
      if (!group.spellings.some((spelling) => spelling === record.tag)) group.spellings.push(record.tag);
      group.records.push(record);
      return;
    }
    groups.push({ spellings: [record.tag], records: [record] });
  });

  return groups
    .map((group) => ({
      // The fullest spelling reads best as the account name: "DP Lab" over
      // "DPLab", because a person wrote the spaces on purpose.
      name: [...group.spellings].sort((left, right) => right.length - left.length)[0],
      spellings: [...group.spellings].sort(),
      itemCount: group.records.length,
      sampleLabels: group.records.slice(0, 2).map((record) => record.label),
    }))
    .sort((left, right) => right.itemCount - left.itemCount || left.name.localeCompare(right.name))
    // Generous by design: this is a to-do list of real customers, not a ranked
    // suggestion feed. Capping it low would have told an operator with fifteen
    // customers on their week that they had eight, and quietly hidden the rest.
    // The panel handles density by showing a few and offering "show all".
    .slice(0, input.limit ?? 40);
}

/**
 * The plan items that should point at an account once it exists - every record
 * carrying any spelling the candidate folded together, so creating the account
 * links the whole week rather than one line.
 */
export function planRecordsForCandidate(
  records: PlanRecord[],
  candidate: PlanTagAccountCandidate,
): PlanRecord[] {
  return records.filter((record) => (
    record.__deleted !== true
    && !record.derivedKey
    && Boolean(record.tag)
    && candidate.spellings.some((spelling) => sameAccount(spelling, record.tag))
  ));
}
