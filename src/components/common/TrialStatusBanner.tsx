import { Link } from 'react-router-dom';
import { Clock, Lock } from 'lucide-react';
import { useEntitlement } from '../../hooks/useEntitlement';
import { describeTrialRemaining, TRIAL_DAYS } from '../../utils/entitlement';

/**
 * What the subscription is doing, said once, at the top of the workspace.
 *
 * Quiet by default. A banner that shouts from day one trains people to stop
 * reading it by day three, which is exactly when it starts mattering - so a
 * trial says nothing until its last two days, and a healthy subscription says
 * nothing at all.
 *
 * The two loud states are honest in opposite directions. `needs_trial` is a
 * closed door and says so, with the one control that opens it. A trial ending
 * is *not* a closed door - the card on file will simply be charged - so it says
 * that plainly rather than implying anything is about to be taken away.
 */
export function TrialStatusBanner() {
  const entitlement = useEntitlement();

  if (entitlement.state === 'needs_trial') {
    return (
      <div role="status" className="border-b border-red-200 bg-red-50 px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm leading-6 text-red-900">
            <Lock className="mt-0.5 h-4 w-4 flex-none" />
            <span>
              <span className="font-bold">Start your {TRIAL_DAYS}-day free trial to capture.</span>{' '}
              Everything already in your workspace stays readable and exportable — capturing and
              Search &amp; Insights need an active subscription.
            </span>
          </p>
          <Link
            to="/app/settings?tab=billing"
            className="inline-flex flex-none items-center justify-center rounded-full bg-red-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-800"
          >
            Start free trial
          </Link>
        </div>
      </div>
    );
  }

  // The last stretch of a trial, when the next thing that happens is a charge.
  if (entitlement.state !== 'trial' || entitlement.daysLeft > 2) return null;

  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-sm leading-6 text-amber-900">
          <Clock className="h-4 w-4 flex-none" />
          <span>
            <span className="font-bold">{describeTrialRemaining(entitlement)}</span> of your free trial.
            Your card is charged when it ends — cancel before then and nothing is taken.
          </span>
        </p>
        <Link
          to="/app/settings?tab=billing"
          className="inline-flex flex-none items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-1.5 text-sm font-bold text-amber-900 transition hover:bg-amber-100"
        >
          Manage plan
        </Link>
      </div>
    </div>
  );
}
