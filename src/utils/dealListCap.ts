/**
 * How many deals a review page prints in full before it starts summarising.
 *
 * Pipeline Defense printed every deal at full height in three separate
 * sections, with no cap and no virtualisation. Measured in a browser against a
 * production build:
 *
 *     5 deals    39,564 px tall     3,269 DOM nodes
 *    40 deals   216,049 px tall    17,101 DOM nodes
 *
 * Forty deals is not an edge case, it is the pipeline of the person this
 * product is for. 216,000 px is about three hundred phone screens of
 * uninterrupted scrolling, on the page the landing page sells as the payoff.
 *
 * The cost is linear in the number of deals, so the fix is a cap rather than a
 * faster renderer. Twelve is the size of a real review agenda: enough that a
 * normal week is never truncated, small enough that the page stays a page.
 * Nothing is hidden - the rest is one click away and the control says how many
 * are behind it, because a review that quietly stops at twelve is worse than
 * one that scrolls.
 */
export const DEALS_PRINTED_IN_FULL = 12;

export type DealListCap<T> = {
  /** The deals to render right now. */
  visible: T[];
  /** How many are held back. Zero when everything is on screen. */
  hidden: number;
  /** True when the caller should offer a control at all. */
  capped: boolean;
};

/**
 * Order is never changed here.
 *
 * The deal list on this page is the operator's own working order - they added
 * these deals in the sequence they think about them, and the editable card list
 * is the same list. Sorting by risk to make the cap "smarter" would rearrange
 * somebody's review notes underneath them, which is a worse failure than
 * showing the first twelve.
 */
export function capDealList<T>(
  deals: readonly T[],
  { expanded = false, limit = DEALS_PRINTED_IN_FULL }: { expanded?: boolean; limit?: number } = {},
): DealListCap<T> {
  const list = Array.isArray(deals) ? deals : [];
  const ceiling = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEALS_PRINTED_IN_FULL;

  if (expanded || list.length <= ceiling) {
    return { visible: [...list], hidden: 0, capped: list.length > ceiling };
  }

  return {
    visible: list.slice(0, ceiling),
    hidden: list.length - ceiling,
    capped: true,
  };
}

/** "Show the other 28 deals" / "Show fewer" - what the control prints. */
export function describeDealListCap(cap: DealListCap<unknown>, expanded: boolean) {
  if (!cap.capped) return '';
  if (expanded) return 'Show fewer';
  return `Show the other ${cap.hidden} ${cap.hidden === 1 ? 'deal' : 'deals'}`;
}
