import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, Check, ChevronDown, Clock3, Plus, RotateCcw, X } from 'lucide-react';
import type { CommercialCommitment, CommitmentParty } from '../../domain/commercialKernel/types';
import {
  isPlanDerivedCommitment,
  splitCommitmentsByBoard,
  type PlanBoardWindow,
} from '../../domain/commercialKernel/derivePlanCommitments';
import { formatSafeBusinessDate, todayDateKey } from '../../utils/safeDate.ts';
import { useCommitmentLedger } from './useCommitmentLedger';
import { PLAN_BOARD_ANCHOR_ID } from '../plan/WeeklyPlanPage';

const partyLabels: Record<CommitmentParty, string> = {
  self: 'I owe',
  customer: 'Customer owes',
  internal: 'Internal owes',
};

const partyTone: Record<CommitmentParty, string> = {
  self: 'bg-blue-50 text-brand-blue ring-blue-100',
  customer: 'bg-amber-50 text-amber-800 ring-amber-100',
  internal: 'bg-slate-100 text-slate-700 ring-slate-200',
};

/**
 * The Commercial Commitment Ledger.
 *
 * The three parties are the whole point, and they are the thing a task list
 * cannot express: "I owe them a revised quote" and "they owe me a confirmed
 * quantity" are not two tasks of mine, and treating them as one list is how a
 * seller ends up chasing themselves while the customer's promise quietly
 * expires. Grouping is by when, because that is how the day is worked; the
 * party is a badge on each row so the split is never lost.
 */
