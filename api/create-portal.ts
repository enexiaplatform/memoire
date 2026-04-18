import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken } = req.body;

  // Validate JWT
  const supabaseUser = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user || user.id !== userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
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
    return_url: `${appUrl}/app/settings/billing`,
  });

  res.json({ url: portalSession.url });
}
