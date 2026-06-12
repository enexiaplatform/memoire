import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Billing is not configured.' });

  const { userId, authToken } = req.body;
  if (!await verifyUserToken(authToken, userId)) return res.status(401).json({ error: 'Unauthorized' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found' });
  }

  const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173';

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${appUrl}/app/settings`,
  });

  res.json({ url: portalSession.url });
}
