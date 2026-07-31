import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';
import {
  allowedVariantIds,
  billingConfigured,
  buildCheckoutBody,
  lemonSqueezyRequest,
} from './_lemonsqueezy.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!billingConfigured()) return res.status(503).json({ error: 'Billing is not configured.' });

  const { action, userId, authToken, variantId } = req.body || {};
  const user = await verifyUserToken(authToken, userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
  const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173';

  if (action === 'checkout') {
    if (process.env.BILLING_CHECKOUT_ENABLED !== 'true') {
      return res.status(503).json({ error: 'Checkout is not enabled.' });
    }

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
