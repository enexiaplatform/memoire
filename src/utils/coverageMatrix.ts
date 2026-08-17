import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { resolveAccountName, type AccountAliasIndex } from './accountAliases.ts';
import { accountKey } from './accountIdentity.ts';
import { isCommittedToOrder } from './orderToCash.ts';
import { sumMoneyInBase } from './money.ts';

/**
 * Every customer against every line you carry, and - the point of the whole
 * thing - the squares you have never filled.
 *
 * This replaced a force-directed map of the same records. The map drew the
 * business accurately and was worthless, because it showed an operator the one
 * thing they already know: who their customers are and which deals exist. A
 * note-vault graph earns its keep by surfacing links you had forgotten; nobody
 * forgets their own accounts.
 *
 * The matrix is worth reading because its empty cells are information. A
 * distributor's real strategic question is not "what does my business look
 * like" but "I carry four lines and sell to twenty customers - which of those
 * eighty combinations have I never even tried?" That question has no other home
 * in the product, and its answer is a list of things to go and do.
 */

export type CoverageCellState = 'won' | 'committed' | 'active' | 'lost' | 'none';

export type CoverageCell = {
  accountName: string;
  brand: string;
  state: CoverageCellState;
  activeValueBase: number;
  wonValueBase: number;
  dealCount: number;
  /** Opens the deals behind this square. Empty for a square with no deals. */
  href: string;
};

export type CoverageRow = {
  accountName: string;
  cells: CoverageCell[];
  /** Lines this customer has ever bought or been quoted. */
  brandsTouched: number;
  activeValueBase: number;
  wonValueBase: number;
  relationshipValueBase: number;
  /** Lines never taken to this customer at all. */
  missingBrands: string[];
};

export type CoverageGap = {
  accountName: string;
  relationshipValueBase: number;
  brandsTouched: number;
  missingBrands: string[];
};

export type CoverageMatrix = {
  brands: string[];
  rows: CoverageRow[];
  /** Customer-brand squares with at least one deal behind them. */
  filledCells: number;
  totalCells: number;
  /** filledCells / totalCells, 0..1. */
  penetration: number;
  /**
   * Customers already worth real money that carry only part of the range.
   * Ranked by what the relationship is worth, because a gap at a customer who
   * already trusts you is worth more than a gap at one who does not.
   */
  gaps: CoverageGap[];
  /** A matrix needs at least two lines to be a matrix rather than a list. */
  hasEnoughBrands: boolean;
};

const CELL_RANK: Record<CoverageCellState, number> = {
  won: 4,
  committed: 3,
  active: 2,
  lost: 1,
  none: 0,
};

