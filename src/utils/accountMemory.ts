import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { sumMoneyInBase } from './money.ts';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { compareSafeBusinessDate, isValidBusinessDate } from './safeDate.ts';
import { accountKey as normalize, sameAccount } from './accountIdentity.ts';

export type AccountCandidate = {
  accountName: string;
  source: 'opportunity' | 'activity' | 'mixed';
  opportunityCount: number;
  activityCount: number;
};

export type AccountHealth = 'Healthy' | 'Needs attention' | 'At risk' | 'Dormant';

export type AccountMemory = {
  account: AccountMemoryRecord;
  opportunities: CrmLiteOpportunity[];
  linkedActivities: SalesActivityRecord[];
  matchingActivities: SalesActivityRecord[];
  openNextActions: string[];
  objectionDebt: string[];
  latestActivityDate: string;
  estimatedActiveValue: number;
  activeOpportunityCount: number;
  wonCount: number;
  lostCount: number;
  onHoldCount: number;
  health: AccountHealth;
  riskSignals: string[];
};

export function buildAccountMemory(
  account: AccountMemoryRecord,
  opportunities: CrmLiteOpportunity[],
  activities: SalesActivityRecord[],
  /**
   * Names the user merged into this account. Deals and activities keep the name
   * they were captured under - a merge is a decision, not a rewrite - so this is
   * how that decision reaches the numbers.
   */
  alternateNames: string[] = [],
): AccountMemory {
  // Match on the shared canonical key (diacritic- and punctuation-insensitive),
  // so a deal on "VNVC" and this "VNVC." account are the same account. Exact
  // lowercase+trim equality here is what reported 0 active opportunities while
  // the deals were visible one screen over.
  const answersTo = (name?: string) => (
    sameAccount(name || '', account.accountName)
    || alternateNames.some((alternate) => sameAccount(name || '', alternate))
  );

  const accountOpportunities = opportunities.filter((opportunity) => answersTo(opportunity.accountName));
  const linkedActivities = activities.filter((activity) =>
    activity.linkStatus === 'Linked' && answersTo(activity.linkedAccountName || activity.accountName)
  );
  const matchingActivities = activities.filter((activity) =>
    activity.linkStatus !== 'Linked' && answersTo(activity.accountName)
  );
  const allActivities = [...linkedActivities, ...matchingActivities];
  const openNextActions = uniqueClean([
    ...accountOpportunities.map((opportunity) => opportunity.nextAction),
    ...allActivities.map((activity) => activity.nextAction),
  ]);
  const objectionDebt = uniqueClean([
    ...accountOpportunities.map((opportunity) => opportunity.objectionDebt),
    ...allActivities
      .filter((activity) => activity.activityType === 'Objection handling' || activity.tags.includes('risk-signal'))
      .map((activity) => activity.summary),
  ]);
  const activeOpportunities = accountOpportunities.filter((opportunity) => opportunity.status === 'Active');
  const latestActivityDate = allActivities.map((activity) => activity.activityDate).filter(isValidBusinessDate).sort(compareSafeBusinessDate).at(-1) || '';
  const memoryWithoutHealth = {
    account,
    opportunities: accountOpportunities,
    linkedActivities,
    matchingActivities,
    openNextActions,
    objectionDebt,
    latestActivityDate,
    estimatedActiveValue: sumMoneyInBase(activeOpportunities.map((opportunity) => ({
      amount: opportunity.estimatedValue,
      currency: opportunity.currency,
    }))),
    activeOpportunityCount: activeOpportunities.length,
    wonCount: accountOpportunities.filter((opportunity) => opportunity.status === 'Won').length,
    lostCount: accountOpportunities.filter((opportunity) => opportunity.status === 'Lost').length,
    onHoldCount: accountOpportunities.filter((opportunity) => opportunity.status === 'On hold').length,
    health: 'Healthy' as AccountHealth,
    riskSignals: [],
  };
  const health = calculateAccountHealth(memoryWithoutHealth);

  return {
    ...memoryWithoutHealth,
    health,
    riskSignals: getRiskSignals(memoryWithoutHealth, health),
  };
}

