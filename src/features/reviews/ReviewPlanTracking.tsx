import { Link } from 'react-router-dom';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { confirmedReviewOutcome, planItemHref, reviewPlanStatusLabels } from '../../utils/reviewPlanStatus';
import type { PlanStatus } from './useReviewPlanStatus';

export function ReviewPlanTracking({ status, scope, onRetry }: { status: PlanStatus; scope: string; onRetry: () => void }) {
  if (status.state === 'ready' && status.rows.length === 0) return null;
  return (
    <section aria-label="Review follow-ups in Plan" className="rounded-panel border border-line p-4">
      <h2 className="text-sm font-bold text-ink">Review follow-ups in Plan</h2>
      {status.state === 'loading' && <p role="status" className="mt-2 text-sm text-muted">Checking Plan items…</p>}
      {status.state === 'unavailable' && <div className="mt-2 text-sm">
        <p role="alert">Plan status unavailable.</p>
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-brand-blue underline">Retry Plan status</button>
      </div>}
      {status.state === 'ready' && <ul className="mt-2 divide-y divide-line">
        {status.rows.map(row => {
          const activity = row.activity_evidence;
          const outcome = confirmedReviewOutcome(activity);
          return (
          <li key={row.item_id} className="space-y-2 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-ink">{row.label}</p>
              <p className="text-xs text-muted">{formatSafeBusinessDate(row.plan_date)} · {reviewPlanStatusLabels[row.completion_status]}</p>
            </div>
            {activity && <div className="text-sm">
              <p className="font-semibold text-ink">Verified Activity</p>
              <p className="text-muted">{formatSafeBusinessDate(activity.date)} · {activity.type?.trim() || 'Type unavailable'}</p>
              {activity.summary?.trim() && <p className="whitespace-pre-wrap break-words text-ink">{activity.summary}</p>}
            </div>}
            {outcome ? <div className="text-sm">
              <p className="font-semibold text-ink">Confirmed opportunity outcome · {outcome.result} · {formatSafeBusinessDate(outcome.date)}</p>
              <p className="whitespace-pre-wrap break-words text-muted">{outcome.reason}</p>
            </div> : <p className="text-sm text-muted">Outcome not yet confirmed</p>}
            <div className="flex flex-wrap gap-x-4 text-sm font-semibold text-brand-blue">
              <Link to={planItemHref(row.item_id, row.plan_date)} state={{ planItemScope: scope }}
                className="inline-flex min-h-11 items-center underline">
                Open in Plan<span className="sr-only"> · {row.label}</span>
              </Link>
              {row.completion_status === 'verified_done' && row.activity_id && (
                <Link to={`/app/timeline?view=history&activityId=${encodeURIComponent(row.activity_id)}`}
                  className="inline-flex min-h-11 items-center underline">View linked Activity<span className="sr-only"> · {row.label}</span></Link>
              )}
              {activity?.opportunity_id && <Link to={'/app/opportunities?' + new URLSearchParams({ opportunityId: activity.opportunity_id })}
                className="inline-flex min-h-11 items-center underline">
                Open related opportunity<span className="sr-only"> · {activity.opportunity_name || row.label}</span>
              </Link>}
            </div>
          </li>
          );
        })}
      </ul>}
    </section>
  );
}