export function buildCoverageMatrix(input: {
  opportunities: CrmLiteOpportunity[];
  /** How many gaps to name. The panel shows a shortlist, not a backlog. */
  gapLimit?: number;
  /** Names the user has merged, so a customer merged in Accounts is one row here. */
  accountAliases?: AccountAliasIndex;
}): CoverageMatrix {
  const opportunities = input.opportunities.map((opportunity) => (
    { ...opportunity, accountName: resolveAccountName(opportunity.accountName, input.accountAliases) }
  ));
  const withBrand = opportunities.filter((opportunity) => (opportunity.brand || '').trim());

  const brandValue = new Map<string, number>();
  withBrand.forEach((opportunity) => {
    const brand = (opportunity.brand || '').trim();
    brandValue.set(brand, (brandValue.get(brand) || 0) + valueOf(opportunity));
  });
  // Biggest lines first, so the columns that matter are read before scrolling.
  const brands = [...brandValue.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([brand]) => brand);

  // Every customer the workspace knows through a deal, branded or not: a
  // customer who buys nothing from your branded lines is exactly the row worth
  // seeing, and dropping them would hide the widest gap on the page.
  //
  // Deduped on the normalized key, not the raw string. The cells below already
  // group with `cellKey`, so a customer written "VNVC" on one deal and "vnvc."
  // on another used to get two rows carrying the same squares.
  const accountNamesByKey = new Map<string, string>();
  opportunities.forEach((opportunity) => {
    const name = (opportunity.accountName || '').trim();
    if (!name) return;
    const key = accountKey(name);
    if (key && !accountNamesByKey.has(key)) accountNamesByKey.set(key, name);
  });
  const accountNames = [...accountNamesByKey.values()];

  const byAccountBrand = new Map<string, CrmLiteOpportunity[]>();
  withBrand.forEach((opportunity) => {
    const key = cellKey(opportunity.accountName, opportunity.brand || '');
    const list = byAccountBrand.get(key) || [];
    list.push(opportunity);
    byAccountBrand.set(key, list);
  });

  const rows: CoverageRow[] = accountNames.map((accountName) => {
    const cells = brands.map((brand) => {
      const deals = byAccountBrand.get(cellKey(accountName, brand)) || [];
      return buildCell(accountName, brand, deals);
    });

    const activeValueBase = cells.reduce((sum, cell) => sum + cell.activeValueBase, 0);
    const wonValueBase = cells.reduce((sum, cell) => sum + cell.wonValueBase, 0);

    return {
      accountName,
      cells,
      brandsTouched: cells.filter((cell) => cell.state !== 'none').length,
      activeValueBase,
      wonValueBase,
      relationshipValueBase: activeValueBase + wonValueBase,
      missingBrands: cells.filter((cell) => cell.state === 'none').map((cell) => cell.brand),
    };
  }).sort((left, right) =>
    right.relationshipValueBase - left.relationshipValueBase
    || right.brandsTouched - left.brandsTouched
    || left.accountName.localeCompare(right.accountName));

  const totalCells = rows.length * brands.length;
  const filledCells = rows.reduce((sum, row) => sum + row.brandsTouched, 0);

  const gaps: CoverageGap[] = rows
    // Gated on having a deal, not on that deal being convertible.
    //
    // The filter was `relationshipValueBase > 0`, and that figure comes from
    // `sumMoneyInBase`, which drops an amount it cannot convert. So a customer
    // whose deals are all in a currency nobody has priced summed to zero and
    // vanished from this list entirely - not ranked last, absent - while being
    // exactly the "customer already worth real money carrying only part of the
    // range" the list is for. `brandsTouched` says the same thing the filter
    // meant (this is a real relationship, not a bare name) and cannot be zeroed
    // by a missing rate. The sort still uses the value, so an unpriced customer
    // ranks low rather than disappearing.
    .filter((row) => row.missingBrands.length > 0 && row.brandsTouched > 0)
    .slice(0, input.gapLimit ?? 5)
    .map((row) => ({
      accountName: row.accountName,
      relationshipValueBase: row.relationshipValueBase,
      brandsTouched: row.brandsTouched,
      missingBrands: row.missingBrands,
    }));

  return {
    brands,
    rows,
    filledCells,
    totalCells,
    penetration: totalCells > 0 ? filledCells / totalCells : 0,
    gaps,
    hasEnoughBrands: brands.length >= 2,
  };
}

function buildCell(accountName: string, brand: string, deals: CrmLiteOpportunity[]): CoverageCell {
  const active = deals.filter((deal) => deal.status === 'Active');
  const won = deals.filter((deal) => deal.status === 'Won');

  // Strongest truth about this square wins. "Won" outranks "we also have
  // something active", because the question the square answers is whether this
  // line is in this customer at all.
  let state: CoverageCellState = 'none';
  if (won.length > 0) state = 'won';
  else if (active.some(isCommittedToOrder)) state = 'committed';
  else if (active.length > 0) state = 'active';
  else if (deals.length > 0) state = 'lost';

  return {
    accountName,
    brand,
    state,
    activeValueBase: sumValue(active),
    wonValueBase: sumValue(won),
    dealCount: deals.length,
    href: deals.length > 0
      ? `/app/opportunities?account=${encodeURIComponent(accountName)}&brand=${encodeURIComponent(brand)}`
      : '',
  };
}

export function coverageCellLabel(state: CoverageCellState) {
  return {
    won: 'Won',
    committed: 'Committed to order',
    active: 'In play',
    lost: 'Tried and lost',
    none: 'Never taken to them',
  }[state];
}

function sumValue(opportunities: CrmLiteOpportunity[]) {
  return sumMoneyInBase(opportunities.map((opportunity) => ({
    amount: opportunity.estimatedValue,
    currency: opportunity.currency,
  })));
}

function valueOf(opportunity: CrmLiteOpportunity) {
  return opportunity.status === 'Lost' ? 0 : sumValue([opportunity]);
}

/**
 * The account half uses `accountKey` - the app's one answer to "are these the
 * same customer" - rather than this file's local normalizer, which lowercases
 * and strips accents but keeps punctuation. "VNVC" and "vnvc." were two rows
 * carrying two halves of one customer's squares.
 */
function cellKey(accountName: string, brand: string) {
  return `${accountKey(accountName)}|${normalize(brand)}`;
}

function normalize(value: string) {
  return (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export { CELL_RANK };
