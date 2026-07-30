import type { ActivityEntry } from './activityLedger.ts';
import { relationTypeLabel } from './activityLedger.ts';
import { formatSafeBusinessDate } from './safeDate.ts';

/**
 * A pivot over the activity ledger: pick what the rows are, pick what the
 * columns are, and read the count where they cross.
 *
 * The reason this is a pivot and not eight more bar charts is that nobody knows
 * in advance which crossing matters. "Customer by month" finds the account that
 * quietly stopped. "Customer by state" finds the one you keep planning for and
 * never doing. "Type by weekday" finds that every quote goes out on a Friday
 * afternoon. Each of those is the same data, and a chart per question would be
 * ten panels the operator has to scan instead of one they can steer.
 *
 * Counts only, deliberately. Money already has a surface that is careful about
 * currency, base conversion and what counts as committed; a second, casual
 * arithmetic over the same records here would eventually disagree with it, and
 * an operator with two revenue numbers trusts neither.
 */

export type ActivityDimension =
  | 'relatedTo'
  | 'relationType'
  | 'type'
  | 'domain'
  | 'state'
  | 'kind'
  | 'origin'
  | 'month'
  | 'week'
  | 'weekday';

export type ActivityDimensionMeta = {
  id: ActivityDimension;
  label: string;
  /** What this dimension answers, shown when the operator picks it. */
  hint: string;
  /** Chronological dimensions sort by value; the rest sort by size. */
  ordered: boolean;
};

export const activityDimensions: ActivityDimensionMeta[] = [
  { id: 'relatedTo', label: 'Subject', hint: 'The customer, deal, line or domain the work served.', ordered: false },
  { id: 'relationType', label: 'Subject type', hint: 'Opportunity, account, brand line, internal, or not linked yet.', ordered: false },
  { id: 'type', label: 'Activity type', hint: 'What kind of work it was.', ordered: false },
  { id: 'domain', label: 'Business domain', hint: 'Which of the seven parts of the business it belonged to.', ordered: false },
  { id: 'state', label: 'State', hint: 'Done, still open, or overdue.', ordered: false },
  { id: 'kind', label: 'Record', hint: 'A touch that happened, or dated work.', ordered: false },
  { id: 'origin', label: 'Came from', hint: 'Capture, a deal, an obligation, or typed by hand.', ordered: false },
  { id: 'month', label: 'Month', hint: 'Calendar month.', ordered: true },
  { id: 'week', label: 'Week', hint: 'Week beginning Monday.', ordered: true },
  { id: 'weekday', label: 'Weekday', hint: 'The shape of a normal week.', ordered: true },
];

export type PivotCell = {
  count: number;
  /** Of the row's total, so a row reads as a mix and not just a size. */
  rowShare: number;
};

export type PivotRow = {
  key: string;
  label: string;
  /** Extra context for the label - the subject type, for instance. */
  note: string;
  cells: PivotCell[];
  total: number;
};

export type ActivityPivot = {
  rowDimension: ActivityDimension;
  columnDimension: ActivityDimension;
  columns: { key: string; label: string }[];
  rows: PivotRow[];
  columnTotals: number[];
  grandTotal: number;
  /** The largest single cell, so a heat scale has a top. */
  maxCell: number;
  /** Rows folded into the last row because the table would not read. */
  truncatedRows: number;
};

const WEEKDAY_ORDER = ['1', '2', '3', '4', '5', '6', '0'];
const WEEKDAY_LABELS: Record<string, string> = {
  '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat',
};
const STATE_ORDER = ['overdue', 'open', 'done'];

