/**
 * How this customer is allowed to buy - and what that obliges the seller to do.
 *
 * This was a free-text box, and a free-text box is the wrong shape for it. The
 * route is not a description of a deal, it is the single fact that decides how
 * long the deal takes, what has to exist before a PO can be raised, and whether
 * there is a deadline that can be missed. Written as prose it is unreadable by
 * the app and usually left blank; written as a route it can be counted, warned
 * about, and turned into the next action.
 *
 * The routes below are deliberately about **what the seller must do**, not
 * about procurement law. "Needs competing quotes" is a fact about the work;
 * naming a specific regulation would be a claim this product cannot keep
 * current across the markets it is used in.
 *
 * `Not known yet` is the honest default and is treated as a gap rather than an
 * answer: not knowing how a customer buys is the most common reason a deal that
 * looked ready sits still for a quarter.
 */
export const procurementRoutes = [
  'Not known yet',
  'Direct purchase',
  'Quote comparison',
  'Open tender',
  'Framework / existing contract',
  'Through distributor or agent',
] as const;

export type ProcurementRoute = (typeof procurementRoutes)[number];

export type ProcurementRouteGuide = {
  /** One line: what this route means for the seller. */
  meaning: string;
  /** What has to be true before this customer can raise a PO. */
  requires: string[];
  /** The thing most likely to lose the deal on this route. */
  risk: string;
  /** True when the route runs to a deadline the seller does not control. */
  hasDeadline: boolean;
};

export const PROCUREMENT_ROUTE_GUIDE: Record<ProcurementRoute, ProcurementRouteGuide> = {
  'Not known yet': {
    meaning: 'Nobody has confirmed how this customer is able to buy.',
    requires: ['Ask the budget owner which route applies before quoting'],
    risk: 'A quote sent down the wrong route is work the customer cannot act on.',
    hasDeadline: false,
  },
  'Direct purchase': {
    meaning: 'The buyer can raise a PO against your quote without running a competition.',
    requires: ['A quote in the buyer\'s required format', 'The budget owner named and available'],
    risk: 'Nothing forces a date, so it slips quietly. Ask for the PO week, not the PO.',
    hasDeadline: false,
  },
  'Quote comparison': {
    meaning: 'The buyer has to put your price beside other quotes before deciding.',
    requires: ['Your quote', 'The comparison criteria in writing', 'Who else was asked'],
    risk: 'Being compared on price alone, because nobody wrote down what else counts.',
    hasDeadline: false,
  },
  'Open tender': {
    meaning: 'A published process with a closing date you do not control.',
    requires: ['The tender documents', 'Technical criteria confirmed against the spec', 'Submission before the closing date'],
    risk: 'Missing the date, or being specced out of it before it is published.',
    hasDeadline: true,
  },
  'Framework / existing contract': {
    meaning: 'The customer buys under an agreement that already exists.',
    requires: ['Confirmation your line is on the agreement', 'The remaining value or expiry'],
    risk: 'The agreement expires or fills up while the deal is treated as open-ended.',
    hasDeadline: true,
  },
  'Through distributor or agent': {
    meaning: 'A third party transacts, so your customer is not the one raising the PO.',
    requires: ['The transacting party named', 'Margin and terms agreed with them'],
    risk: 'The end customer says yes and nothing moves, because nobody owns the paperwork.',
    hasDeadline: false,
  },
};

export function isProcurementRoute(value: string): value is ProcurementRoute {
  return (procurementRoutes as readonly string[]).includes(value);
}

/**
 * What the route says about the deal, for surfaces that judge readiness.
 *
 * A deal on a deadline-bearing route with no expected close date is the shape
 * this returns `true` for: the customer's own process has a clock and the
 * workspace is not carrying it.
 */
export function routeNeedsADate(route: string, expectedCloseDate: string) {
  if (!isProcurementRoute(route)) return false;
  return PROCUREMENT_ROUTE_GUIDE[route].hasDeadline && !expectedCloseDate.trim();
}
