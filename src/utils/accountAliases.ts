import type { AccountMergeRecord } from '../services/accountMergeStore.ts';
import { accountKey } from './accountIdentity.ts';

/**
 * One place that knows a customer answers to more than one name.
 *
 * Merging two accounts does not rewrite anything: it records that "DPLab" is
 * really "DP Lab" and leaves every deal, quote and touch spelled the way it was
 * typed. That is the right call - a merge stays reversible and no source record
 * is edited behind the user's back - but it means every surface that groups by
 * account has to apply the merge itself, and until now only the Accounts page
 * did. The Vault matrix drew two rows for a customer the user had already
 * merged, and the operator profile measured two touch rhythms for them.
 *
 * `accountKey` decides whether two spellings are the same name. This decides
 * whether two different names are the same customer, because the user said so.
 */

/** Alias key -> the canonical display name that survived the merge. */
export type AccountAliasIndex = Map<string, string>;

export const EMPTY_ACCOUNT_ALIASES: AccountAliasIndex = new Map();

export function buildAccountAliasIndex(merges: AccountMergeRecord[] = []): AccountAliasIndex {
  const index: AccountAliasIndex = new Map();
  const active = merges.filter((record) => record.kind === 'merge' && record.__deleted !== true);

  // Explicit aliases first, so a chain (A folded into B, B later into C) keeps
  // its second hop. The self-mapping added below must never overwrite one.
  active.forEach((record) => {
    const canonical = (record.canonicalAccountName || '').trim();
    if (!canonical) return;
    const canonicalKey = accountKey(canonical);

    (record.mergedNames || []).forEach((name) => {
      const key = accountKey(name || '');
      if (!key || key === canonicalKey) return;
      index.set(key, canonical);
    });
  });

  // The surviving account also answers to its own key, so that a deal spelled
  // "dp lab." is *displayed* as the "DP Lab" the user chose to keep. Without
  // this, `accountKey` still groups them together but the row is labelled with
  // whichever spelling happened to be read first.
  active.forEach((record) => {
    const canonical = (record.canonicalAccountName || '').trim();
    const key = accountKey(canonical);
    if (!key || index.has(key)) return;
    index.set(key, canonical);
  });

  return index;
}

/**
 * The name a customer is counted under.
 *
 * Follows a chain - A folded into B, B later folded into C, so A is C - with a
 * hop limit rather than a trusting `while`. Merging A into B and then B into A
 * is a mistake a user can make in two clicks, and a resolver that believed the
 * records would hang the tab rather than show a wrong number.
 */
export function resolveAccountName(name: string, aliases?: AccountAliasIndex): string {
  const trimmed = (name || '').trim();
  if (!trimmed || !aliases || aliases.size === 0) return trimmed;

  let current = trimmed;
  const seen = new Set<string>([accountKey(current)]);

  for (let hop = 0; hop < 10; hop += 1) {
    const currentKey = accountKey(current);
    const next = aliases.get(currentKey);
    if (!next) return current;

    const nextKey = accountKey(next);
    // Same key, different spelling: this is the canonical wording of the account
    // we are already on, not another hop. Treating it as one would trip the
    // cycle guard below and hand back the spelling the user merged away.
    if (nextKey === currentKey) return next;
    if (seen.has(nextKey)) return current;

    seen.add(nextKey);
    current = next;
  }

  return current;
}

/** The grouping key for a customer, merges applied. */
export function resolvedAccountKey(name: string, aliases?: AccountAliasIndex): string {
  return accountKey(resolveAccountName(name, aliases));
}
