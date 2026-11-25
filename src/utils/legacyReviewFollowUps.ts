import { buildAccountAliasIndex, resolvedAccountKey } from './accountAliases.ts';
import { normalizeEntityName } from './accountIdentity.ts';
import { isValidBusinessDate } from './safeDate.ts';
import type { SalesWorkspaceData } from '../services/workspaceData.ts';
import { requiresLegacyReviewLookup, type ReviewPlanStatusRow } from './reviewPlanStatus.ts';
import type { PlanRecord } from './weeklyPlan.ts';

type ReviewAccounts = Pick<SalesWorkspaceData, 'accounts' | 'accountMerges' | 'opportunities'>;

export function findPossibleReviewFollowUps(
  rows: readonly ReviewPlanStatusRow[], plans: readonly PlanRecord[], workspace: ReviewAccounts, ownerId: string,
) {
  const aliases = buildAccountAliasIndex(workspace.accountMerges.filter(record => !record.isSample && record.source !== 'demo'));
  const keyOf = (name: string) => resolvedAccountKey(name, aliases);
  const accountIds = new Map<string, Set<string>>();
  const registerAccount = (name: string, id: string) => {
    const key = keyOf(name);
    if (!key) return;
    const ids = accountIds.get(key) ?? new Set<string>();
    ids.add(id);
    accountIds.set(key, ids);
  };
  workspace.accounts.filter(account => account.userId === ownerId && !account.isSample && account.source !== 'demo')
    .forEach(account => registerAccount(account.accountName, account.id));
  const opportunities = workspace.opportunities.filter(deal => deal.userId === ownerId && !deal.isSample && deal.source !== 'demo');
  opportunities.forEach(deal => { if (deal.accountId) registerAccount(deal.accountName, deal.accountId); });
  const result = new Map<string, PlanRecord[]>();
  for (const row of rows) {
    const evidence = row.activity_evidence;
    if (!requiresLegacyReviewLookup(row) || !evidence || !isValidBusinessDate(evidence.date)) continue;
    const activityDate = evidence.date;
    const deal = opportunities.find(deal => deal.id === evidence.opportunity_id);
    const accountKey = deal && keyOf(deal.accountName);
    if (!deal || !accountKey || (accountIds.get(accountKey)?.size ?? 0) > 1) continue;
    const wording = [row.label, deal.nextAction].map(normalizeEntityName).filter(Boolean);
    const dealName = normalizeEntityName(deal.opportunityName);
    const uniqueDealName = dealName && dealName !== accountKey && opportunities.filter(candidate =>
      keyOf(candidate.accountName) === accountKey && normalizeEntityName(candidate.opportunityName) === dealName).length === 1;
    const possible = plans.filter(plan => {
      const accountName = plan.linkedAccountName || (!plan.linkedBrand ? plan.tag : '');
      if (plan.id === row.item_id || plan.done || plan.__deleted || plan.dismissed || plan.derivedKey || plan.automation
        || plan.isSample || plan.source === 'demo' || plan.linkedOpportunityId
        || !isValidBusinessDate(plan.date) || plan.date < activityDate
        || typeof accountName !== 'string' || keyOf(accountName) !== accountKey
        || typeof plan.label !== 'string' || !plan.label.trim() || !plan.id || plan.id.length > 200) return false;
      const label = normalizeEntityName(plan.label);
      return wording.includes(label) || Boolean(uniqueDealName && ` ${label} `.includes(` ${dealName} `));
    });
    if (possible.length) result.set(row.item_id, possible.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)));
  }
  return result;
}
