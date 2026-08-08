import { supabase } from './supabase';
import { isDemoMode, isSupabaseConfigured } from './demoMode';

/**
 * The browser's half of the Lemon Squeezy relationship.
 *
 * It is deliberately thin. Lemon Squeezy is the merchant of record and mints
 * its checkout as a hosted URL, so there is no payment SDK here, no publishable
 * key, and no variant id: this file names a *plan* and `/api/billing` decides
 * which variant that is. A billing credential reaching this bundle would be a
 * real regression, and the paid-readiness contract fails the build over it.
 */

export type BillingPlan = 'personal' | 'team';

export type BillingStatus = {
  /** Whether the deployment has BILLING_CHECKOUT_ENABLED=true. */
  checkoutEnabled: boolean;
  /** Plans the store actually has a variant configured for. */
  plans: BillingPlan[];
  tier: string;
  status: string;
  hasBillingAccount: boolean;
};

async function callBilling(action: string, extra: Record<string, unknown> = {}) {
  if (isDemoMode || !isSupabaseConfigured) return { unavailable: true as const };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user?.id) return { unavailable: true as const };

  const response = await fetch('/api/billing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      userId: session.user.id,
      authToken: session.access_token,
      ...extra,
    }),
  });

  // Nobody pressed anything to get here, so a failure is not news. A deployment
  // with no Lemon Squeezy keys answers 503, and a dev server with no functions
  // behind it answers with the index page; both mean the same thing to this
  // screen - there is no billing to show - and neither is worth an alert. A
  // checkout or portal call below did come from a button, and does report.
  if (!response.ok && action === 'status') return { unavailable: true as const };

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
      ? body.error
      : 'Billing is unavailable right now. Please try again.';
    throw new Error(message);
  }
  return { unavailable: false as const, body };
}

/** Returns null when billing is not configured for this deployment. */
export async function fetchBillingStatus(): Promise<BillingStatus | null> {
  const result = await callBilling('status');
  if (result.unavailable) return null;
  // A 200 that is not the JSON we expect is still nothing to render.
  const body = result.body as Partial<BillingStatus> | null;
  if (!body || typeof body !== 'object' || !Array.isArray(body.plans)) return null;
  return body as BillingStatus;
}

/**
 * Sends the operator to Lemon Squeezy's hosted checkout.
 *
 * The redirect is a full navigation rather than a popup: the checkout is a page
 * on someone else's domain that ends by coming back to us, and a blocked popup
 * would leave the operator looking at a button that did nothing.
 */
export async function startCheckout(plan: BillingPlan): Promise<void> {
  const result = await callBilling('checkout', { plan });
  if (result.unavailable) throw new Error('Billing is not available in this workspace.');
  const url = (result.body as { url?: string })?.url;
  if (!url) throw new Error('Checkout could not be started.');
  window.location.assign(url);
}

/** Opens Lemon Squeezy's customer portal - where cards, invoices and cancellation live. */
export async function openBillingPortal(): Promise<void> {
  const result = await callBilling('portal');
  if (result.unavailable) throw new Error('Billing is not available in this workspace.');
  const url = (result.body as { url?: string })?.url;
  if (!url) throw new Error('Billing portal is unavailable.');
  window.location.assign(url);
}
