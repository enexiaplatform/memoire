import type { AccountMemoryRecord } from '../services/accountStore';
import type { CrmLiteOpportunity } from '../services/opportunityStore';
import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { QuoteRecord } from '../services/quoteStore';
import { isCommittedToOrder } from './orderToCash';
import { sumMoneyInBase } from './money.ts';
import { compareSafeBusinessDate, isValidBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * The whole business as one connected map: the workspace at the center, the
 * brands it carries, the customers each brand reaches, and the deals each
 * customer holds - every node clickable through to the record it mirrors.
 *
 * This is a derived view in the strictest sense. It stores nothing, owns
 * nothing, and is rebuilt from the same records every other surface reads, so
 * the map can never disagree with the workspace it draws.
 */

export type VaultNodeKind = 'hub' | 'brand' | 'account' | 'opportunity';

export type VaultNode = {
  id: string;
  kind: VaultNodeKind;
  label: string;
  /** Money weight in base currency - drives node size on the map. */
  valueBase: number;
  /** Days since the last captured touch. Accounts only; null when never touched. */
  quietDays: number | null;
  stage?: string;
  status?: string;
  /** The customer has committed to order - the order book's own definition. */
  committed?: boolean;
  href: string;
  /** Short facts for the detail panel, already worded. */
  facts: string[];
};

export type VaultLink = {
  source: string;
  target: string;
};

export type BusinessGraph = {
  nodes: VaultNode[];
  links: VaultLink[];
  brandCount: number;
  accountCount: number;
  opportunityCount: number;
  totalActiveBase: number;
};

const QUIET_ACCOUNT_DAYS = 14;

export function buildBusinessGraph(input: {
  accounts: AccountMemoryRecord[];
  opportunities: CrmLiteOpportunity[];
  activities: SalesActivityRecord[];
  quotes: QuoteRecord[];
  today?: string;
}): BusinessGraph {
  const today = input.today || todayDateKey();
  const nodes: VaultNode[] = [];
  const links: VaultLink[] = [];

  const lastTouchByAccount = new Map<string, string>();
  input.activities.forEach((activity) => {
    const key = normalize(activity.linkedAccountName || activity.accountName);
    if (!key || !isValidBusinessDate(activity.activityDate)) return;
    const current = lastTouchByAccount.get(key);
    if (!current || compareSafeBusinessDate(activity.activityDate, current) > 0) {
      lastTouchByAccount.set(key, activity.activityDate);
    }
  });

  // Every customer the workspace knows: the account book first, then any name
  // that only exists on a deal yet - the map should never lose a customer to a
  // missing account record.
  const accountNames = new Map<string, string>();
  input.accounts.forEach((account) => {
    if (account.accountName.trim()) accountNames.set(normalize(account.accountName), account.accountName.trim());
  });
  input.opportunities.forEach((opportunity) => {
    const name = (opportunity.accountName || '').trim();
    if (name && !accountNames.has(normalize(name))) accountNames.set(normalize(name), name);
  });

  const liveOpportunities = input.opportunities.filter(
    (opportunity) => opportunity.status === 'Active' || opportunity.status === 'Won',
  );

  const valueByAccount = new Map<string, number>();
  const brandsByAccount = new Map<string, Set<string>>();
  const brandValue = new Map<string, number>();
  liveOpportunities.forEach((opportunity) => {
    const accountKey = normalize(opportunity.accountName);
    const value = opportunity.status === 'Active' && typeof opportunity.estimatedValue === 'number'
      ? sumMoneyInBase([{ amount: opportunity.estimatedValue, currency: opportunity.currency }])
      : 0;
    valueByAccount.set(accountKey, (valueByAccount.get(accountKey) || 0) + value);

    const brand = (opportunity.brand || '').trim();
    if (brand) {
      const set = brandsByAccount.get(accountKey) || new Set<string>();
      set.add(brand);
      brandsByAccount.set(accountKey, set);
      brandValue.set(brand, (brandValue.get(brand) || 0) + value);
    }
  });

  const totalActiveBase = [...valueByAccount.values()].reduce((sum, value) => sum + value, 0);

  const hubId = 'hub';
  nodes.push({
    id: hubId,
    kind: 'hub',
    label: 'Your business',
    valueBase: totalActiveBase,
    quietDays: null,
    href: '/app/today',
    facts: [
      `${accountNames.size} customers`,
      `${liveOpportunities.filter((item) => item.status === 'Active').length} active deals`,
    ],
  });

  const brands = [...brandValue.keys()].sort();
  brands.forEach((brand) => {
    const id = `brand:${normalize(brand)}`;
    nodes.push({
      id,
      kind: 'brand',
      label: brand,
      valueBase: brandValue.get(brand) || 0,
      quietDays: null,
      href: '/app/opportunities',
      facts: [`Active value: ${Math.round(brandValue.get(brand) || 0).toLocaleString()} VND`],
    });
    links.push({ source: hubId, target: id });
  });

  accountNames.forEach((label, key) => {
    const id = `account:${key}`;
    const lastTouch = lastTouchByAccount.get(key);
    const quietDays = lastTouch ? daysBetween(lastTouch, today) : null;
    nodes.push({
      id,
      kind: 'account',
      label,
      valueBase: valueByAccount.get(key) || 0,
      quietDays,
      href: `/app/accounts?accountName=${encodeURIComponent(label)}`,
      facts: [
        lastTouch ? `Last touch ${lastTouch} (${quietDays}d ago)` : 'No touch captured yet',
      ],
    });

    const accountBrands = brandsByAccount.get(key);
    if (accountBrands && accountBrands.size > 0) {
      accountBrands.forEach((brand) => links.push({ source: `brand:${normalize(brand)}`, target: id }));
    } else {
      links.push({ source: hubId, target: id });
    }
  });

  liveOpportunities.forEach((opportunity) => {
    const id = `opportunity:${opportunity.id}`;
    const accountId = `account:${normalize(opportunity.accountName)}`;
    const valueBase = typeof opportunity.estimatedValue === 'number'
      ? sumMoneyInBase([{ amount: opportunity.estimatedValue, currency: opportunity.currency }])
      : 0;
    nodes.push({
      id,
      kind: 'opportunity',
      label: opportunity.opportunityName || 'Untitled deal',
      valueBase,
      quietDays: null,
      stage: opportunity.stage,
      status: opportunity.status,
      committed: isCommittedToOrder(opportunity),
      href: `/app/opportunities?opportunityId=${encodeURIComponent(opportunity.id)}`,
      facts: [
        opportunity.status === 'Won' ? 'Won' : `Stage: ${opportunity.stage}`,
        opportunity.nextAction ? `Next: ${opportunity.nextAction}` : 'No next action written',
      ],
    });
    links.push({ source: accountId, target: id });
  });

  return {
    nodes,
    links,
    brandCount: brands.length,
    accountCount: accountNames.size,
    opportunityCount: liveOpportunities.length,
    totalActiveBase,
  };
}

export function isQuietAccount(node: VaultNode) {
  return node.kind === 'account' && (node.quietDays === null || node.quietDays >= QUIET_ACCOUNT_DAYS);
}

function daysBetween(fromDate: string, toDate: string) {
  const from = new Date(`${fromDate}T00:00:00`);
  const to = new Date(`${toDate}T00:00:00`);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

function normalize(value: string) {
  return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