export function CommitmentLedgerPanel({
  title = 'Commitments',
  accountNames = [],
  limit,
  showComposer = true,
  boardWindow,
  onShowOnBoard,
}: {
  title?: string;
  /** Known accounts, offered as suggestions so promises attach to real customers. */
  accountNames?: string[];
  /** Cap each group. Today shows a few; Timeline shows them all. */
  limit?: number;
  showComposer?: boolean;
  /**
   * The days the plan board directly below is drawing, when there is one.
   *
   * Given it, the panel stops re-listing the promises that board already shows
   * and counts them on one line instead. Omitted on Today and Review, where
   * there is no board on screen and the list is the only place they appear.
   */
  boardWindow?: PlanBoardWindow;
  /**
   * Pages the board below to a given day. Only meaningful beside a board, and
   * it is what makes the rows that survive the fold reachable: they survived
   * precisely because their day is not on screen.
   */
  onShowOnBoard?: (dateKey: string) => void;
}) {
  const ledger = useCommitmentLedger();
  const [composerOpen, setComposerOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState<string>('');
  const [showSettled, setShowSettled] = useState(false);
  const [showBoardItems, setShowBoardItems] = useState(false);

  const openCount = ledger.groups.overdue.length
    + ledger.groups.dueToday.length
    + ledger.groups.upcoming.length
    + ledger.groups.undated.length;

  // What the week below already draws, folded into a line. `showBoardItems`
  // puts it back: the fold is a default, not a decision taken away.
  const fold = useMemo(() => {
    if (!boardWindow || showBoardItems) return null;
    const open = [...ledger.groups.overdue, ...ledger.groups.dueToday, ...ledger.groups.upcoming];
    const { onBoard } = splitCommitmentsByBoard(open, boardWindow);
    if (onBoard.length === 0) return null;
    const folded = new Set(onBoard.map((commitment) => commitment.id));
    return {
      count: onBoard.length,
      overdue: ledger.groups.overdue.filter((commitment) => folded.has(commitment.id)).length,
      dueToday: ledger.groups.dueToday.filter((commitment) => folded.has(commitment.id)).length,
      upcoming: ledger.groups.upcoming.filter((commitment) => folded.has(commitment.id)).length,
      folded,
    };
  }, [boardWindow, ledger.groups, showBoardItems]);

  const groups = useMemo(() => {
    if (!fold) return ledger.groups;
    const keep = (items: CommercialCommitment[]) => items.filter((item) => !fold.folded.has(item.id));
    return {
      ...ledger.groups,
      overdue: keep(ledger.groups.overdue),
      dueToday: keep(ledger.groups.dueToday),
      upcoming: keep(ledger.groups.upcoming),
    };
  }, [fold, ledger.groups]);
  const listedCount = groups.overdue.length + groups.dueToday.length + groups.upcoming.length + groups.undated.length;
  // Group labels earn their place only when there is something to tell apart.
  // Folded down to one group, "NOT ON THE WEEK SHOWN (3)" sat directly above
  // "COMING UP (3)" - two headings, one count, no new fact between them.
  const listedGroupCount = [groups.overdue, groups.dueToday, groups.upcoming, groups.undated]
    .filter((group) => group.length > 0).length;
  const showGroupLabels = !fold || listedGroupCount > 1;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-brand-blue" />
          <h2 className="text-sm font-bold text-navy">{title}</h2>
          {openCount > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600">
              {openCount} open
            </span>
          )}
        </div>
        {showComposer && (
          <button
            type="button"
            onClick={() => setComposerOpen((open) => !open)}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Record a commitment
          </button>
        )}
      </div>

      {ledger.message && (
        <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">{ledger.message}</p>
      )}

      {composerOpen && (
        <CommitmentComposer
          accountNames={accountNames}
          onCancel={() => setComposerOpen(false)}
          onSave={(input) => {
            if (ledger.create(input)) setComposerOpen(false);
          }}
        />
      )}

      {fold && <PlanBoardFold fold={fold} onExpand={() => setShowBoardItems(true)} />}
      {boardWindow && showBoardItems && openCount > 0 && (
        <button
          type="button"
          onClick={() => setShowBoardItems(false)}
          className="mt-3 text-xs font-bold text-brand-blue hover:underline"
        >
          Fold the ones already on the week
        </button>
      )}

      {ledger.loading && openCount === 0 ? (
        <p className="mt-4 text-xs text-gray-400">Loading commitments…</p>
      ) : openCount === 0 ? (
        <p className="mt-4 text-sm leading-6 text-gray-500">
          Nothing is promised right now. A commitment is what Memoire watches: what happens next, who owes it, and by
          when.
        </p>
      ) : listedCount === 0 ? (
        /* Every open promise is on the week below. Saying so beats an empty
           panel, which would read as "nothing is promised" directly above a
           board full of promises. */
        null
      ) : (
        <div className="mt-3 space-y-4">
          {/* One heading for the whole remainder, rather than qualifying every
              group. The groups themselves are relative to today - overdue,
              due today, coming up - while "on the week shown" is relative to
              the board, and folding those two ideas into each label produced
              "Later than this week" above a promise dated *before* the week the
              board had been paged to. */}
          {fold && (
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
              Not on the week shown ({listedCount})
            </p>
          )}
          <CommitmentGroup
            label="Overdue"
            tone="text-red-700"
            items={groups.overdue}
            limit={limit}
            rescheduling={rescheduling}
            onReschedule={setRescheduling}
            onShowOnBoard={onShowOnBoard}
            showLabel={showGroupLabels}
            ledger={ledger}
          />
          <CommitmentGroup
            label="Due today"
            tone="text-navy"
            items={groups.dueToday}
            limit={limit}
            rescheduling={rescheduling}
            onReschedule={setRescheduling}
            onShowOnBoard={onShowOnBoard}
            showLabel={showGroupLabels}
            ledger={ledger}
          />
          <CommitmentGroup
            label="Coming up"
            tone="text-gray-600"
            items={groups.upcoming}
            limit={limit}
            rescheduling={rescheduling}
            onReschedule={setRescheduling}
            onShowOnBoard={onShowOnBoard}
            showLabel={showGroupLabels}
            ledger={ledger}
          />
          <CommitmentGroup
            label="No date yet"
            tone="text-amber-700"
            items={groups.undated}
            limit={limit}
            rescheduling={rescheduling}
            onReschedule={setRescheduling}
            onShowOnBoard={onShowOnBoard}
            showLabel={showGroupLabels}
            ledger={ledger}
          />
        </div>
      )}

      {groups.settled.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button
            type="button"
            onClick={() => setShowSettled((open) => !open)}
            className="inline-flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-brand-blue"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition ${showSettled ? 'rotate-180' : ''}`} />
            {groups.settled.length} settled
          </button>
          {showSettled && (
            <ul className="mt-2 space-y-1 text-xs leading-5 text-gray-400">
              {groups.settled.slice(0, 20).map((commitment) => (
                <li key={commitment.id} className="flex items-baseline gap-2">
                  <span className={commitment.status === 'completed' ? 'text-emerald-600' : 'text-gray-400'}>
                    {commitment.status === 'completed' ? 'Kept' : 'Cancelled'}
                  </span>
                  <span className="line-through">{commitment.commitmentText}</span>
                  <span className="ml-auto shrink-0">{commitment.accountName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The promises the week below is already drawing, as one line instead of a
 * hundred pixels each.
 *
 * It leads with the count that decides whether the operator is behind, because
 * that is the question the top of this page is read for - and it is a link to
 * the board rather than a summary they then have to go and find.
 */
function PlanBoardFold({
  fold,
  onExpand,
}: {
  fold: { count: number; overdue: number; dueToday: number; upcoming: number };
  onExpand: () => void;
}) {
  const parts = [
    fold.overdue > 0 ? `${fold.overdue} overdue` : '',
    fold.dueToday > 0 ? `${fold.dueToday} due today` : '',
    // Not "later this week": the board can be paged to any week, and a
    // breakdown that assumes the current one describes the wrong days the
    // moment somebody looks ahead.
    fold.upcoming > 0 ? `${fold.upcoming} still to come` : '',
  ].filter(Boolean);
  // A breakdown that repeats the count in different words earns nothing. It is
  // shown when it splits the total, or whenever anything is overdue - that one
  // is the reason this line is read at all.
  const breakdown = parts.length > 1 || fold.overdue > 0 ? parts : [];

  return (
    <div className={`mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg px-3 py-2 ring-1 ${
      fold.overdue > 0 ? 'bg-red-50 ring-red-100' : 'bg-blue-50 ring-blue-100'
    }`}>
      <p className="text-sm font-bold text-navy">
        {fold.count} {fold.count === 1 ? 'promise is' : 'promises are'} on the week below
      </p>
      {breakdown.length > 0 && (
        <p className={`text-xs font-semibold ${fold.overdue > 0 ? 'text-red-800' : 'text-gray-600'}`}>
          {breakdown.join(' · ')}
        </p>
      )}
      <div className="ml-auto flex items-center gap-3">
        <a
          href={`#${PLAN_BOARD_ANCHOR_ID}`}
          onClick={(event) => {
            const board = document.getElementById(PLAN_BOARD_ANCHOR_ID);
            if (!board) return;
            event.preventDefault();
            board.scrollIntoView({ block: 'start' });
          }}
          className="inline-flex items-center gap-1 text-xs font-bold text-brand-blue hover:underline"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Go to the week
        </a>
        <button
          type="button"
          onClick={onExpand}
          className="text-xs font-bold text-gray-500 hover:text-brand-blue"
        >
          List them
        </button>
      </div>
    </div>
  );
}

