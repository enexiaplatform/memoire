import type { ProductEvent } from './productAnalytics';

/**
 * Which activation event each core event proves.
 *
 * ## Why this is its own module
 *
 * It is a statement about the product's onboarding funnel, and it was written
 * inside `productAnalytics.ts` - a module that imports `demoMode` and the
 * Supabase client and therefore only runs in a browser. So the one part of the
 * funnel that is pure data, and the part most worth checking, was the part
 * nothing could test. Here it is data with no imports at all except a type,
 * which is erased.
 *
 * ## Why the pairing exists
 *
 * The five activation events are the five steps of `buildFirstWeekPath` - the
 * single onboarding path the welcome screen, the strip on Today and the corner
 * coach all read from. The taxonomy declared all five, and a contract checked
 * that the client union, the endpoint allowlist and the Postgres CHECK
 * constraint all agreed on the list. Nothing checked that any of them was ever
 * *sent*, and three never were: `first_capture_saved`, `first_thread_linked`
 * and `first_review_completed` had no emitter anywhere in the app.
 *
 * The two that did work were fired by hand on the line below their core event.
 * That is the arrangement that produced the gap - `review_completed` has six
 * call sites, each one a chance to forget the line under it. Pairing them once,
 * here, means a new call site cannot ship without its activation event, and
 * fixing the six existing ones was writing this map rather than editing six
 * files.
 *
 * ## What is deliberately not here
 *
 * `first_thread_linked` has no core counterpart. Linking is written by five
 * call sites across three pages, and `thread_viewed` is not it - looking at a
 * thread is not giving a capture somewhere to live. It is emitted directly from
 * `salesActivityStore`, where the link is actually written, on the same rule
 * `buildFirstWeekPath` uses to tick the step: a capture that names a customer.
 * An event with a stricter rule than the checklist on screen would report a
 * step as undone while the operator is looking at a tick.
 *
 * No activation event may appear as a *key* here. The pairing runs once when an
 * event is recorded; a first_* that paired to another would recurse.
 */
export const ACTIVATION_OF: Partial<Record<ProductEvent, ProductEvent>> = {
  capture_saved: 'first_capture_saved',
  commitment_created: 'first_commitment_created',
  commitment_completed: 'first_commitment_completed',
  review_completed: 'first_review_completed',
};

/** The five events that measure the first-week path, in the path's own order. */
export const ACTIVATION_EVENTS: ProductEvent[] = [
  'first_capture_saved',
  'first_thread_linked',
  'first_commitment_created',
  'first_commitment_completed',
  'first_review_completed',
];
