import { accountKey } from './accountIdentity.ts';

type AccountLink = { id: string; accountName: string; userId?: string; isSample?: boolean; source?: string };

/** Only an unambiguous account in this owner scope can supply a canonical ID. */
export function canonicalAccountId(name: string, accounts: AccountLink[], userId?: string | null, preferredId?: string): string | undefined {
  const matches = accounts.filter(account => accountKey(account.accountName) === accountKey(name)
    && (!userId || (account.userId === userId && !account.isSample && account.source !== 'demo')));
  if (preferredId && matches.some(account => account.id === preferredId)) return preferredId;
  return matches.length === 1 ? matches[0].id : undefined;
}
