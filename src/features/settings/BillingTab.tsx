import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '../../auth/authContext';
import { useEntitlement } from '../../hooks/useEntitlement';
import { describeTrialRemaining, TRIAL_DAYS, type Entitlement } from '../../utils/entitlement';
import {
  fetchBillingStatus,
  openBillingPortal,
  startCheckout,
  type BillingPlan,
  type BillingStatus,
} from '../../lib/billing';

/**
 * What the operator is paying for, and the one place they can change it.
 *
 * Lemon Squeezy is the merchant of record, so almost nothing happens here: a
 * plan is chosen, Lemon Squeezy takes the payment on its own hosted page, and a
 * webhook decides the tier. Cards, invoices, receipts and cancellation all live
 * in Lemon Squeezy's portal, which is why the only other control is a link into
 * it rather than a form.
 *
 * This tab is the checkout entry point, not `/pricing`. The public pricing page
 * still quotes a range rather than a price, and the commercial release gate
 * holds it there until an offer is actually selected.
 */

const PLAN_COPY: Record<BillingPlan, { name: string; description: string }> = {
  personal: {
    name: 'Personal',
    // Not "AI search". Memoire has no AI service - Search & Insights answers
    // from your own history on your own device, and selling it as AI would be
    // charging for something that does not exist.
    description: 'Unlimited capture, unlimited records, and Search & Insights across everything you have written down.',
  },
  team: {
    name: 'Team',
    description: 'Everything in Personal, for a workspace shared with the people you sell alongside.',
  },
};

/**
 * The one line at the top of the tab. Every branch is a state Lemon Squeezy can
 * actually report, so none of them can be reached by a bug in this file alone.
 */
function planHeadline(entitlement: Entitlement, status: BillingStatus): string {
  switch (entitlement.state) {
    case 'trial':
      return `Free trial · ${describeTrialRemaining(entitlement)}`;
    case 'paid':
      return PLAN_COPY[status.tier as BillingPlan]?.name ?? 'Subscribed';
    case 'needs_trial':
      return 'No subscription';
    case 'legacy':
      return 'Early access';
    default:
      return 'No subscription';
  }
}

function planDetail(entitlement: Entitlement): string {
  if (entitlement.endingSoon) {
    return 'Cancelled. You keep everything until the period you have already paid for runs out.';
  }
  switch (entitlement.state) {
    case 'trial':
      return `Full access. Your card is charged on ${formatTrialEnd(entitlement.trialEndsAt)} unless you cancel before then, and cancelling during the trial costs nothing.`;
    case 'paid':
      return 'Active. Unlimited capture, unlimited records, and Search & Insights.';
    case 'needs_trial':
      return 'Capture and Search & Insights are paused. Everything you already wrote down stays readable and exportable.';
    case 'legacy':
      return 'You joined before Memoire started charging, so your workspace is open while we sort out a plan with you.';
    default:
      return 'Nothing is being charged for this workspace.';
  }
}

/** "16 August 2026" - long form, because a trial end date is worth being unambiguous about. */
function formatTrialEnd(iso: string | null) {
  if (!iso) return 'the end of your trial';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'the end of your trial';
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function BillingTab() {
  const { isAuthenticated } = useAuthContext();
  const entitlement = useEntitlement();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string>('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!isAuthenticated) {
      setLoading(false);
      return () => { active = false; };
    }
    void fetchBillingStatus()
      .then((result) => { if (active) setStatus(result); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <Panel>
        <p className="max-w-xl text-sm leading-6 text-gray-500">
          You are working in this browser without an account, so there is nothing to bill. Everything here stays on this
          device until you sign in.
        </p>
      </Panel>
    );
  }

  if (loading) {
    return (
      <Panel>
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking your plan...
        </p>
      </Panel>
    );
  }

  // Null means this deployment has no Lemon Squeezy credentials at all, which
  // is a deployment fact rather than something the operator can act on. Saying
  // so plainly beats an upgrade button that would 503.
  if (!status) {
    return (
      <Panel>
        <p className="max-w-xl text-sm leading-6 text-gray-500">
          Paid plans are not set up on this deployment. Every feature you can see is yours to use, and nothing here will
          ask you for a card.
        </p>
      </Panel>
    );
  }

  const paid = status.tier === 'personal' || status.tier === 'team';
  const run = async (name: string, work: () => Promise<void>) => {
    setBusyAction(name);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusyAction('');
    }
  };

  return (
    <Panel>
      <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Current plan</p>
        <p className="mt-1 text-lg font-bold text-navy">{planHeadline(entitlement, status)}</p>
        {/* Cancelling is not the same as losing access: the period is paid for.
            The webhook keeps the tier until Lemon Squeezy sends the expiry, so
            this screen has to say the same thing or it reads as a bug. */}
        <p className={`mt-1 text-sm leading-6 ${entitlement.endingSoon ? 'text-amber-800' : 'text-gray-500'}`}>
          {planDetail(entitlement)}
        </p>
      </div>

      {!paid && status.plans.length > 0 && (
        <div className="mt-5 space-y-3">
          {status.checkoutEnabled ? (
            status.plans.map((plan) => (
              <div key={plan} className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-navy">{PLAN_COPY[plan].name}</p>
                  <p className="mt-1 max-w-md text-sm leading-6 text-gray-500">{PLAN_COPY[plan].description}</p>
                  <p className="mt-1 max-w-md text-xs leading-5 text-gray-400">
                    {TRIAL_DAYS} days free first. Your card is taken now and charged when the trial ends —
                    cancel before then and nothing is taken.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => { void run(plan, () => startCheckout(plan)); }}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy/90 disabled:opacity-50"
                >
                  {busyAction === plan && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busyAction === plan
                    ? 'Opening checkout...'
                    : `Start ${TRIAL_DAYS}-day free trial`}
                </button>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-gray-200 px-4 py-3 text-sm leading-6 text-gray-500">
              Paid plans are configured but checkout is not open yet, so your workspace stays fully open until it is.
              Nothing gets locked behind a button you cannot press.
            </p>
          )}
          <p className="text-[11px] leading-5 text-gray-400">
            Payment is taken by Lemon Squeezy, which is the seller on your invoice and handles tax where you are.
            Memoire never sees your card.
          </p>
        </div>
      )}

      {status.hasBillingAccount && (
        <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-navy">Payment method, invoices and cancellation</p>
            <p className="mt-1 max-w-md text-sm leading-6 text-gray-500">
              All of it lives in Lemon Squeezy's portal. The link is issued fresh each time and expires, so it is not
              one you can bookmark.
            </p>
          </div>
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={() => { void run('portal', openBillingPortal); }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {busyAction === 'portal' && <Loader2 className="h-4 w-4 animate-spin" />}
            {busyAction === 'portal' ? 'Opening...' : 'Manage billing'}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
    </Panel>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-navy">Plan &amp; billing</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">
        What you are on, and what it costs. Payment is handled by Lemon Squeezy.
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
