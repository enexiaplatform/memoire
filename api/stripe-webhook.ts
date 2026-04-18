import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: any, res: any) {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('user_profiles')
        .update({
          subscription_status: subscription.status === 'active' ? 'active' : 'cancelled',
          subscription_tier: 'personal', // expand later based on price_id
        })
        .eq('stripe_customer_id', subscription.customer);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await supabase
        .from('user_profiles')
        .update({ subscription_status: 'cancelled', subscription_tier: 'free' })
        .eq('stripe_customer_id', subscription.customer);
      break;
    }
  }

  res.json({ received: true });
}