export function buildActivityPivot(
  entries: ActivityEntry[],
  rowDimension: ActivityDimension,
  columnDimension: ActivityDimension,
  options: { maxRows?: number; maxColumns?: number } = {},
): ActivityPivot {
  const maxRows = options.maxRows ?? 14;
  const maxColumns = options.maxColumns ?? 12;

  const columns = orderedValues(entries, columnDimension, maxColumns);
  const columnIndex = new Map(columns.map((column, index) => [column.key, index]));

  const allRows = orderedValues(entries, rowDimension, Number.POSITIVE_INFINITY);
  const keptRows = allRows.slice(0, maxRows);
  const keptKeys = new Set(keptRows.map((row) => row.key));
  const foldedRows = allRows.length - keptRows.length;

  const buckets = new Map<string, number[]>();
  const notes = new Map<string, string>();
  const rowLabels = new Map<string, string>();
  keptRows.forEach((row) => {
    buckets.set(row.key, new Array(columns.length).fill(0));
    rowLabels.set(row.key, row.label);
    if (row.note) notes.set(row.key, row.note);
  });
  if (foldedRows > 0) {
    buckets.set(OTHER_KEY, new Array(columns.length).fill(0));
    rowLabels.set(OTHER_KEY, `${foldedRows} more`);
  }

  entries.forEach((entry) => {
    const rowKey = keyOf(entry, rowDimension);
    const bucketKey = keptKeys.has(rowKey) ? rowKey : foldedRows > 0 ? OTHER_KEY : '';
    if (!bucketKey) return;
    const bucket = buckets.get(bucketKey);
    if (!bucket) return;
    const index = columnIndex.get(keyOf(entry, columnDimension));
    if (index === undefined) return;
    bucket[index] += 1;
  });

  const rows: PivotRow[] = [...buckets.entries()].map(([key, counts]) => {
    const total = counts.reduce((sum, count) => sum + count, 0);
    return {
      key,
      label: rowLabels.get(key) || key,
      note: notes.get(key) || '',
      total,
      cells: counts.map((count) => ({ count, rowShare: total === 0 ? 0 : count / total })),
    };
  })
    // The folded row stays last whatever its size; everything above it keeps the
    // dimension's own order.
    .sort((left, right) => {
      if (left.key === OTHER_KEY) return 1;
      if (right.key === OTHER_KEY) return -1;
      return 0;
    });

  const columnTotals = columns.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index].count, 0));

  return {
    rowDimension,
    columnDimension,
    columns: columns.map((column) => ({ key: column.key, label: column.label })),
    rows,
    columnTotals,
    grandTotal: columnTotals.reduce((sum, total) => sum + total, 0),
    maxCell: rows.reduce((max, row) => Math.max(max, ...row.cells.map((cell) => cell.count)), 0),
    truncatedRows: foldedRows,
  };
}

const OTHER_KEY = '__other__';

/** Every distinct value of a dimension, in the order it should be read. */
export function orderedValues(
  entries: ActivityEntry[],
  dimension: ActivityDimension,
  limit: number,
): { key: string; label: string; note: string; count: number }[] {
  const counts = new Map<string, { label: string; note: string; count: number }>();
  entries.forEach((entry) => {
    const key = keyOf(entry, dimension);
    if (!key) return;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }
    counts.set(key, { label: labelOf(entry, dimension), note: noteOf(entry, dimension), count: 1 });
  });

  const values = [...counts.entries()].map(([key, value]) => ({ key, ...value }));
  const meta = activityDimensions.find((candidate) => candidate.id === dimension);

  if (dimension === 'weekday') {
    values.sort((left, right) => WEEKDAY_ORDER.indexOf(left.key) - WEEKDAY_ORDER.indexOf(right.key));
  } else if (dimension === 'state') {
    values.sort((left, right) => STATE_ORDER.indexOf(left.key) - STATE_ORDER.indexOf(right.key));
  } else if (meta?.ordered) {
    values.sort((left, right) => left.key.localeCompare(right.key));
  } else {
    values.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
  }

  return Number.isFinite(limit) ? values.slice(0, limit) : values;
}

export function keyOf(entry: ActivityEntry, dimension: ActivityDimension): string {
  switch (dimension) {
    case 'relatedTo':
      // Typed, so an account and a brand line with the same name never merge
      // into one row that means two different things.
      return `${entry.relatedTo.type}:${entry.relatedTo.name.toLowerCase()}`;
    case 'relationType':
      return entry.relatedTo.type;
    case 'type':
      return entry.type;
    case 'domain':
      return entry.domain;
    case 'state':
      return entry.state;
    case 'kind':
      return entry.kind;
    case 'origin':
      return entry.origin;
    case 'month':
      return entry.date.slice(0, 7);
    case 'week':
      return entry.weekStart;
    case 'weekday':
      return String(entry.weekday);
    default:
      return '';
  }
}

function labelOf(entry: ActivityEntry, dimension: ActivityDimension): string {
  switch (dimension) {
    case 'relatedTo':
      return entry.relatedTo.name;
    case 'relationType':
      return relationTypeLabel(entry.relatedTo.type);
    case 'state':
      return { done: 'Done', open: 'Open', overdue: 'Overdue' }[entry.state];
    case 'kind':
      return entry.kind === 'event' ? 'Touch' : 'Dated work';
    case 'origin':
      return { capture: 'Capture', deal: 'Deal', obligation: 'Obligation', typed: 'Typed' }[entry.origin];
    case 'month':
      return formatMonth(entry.date.slice(0, 7));
    case 'week':
      return formatSafeBusinessDate(entry.weekStart);
    case 'weekday':
      return WEEKDAY_LABELS[String(entry.weekday)] || '';
    default:
      return keyOf(entry, dimension);
  }
}

function noteOf(entry: ActivityEntry, dimension: ActivityDimension): string {
  return dimension === 'relatedTo' ? relationTypeLabel(entry.relatedTo.type) : '';
}

export function formatMonth(monthKey: string) {
  const parsed = Date.parse(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed)) return monthKey;
  return new Date(parsed).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function dimensionLabel(dimension: ActivityDimension) {
  return activityDimensions.find((candidate) => candidate.id === dimension)?.label || dimension;
}
