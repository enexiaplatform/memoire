import { Check, NotebookPen, X } from 'lucide-react';
import type { PlanItem } from '../../utils/weeklyPlan';
import {
  ACTIVITY_CHANNELS,
  activityChannelSpec,
  type ActivityChannel,
} from '../../utils/activityChannel';

export type LogToActivityDraft = {
  item: PlanItem;
  note: string;
  enabled: boolean;
  /**
   * How the work happened. Seeded from the channel planned on the item, so a
   * line written as an on-site visit does not have to be re-declared on the way
   * out, and overridable because the day is allowed to have gone differently.
   */
  channel: ActivityChannel | '';
};

export type LogToActivityState = 'idle' | 'saving' | 'saved';

/**
 * The offer to write down what actually happened, made at the moment a box is
 * ticked.
 *
 * Lives here rather than beside either caller because both Today's commitment
 * strip and the Plan board present it, and it is the same offer: same wording,
 * same opt-in, same warning about what the record will and will not reach. Two
 * copies would drift, and the surface with the older copy would quietly promise
 * something different about where the operator's note went.
 *
 * Opt-in, not automatic. A tick means "done", not "and here is a paragraph
 * about it", and minting an activity from every checkbox is how a ledger fills
 * with rows that record a click and nothing else.
 */
export function LogToActivityBox({
  draft,
  state,
  message,
  onToggleEnabled,
  onChangeNote,
  onChangeChannel,
  onSave,
  onDismiss,
  indentClassName = 'ml-9',
}: {
  draft: LogToActivityDraft;
  state: LogToActivityState;
  message: string;
  onToggleEnabled: (enabled: boolean) => void;
  onChangeNote: (note: string) => void;
  onChangeChannel: (channel: ActivityChannel | '') => void;
  onSave: () => void;
  onDismiss: () => void;
  /**
   * How far in to sit under the row that opened it. Today's strip has a wide
   * checkbox gutter; the Plan board's day column has almost none, and borrowing
   * Today's indent there would push the box off the side of the column.
   */
  indentClassName?: string;
}) {
  if (state === 'saved') {
    return (
      <div className={`${indentClassName} mt-1 flex items-center justify-between gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2`}>
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {message}
        </p>
        <button type="button" onClick={onDismiss} className="shrink-0 rounded-full p-1 text-emerald-700 hover:bg-emerald-100" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`${indentClassName} mt-1 rounded-lg border border-gray-200 bg-white px-3 py-2`}>
      <div className="flex items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => onToggleEnabled(event.target.checked)}
            className="h-3.5 w-3.5 shrink-0"
          />
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700">
            <NotebookPen className="h-3.5 w-3.5 text-brand-blue" />
            Log what you did to Activity
          </span>
        </label>
        <button type="button" onClick={onDismiss} className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Dismiss">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {draft.enabled && (
        <div className="mt-2 space-y-2">
          <textarea
            value={draft.note}
            onChange={(event) => onChangeNote(event.target.value)}
            rows={2}
            autoFocus
            placeholder="What actually happened, and what they asked for next."
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
          />
          {/* How it happened, asked here because this is the last moment the
              operator remembers. It is the one field nothing else can recover
              later: the note may or may not contain the word "visit", and a
              month of touches with no channel on them cannot be told apart
              afterwards however carefully they were written. */}
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">How</span>
            <select
              value={draft.channel}
              onChange={(event) => onChangeChannel((event.target.value || '') as ActivityChannel | '')}
              className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/10"
            >
              <option value="">Not stated</option>
              {ACTIVITY_CHANNELS.map((spec) => (
                <option key={spec.channel} value={spec.channel}>{spec.channel}</option>
              ))}
            </select>
            {activityChannelSpec(draft.channel) && (
              <span className="mt-0.5 block text-[11px] leading-4 text-gray-400">
                {activityChannelSpec(draft.channel)?.hint}
              </span>
            )}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={state === 'saving' || draft.note.trim().length === 0}
              className="rounded-full bg-navy px-3 py-1.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'saving' ? 'Saving...' : 'Save to Activity'}
            </button>
            {/* Only a customer-facing task produces a customer-facing touch, so
                only that one gets the warning. Printing it over an internal
                task would train the operator to ignore it. */}
            <p className="text-[11px] leading-4 text-gray-400">
              {draft.item.workKind === 'customer'
                ? `Counts as a touch on ${draft.item.tag || 'this customer'}, so the going-silent watch sees it.`
                : 'Recorded as internal work. This task names no customer, so no deal moves.'}
            </p>
          </div>
          {message && <p className="text-[11px] font-semibold text-amber-700">{message}</p>}
        </div>
      )}
    </div>
  );
}
