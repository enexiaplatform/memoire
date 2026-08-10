import { Link } from 'react-router-dom';
import { Clock, Lock } from 'lucide-react';
import { useEntitlement } from '../../hooks/useEntitlement';
import { describeTrialRemaining, TRIAL_DAYS } from '../../utils/entitlement';

/**
 * What the trial is doing, said once, at the top of the workspace.
 *
 * Deliberately quiet for most of the week and loud only at the end. A trial
 * banner that shouts on day one trains people to stop reading it by day three,
 * which is exactly when it starts mattering. So: nothing for the first stretch,
 * an amber note in the last two days, and a red one once it has closed.
 *
 * The expired state is the only one that blocks anything, and it says what
 * still works - reading and exporting - because the thing an expired trial must
 * never imply is that the work is gone.
 */
export function TrialStatusBanner() {
  const entitlement = useEntitlement();

  if (entitlement.state === 'expired') {
    return (
      <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm leading-6 text-red-900">
            <Lock className="mt-0.5 h-4 w-4 flex-none" />
            <span>
              <span className="font-bold">Your {TRIAL_DAYS}-day trial has ended.</span>{' '}
              Everything you wrote down is still here, and you can still read and export all of it — but
              capturing and Search &amp; Insights need a subscription.
            </span>
          </p>
          <Link
            to="/app/settings?tab=billing"
            className="inline-flex flex-none items-center justify-center rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800"
          >
            See plans
          </Link>
        </div>
      </div>
    );
  }

  // Quiet until the trial is nearly out. Two days is enough notice to act and
  // short enough that the banner still reads as news when it appears.
  if (entitlement.state !== 'trial' || entitlement.daysLeft > 2) return null;

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm leading-6 text-amber-900">
          <Clock className="h-4 w-4 flex-none" />
          <span>
            <span className="font-bold">{describeTrialRemaining(entitlement)}</span> of your trial.
            Subscribe to keep capturing after it ends.
          </span>
        </p>
        <Link
          to="/app/settings?tab=billing"
          className="inline-flex flex-none items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-1.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
        >
          See plans
        </Link>
      </div>
    </div>
  );
}
