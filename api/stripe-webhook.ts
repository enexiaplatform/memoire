import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Billing is not configured.' });
  }

  const stripe = new Stripe(stripeSecretKey);
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing webhook signature.' });

  let event: Stripe.Event;
  let rawBody = '';

  await new Promise<void>((resolve) => {
    req.on('data', (chunk: Buffer) => { rawBody += chunk.toString(); });
    req.on('end', resolve);
  });

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Webhook signature verification failed:', err);
    }
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  const getUserId = (obj: any): string | null =>
    obj?.metadata?.supabase_user_id || null;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = getUserId(sub);
      if (!userId) break;

      const isActive = sub.status === 'active' || sub.status === 'trialing';
      const priceId = sub.items.data[0]?.price?.id;
      const tier = priceId === process.env.STRIPE_TEAM_PRICE_ID ? 'team' : 'personal';

      await supabase.from('user_profiles').update({
        subscription_status: isActive ? 'active' : 'cancelled',
        subscription_tier: isActive ? tier : 'free',
      }).eq('id', userId);
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const userId = getUserId(sub);
      if (!userId) break;

      await supabase.from('user_profiles').update({
        subscription_status: 'cancelled',
        subscription_tier: 'free',
      }).eq('id', userId);
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = getUserId(session);
      if (userId) {
        await supabase.from('activity_log').insert({
          user_id: userId,
          action: 'subscription_started',
          metadata: { session_id: session.id },
        });
      }
      break;
    }
  }

  res.json({ received: true });
}
