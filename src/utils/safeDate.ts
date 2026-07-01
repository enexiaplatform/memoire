export const MIN_BUSINESS_DATE = '2000-01-01';
export const NO_DUE_DATE_LABEL = 'No due date';
export const DATE_CORRECTION_LABEL = 'Needs date correction';

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

export function isBusinessDateOverdue(date: unknown, today = new Date().toISOString().slice(0, 10)) {
  return isValidBusinessDate(date) && isValidBusinessDate(today) && compareSafeBusinessDate(date, today) < 0;
}

export function isBusinessDateInRange(date: unknown, start: unknown, end: unknown) {
  return isValidBusinessDate(date) && isValidBusinessDate(start) && isValidBusinessDate(end)
    && compareSafeBusinessDate(date, start) >= 0
    && compareSafeBusinessDate(date, end) <= 0;
}
