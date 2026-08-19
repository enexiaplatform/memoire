import { PERSONAL_MONTHLY_PRICE_USD, TRIAL_DAYS } from '../utils/entitlement';

/**
 * Which commercial phase the public pages are describing.
 *
 * Memoire is in the hands of its first operators before the store is open. They
 * get the whole product for nothing, and the marketing pages have to say that
 * out loud - because it is already true in code. `BILLING_CHECKOUT_ENABLED` is
 * off, so no card can be taken, and `src/utils/entitlement.ts` refuses to expire
 * anybody while checkout is shut (see `src/lib/checkoutAvailability.ts`). A
 * landing page that asks for a card up front is therefore describing a checkout
 * that does not exist, and the first promise a preview visitor meets is one the
 * app cannot keep.
 *
 * ## Going back to the launch pages
 *
 * Set `FREE_PREVIEW` to `false`. That is the whole revert.
 *
 * Every page keeps its paid copy beside its preview copy and picks between them
 * on this constant, so the flip restores the pages exactly as they were written
 * rather than asking somebody to rewrite them from memory a month from now.
 *
 * Two things sit outside the flag because they are not React:
 *   - `public/llms.txt` carries a "Current status" paragraph to delete.
 *   - `docs/operations/free-preview.md` is the checklist for both, and for the
 *     order the switches have to be thrown in.
 *
 * ## What it does not do
 *
 * It changes what is *said*, never what is *enforced*. Flipping this back to
 * `false` does not start charging anyone - opening `BILLING_CHECKOUT_ENABLED`
 * does. Do them in that order, and tell the preview accounts before either.
 */
export const FREE_PREVIEW = true;

/** The short label. Used on both public pages, so it is said the same way twice. */
export const PREVIEW_BADGE = 'Free while in preview';

/**
 * The offer, in one clause, for meta descriptions.
 *
 * Kept short on purpose: it is appended to a sentence that already fills most
 * of the ~155 characters a search result renders.
 */
export const PREVIEW_SEO_LINE = 'Free for everyone while it is in preview.';
export const PAID_SEO_LINE = `$${PERSONAL_MONTHLY_PRICE_USD}/month, ${TRIAL_DAYS}-day free trial.`;

/**
 * What happens when the preview ends, said the same way on both pages.
 *
 * It names the real price rather than leaving it to be discovered later. A
 * preview whose end is vague reads as a price nobody wants to state, and the
 * account that finds out from a card statement is the one that leaves.
 */
export const PREVIEW_ENDS_NOTE =
  `Nothing is charged today and no card is taken. When the preview ends it is $${PERSONAL_MONTHLY_PRICE_USD} a month for one person, ` +
  'and every account here hears it from us first - nothing starts billing on its own.';
