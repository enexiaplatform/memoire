import { Link } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { formatSafeBusinessDate } from '../../utils/safeDate';
import { confirmedReviewOutcome, planItemHref, requiresLegacyReviewLookup, reviewOutcomeGap, reviewPendingFollowUp, reviewPlanStatusLabels } from '../../utils/reviewPlanStatus';
import type { PlanStatus } from './useReviewPlanStatus';
import type { SalesWorkspaceData } from '../../services/workspaceData';
import { findPossibleReviewFollowUps } from '../../utils/legacyReviewFollowUps';

export function ReviewPlanTracking({ status, scope, ownerId, workspace, returnItemId, onRetry }: {
  status: PlanStatus; scope: string; ownerId: string; workspace: SalesWorkspaceData | null; returnItemId?: string; onRetry: () => void;
}) {
  const returnTitle = useRef<HTMLParagraphElement>(null);
  const focusedItem = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (returnItemId && returnTitle.current && focusedItem.current !== returnItemId) {
      returnTitle.current.focus();
      focusedItem.current = returnItemId;
    }
  }, [returnItemId, status.state]);
  if (status.state === 'ready' && status.rows.length === 0) return null;
  const legacy = status.state === 'ready' ? status.legacy : undefined;
  const possibleFollowUps = status.state === 'ready' && status.legacy.state === 'ready' && workspace
    ? findPossibleReviewFollowUps(status.rows, status.legacy.plans, workspace, ownerId) : null;
  return (
    <section aria-label="Review follow-ups in Plan" className="rounded-panel border border-line p-4">
      <h2 className="text-sm font-bold text-ink">Review follow-ups in Plan</h2>
      {status.state === 'loading' && <p role="status" className="mt-2 text-sm text-muted">Checking Plan items…</p>}
      {status.state === 'unavailable' && <div className="mt-2 text-sm">
        <p role="alert">Plan status unavailable.</p>
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-brand-blue underline">Retry Plan status</button>
      </div>}
      {legacy?.state === 'loading' && <p role="status" className="mt-2 text-sm text-muted">Checking possible follow-ups…</p>}
      {legacy?.state === 'unavailable' && <div className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-muted">
        <p role="status">Possible follow-ups could not be checked.</p>
        <button type="button" onClick={onRetry} className="min-h-11 font-semibold text-brand-blue underline">
          Retry possible follow-ups
        </button>
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
          const possible = possibleFollowUps?.get(row.item_id);
          return (
          <li key={row.item_id} className="space-y-2 py-3">
            <div className="min-w-0">
              <p ref={row.item_id === returnItemId ? returnTitle : undefined}
                tabIndex={row.item_id === returnItemId ? -1 : undefined}
                className="break-words text-sm font-semibold text-ink">{row.label}</p>
              <p className="text-xs text-muted">{formatSafeBusinessDate(row.plan_date)} · {reviewPlanStatusLabels[row.completion_status]}</p>
            </div>
            {activity && <div className="text-sm">
              <p className="font-semibold text-ink">Verified Activity</p>
              <p className="text-muted">{formatSafeBusinessDate(activity.date)} · {activity.type?.trim() || 'Type unavailable'}</p>
              {activity.summary?.trim() && <p className="whitespace-pre-wrap break-words text-ink">{activity.summary}</p>}
            </div>}
            {possible && <div className="rounded-lg border border-line p-3 text-sm">
              <p className="font-semibold text-ink">Possible existing follow-up</p>
              <p className="text-muted">{possible.length > 1
                ? 'Multiple Plan items could match. Open one to check which concerns this opportunity.'
                : 'The account and wording match. Open the Plan item to check whether it concerns this opportunity.'}</p>
              <ul>
                {possible.map(item => <li key={item.id}>
                  <Link to={planItemHref(item.id, item.date)} state={{ planItemScope: scope }}
                    className="inline-flex min-h-11 flex-wrap items-center gap-x-2 font-semibold text-brand-blue underline">
                    <span className="break-words">{item.label}</span>
                    <span className="text-muted">{formatSafeBusinessDate(item.date)} · Planned</span>
                  </Link>
                </li>)}
              </ul>
            </div>}
            {outcome ? <div className="text-sm">
              <p className="font-semibold text-ink">Confirmed opportunity outcome · {outcome.result} · {formatSafeBusinessDate(outcome.date)}</p>
              <p className="whitespace-pre-wrap break-words text-muted">{outcome.reason}</p>
            </div> : <div className="text-sm text-muted">
              <p className="font-semibold text-ink">Outcome not yet confirmed</p>
              {gap && <p>{gap}</p>}
              {followUp && <p>A Plan item is already open for this opportunity.</p>}
              {canCapture && (!requiresLegacyReviewLookup(row) || legacy?.state === 'ready') &&
                <p>Capture a follow-up when you have a new update.</p>}
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
              {canCapture && <Link to={`/app/capture?mode=quick&${opportunityQuery}`}
                state={{ reviewOpportunityOwner: ownerId, reviewReturn: { scope, itemId: row.item_id } }}
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
