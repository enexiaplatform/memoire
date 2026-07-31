import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { accountKey } from './accountIdentity.ts';
import { sumMoneyInBase } from './money.ts';
import { compareSafeBusinessDate, isValidBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The account dimension of the business picture.
 *
 * The master model already answers where the money is, whether the pipeline is
 * believable and whether the operator is working. It says nothing about *who
 * the business is*, and for a distributor that is the question with the sharpest
 * edge: a pipeline that looks healthy in total can be one customer away from
 * being nothing.
 *
 * Two facts, both of which a seller knows in their gut and almost never checks.
 * Concentration - what share of open pipeline sits with the top few customers.
 * And quiet money - customers carrying open pipeline that nobody has touched.
 * Neither is a forecast; both are counts of records that already exist.
 */

/** Days without a touch before an account carrying pipeline counts as quiet. */
export const QUIET_ACCOUNT_DAYS = 30;

/** How many customers the concentration view names before it stops. */
const TOP_ACCOUNTS_SHOWN = 6;

export type AccountConcentrationRow = {
  accountName: string;
  openPipelineBase: number;
  /** Share of total open pipeline, 0-1. */
  share: number;
  openDeals: number;
  lastTouchDate: string;
  daysQuiet: number | null;
};

export type BusinessLensModel = {
  concentration: {
    rows: AccountConcentrationRow[];
    /** Share held by the top three customers, 0-1. Null when there is no pipeline. */
    topThreeShare: number | null;
    totalOpenBase: number;
    accountsWithPipeline: number;
    headline: string;
  };
  accounts: {
    /** Every customer the workspace knows, however it learned about them. */
    total: number;
    /** Touched inside the quiet window. */
    active: number;
    /** Carrying open pipeline with no touch inside the window - the risky ones. */
    quiet: number;
    quietPipelineBase: number;
    /** Known, but with nothing open. */
    withoutPipeline: number;
  };
};

export function buildBusinessLens(input: {
  accounts: AccountMemoryRecord[];
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  aliases?: AccountAliasIndex;
  today?: string;
}): BusinessLensModel {
  const today = input.today || todayDateKey();
  const canonical = (name?: string) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return '';
    return input.aliases ? resolveAccountName(trimmed, input.aliases) : trimmed;
  };

  // Last touch per customer, so "quiet" means quiet for the customer rather
  // than quiet for one of the several ways their name is spelled.
  const lastTouch = new Map<string, string>();
  input.activities.forEach((activity) => {
    const name = canonical(activity.linkedAccountName || activity.accountName);
    if (!name || !isValidBusinessDate(activity.activityDate)) return;
    const key = accountKey(name);
    const current = lastTouch.get(key);
    if (!current || compareSafeBusinessDate(activity.activityDate, current) > 0) {
      lastTouch.set(key, activity.activityDate);
    }
  });

  const openByAccount = new Map<string, { accountName: string; deals: CrmLiteOpportunity[] }>();
  input.opportunities
    .filter((opportunity) => opportunity.status === 'Active')
    .forEach((opportunity) => {
      const name = canonical(opportunity.accountName);
      if (!name) return;
      const key = accountKey(name);
      const entry = openByAccount.get(key) || { accountName: name, deals: [] };
      entry.deals.push(opportunity);
      openByAccount.set(key, entry);
    });

  const rowsAll: AccountConcentrationRow[] = Array.from(openByAccount.entries())
    .map(([key, entry]) => {
      const openPipelineBase = sumMoneyInBase(entry.deals.map((deal) => ({
        amount: deal.estimatedValue,
        currency: deal.currency,
      })));
      const touch = lastTouch.get(key) || '';
      return {
        accountName: entry.accountName,
        openPipelineBase,
        share: 0,
        openDeals: entry.deals.length,
        lastTouchDate: touch,
        daysQuiet: touch ? daysBetween(touch, today) : null,
      };
    })
    .sort((left, right) => right.openPipelineBase - left.openPipelineBase);

  const totalOpenBase = rowsAll.reduce((total, row) => total + row.openPipelineBase, 0);
  const withShare = rowsAll.map((row) => ({
    ...row,
    share: totalOpenBase > 0 ? row.openPipelineBase / totalOpenBase : 0,
  }));

  const topThreeShare = totalOpenBase > 0
    ? withShare.slice(0, 3).reduce((total, row) => total + row.share, 0)
    : null;

  // Known customers, counted from every name the workspace carries - an account
  // record, a deal, or a touch. Counting only account rows would report a
  // customer base smaller than the one the seller is actually working.
  const knownKeys = new Set<string>();
  [
    ...input.accounts.map((account) => account.accountName),
    ...input.opportunities.map((opportunity) => opportunity.accountName),
    ...input.activities.map((activity) => activity.linkedAccountName || activity.accountName),
  ].forEach((name) => {
    const resolved = canonical(name);
    if (resolved) knownKeys.add(accountKey(resolved));
  });

  const activeKeys = new Set(
    Array.from(lastTouch.entries())
      .filter(([, date]) => {
        const days = daysBetween(date, today);
        // An unparseable touch date is not evidence of contact.
        return days !== null && days <= QUIET_ACCOUNT_DAYS;
      })
      .map(([key]) => key),
  );

  const quietRows = withShare.filter((row) => row.daysQuiet === null || row.daysQuiet > QUIET_ACCOUNT_DAYS);

  return {
    concentration: {
      rows: withShare.slice(0, TOP_ACCOUNTS_SHOWN),
      topThreeShare,
      totalOpenBase,
      accountsWithPipeline: withShare.length,
      headline: concentrationHeadline(withShare, topThreeShare),
    },
    accounts: {
      total: knownKeys.size,
      active: activeKeys.size,
      quiet: quietRows.length,
      quietPipelineBase: quietRows.reduce((total, row) => total + row.openPipelineBase, 0),
      withoutPipeline: Math.max(knownKeys.size - withShare.length, 0),
    },
  };
}

/**
 * The sentence a seller would say out loud. Concentration is only worth
 * remarking on when it is high enough to be a risk - saying "your top three are
 * 30% of pipeline" is a statistic, not an observation.
 */
function concentrationHeadline(rows: AccountConcentrationRow[], topThreeShare: number | null) {
  if (rows.length === 0 || topThreeShare === null) {
    return 'No open pipeline yet, so there is nothing concentrated anywhere.';
  }

  const percent = Math.round(topThreeShare * 100);
  const named = Math.min(3, rows.length);
  const biggest = rows[0];
  const biggestPercent = Math.round(biggest.share * 100);

  if (rows.length <= 3) {
    return `All of your open pipeline sits with ${rows.length} ${rows.length === 1 ? 'customer' : 'customers'}. ${biggest.accountName} alone is ${biggestPercent}% of it.`;
  }
  if (topThreeShare >= 0.6) {
    return `Your top ${named} customers are ${percent}% of open pipeline, and ${biggest.accountName} alone is ${biggestPercent}%. Losing one changes the year.`;
  }
  return `Your top ${named} customers are ${percent}% of open pipeline, spread across ${rows.length} customers in total.`;
}

function daysBetween(fromKey: string, toKey: string) {
  const from = Date.parse(`${fromKey}T00:00:00`);
  const to = Date.parse(`${toKey}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}
