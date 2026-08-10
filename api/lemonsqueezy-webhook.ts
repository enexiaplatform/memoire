import { createClient } from '@supabase/supabase-js';
import {
  readRawBody,
  subscriptionStateFor,
  verifyWebhookSignature,
} from './_lemonsqueezy.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({ error: 'Billing is not configured.' });
  }

  const signature = req.headers['x-signature'];
  if (!signature || Array.isArray(signature)) {
    return res.status(400).json({ error: 'Missing webhook signature.' });
  }

  let rawBody: string;
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: 'Webhook payload could not be read.' });
  }

  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const eventName = event?.meta?.event_name;
  const userId = event?.meta?.custom_data?.user_id || null;
  const attributes = event?.data?.attributes || {};

  // Without the account link there is no row to update. Answer 200 so Lemon
  // Squeezy stops retrying a delivery that can never succeed.
  if (!userId) return res.json({ received: true });

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed':
    case 'subscription_unpaused':
    case 'subscription_paused':
    case 'subscription_cancelled':
    case 'subscription_expired': {
      // Only write ids the payload actually carries. A later event missing one
      // must not erase the mapping support uses to find the subscription.
      const update: Record<string, unknown> = subscriptionStateFor(attributes);
      if (attributes.customer_id) update.lemonsqueezy_customer_id = String(attributes.customer_id);
      if (event?.data?.id) update.lemonsqueezy_subscription_id = String(event.data.id);

      await supabase.from('user_profiles').update(update).eq('id', userId);
      break;
    }

    case 'order_created': {
      await supabase.from('activity_log').insert({
        user_id: userId,
        action: 'subscription_started',
        metadata: { order_id: event?.data?.id ?? null },
      });
      break;
    }
  }

  res.json({ received: true });
}
