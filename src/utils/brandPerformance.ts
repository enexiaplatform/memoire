import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { isCommittedToOrder } from './orderToCash.ts';
import { sumMoneyInBase } from './money.ts';

/**
 * Which brand is carrying the number.
 *
 * An operator who distributes several principals' lines does not have one
 * pipeline, they have several sharing one calendar. The question a distributor
 * asks at the end of a week - which line is actually earning its place, and
 * which one am I carrying out of habit - has no answer anywhere else in the
 * product, because every other surface groups by customer or by stage.
 *
 * Grouped from the `brand` already on each opportunity. Derived, never stored,
 * so it cannot disagree with the deal list it summarises.
 */

// Below this, a win rate is a coin toss with a percentage sign on it. Matches
// the route-health floor deliberately: two surfaces reporting win rates on
// different evidence thresholds would teach the operator to trust neither.
export const MIN_DECIDED_FOR_BRAND_RATE = 3;

export const UNBRANDED_LABEL = 'No brand set';

export type BrandPerformance = {
  brand: string;
  /** True for the bucket holding deals with no brand recorded. */
  unbranded: boolean;
  activeCount: number;
  activeValueBase: number;
  /** Active deals the customer has already committed to order. */
  committedCount: number;
  committedValueBase: number;
  wonCount: number;
  lostCount: number;
  decidedCount: number;
  wonValueBase: number;
  /** 0..1, or null when fewer than MIN_DECIDED_FOR_BRAND_RATE have closed. */
  winRate: number | null;
  /** This brand's share of all active pipeline value, 0..1. */
  shareOfActive: number;
};

export type BrandPerformanceReport = {
  brands: BrandPerformance[];
  /** True once at least one opportunity carries a brand - the panel's gate. */
  hasBrands: boolean;
  totalActiveBase: number;
  /** Active deals with no brand recorded. Named, never quietly folded away. */
  unbrandedActiveCount: number;
  /** The brand carrying the most active value, or null on an empty pipeline. */
  leader: BrandPerformance | null;
  coverageMessage: string;
};

export function buildBrandPerformance(input: { opportunities: CrmLiteOpportunity[] }): BrandPerformanceReport {
  const groups = new Map<string, CrmLiteOpportunity[]>();
  input.opportunities.forEach((opportunity) => {
    const brand = (opportunity.brand || '').trim() || UNBRANDED_LABEL;
    const list = groups.get(brand) || [];
    list.push(opportunity);
    groups.set(brand, list);
  });

  const hasBrands = [...groups.keys()].some((brand) => brand !== UNBRANDED_LABEL);

  const rows: BrandPerformance[] = [...groups.entries()].map(([brand, opportunities]) => {
    const active = opportunities.filter((opportunity) => opportunity.status === 'Active');
    const committed = active.filter(isCommittedToOrder);
    const won = opportunities.filter((opportunity) => opportunity.status === 'Won');
    const lostCount = opportunities.filter((opportunity) => opportunity.status === 'Lost').length;
    const decidedCount = won.length + lostCount;

    return {
      brand,
      unbranded: brand === UNBRANDED_LABEL,
      activeCount: active.length,
      activeValueBase: sumValue(active),
      committedCount: committed.length,
      committedValueBase: sumValue(committed),
      wonCount: won.length,
      lostCount,
      decidedCount,
      wonValueBase: sumValue(won),
      winRate: decidedCount >= MIN_DECIDED_FOR_BRAND_RATE ? won.length / decidedCount : null,
      shareOfActive: 0,
    };
  });

  const totalActiveBase = rows.reduce((sum, row) => sum + row.activeValueBase, 0);
  const brands = rows
    .map((row) => ({
      ...row,
      shareOfActive: totalActiveBase > 0 ? row.activeValueBase / totalActiveBase : 0,
    }))
    // Named brands lead however small they are; the unbranded bucket is a gap
    // to close, not a competitor, so it always sits last.
    .sort((left, right) =>
      Number(left.unbranded) - Number(right.unbranded)
      || right.activeValueBase - left.activeValueBase
      || right.activeCount - left.activeCount);

  const unbrandedActiveCount = brands.find((row) => row.unbranded)?.activeCount || 0;
  const namedBrands = brands.filter((row) => !row.unbranded);

  return {
    brands,
    hasBrands,
    totalActiveBase,
    unbrandedActiveCount,
    leader: namedBrands[0] || null,
    coverageMessage: unbrandedActiveCount > 0
      ? `${unbrandedActiveCount} active deal${unbrandedActiveCount === 1 ? '' : 's'} carr${unbrandedActiveCount === 1 ? 'ies' : 'y'} no brand, so ${unbrandedActiveCount === 1 ? 'it is' : 'they are'} not counted against any line.`
      : '',
  };
}

function sumValue(opportunities: CrmLiteOpportunity[]) {
  return sumMoneyInBase(opportunities.map((opportunity) => ({
    amount: opportunity.estimatedValue,
    currency: opportunity.currency,
  })));
}