function CommitmentGroup({
  label,
  tone,
  items,
  limit,
  rescheduling,
  onReschedule,
  onShowOnBoard,
  showLabel = true,
  ledger,
}: {
  label: string;
  tone: string;
  items: CommercialCommitment[];
  limit?: number;
  rescheduling: string;
  onReschedule: (id: string) => void;
  onShowOnBoard?: (dateKey: string) => void;
  showLabel?: boolean;
  ledger: ReturnType<typeof useCommitmentLedger>;
}) {
  if (items.length === 0) return null;
  const visible = limit ? items.slice(0, limit) : items;

  return (
    <div>
      {showLabel && (
        <p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${tone}`}>
          {label} ({items.length})
        </p>
      )}
      <ul className={showLabel ? 'mt-1.5 space-y-1.5' : 'space-y-1.5'}>
        {visible.map((commitment) => {
          // A promise derived from the Plan is shown, never edited here: the
          // plan item is the record, and it is ticked and moved on the Plan.
          // Offering a tick that writes nowhere would be a worse lie than the
          // empty panel this replaced.
          const fromPlan = isPlanDerivedCommitment(commitment);
          return (
          <li key={commitment.id} className="rounded-lg border border-gray-100 p-2.5">
            <div className="flex flex-wrap items-start gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${partyTone[commitment.commitmentParty]}`}>
                {partyLabels[commitment.commitmentParty]}
              </span>
              <p className="min-w-0 flex-1 text-sm leading-5 text-gray-900">
                {commitment.commitmentText}
                {commitment.accountName && <span className="ml-1.5 text-xs text-gray-400">· {commitment.accountName}</span>}
              </p>
              {fromPlan ? (
                /* A promise that lives on the board is ticked on the board -
                   this panel deliberately does not write derived commitments,
                   so the chip is the only route from here to the place it can
                   be kept. It pointed at `/app/timeline?view=upcoming`, which
                   on Plan is the page the operator is already looking at: a
                   link that did nothing, on every row, above a board that until
                   now did not even show the overdue ones. When the board is on
                   screen it scrolls there; from Today it still navigates. */
                <Link
                  to="/app/timeline?view=upcoming"
                  onClick={(event) => {
                    const board = document.getElementById(PLAN_BOARD_ANCHOR_ID);
                    if (!board) return;
                    event.preventDefault();
                    // A row survives the fold because its day is not on the
                    // board, so scrolling alone would land the operator on a
                    // week this promise is not in. Page the board to it first.
                    if (onShowOnBoard && commitment.currentDueDate) onShowOnBoard(commitment.currentDueDate);
                    board.scrollIntoView({ block: 'start' });
                  }}
                  title={onShowOnBoard ? 'Show that week on the plan board' : 'Tick it on the plan board'}
                  className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[10px] font-bold text-gray-500 hover:bg-gray-50 hover:text-brand-blue"
                >
                  {onShowOnBoard ? 'Show on the week' : 'On your Plan'}
                </Link>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => ledger.complete(commitment.id)}
                    title="Mark as kept"
                    className="rounded-full p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReschedule(rescheduling === commitment.id ? '' : commitment.id)}
                    title="Move the date"
                    className="rounded-full p-1.5 text-gray-400 hover:bg-blue-50 hover:text-brand-blue"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => ledger.cancel(commitment.id)}
                    title="Cancel this commitment"
                    className="rounded-full p-1.5 text-gray-300 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <CommitmentMeta commitment={commitment} />

            {rescheduling === commitment.id && (
              <RescheduleRow
                current={commitment.currentDueDate}
                onCancel={() => onReschedule('')}
                onSave={(date, reason) => {
                  if (ledger.reschedule(commitment.id, date, reason)) onReschedule('');
                }}
              />
            )}
          </li>
          );
        })}
      </ul>
      {limit && items.length > visible.length && (
        <p className="mt-1.5 text-[11px] text-gray-400">
          +{items.length - visible.length} more in Plan
        </p>
      )}
    </div>
  );
}

