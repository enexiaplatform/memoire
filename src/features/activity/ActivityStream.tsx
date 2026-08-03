import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, CircleDot, Clock, MessageSquare, User } from 'lucide-react';
import type { ActivityEntry } from '../../utils/activityLedger.ts';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';
import { SubjectChip } from '../../components/common/SubjectChip';

// Re-exported so the Activity feature's own files keep one import path, while the
// chip itself lives in components/common - Timeline draws it too, and a calendar
// importing out of a sibling feature folder is how a shared thing ends up owned by
// whichever surface happened to need it first.
export { SubjectChip };

/**
 * The ledger itself, split the way Salesforce splits an activity timeline: what
 * is still open above, what already happened below.
 *
 * The split is on state, not on record type, and that is the point. An operator
 * does not think "show me my tasks and then my events" - they think "what is
 * still owed, and what did I do". A single reverse-chronological list mixes those
 * two questions and answers neither, which is why every CRM that tried it went
 * back to two sections.
 *
 * Every row carries its subject as a link. That chip is the whole thesis of the
 * page: a note on a calendar that points at nothing is a note that will never
 * reach a deal, an invoice or a forecast.
 *
 * Open work is never truncated - it is a list of things still owed, and hiding
 * the tail of that is how a commitment goes quiet. History is capped, because a
 * quarter of touches is hundreds of rows nobody scrolls, and the charts above
 * already summarise them.
 */
const HISTORY_PREVIEW = 40;

export function ActivityStream({
  entries,
  emptyMessage,
  onSelect,
}: {
  entries: ActivityEntry[];
  emptyMessage: string;
  /** Opens the row's detail. The same drawer the list view opens. */
  onSelect: (entry: ActivityEntry) => void;
}) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  const open = entries.filter((entry) => entry.bucket === 'open');
  const history = entries.filter((entry) => entry.bucket === 'history');

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        {emptyMessage}
      </p>
    );
  }

  const sortedHistory = [...history].sort((left, right) => right.date.localeCompare(left.date));
  const visibleHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, HISTORY_PREVIEW);
  const hiddenHistory = sortedHistory.length - visibleHistory.length;

  return (
    <div className="space-y-5">
      {open.length > 0 && (
        <StreamSection
          title="Open and overdue"
          hint="Dated work that has not been ticked. Sorted soonest first."
          entries={[...open].sort((left, right) => left.date.localeCompare(right.date))}
          onSelect={onSelect}
        />
      )}
      {history.length > 0 && (
        <>
          <StreamSection
            title="History"
            hint="Touches you captured and dated work you finished. Newest first."
            entries={visibleHistory}
            count={sortedHistory.length}
            onSelect={onSelect}
          />
          {hiddenHistory > 0 && (
            <button
              type="button"
              onClick={() => setShowAllHistory(true)}
              className="rounded-full border border-gray-200 px-3.5 py-1.5 text-xs font-bold text-gray-600 hover:border-brand-blue hover:text-brand-blue"
            >
              Show {hiddenHistory} older {hiddenHistory === 1 ? 'row' : 'rows'}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function StreamSection({
  title,
  hint,
  entries,
  count,
  onSelect,
}: {
  title: string;
  hint: string;
  entries: ActivityEntry[];
  /** The full size of the section, when only part of it is rendered. */
  count?: number;
  onSelect: (entry: ActivityEntry) => void;
}) {
  const groups: { date: string; rows: ActivityEntry[] }[] = [];
  entries.forEach((entry) => {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) {
      last.rows.push(entry);
      return;
    }
    groups.push({ date: entry.date, rows: [entry] });
  });

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 className="text-sm font-bold uppercase tracking-wide text-navy">{title}</h3>
        <span className="text-xs font-bold text-gray-400">{count ?? entries.length}</span>
        <span className="text-xs text-gray-500">{hint}</span>
      </div>

      <ol className="mt-2 space-y-3">
        {groups.map((group) => (
          <li key={`${title}-${group.date}`}>
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {formatSafeBusinessDate(group.date)}
            </p>
            <ul className="mt-1 space-y-1.5">
              {group.rows.map((entry) => (
                <StreamRow key={entry.id} entry={entry} onSelect={onSelect} />
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StreamRow({ entry, onSelect }: { entry: ActivityEntry; onSelect: (entry: ActivityEntry) => void }) {
  const StateIcon = entry.state === 'done' ? Check : entry.state === 'overdue' ? AlertTriangle : Clock;
  const stateTone = entry.state === 'done'
    ? 'bg-emerald-50 text-emerald-600'
    : entry.state === 'overdue'
      ? 'bg-red-50 text-red-600'
      : 'bg-amber-50 text-amber-600';

  return (
    <li className="flex items-start gap-2.5 rounded-lg border border-gray-100 bg-white p-2.5 hover:border-blue-100 hover:bg-blue-50/30">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${stateTone}`}>
        <StateIcon className="h-3.5 w-3.5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <SubjectChip relation={entry.relatedTo} />
          {/* The subject opens the row's detail; the chip beside it still goes
              to the customer and "Open" still goes to the record it came from.
              Three targets, three different questions. */}
          <button
            type="button"
            onClick={() => onSelect(entry)}
            className="min-w-0 break-words text-left text-sm font-semibold text-gray-800 hover:text-brand-blue hover:underline"
          >
            {entry.subject}
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1 font-semibold text-gray-600">
            {entry.kind === 'event' ? <MessageSquare className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
            {entry.type}
          </span>
          {entry.who && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {entry.who}
            </span>
          )}
          <span>{entry.domain}</span>
          {entry.hasNextAction && <span className="font-semibold text-brand-blue">next action dated</span>}
        </div>
      </div>

      {entry.href && (
        <Link
          to={entry.href}
          className="shrink-0 self-center rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:border-brand-blue hover:text-brand-blue"
        >
          Open
        </Link>
      )}
    </li>
  );
}
