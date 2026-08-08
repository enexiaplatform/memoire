import { sanitizeBusinessDate, todayDateKey } from './safeDate.ts';

/**
 * When a deal is expected to close, read off a field that has never agreed with
 * itself.
 *
 * `expectedClosePeriod` is free text, and it holds at least four different
 * things depending on where the record came from. The founder import writes a
 * bare quarter ("Q3"). Capture and the sample workspace write relative phrases
 * ("This month", "Next quarter"). A CSV import maps a `closedate` column
 * straight in, so it can hold an ISO date. And plenty of records hold nothing at
 * all.
 *
 * The pipeline table could not usefully sort on that. It compared the raw
 * strings, so "Next quarter" sorted before "This month" (N < T), "Q4" sorted
 * after "Q1" only by luck of the alphabet, and every empty value was pushed to
 * the end by a literal 'zzzz' sentinel. An operator asking "what closes soonest"
 * got alphabetical order and no warning.
 *
 * This maps all four onto one absolute axis - a calendar quarter - so they can
 * be ordered against each other, and it does that *without touching the stored
 * value*. The record keeps the words the operator typed; only the reading is
 * derived. That matters because the operator's phrase is often more honest than
 * the quarter we infer from it, and rewriting "Next quarter" to "Q4 2026" in the
 * database would destroy the distinction between a date somebody committed to
 * and a date we guessed.
 *
 * Two ranks sit deliberately outside the quarter axis:
 *
 *   `LATER_RANK`   - "Later", "H2", "next year". The operator said it is far
 *                    away and refused to say when. Sorting that into a specific
 *                    quarter would invent precision they explicitly withheld, so
 *                    it lands after everything dated and before everything blank.
 *   `UNKNOWN_RANK` - nothing readable. Last, always.
 */

export type ClosePeriodBasis =
  /** An explicit quarter: "Q3", "Q3 2026", "FY27 Q1". */
  | 'quarter'
  /** A real date we could parse, bucketed into its quarter. */
  | 'date'
  /** A phrase relative to today: "this month", "next quarter". */
  | 'relative'
  /** Far away, deliberately unspecified. */
  | 'later'
  /** Empty, or text nobody can read as a time. */
  | 'none';

export type ClosePeriod = {
  /** Position on the absolute axis. Smaller closes sooner. */
  rank: number;
  quarter: 1 | 2 | 3 | 4 | null;
  year: number | null;
  /** Chip text: "Q3 '26", matching the quarter labels used elsewhere. */
  label: string;
  /** Row-group heading: "Q3 2026". */
  longLabel: string;
  basis: ClosePeriodBasis;
  /** The year was inferred from today rather than written down. */
  yearInferred: boolean;
  /** Exactly what the record holds, so nothing is hidden behind the reading. */
  raw: string;
};

/** Said to be far off, with no quarter named. After every dated deal. */
export const LATER_RANK = Number.MAX_SAFE_INTEGER - 1;
/** No readable close date. Last. */
export const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;

const QUARTER_PATTERN = /q\s*([1-4])/i;
const EXPLICIT_YEAR_PATTERN = /(?:fy\s*)?(\d{4})|fy\s*(\d{2})\b|'(\d{2})\b/i;
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export function resolveClosePeriod(raw: string | null | undefined, today?: string): ClosePeriod {
  const text = (raw || '').trim();
  const reference = referenceQuarter(today);

  if (!text) return unknownPeriod('', 'No close date');

  const normalized = text.toLowerCase();

  // A real date beats every heuristic below it - it is the only form that says
  // which quarter without anybody guessing.
  const dated = readDate(text);
  if (dated) return fromQuarter(dated.quarter, dated.year, 'date', false, text);

  // An explicit quarter, with or without a year written next to it.
  const quarterMatch = QUARTER_PATTERN.exec(normalized);
  if (quarterMatch) {
    const quarter = Number(quarterMatch[1]) as 1 | 2 | 3 | 4;
    const explicitYear = readYear(normalized);
    if (explicitYear !== null) return fromQuarter(quarter, explicitYear, 'quarter', false, text);

    // A bare "Q1" written in July means next year's Q1, not one that ended in
    // March. Sellers write the next occurrence; reading it as the current
    // calendar year would file live pipeline in the past.
    const year = quarter >= reference.quarter ? reference.year : reference.year + 1;
    return fromQuarter(quarter, year, 'quarter', true, text);
  }

  const relative = readRelative(normalized, reference);
  if (relative) return relative === 'later'
    ? { ...unknownPeriod(text, 'Later'), rank: LATER_RANK, basis: 'later' }
    : fromQuarter(relative.quarter, relative.year, 'relative', true, text);

  const monthly = readMonthName(normalized, reference);
  if (monthly) return fromQuarter(monthly.quarter, monthly.year, 'date', monthly.yearInferred, text);

  // Unreadable, but the operator wrote something. Show their words rather than
  // "No close date", which would look like the field was empty.
  return unknownPeriod(text, text);
}