export function deriveAccountCandidatesFromOpportunities(opportunities: CrmLiteOpportunity[]) {
  return buildCandidates(opportunities.map((opportunity) => ({
    accountName: opportunity.accountName,
    opportunityCount: 1,
    activityCount: 0,
  })));
}

export function deriveAccountCandidatesFromActivities(activities: SalesActivityRecord[]) {
  return buildCandidates(activities.map((activity) => ({
    accountName: activity.linkedAccountName || activity.accountName,
    opportunityCount: 0,
    activityCount: 1,
  })));
}

export function calculateAccountHealth(memory: Omit<AccountMemory, 'health' | 'riskSignals'>): AccountHealth {
  if (memory.account.relationshipStatus === 'Dormant') return 'Dormant';
  if (memory.account.relationshipStatus === 'At risk') return 'At risk';
  if (memory.objectionDebt.length > 0 && memory.openNextActions.length === 0) return 'At risk';
  if (!memory.latestActivityDate && memory.activeOpportunityCount > 0) return 'Needs attention';
  if (memory.latestActivityDate && daysSince(memory.latestActivityDate) > 30) return 'Dormant';
  if (memory.openNextActions.length === 0 && memory.activeOpportunityCount > 0) return 'Needs attention';
  return 'Healthy';
}

export function mergeAccountCandidates(
  opportunityCandidates: AccountCandidate[],
  activityCandidates: AccountCandidate[],
  existingAccounts: AccountMemoryRecord[]
) {
  const existing = new Set(existingAccounts.map((account) => normalize(account.accountName)));
  const byName = new Map<string, AccountCandidate>();

  [...opportunityCandidates, ...activityCandidates].forEach((candidate) => {
    const key = normalize(candidate.accountName);
    if (!key || existing.has(key)) return;
    const current = byName.get(key);
    if (!current) {
      byName.set(key, candidate);
      return;
    }
    byName.set(key, {
      accountName: candidate.accountName || current.accountName,
      source: current.source === candidate.source ? current.source : 'mixed',
      opportunityCount: current.opportunityCount + candidate.opportunityCount,
      activityCount: current.activityCount + candidate.activityCount,
    });
  });

  return Array.from(byName.values()).sort((a, b) =>
    (b.opportunityCount + b.activityCount) - (a.opportunityCount + a.activityCount)
  );
}

function buildCandidates(items: { accountName: string; opportunityCount: number; activityCount: number }[]): AccountCandidate[] {
  const byName = new Map<string, AccountCandidate>();
  items.forEach((item) => {
    const accountName = item.accountName.trim();
    const key = normalize(accountName);
    if (!key) return;
    const current = byName.get(key);
    if (!current) {
      byName.set(key, {
        accountName,
        source: item.opportunityCount > 0 ? 'opportunity' : 'activity',
        opportunityCount: item.opportunityCount,
        activityCount: item.activityCount,
      });
      return;
    }
    byName.set(key, {
      ...current,
      opportunityCount: current.opportunityCount + item.opportunityCount,
      activityCount: current.activityCount + item.activityCount,
    });
  });
  return Array.from(byName.values());
}

function getRiskSignals(memory: Omit<AccountMemory, 'health' | 'riskSignals'>, health: AccountHealth) {
  return [
    health === 'Dormant' ? 'No recent account activity.' : '',
    memory.objectionDebt.length > 0 ? `${memory.objectionDebt.length} objection or risk signal${memory.objectionDebt.length === 1 ? '' : 's'} captured.` : '',
    memory.activeOpportunityCount > 0 && memory.openNextActions.length === 0 ? 'Active opportunities have no clear next action.' : '',
    memory.account.accountPotential === 'High' && memory.activeOpportunityCount === 0 ? 'High-potential account has no active opportunity.' : '',
  ].filter(Boolean);
}

function uniqueClean(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function daysSince(dateKey: string) {
  const then = new Date(`${dateKey}T00:00:00`);
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}
