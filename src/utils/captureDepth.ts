import type { SalesActivityRecord } from '../services/salesActivityStore';
import type { ClassifiedSalesActivity } from './salesActivityClassifier.ts';

/**
 * Whether a recorded touch actually records anything.
 *
 * The failure this exists to catch is a ledger that fills with rows saying a
 * click happened. It is the standard outcome of every CRM rollout, and a
 * distributor's own work instruction answers it with a hard rule: an activity
 * must carry at least a hundred words, the sheet counts them, and anything
 * short is flagged SHORT and counted against the salesperson by name.
 *
 * Memoire deliberately does not copy that.
 *
 * A hard word floor measures typing, not information, and it is gameable in the
 * most damaging way available: the fastest route to a hundred words is a
 * paragraph of nothing, which passes the check and leaves the ledger worse than
 * the three honest words it replaced. "Called Ms Ha, she wants the TDS by
 * Friday" is eleven words and is a complete record.
 *
 * So thinness here is short **and** empty: the rules found no customer, no next
 * step, no person and no signal in it. That is the same test
 * `salesActivityClassifier.summarize` already uses to decide a note cannot
 * safely be compressed, which is the right instinct - a note the parser could
 * not read anything out of is exactly the note that needs its own words kept.
 *
 * Nothing is ever blocked. The floor is a nudge shown while the note is being
 * written, and a count on the scoreboard afterwards. A capture refused for
 * being short is a capture that does not happen at all, and an empty ledger is
 * worse than a thin one.
 */

/**
 * Words below which a note with nothing structured in it is called thin.
 *
 * Twelve, not a hundred. It is roughly one full sentence - long enough that a
 * bare "followed up" or "called" is caught, short enough that a real one-line
 * record with a name and a date in it never is.
 */
export const THIN_NOTE_WORDS = 12;

export type CaptureDepth = {
  words: number;
  /** Short *and* carrying nothing the rest of the app can read. */
  thin: boolean;
  /** What is missing, for a hint that says something useful. */
  missing: string[];
  /** The one-line nudge, or '' when the note is fine. */
  hint: string;
};

/**
 * Words in a note, counted the way a person would.
 *
 * Runs of letters, digits and marks in any script, so Vietnamese counts
 * correctly and a note in a script without spaces is not reported as one word.
 * The `u` flag is not optional here: `\p{L}` without it matches the literal
 * letter p, and the whole count silently becomes zero while every test that
 * only checks "greater than the floor" still passes.
 */
export function countNoteWords(text: string): number {
  return ((text || '').match(/[\p{L}\p{N}\p{M}]+/gu) || []).length;
}

export function assessCaptureDepth(
  activity: Pick<
    ClassifiedSalesActivity,
    'rawNote' | 'summary' | 'nextAction' | 'accountName' | 'stakeholderName' | 'contactName'
  > & Partial<Pick<ClassifiedSalesActivity, 'nextActions' | 'buyingSignals' | 'risks' | 'timelineSignals' | 'competitors'>>,
): CaptureDepth {
  const words = countNoteWords(activity.rawNote || activity.summary || '');

  const hasNextStep = Boolean((activity.nextAction || '').trim()) || (activity.nextActions || []).length > 0;
  const hasCustomer = Boolean((activity.accountName || '').trim());
  const hasPerson = Boolean((activity.stakeholderName || activity.contactName || '').trim());
  const hasSignal = (activity.buyingSignals || []).length > 0
    || (activity.risks || []).length > 0
    || (activity.timelineSignals || []).length > 0
    || (activity.competitors || []).length > 0;

  const missing = [
    !hasCustomer ? 'which customer' : '',
    !hasPerson ? 'who you spoke to' : '',
    !hasNextStep ? 'what happens next' : '',
  ].filter(Boolean);

  // Anything structured rescues a short note: the fields beside it hold what the
  // sentence does not.
  const thin = words < THIN_NOTE_WORDS && !hasNextStep && !hasCustomer && !hasPerson && !hasSignal;

  return {
    words,
    thin,
    missing,
    hint: thin
      ? `This records that something happened, not what. Add ${missing.slice(0, 2).join(' and ')} — a line you can act on in a month.`
      : '',
  };
}

/** The same test against a stored record, for counting a period after the fact. */
export function isThinCapture(activity: SalesActivityRecord): boolean {
  return assessCaptureDepth(activity).thin;
}

export type CaptureDepthSummary = {
  total: number;
  thin: number;
  /** Median words, which survives one very long note in a way a mean does not. */
  medianWords: number;
};

export function summariseCaptureDepth(activities: SalesActivityRecord[]): CaptureDepthSummary {
  const depths = activities.map((activity) => assessCaptureDepth(activity));
  const counts = depths.map((depth) => depth.words).sort((left, right) => left - right);
  const middle = Math.floor(counts.length / 2);

  return {
    total: activities.length,
    thin: depths.filter((depth) => depth.thin).length,
    medianWords: counts.length === 0
      ? 0
      : counts.length % 2 === 1
        ? counts[middle]
        : Math.round((counts[middle - 1] + counts[middle]) / 2),
  };
}
