import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyUserToken } from './_auth.js';
import { getSupabaseServiceRoleKey, getSupabaseUrl } from './_env.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Billing is not configured.' });

  const { userId, authToken, priceId } = req.body;
  if (!userId || !authToken || !priceId) {
    return res.status(400).json({ error: 'Missing params' });
  }
  const allowedPriceIds = [process.env.STRIPE_PERSONAL_PRICE_ID, process.env.STRIPE_TEAM_PRICE_ID].filter(Boolean);
  if (!allowedPriceIds.includes(priceId)) return res.status(400).json({ error: 'Invalid price.' });
  const user = await verifyUserToken(authToken, userId);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey());

  // Get or create Stripe customer
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id, email')
    .eq('id', userId)
    .single();

  let customerId = profile?.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email || user.email,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    await supabase
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  const appUrl = process.env.VITE_APP_URL || 'http://localhost:5173';

  // Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: `${appUrl}/app/capture?upgrade=success`,
    cancel_url: `${appUrl}/pricing?upgrade=cancelled`,
    metadata: { supabase_user_id: userId },
    subscription_data: {
      metadata: { supabase_user_id: userId },
    },
  });

  res.json({ url: session.url });
}
