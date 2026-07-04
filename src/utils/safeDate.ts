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

export function isValidBusinessDate(date: unknown): date is string {
  if (typeof date !== 'string') return false;
  const value = date.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < MIN_BUSINESS_DATE) return false;

  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function sanitizeBusinessDate(date: unknown) {
  return isValidBusinessDate(date) ? date.trim() : '';
}

export function formatSafeBusinessDate(date: unknown) {
  if (date === null || date === undefined || (typeof date === 'string' && !date.trim())) return NO_DUE_DATE_LABEL;
  const value = sanitizeBusinessDate(date);
  if (!value) return DATE_CORRECTION_LABEL;

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
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

export function isBusinessDateOverdue(date: unknown, today = todayDateKey()) {
  return isValidBusinessDate(date) && isValidBusinessDate(today) && compareSafeBusinessDate(date, today) < 0;
}

export function isBusinessDateInRange(date: unknown, start: unknown, end: unknown) {
  return isValidBusinessDate(date) && isValidBusinessDate(start) && isValidBusinessDate(end)
    && compareSafeBusinessDate(date, start) >= 0
    && compareSafeBusinessDate(date, end) <= 0;
}
