import type { CrmLiteOpportunity } from '../services/opportunityStore';
import { sumMoneyInBase } from './money.ts';

// Below these, a win rate is noise. Per-route gate keeps a single lucky deal
// from reading as "100% win"; the report gate keeps the whole panel honest on a
// thin workspace.
export const MIN_DECIDED_FOR_RATE = 3;
export const MIN_TOTAL_DECIDED = 3;

export const UNSPECIFIED_ROUTE = 'Unspecified route';

export type RouteHealth = {
  route: string;
  activeCount: number;
  activeValueBase: number;
  decidedCount: number;
  wonCount: number;
  lostCount: number;
  /** 0..1, or null when the route has fewer than MIN_DECIDED_FOR_RATE decided. */
  winRate: number | null;
};

export type RouteHealthReport = {
  routes: RouteHealth[];
  totalDecided: number;
  hasEnoughData: boolean;
  lowDataMessage: string;
};

/**
 * Stage 3 route-to-market intelligence, grown from the operator's own deals.
 * Groups opportunities by the product/solution they sell (the route) and
 * measures, per route, active money at stake and the win rate from closed
 * deals - never a blank canvas: below a floor of closed deals it says the data
 * is too thin and names what to capture. derived, never stored.
 */
export function buildRouteHealth(input: { opportunities: CrmLiteOpportunity[] }): RouteHealthReport {
  const groups = new Map<string, CrmLiteOpportunity[]>();
  input.opportunities.forEach((opportunity) => {
    const route = opportunity.productOrSolution?.trim() || UNSPECIFIED_ROUTE;
    const list = groups.get(route) || [];
    list.push(opportunity);
    groups.set(route, list);
  });

  const routes: RouteHealth[] = [...groups.entries()]
    .map(([route, opportunities]) => {
      const active = opportunities.filter((opportunity) => opportunity.status === 'Active');
      const wonCount = opportunities.filter((opportunity) => opportunity.status === 'Won').length;
      const lostCount = opportunities.filter((opportunity) => opportunity.status === 'Lost').length;
      const decidedCount = wonCount + lostCount;
      return {
        route,
        activeCount: active.length,
        activeValueBase: sumMoneyInBase(active.map((opportunity) => ({ amount: opportunity.estimatedValue, currency: opportunity.currency }))),
        decidedCount,
        wonCount,
        lostCount,
        winRate: decidedCount >= MIN_DECIDED_FOR_RATE ? wonCount / decidedCount : null,
      };
    })
    .sort((left, right) => right.activeValueBase - left.activeValueBase);

  const totalDecided = routes.reduce((sum, route) => sum + route.decidedCount, 0);
  const hasEnoughData = totalDecided >= MIN_TOTAL_DECIDED;

  return {
    routes,
    totalDecided,
    hasEnoughData,
    lowDataMessage: hasEnoughData
      ? ''
      : `Only ${totalDecided} closed deal${totalDecided === 1 ? '' : 's'} recorded across all routes. Mark deals Won or Lost as they close - win rates stay hidden until at least ${MIN_TOTAL_DECIDED} are in.`,
  };
}
