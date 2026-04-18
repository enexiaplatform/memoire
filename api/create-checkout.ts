import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const { userId, authToken, priceId } = req.body;
  if (!userId || !authToken || !priceId) {
    return res.status(400).json({ error: 'Missing params' });
  }

  // Validate the JWT
  const supabaseUser = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${authToken}` } } }
  );
  
  const { data: { user }, error } = await supabaseUser.auth.getUser();
  if (error || !user || user.id !== userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

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
