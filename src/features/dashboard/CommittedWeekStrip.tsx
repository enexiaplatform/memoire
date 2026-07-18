import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  MAX_WEEKLY_COMMITMENTS,
  resolveCommitmentItem,
  type WeeklyCommitmentSnapshot,
} from '../../utils/weeklyCommitment';
import {
  getWeeklyCommitmentForWeek,
  loadWeeklyCommitmentsForWorkspace,
  saveWeeklyCommitment,
} from '../../services/weeklyCommitmentStore';
import { getCurrentPipelineReviewWeekId } from '../../utils/pipelineReviewHabit';
import { trackProductEvent } from '../../utils/productAnalytics';
import { formatSafeBusinessDate } from '../../utils/safeDate.ts';

/**
 * The third touchpoint of the weekly commitment loop: what you said you'd do,
 * visible during the week rather than only at planning and review time.
 *
 * Deliberately thin. It reads the snapshot the review froze and lets an item be
 * ticked off; it never re-derives, re-ranks, or re-words a commitment, because
 * the whole point of the snapshot is that the promise stops moving once it is
 * made. Carried-over and dropped resolutions stay on the review, where the user
 * has the plan-vs-actual context to make that call.
 */
export function CommittedWeekStrip({
  userId,
  sampleDataActive,
}: {
  userId?: string;
  sampleDataActive: boolean;
}) {
  const [snapshots, setSnapshots] = useState<WeeklyCommitmentSnapshot[]>([]);

  const weekId = useMemo(() => getCurrentPipelineReviewWeekId(), []);
  const snapshot = useMemo(() => getWeeklyCommitmentForWeek(weekId, snapshots), [snapshots, weekId]);

  useEffect(() => {
    let active = true;
    void loadWeeklyCommitmentsForWorkspace(userId, sampleDataActive).then((loaded) => {
      if (active) setSnapshots(loaded);
    });
    return () => { active = false; };
  }, [sampleDataActive, userId]);

  const toggleDone = useCallback((current: WeeklyCommitmentSnapshot, itemId: string, done: boolean) => {
    setSnapshots(saveWeeklyCommitment(resolveCommitmentItem(current, itemId, done ? 'completed' : 'open')));
    trackProductEvent('weekly_commitment_resolved');
  }, []);

  // Nothing confirmed for this week is not a gap to fill with a prompt - the
  // review already owns that ask. The strip simply does not render.
  if (!snapshot || snapshot.items.length === 0) return null;

  const completed = snapshot.items.filter((item) => item.resolution === 'completed').length;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Committed this week">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-navy">
            Committed this week ({completed}/{snapshot.items.length})
          </h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Confirmed for {formatSafeBusinessDate(snapshot.periodStart)} - {formatSafeBusinessDate(snapshot.periodEnd)}.
            {snapshot.items.length < MAX_WEEKLY_COMMITMENTS ? ' Change it in the weekly review.' : ''}
          </p>
        </div>
        <Link to="/app/weekly-brief" className="text-xs font-bold text-brand-blue hover:underline">
          Open the review
        </Link>
      </div>

      <ul className="mt-3 space-y-1.5 text-xs leading-5">
        {snapshot.items.map((item) => {
          const done = item.resolution === 'completed';
          const settled = item.resolution === 'carried-over' || item.resolution === 'dropped';
          return (
            <li key={item.id}>
              <label className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 ${done ? 'bg-emerald-50' : 'bg-gray-50'} ${settled ? 'opacity-60' : ''}`}>
                <input
                  type="checkbox"
                  checked={done}
                  disabled={settled}
                  onChange={(event) => toggleDone(snapshot, item.id, event.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0">
                  <span className={`font-bold ${done ? 'text-emerald-800 line-through' : 'text-gray-900'}`}>
                    {item.label}
                  </span>
                  {item.linkedAccountName && (
                    <span className="ml-1.5 text-gray-500">{item.linkedAccountName}</span>
                  )}
                  {settled && (
                    <span className="mt-0.5 block text-gray-500">
                      {item.resolution === 'carried-over' ? 'Carried over at the review.' : 'Dropped at the review.'}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {completed === snapshot.items.length && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          Everything you committed to is done.
        </p>
      )}
    </section>
  );
}
