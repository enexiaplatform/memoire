import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Clock, Trash2, X } from 'lucide-react';
import type { ActivityEntry, ActivityOrigin } from '../../utils/activityLedger.ts';
import { relationTypeLabel } from '../../utils/activityLedger.ts';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';
import { SubjectChip } from '../../components/common/SubjectChip';

/**
 * One row of the ledger, opened in place.
 *
 * The Activity list is a list of *derived* rows - the ledger owns nothing, and
 * every row was written somewhere else: a captured touch, a plan item, an
 * obligation. So the drawer's job is different from a record drawer's. It is not
 * "edit this"; it is "show me everything this row knows, and tell me where the
 * real record lives so I can go and change it there". Every field below is read
 * from the entry, and the only two things that leave are the subject chip and
 * the explicit "Open the record" link.
 *
 * With one exception: deletion. A row written by mistake - a touch captured
 * twice, a plan line typed on the wrong day - was unremovable from here, and the
 * only delete in the product sat inside a modal on the history calendar that an
 * operator reading the ledger had no reason to find. So the two origins this
 * workspace actually owns the record for, a captured touch and a typed plan
 * line, can be deleted where they are read. Derived rows (a deal's next action,
 * an obligation) still cannot: they are a *view* of another record, and removing
 * the view without the record would be a lie.
 */
const ORIGIN_COPY: Record<ActivityOrigin, { label: string; detail: string }> = {
  capture: {
    label: 'Captured touch',
    detail: 'You wrote this down after it happened. It lives in Capture and reads out on Timeline > History.',
  },
  deal: {
    label: 'Dated on a deal',
    detail: 'A next action dated on the opportunity record. Changing the date there moves this row.',
  },
  obligation: {
    label: 'Own obligation',
    detail: 'Something the business owes - a supplier commitment or a milestone, not customer work.',
  },
  typed: {
    label: 'Planned on the calendar',
    detail: 'You typed this straight into a day on Plan. Ticking it there ticks it here; they are the same record.',
  },
};

export function ActivityDetailDrawer({
  entry,
  onClose,
  onDelete,
}: {
  entry: ActivityEntry;
  onClose: () => void;
  /**
   * Removes the record this row was derived from. Omitted for the origins the
   * ledger only borrows, which is what greys the button out with a reason.
   */
  onDelete?: () => void | Promise<void>;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const StateIcon = entry.state === 'done' ? Check : entry.state === 'overdue' ? AlertTriangle : Clock;
  const stateTone = entry.state === 'done'
    ? 'bg-emerald-50 text-emerald-700'
    : entry.state === 'overdue'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  const stateLabel = entry.state === 'done' ? 'Done' : entry.state === 'overdue' ? 'Overdue' : 'Open';
  const origin = ORIGIN_COPY[entry.origin];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close activity detail"
        onClick={onClose}
        className="absolute inset-0 bg-navy/40"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Activity detail"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-blue">
              {entry.kind === 'event' ? 'Activity · touch' : 'Activity · dated work'}
            </p>
            <h2 className="mt-1 break-words text-lg font-bold leading-6 text-navy">{entry.subject}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-navy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${stateTone}`}>
              <StateIcon className="h-3.5 w-3.5" />
              {stateLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
              {formatSafeBusinessDate(entry.date)}
            </span>
          </div>

          {/* The chip is the page's whole thesis, so it gets its own block
              rather than sitting in the field list: a row that points at
              nothing reaches no deal, no invoice and no forecast. */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Who it was for</h3>
            <div className="mt-2">
              <SubjectChip relation={entry.relatedTo} />
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-600">
              {entry.relatedTo.type === 'unresolved'
                ? `"${entry.relatedTo.name}" is not an account, a deal or a line you carry yet. This work reaches no deal and no money until it is one.`
                : `${relationTypeLabel(entry.relatedTo.type)} · ${entry.relatedTo.name}`}
            </p>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Detail</h3>
            <dl className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-100">
              <Field label="Type" value={entry.type} />
              <Field label="Domain" value={entry.domain} />
              <Field label="Person" value={entry.who || 'Nobody named'} muted={!entry.who} />
              <Field
                label="Next action"
                value={entry.hasNextAction ? 'A dated next action was written down' : 'None dated'}
                muted={!entry.hasNextAction}
              />
            </dl>
          </section>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Where it came from</h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-sm font-bold text-navy">{origin.label}</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{origin.detail}</p>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-2">
            {entry.href && (
              <Link
                to={entry.href}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90"
              >
                Open the record
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {onDelete && !confirmingDelete && (
              <button
                type="button"
                onClick={() => { setDeleteError(''); setConfirmingDelete(true); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
          </div>

          {/* Two presses, not a browser confirm dialog. This deletes a record
              the operator wrote, and the sentence saying so is worth more than
              an OS alert nobody reads. */}
          {onDelete && confirmingDelete && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3">
              <p className="text-sm font-bold text-red-800">
                Delete this {entry.origin === 'capture' ? 'captured touch' : 'plan item'}?
              </p>
              <p className="mt-1 text-xs leading-5 text-red-900/80">
                It disappears from the ledger, the calendar and every count built on it. This cannot be undone.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={async () => {
                    setDeleting(true);
                    setDeleteError('');
                    try {
                      await onDelete();
                      onClose();
                    } catch {
                      setDeleteError('That could not be deleted. Check the connection and try again.');
                      setDeleting(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:bg-gray-300"
                >
                  <Trash2 className="h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Yes, delete it'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700"
                >
                  Keep it
                </button>
              </div>
              {deleteError && <p className="mt-2 text-xs font-semibold text-red-800">{deleteError}</p>}
            </div>
          )}

          {!onDelete && (
            <p className="text-xs leading-5 text-gray-500">
              This row is a view of another record, so it cannot be deleted here. Open the record and remove it there.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-xs font-semibold text-gray-500">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-sm font-semibold ${muted ? 'text-gray-400' : 'text-gray-800'}`}>
        {value}
      </dd>
    </div>
  );
}
