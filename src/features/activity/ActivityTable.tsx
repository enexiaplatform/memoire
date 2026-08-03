import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, Clock } from 'lucide-react';
import type { ActivityEntry } from '../../utils/activityLedger.ts';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';
import { SubjectChip } from '../../components/common/SubjectChip';

/**
 * The ledger as a record list, sortable by column, one row per activity.
 *
 * The stream next to it answers "what is still owed and what did I do" - it is
 * grouped by state and then by day, which is the right shape for reading a week.
 * It is the wrong shape for looking something up. An operator who remembers
 * doing something for a customer and wants to find it has to scroll a grouped
 * timeline; here they sort by customer, or by date, the same way they would in
 * Accounts or Opportunities. Two shapes over one set of rows, not two sets.
 *
 * Every row opens the detail drawer. Nothing here edits: the ledger owns no
 * records, so the drawer's job is to say where the real one lives.
 */
type SortKey = 'date' | 'subject' | 'relatedTo' | 'type' | 'who' | 'domain' | 'state';
type SortDirection = 'asc' | 'desc';

const STATE_ORDER: Record<ActivityEntry['state'], number> = { overdue: 0, open: 1, done: 2 };

const COLUMNS: { key: SortKey; label: string; className: string }[] = [
  { key: 'date', label: 'Date', className: 'w-[112px]' },
  { key: 'state', label: 'State', className: 'w-[104px]' },
  { key: 'relatedTo', label: 'Who it was for', className: 'w-[190px]' },
  { key: 'subject', label: 'Subject', className: '' },
  { key: 'type', label: 'Type', className: 'w-[130px] hidden md:table-cell' },
  { key: 'who', label: 'Person', className: 'w-[140px] hidden lg:table-cell' },
  { key: 'domain', label: 'Domain', className: 'w-[110px] hidden lg:table-cell' },
];

export function ActivityTable({
  entries,
  emptyMessage,
  onSelect,
}: {
  entries: ActivityEntry[];
  emptyMessage: string;
  onSelect: (entry: ActivityEntry) => void;
}) {
  // Newest first is what every other record list in the product opens on, and
  // it is the only default that does not imply a judgement about which rows
  // matter.
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [direction, setDirection] = useState<SortDirection>('desc');

  const sorted = useMemo(() => {
    const rows = [...entries];
    rows.sort((left, right) => {
      const delta = compareBy(sortKey, left, right);
      // Ties fall back to the date so the order is stable and reproducible
      // rather than dependent on however the ledger happened to build.
      return (delta !== 0 ? delta : left.date.localeCompare(right.date)) * (direction === 'asc' ? 1 : -1);
    });
    return rows;
  }, [direction, entries, sortKey]);

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        {emptyMessage}
      </p>
    );
  }

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    // Dates read newest-first; names read A-Z. Opening a text column at Z-A
    // looks like a bug even when it is consistent.
    setDirection(key === 'date' ? 'desc' : 'asc');
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200">
            {COLUMNS.map((column) => (
              <th key={column.key} scope="col" className={`py-2 pr-3 ${column.className}`}>
                <button
                  type="button"
                  onClick={() => toggleSort(column.key)}
                  aria-label={`Sort by ${column.label}`}
                  className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${
                    sortKey === column.key ? 'text-navy' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {column.label}
                  {sortKey === column.key && (
                    direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr
              key={entry.id}
              tabIndex={0}
              role="button"
              aria-label={`Open ${entry.subject}`}
              onClick={() => onSelect(entry)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(entry);
                }
              }}
              className="cursor-pointer border-b border-gray-100 outline-none hover:bg-blue-50/40 focus-visible:bg-blue-50/60 focus-visible:ring-2 focus-visible:ring-brand-blue/30"
            >
              <td className="py-2 pr-3 align-top text-xs font-semibold text-gray-500">
                {formatSafeBusinessDate(entry.date)}
              </td>
              <td className="py-2 pr-3 align-top">
                <StatePill state={entry.state} />
              </td>
              <td className="py-2 pr-3 align-top">
                <SubjectChip relation={entry.relatedTo} size="compact" />
              </td>
              <td className="py-2 pr-3 align-top">
                <span className="line-clamp-2 text-sm font-semibold text-gray-800">{entry.subject}</span>
              </td>
              <td className="hidden py-2 pr-3 align-top text-xs text-gray-600 md:table-cell">{entry.type}</td>
              <td className="hidden py-2 pr-3 align-top text-xs text-gray-600 lg:table-cell">
                {entry.who || <span className="text-gray-300">—</span>}
              </td>
              <td className="hidden py-2 pr-3 align-top text-xs text-gray-600 lg:table-cell">{entry.domain}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatePill({ state }: { state: ActivityEntry['state'] }) {
  const Icon = state === 'done' ? Check : state === 'overdue' ? AlertTriangle : Clock;
  const tone = state === 'done'
    ? 'bg-emerald-50 text-emerald-700'
    : state === 'overdue'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  const label = state === 'done' ? 'Done' : state === 'overdue' ? 'Overdue' : 'Open';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function compareBy(key: SortKey, left: ActivityEntry, right: ActivityEntry) {
  if (key === 'state') return STATE_ORDER[left.state] - STATE_ORDER[right.state];
  if (key === 'relatedTo') return left.relatedTo.name.localeCompare(right.relatedTo.name);
  if (key === 'date') return left.date.localeCompare(right.date);
  return String(left[key] || '').localeCompare(String(right[key] || ''));
}