/** A promise of the operator's own, which the "I owe" badge already states. */
function isSelfOwned(commitment: CommercialCommitment) {
  return commitment.commitmentParty === 'self';
}

/**
 * The second line of a row: who owes it, when, and whether the date has moved.
 *
 * Assembled as a list rather than written out, because the owner is now dropped
 * whenever the badge beside it already says "I owe" - and a hard-coded "·"
 * prefix on the parts that follow leaves a dangling separator the moment the
 * first part is gone.
 */
function CommitmentMeta({ commitment }: { commitment: CommercialCommitment }) {
  const parts: { key: string; node: ReactNode }[] = [];
  if (!isSelfOwned(commitment)) parts.push({ key: 'owner', node: commitment.ownerLabel });
  if (commitment.currentDueDate) {
    parts.push({ key: 'due', node: `due ${formatSafeBusinessDate(commitment.currentDueDate)}` });
  }
  // The promise as first made, whenever it is not the promise now. Without
  // this, a date moved three times reads as if it were always Friday.
  if (commitment.dueDateHistory.length > 0) {
    parts.push({
      key: 'history',
      node: (
        <span className="text-amber-700">
          first promised {formatSafeBusinessDate(commitment.originalDueDate)}, moved {commitment.dueDateHistory.length}×
        </span>
      ),
    });
  }
  if (parts.length === 0) return null;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-gray-500">
      {parts.map((part, index) => (
        <span key={part.key}>
          {index > 0 && <span className="mr-1.5 text-gray-300">·</span>}
          {part.node}
        </span>
      ))}
    </p>
  );
}

