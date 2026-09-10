/**
 * The three views of Money, in one place.
 *
 * Separate from the page so any surface can link to a specific view - an
 * opportunity that has been won points at Collections, a quote points at Margin
 * - without importing the page component to find out what the views are called.
 */
export const moneyViews = ['orders', 'collections', 'margin'] as const;
export type MoneyView = (typeof moneyViews)[number];

export const moneyViewLabels: Record<MoneyView, string> = {
  orders: 'Orders',
  collections: 'Collections',
  margin: 'Margin',
};

/** Anything unrecognised opens the order book, which is where money starts. */
export function toMoneyView(value: string | null): MoneyView {
  return (moneyViews as readonly string[]).includes(value || '') ? (value as MoneyView) : 'orders';
}

/** The canonical link to one view. `orders` is the default and stays out of the URL. */
export function moneyViewHref(view: MoneyView): string {
  return view === 'orders' ? '/app/revenue' : `/app/revenue?view=${view}`;
}
