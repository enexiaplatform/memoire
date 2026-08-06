/**
 * Whether a captured touch counts as business activity.
 *
 * Capture exists to feed the activity ledger - that is the whole point of
 * writing something down once and having every surface read it - so this is
 * opt-*out*, the mirror of the opt-in tick on Today's plan strip. Ticked by
 * default, and the operator unticks it for the captures that are notes to
 * themselves rather than work done for a customer: a reminder, a thought about
 * a supplier, the thing they typed because it was the nearest text box.
 *
 * Held as a tag rather than a column because `tags` already exists on the
 * record, in localStorage and in `sales_activities` alike, and a new column
 * would need a migration reaching a live database for a boolean. The record is
 * still saved and still findable in Capture and Timeline > History - unticking
 * this does not delete anything. It keeps the row out of Activity's ledger and
 * out of every figure derived from it, which is exactly what "do not count this"
 * should mean and is more honest than a note that vanishes.
 */
export const ACTIVITY_LEDGER_EXCLUDED_TAG = 'not-business-activity';

/** True when the operator asked for this capture to stay out of Activity. */
export function isExcludedFromActivityLedger(activity: { tags?: string[] | null }) {
  return (activity.tags || []).includes(ACTIVITY_LEDGER_EXCLUDED_TAG);
}

/** Applies the operator's choice to a tag list, without disturbing the rest. */
export function applyActivityLogChoice(tags: string[], logToActivity: boolean) {
  const without = tags.filter((tag) => tag !== ACTIVITY_LEDGER_EXCLUDED_TAG);
  return logToActivity ? without : [...without, ACTIVITY_LEDGER_EXCLUDED_TAG];
}