function RescheduleRow({
  current,
  onSave,
  onCancel,
}: {
  current: string;
  onSave: (date: string, reason: string) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(current || todayDateKey());
  const [reason, setReason] = useState('');

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-2">
      <input
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        aria-label="New due date"
        className="rounded border border-gray-200 px-2 py-1 text-xs"
      />
      <input
        type="text"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Why did it move? (optional)"
        aria-label="Reason for the move"
        className="min-w-0 flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={() => onSave(date, reason)}
        className="rounded-full bg-brand-blue px-3 py-1 text-xs font-bold text-white hover:bg-blue-700"
      >
        Move
      </button>
      <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
        Cancel
      </button>
    </div>
  );
}

function CommitmentComposer({
  accountNames,
  onSave,
  onCancel,
}: {
  accountNames: string[];
  onSave: (input: {
    accountName: string;
    commitmentParty: CommitmentParty;
    commitmentText: string;
    dueDate: string;
    ownerLabel?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [party, setParty] = useState<CommitmentParty>('self');
  const [accountName, setAccountName] = useState('');
  const [commitmentText, setCommitmentText] = useState('');
  const [dueDate, setDueDate] = useState(todayDateKey());
  const [ownerLabel, setOwnerLabel] = useState('');

  return (
    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      {/* Three decisions and nothing else: who owes it, what, by when. */}
      <div className="flex rounded-full border border-gray-200 bg-white p-0.5">
        {(['self', 'customer', 'internal'] as CommitmentParty[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setParty(option)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              party === option ? 'bg-navy text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {partyLabels[option]}
          </button>
        ))}
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_180px_160px]">
        <input
          type="text"
          value={commitmentText}
          onChange={(event) => setCommitmentText(event.target.value)}
          placeholder="What was promised?"
          aria-label="What was promised"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <input
          type="text"
          list="commitment-account-names"
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="Customer"
          aria-label="Customer"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
        <datalist id="commitment-account-names">
          {accountNames.map((name) => <option key={name} value={name} />)}
        </datalist>
        <input
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
          aria-label="Due date"
          className="rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
      </div>

      {party !== 'self' && (
        <input
          type="text"
          value={ownerLabel}
          onChange={(event) => setOwnerLabel(event.target.value)}
          placeholder={party === 'customer' ? 'Who at the customer? (optional)' : 'Who internally? (optional)'}
          aria-label="Who owes it"
          className="mt-2 w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ accountName, commitmentParty: party, commitmentText, dueDate, ownerLabel })}
          className="rounded-full bg-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-navy/90"
        >
          Record it
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-500 hover:text-gray-800">
          Cancel
        </button>
      </div>
    </div>
  );
}
