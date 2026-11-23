import { Link } from 'react-router-dom';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { confirmedReviewOutcome, planItemHref, reviewOutcomeGap, reviewPendingFollowUp, reviewPlanStatusLabels } from '../../utils/reviewPlanStatus';
import type { PlanStatus } from './useReviewPlanStatus';

export function ReviewPlanTracking({ status, scope, ownerId, onRetry }: { status: PlanStatus; scope: string; ownerId: string; onRetry: () => void }) {
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
          const gap = activity && !outcome ? reviewOutcomeGap(activity) : null;
          const followUp = activity && !outcome ? reviewPendingFollowUp(activity) : null;
          const opportunity = activity?.opportunity_id;
          const opportunityQuery = opportunity ? new URLSearchParams({ opportunityId: opportunity }) : null;
          const canCapture = opportunity && !outcome && !followUp && activity.outcome_state === 'open';
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
            </div> : <div className="text-sm text-muted">
              <p className="font-semibold text-ink">Outcome not yet confirmed</p>
              {gap && <p>{gap}</p>}
              {followUp && <p>A Plan item is already open for this opportunity.</p>}
              {canCapture && <p>Capture a follow-up when you have a new update.</p>}
            </div>}
            <div className="flex flex-wrap gap-x-4 text-sm font-semibold text-brand-blue">
              <Link to={planItemHref(row.item_id, row.plan_date)} state={{ planItemScope: scope }}
                className="inline-flex min-h-11 items-center underline">
                Open in Plan<span className="sr-only"> · {row.label}</span>
              </Link>
              {row.completion_status === 'verified_done' && row.activity_id && (
                <Link to={`/app/timeline?view=history&activityId=${encodeURIComponent(row.activity_id)}`}
                  state={{ reviewActivityOwner: ownerId }}
                  className="inline-flex min-h-11 items-center underline">View linked Activity<span className="sr-only"> · {row.label}</span></Link>
              )}
              {opportunityQuery && <Link to={`/app/opportunities?${opportunityQuery}`}
                state={{ reviewOpportunityOwner: ownerId }}
                className="inline-flex min-h-11 items-center underline">
                Open related opportunity<span className="sr-only"> · {activity?.opportunity_name || row.label}</span>
              </Link>}
              {opportunityQuery && (activity?.has_outcome_evidence === true || activity?.outcome_state === 'unrecorded') &&
                <Link to={`/app/opportunities?${opportunityQuery}&reviewOutcome=1`} state={{ reviewOpportunityOwner: ownerId }}
                  className="inline-flex min-h-11 items-center underline">
                  {activity.has_outcome_evidence === true ? 'Review existing outcome evidence' : 'Open outcome recording'}
                  <span className="sr-only"> · {row.label}</span>
                </Link>}
              {followUp && <Link to={planItemHref(followUp.id, followUp.date)} state={{ planItemScope: scope }}
                className="inline-flex min-h-11 items-center underline">
                Open existing follow-up Plan item<span className="sr-only"> · {row.label}</span>
              </Link>}
              {canCapture && <Link to={`/app/capture?mode=quick&${opportunityQuery}`} state={{ reviewOpportunityOwner: ownerId }}
                className="inline-flex min-h-11 items-center underline">
                Capture a follow-up Activity<span className="sr-only"> · {row.label}</span>
              </Link>}
              {activity?.outcome_state === 'unavailable' &&
                <button type="button" onClick={onRetry} className="min-h-11 underline">Refresh Plan status</button>}
            </div>
          </li>
          );
        })}
      </ul>}
    </section>
  );
}
