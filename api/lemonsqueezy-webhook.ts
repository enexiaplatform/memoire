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
  if (!userId) {
    logBillingProblem('webhook carried no user_id', { eventName, subscriptionId: event?.data?.id });
    return res.json({ received: true });
  }

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

      /**
       * The write is checked, and that is the whole point of this block.
       *
       * It used to be a bare `await supabase.from(...).update(...)` whose result
       * was thrown away, followed unconditionally by `{ received: true }`. Every
       * way that write can fail therefore ended the same way: the customer's card
       * is charged, Lemon Squeezy is told the event was handled and never retries,
       * `user_profiles` still says `free`, and nothing anywhere records that it
       * happened. A paid account with no entitlement and no trace is the worst
       * failure this endpoint has, and it was the silent one.
       *
       * `.select('id')` is what makes "no row matched" visible at all. An update
       * whose filter matches nothing is not an error in PostgREST - it is a
       * success that changed nothing - so an id that does not name a profile
       * (a deleted account, a checkout begun under a since-replaced account)
       * looked identical to a subscription correctly granted.
       */
      const { data, error } = await supabase
        .from('user_profiles')
        .update(update)
        .eq('id', userId)
        .select('id');

      if (error) {
        logBillingProblem('subscription state could not be written', {
          eventName,
          userId,
          subscriptionId: event?.data?.id,
          error: error.message,
        });
        // 500 so Lemon Squeezy retries. A transient database failure is exactly
        // what its retry schedule is for, and silence here costs a paying
        // customer their subscription.
        return res.status(500).json({ error: 'Could not record subscription state.' });
      }

      if (!data || data.length === 0) {
        // Retrying will not conjure the profile, so this is a 200 - but it is the
        // line an operator needs when somebody writes in saying they paid and the
        // app still calls them free.
        logBillingProblem('no profile matched the paying account', {
          eventName,
          userId,
          subscriptionId: event?.data?.id,
        });
      }
      break;
    }

    case 'order_created': {
      const { error } = await supabase.from('activity_log').insert({
        user_id: userId,
        action: 'subscription_started',
        metadata: { order_id: event?.data?.id ?? null },
      });

      // The log line is not the entitlement, so a failure here does not cost the
      // customer access and does not need a retry. It still gets said out loud.
      if (error) {
        logBillingProblem('subscription_started could not be logged', {
          eventName,
          userId,
          error: error.message,
        });
      }
      break;
    }
  }

  res.json({ received: true });
}

/**
 * Billing failures go to the server log as structured JSON, never to the
 * response. Lemon Squeezy is the only reader of the body here and it cannot act
 * on a detail; an operator reading Vercel's logs can.
 */
function logBillingProblem(message: string, detail: Record<string, unknown>) {
  console.error(JSON.stringify({
    level: 'error',
    message: `Lemon Squeezy webhook: ${message}`,
    ...detail,
    timestamp: new Date().toISOString(),
  }));
}
