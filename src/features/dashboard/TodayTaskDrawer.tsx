import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Check, Clock, X } from 'lucide-react';
import type { SalesActivityRecord } from '../../services/salesActivityStore';
import { planWorkTone, type PlanItem } from '../../utils/weeklyPlan';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';

/**
 * A plan task on Today, opened in place.
 *
 * Today is home base, and every task on the strip used to be a link off it. The
 * measured cost of that: finishing one item meant landing on Plan, Opportunities
 * or Timeline, then navigating back to Today to reach the next one - six times
 * for a six-item day. The strip is a checklist, and a checklist you have to
 * leave to read is not one.
 *
 * So the label opens this instead. A deal item goes to the deal quick look,
 * which already exists and says more; everything else lands here: what the task
 * is, who it is for, where the wording actually lives, and one explicit link out
 * for when the operator really does want the record. Nothing here writes to the
 * source record - the tick is the only write, and it belongs to the plan.
 */

const KIND_COPY: Record<PlanItem['kind'], { label: string; detail: string }> = {
  deal: {
    label: 'Dated on a deal',
    detail: 'The next action written on the opportunity. Changing the date there moves this task.',
  },
  obligation: {
    label: 'Something you owe',
    detail: 'A payment or supplier commitment. It moves when the quote or expense behind it moves.',
  },
  capture: {
    label: 'From a captured touch',
    detail: 'You wrote this next action down when you logged the touch. The touch is the record.',
  },
  personal: {
    label: 'Typed onto your plan',
    detail: 'You put this on the day yourself. This task is the record - there is nothing behind it.',
  },
};

export function TodayTaskDrawer({
  item,
  activity,
  onToggleDone,
  onClose,
}: {
  item: PlanItem;
  /** The touch a capture item came from, when it is still in the workspace. */
  activity?: SalesActivityRecord;
  onToggleDone: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const StateIcon = item.done ? Check : item.overdue ? AlertTriangle : Clock;
  const stateTone = item.done
    ? 'bg-emerald-50 text-emerald-700'
    : item.overdue
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  const stateLabel = item.done ? 'Done' : item.overdue ? 'Overdue' : 'Open';
  const kind = KIND_COPY[item.kind];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Close task detail" onClick={onClose} className="absolute inset-0 bg-navy/40" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Task detail"
        className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-blue">On your plan today</p>
            <h2 className="mt-1 break-words text-lg font-bold leading-6 text-navy">{item.label}</h2>
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

        <div className="flex-1 space-y-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${stateTone}`}>
              <StateIcon className="h-3.5 w-3.5" />
              {stateLabel}
            </span>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">
              {formatSafeBusinessDate(item.date)}
            </span>
            {item.tag && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${planWorkTone(item)}`}>{item.tag}</span>
            )}
          </div>

          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Where this came from</h3>
            <div className="mt-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <p className="text-sm font-bold text-navy">{kind.label}</p>
              <p className="mt-1 text-xs leading-5 text-gray-600">{kind.detail}</p>
            </div>
          </section>

          {/* The touch's own words. A capture item's label is the first sentence
              of a next action that was often a paragraph, and reading the rest of
              it used to cost a trip to Timeline. */}
          {activity && (
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400">The touch behind it</h3>
              <div className="mt-2 space-y-2 rounded-lg border border-gray-100 p-3">
                <p className="text-xs font-semibold text-gray-500">
                  {formatSafeBusinessDate(activity.activityDate)} · {activity.activityType}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                  {activity.summary || activity.rawNote || 'No summary was written.'}
                </p>
                {activity.nextAction && (
                  <p className="rounded bg-blue-50/60 px-2.5 py-1.5 text-xs leading-5 text-brand-blue">
                    <span className="font-bold">Next action written down:</span> {activity.nextAction}
                  </p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleDone}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${
                item.done
                  ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                  : 'bg-navy text-white hover:bg-navy/90'
              }`}
            >
              <Check className="h-4 w-4" />
              {item.done ? 'Mark not done' : 'Mark done'}
            </button>
            {item.href && (
              <Link
                to={item.href}
                data-quick-look-exempt="true"
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Open the record
                <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-400">
            Ticking here ticks the same box on Plan. It never writes back onto the deal - only a captured touch moves that.
          </p>
        </div>
      </aside>
    </div>
  );
}
