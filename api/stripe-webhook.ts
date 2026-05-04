import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  let rawBody = '';

  await new Promise<void>((resolve) => {
    req.on('data', (chunk: Buffer) => { rawBody += chunk.toString(); });
    req.on('end', resolve);
  });

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
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