/**
 * The absolute order of two close periods. Exported so the table and any future
 * forecast surface cannot drift into two different ideas of "sooner".
 */
export function compareClosePeriod(left: ClosePeriod, right: ClosePeriod) {
  return left.rank - right.rank;
}

/** The bucket a row belongs to when the table groups by close quarter. */
export function closePeriodGroupKey(period: ClosePeriod) {
  return String(period.rank);
}

export function closePeriodGroupLabel(period: ClosePeriod) {
  if (period.rank === UNKNOWN_RANK) return 'No close date';
  if (period.rank === LATER_RANK) return 'Later';
  return period.longLabel;
}

function fromQuarter(
  quarter: 1 | 2 | 3 | 4,
  year: number,
  basis: ClosePeriodBasis,
  yearInferred: boolean,
  raw: string,
): ClosePeriod {
  return {
    // Four quarters per year on one line, so 2026 Q4 sorts before 2027 Q1
    // without any date arithmetic at comparison time.
    rank: year * 4 + (quarter - 1),
    quarter,
    year,
    label: `Q${quarter} '${String(year).slice(2)}`,
    longLabel: `Q${quarter} ${year}`,
    basis,
    yearInferred,
    raw,
  };
}

function unknownPeriod(raw: string, label: string): ClosePeriod {
  return {
    rank: UNKNOWN_RANK,
    quarter: null,
    year: null,
    label,
    longLabel: label,
    basis: 'none',
    yearInferred: false,
    raw,
  };
}

function referenceQuarter(today?: string) {
  const key = sanitizeBusinessDate(today) || todayDateKey();
  const parsed = Date.parse(`${key}T00:00:00Z`);
  const date = Number.isNaN(parsed) ? new Date() : new Date(parsed);
  const month = Number.isNaN(parsed) ? date.getMonth() : date.getUTCMonth();
  const year = Number.isNaN(parsed) ? date.getFullYear() : date.getUTCFullYear();
  return { quarter: (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4, year, month };
}

function readYear(normalized: string): number | null {
  const match = EXPLICIT_YEAR_PATTERN.exec(normalized);
  if (!match) return null;
  if (match[1]) return Number(match[1]);
  const shortYear = match[2] || match[3];
  return shortYear ? 2000 + Number(shortYear) : null;
}

function readDate(text: string) {
  // Only accept forms that unambiguously carry a day, so "2026" alone does not
  // silently become 1 January.
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fromParts(Number(iso[2]), Number(iso[1]));

  // Day first, matching the date inputs this product renders and the way its
  // operator writes one. `Date.parse` reads a slash date as month first, so it
  // put "12/08/2026" in Q4 instead of Q3.
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/);
  if (!slash) return null;
  const first = Number(slash[1]);
  const second = Number(slash[2]);
  const month = second <= 12 ? second : first;
  if (month < 1 || month > 12) return null;

  const rawYear = Number(slash[3]);
  return fromParts(month, slash[3].length <= 2 ? 2000 + rawYear : rawYear);
}

function fromParts(month: number, year: number) {
  return {
    quarter: (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4,
    year,
  };
}

function readRelative(normalized: string, reference: ReturnType<typeof referenceQuarter>) {
  const shiftQuarters = (count: number) => shiftQuarter(reference.quarter, reference.year, count);
  const shiftMonths = (count: number) => {
    const month = reference.month + count;
    return {
      quarter: (Math.floor(((month % 12) + 12) % 12 / 3) + 1) as 1 | 2 | 3 | 4,
      year: reference.year + Math.floor(month / 12),
    };
  };

  if (/\b(this week|this month|now|immediate|imminent)\b/.test(normalized)) return shiftMonths(0);
  if (/\bnext month\b/.test(normalized)) return shiftMonths(1);
  if (/\bthis quarter\b/.test(normalized)) return shiftQuarters(0);
  if (/\bnext quarter\b/.test(normalized)) return shiftQuarters(1);
  if (/\b(later|next year|h2|second half|beyond|tbd|unknown)\b/.test(normalized)) return 'later' as const;
  return null;
}

function readMonthName(normalized: string, reference: ReturnType<typeof referenceQuarter>) {
  const index = MONTH_NAMES.findIndex((name) => new RegExp(`\\b${name.slice(0, 3)}[a-z]*\\b`).test(normalized));
  if (index < 0) return null;
  const explicitYear = readYear(normalized);
  return {
    quarter: (Math.floor(index / 3) + 1) as 1 | 2 | 3 | 4,
    year: explicitYear ?? (index >= reference.month ? reference.year : reference.year + 1),
    yearInferred: explicitYear === null,
  };
}

function shiftQuarter(quarter: 1 | 2 | 3 | 4, year: number, count: number) {
  const zeroBased = quarter - 1 + count;
  return {
    quarter: ((((zeroBased % 4) + 4) % 4) + 1) as 1 | 2 | 3 | 4,
    year: year + Math.floor(zeroBased / 4),
  };
}
