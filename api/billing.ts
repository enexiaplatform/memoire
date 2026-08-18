import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import {
  allowedVariantIds,
  billingConfigured,
  buildCheckoutBody,
  lemonSqueezyRequest,
  purchasablePlans,
  variantIdForPlan,
} from './_lemonsqueezy.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!billingConfigured()) return res.status(503).json({ error: 'Billing is not configured.' });

  const { action, userId: claimedUserId, authToken, plan } = req.body || {};
  const user = await verifyUserToken(authToken, claimedUserId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Everything below runs with the service-role key, which has no RLS to fall
  // back on. The id it filters by is therefore the one the token proved, never
  // the one the body asserted - they are equal by the check above, and reading
  // the proven one means they stay equal if that check is ever loosened.
  const userId = user.id;

  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
  const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173';

  // What the billing screen renders from. Everything it needs to decide whether
  // to offer a plan, and what to say if it cannot, in one round trip - so the UI
  // never shows a buy button that the checkout guard below would refuse.
  if (action === 'status') {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription_tier, subscription_status, lemonsqueezy_customer_id, lemonsqueezy_subscription_id')
      .eq('id', userId)
      .single();

    return res.json({
      checkoutEnabled: process.env.BILLING_CHECKOUT_ENABLED === 'true',
      plans: purchasablePlans(),
      tier: profile?.subscription_tier || 'free',
      status: profile?.subscription_status || 'free',
      hasBillingAccount: Boolean(
        profile?.lemonsqueezy_subscription_id || profile?.lemonsqueezy_customer_id,
      ),
    });
  }

  if (action === 'checkout') {
    if (process.env.BILLING_CHECKOUT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Checkout is not enabled.' });
    }

    // A card cannot be taken against terms that name no counterparty.
    //
    // The Terms of Service said what the service costs and who was liable
    // without ever saying who "we" is - see src/config/legalEntity.ts. That is
    // fixable while nobody has paid and unfixable afterwards, because it is
    // wrong at the moment of every sale made under it. So the flag that opens
    // checkout is no longer sufficient on its own: the entity has to be named
    // too, and forgetting produces a refusal here rather than a customer.
    if (!(process.env.LEGAL_ENTITY_NAME || '').trim()) {
      return res.status(503).json({
        error: 'Checkout is closed until the operating entity is named in the Terms of Service.',
      });
    }

    // The client names a plan, never a variant id - it has no way to know one.
    // Resolving it here keeps the store's configuration server-side, and the
    // allow-list below still decides, so an unconfigured plan cannot be bought.
    const variantId = variantIdForPlan(plan);
    const allowedVariants = allowedVariantIds();
    if (!variantId || !allowedVariants.includes(String(variantId))) {
      return res.status(400).json({ error: 'Invalid price.' });
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();

    try {
      // Lemon Squeezy creates the customer itself at payment time, so there is
      // nothing to provision here first. The account link travels as custom
      // data and comes back on every webhook.
      const checkout = await lemonSqueezyRequest('/checkouts', {
        method: 'POST',
        body: buildCheckoutBody({
          storeId: process.env.LEMONSQUEEZY_STORE_ID,
          variantId,
          userId,
          email: profile?.email || user.email,
          redirectUrl: `${appUrl}/app/capture?upgrade=success`,
        }),
      });

      const url = checkout?.data?.attributes?.url;
      if (!url) return res.status(502).json({ error: 'Checkout could not be started.' });
      return res.json({ url });
    } catch {
      return res.status(502).json({ error: 'Checkout could not be started.' });
    }
  }

  if (action === 'portal') {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('lemonsqueezy_customer_id, lemonsqueezy_subscription_id')
      .eq('id', userId)
      .single();

    if (!profile?.lemonsqueezy_subscription_id && !profile?.lemonsqueezy_customer_id) {
      return res.status(400).json({ error: 'No billing account found' });
    }

    try {
      // The portal link is issued signed and short-lived by Lemon Squeezy, so
      // it is fetched per request rather than stored.
      const resource = profile.lemonsqueezy_subscription_id
        ? await lemonSqueezyRequest(`/subscriptions/${profile.lemonsqueezy_subscription_id}`)
        : await lemonSqueezyRequest(`/customers/${profile.lemonsqueezy_customer_id}`);

      const url = resource?.data?.attributes?.urls?.customer_portal;
      if (!url) return res.status(502).json({ error: 'Billing portal is unavailable.' });
      return res.json({ url });
    } catch {
      return res.status(502).json({ error: 'Billing portal is unavailable.' });
    }
  }

  return res.status(400).json({ error: 'Invalid billing action.' });
}
