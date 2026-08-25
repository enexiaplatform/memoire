export const MIN_BUSINESS_DATE = '2000-01-01';
export const NO_DUE_DATE_LABEL = 'No due date';
export const DATE_CORRECTION_LABEL = 'Needs date correction';

/**
 * Today's date as YYYY-MM-DD in the user's LOCAL timezone. Use this instead of
 * `new Date().toISOString().slice(0, 10)`, which returns the UTC date and is a
 * day off for a large part of the day in non-UTC zones (e.g. UTC+7 before 7am
 * local reads as yesterday). "Today" for a seller means their local today.
 */
export function todayDateKey(reference: Date = new Date()) {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Local date key for an arbitrary Date (local calendar day, not UTC). */
export function toLocalDateKey(date: Date) {
  return todayDateKey(date);
}

/**
 * Convert a stored value to a LOCAL date key for day-math against `todayDateKey()`.
 * If the value is already a YYYY-MM-DD date key it is returned unchanged; an ISO
 * timestamp (e.g. createdAt/updatedAt) is converted to its local calendar day so
 * it never mixes a UTC timestamp-date with a local "today".
 */
export function timestampToLocalDateKey(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return toLocalDateKey(parsed);
}

/**
 * A month forward or back, with the day clamped instead of overflowing.
 *
 * `date.setMonth(date.getMonth() + 1)` on the 31st asks for the 31st of a month
 * that may only have 30 days, and JavaScript rolls the overflow forward into the
 * month after that. Every month-paging control in the product had it - the Plan,
 * the Calendar and the Reviews recap - so from the 31st:
 *
 *   31 Aug   next -> October                (September unreachable)
 *   31 Mar   next -> May,   prev -> March   (stuck; February unreachable)
 *   31 May   next -> July,  prev -> May     (stuck)
 *
 * Three or four days in every month the arrow skipped a month or would not move,
 * and nothing said so: the header showed a month, just not the one the arrow
 * implied, which reads as "that month is empty" rather than "you never opened
 * it".
 *
 * Clamping rather than snapping to the 1st, because the day is meaningful to the
 * callers that also page by day and week: 31 January back one month is the 28th
 * or 29th of February, which is what a person means by "a month earlier".
 */
export function addMonthsClamped(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), daysInTargetMonth));
  return target;
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Every dated row on every surface passes through here, so this is one of the
 * most-called functions in the product - it accounted for a second of Today's
 * cold load at 300 deals. The rule is unchanged; what is gone is the `Date`
 * allocated per call to find out whether the 31st of February exists. Leap
 * years are the only thing a table cannot answer, and that is one modulo.
 */
export function isValidBusinessDate(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const value = date.trim();
  if (!DATE_KEY_PATTERN.test(value) || value < MIN_BUSINESS_DATE) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;

  const isLeapYear = month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0);
  return day <= (isLeapYear ? 29 : DAYS_IN_MONTH[month - 1]);
}

export function sanitizeBusinessDate(date: unknown) {
  return isValidBusinessDate(date) ? date.trim() : '';
}

/**
 * Built once. Constructing an `Intl.DateTimeFormat` per call cost 1.8 seconds
 * of Today's 4.5-second cold load at 300 deals - every dated row on every
 * surface goes through here, so the constructor ran thousands of times to
 * produce a handful of distinct strings.
 */
const businessDateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatSafeBusinessDate(date: unknown) {
  if (date === null || date === undefined || (typeof date === 'string' && !date.trim())) return NO_DUE_DATE_LABEL;
  const value = sanitizeBusinessDate(date);
  if (!value) return DATE_CORRECTION_LABEL;

  return businessDateFormatter.format(new Date(`${value}T00:00:00Z`));
}

/**
 * Newest first, with unreadable dates last.
 *
 * `compareSafeBusinessDate(b, a)` looks like the way to get a newest-first list
 * and is not: it sends unreadable dates to the FRONT, so the head of the list -
 * the row everything downstream calls "the latest" - is whichever record has a
 * date nobody can read. That is how a broken date became an account's last
 * interaction inside a follow-up the operator was about to send.
 *
 * Direction belongs in the comparator, not at the call site.
 */
export function compareBusinessDateDesc(dateA: unknown, dateB: unknown) {
  const left = sanitizeBusinessDate(dateA);
  const right = sanitizeBusinessDate(dateB);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return right.localeCompare(left);
}

/** Invalid or empty dates sort after valid dates and never compare as overdue. */
export function compareSafeBusinessDate(dateA: unknown, dateB: unknown) {
  const left = sanitizeBusinessDate(dateA);
  const right = sanitizeBusinessDate(dateB);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right);
}

/**
 * True when `candidate` is a readable date that happened after `current`.
 *
 * `compareSafeBusinessDate` sorts unreadable dates *after* readable ones, which
 * is right for a list - the rows nobody can act on belong at the bottom. It is
 * wrong for the other thing four call sites were using it for: keeping the most
 * recent of a set by asking `compare(candidate, current) > 0`. Under that
 * reading "sorts after" means "is more recent", so one activity whose date
 * failed to parse became the account's last touch, and the account was then
 * reported as touched today.
 *
 * That is the worst direction for this product to be wrong in: an unreadable
 * date silenced the silence detector. `03/04/2026` from a dd/mm import is
 * enough to do it - see the deadline four months overdue that the same shape of
 * input produced before.
 *
 * So recency asks this instead. An unreadable candidate never wins, and an
 * unreadable incumbent always loses, which means a set with one readable date
 * in it keeps that one.
 */
export function isMoreRecentBusinessDate(candidate: unknown, current: unknown) {
  if (!isValidBusinessDate(candidate)) return false;
  if (!isValidBusinessDate(current)) return true;
  return compareSafeBusinessDate(candidate, current) > 0;
}

export function isBusinessDateOverdue(date: unknown, today = todayDateKey()) {
  return isValidBusinessDate(date) && isValidBusinessDate(today) && compareSafeBusinessDate(date, today) < 0;
}

export function isBusinessDateInRange(date: unknown, start: unknown, end: unknown) {
  return isValidBusinessDate(date) && isValidBusinessDate(start) && isValidBusinessDate(end)
    && compareSafeBusinessDate(date, start) >= 0
    && compareSafeBusinessDate(date, end) <= 0;
}
