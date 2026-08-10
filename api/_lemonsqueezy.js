import { createHmac, timingSafeEqual } from 'node:crypto';

// Lemon Squeezy is the merchant of record: it owns the card data, the tax
// calculation and the invoice. Memoire never sees a card number, and the only
// billing state it keeps is the customer/subscription id and the entitlement
// those webhooks resolve to.

export const LEMONSQUEEZY_API_BASE = 'https://api.lemonsqueezy.com/v1';

// Statuses Lemon Squeezy can report on a subscription.
// https://docs.lemonsqueezy.com/api/subscriptions
const ENTITLED_STATUSES = new Set(['active', 'on_trial', 'past_due', 'cancelled']);
const RELATIONSHIP_ACTIVE_STATUSES = new Set(['active', 'on_trial', 'past_due']);

export function billingConfigured() {
  return Boolean(process.env.LEMONSQUEEZY_API_KEY && process.env.LEMONSQUEEZY_STORE_ID);
}

export function allowedVariantIds() {
  return [
    process.env.LEMONSQUEEZY_PERSONAL_VARIANT_ID,
    process.env.LEMONSQUEEZY_TEAM_VARIANT_ID,
  ]
    .filter(Boolean)
    .map(String);
}

/**
 * The plans a browser is allowed to name.
 *
 * The browser never learns a variant id. There is no VITE_* billing key - the
 * paid-readiness contract fails the build if one appears - so the client asks
 * for a *plan* and the server resolves which variant that is. Configuration
 * stays server-side, and a plan the store has no variant for simply is not
 * offered rather than rendering a button that 400s.
 */
export const PURCHASABLE_PLANS = ['personal', 'team'];

export function variantIdForPlan(plan) {
  const key = String(plan ?? '').trim().toLowerCase();
  if (key === 'personal') return String(process.env.LEMONSQUEEZY_PERSONAL_VARIANT_ID ?? '').trim() || null;
  if (key === 'team') return String(process.env.LEMONSQUEEZY_TEAM_VARIANT_ID ?? '').trim() || null;
  return null;
}

export function purchasablePlans() {
  return PURCHASABLE_PLANS.filter((plan) => variantIdForPlan(plan));
}

export function tierForVariantId(variantId) {
  const id = String(variantId ?? '').trim();
  const teamId = String(process.env.LEMONSQUEEZY_TEAM_VARIANT_ID ?? '').trim();
  if (id && teamId && id === teamId) return 'team';
  return 'personal';
}

/**
 * Maps a Lemon Squeezy subscription onto the columns Memoire keeps.
 *
 * `subscription_tier` is the entitlement gate. `subscription_status` describes
 * the relationship, and it keeps three distinctions the workspace has to be
 * able to make:
 *
 * - **on_trial is not active.** It used to be folded into 'active', which meant
 *   a workspace could not tell somebody paying from somebody three days into a
 *   trial that is about to charge their card. Both have full access; only one
 *   of them needs to be told a payment is coming.
 * - **cancelled is not expired.** A cancelled subscription has been paid for
 *   until its period ends, so it keeps its tier until Lemon Squeezy sends the
 *   expiry. Cancelling is not the same as losing access today.
 * - **past_due keeps access.** Lemon Squeezy is still retrying the card;
 *   locking the operator out mid-retry punishes them for a bank's timing.
 *
 * Takes the whole attributes object because a subscription now contributes
 * three columns rather than two, and the next one should not change the shape
 * of every call site again.
 */
export function subscriptionStateFor(attributes = {}) {
  const normalized = String(attributes?.status ?? '').trim().toLowerCase();
  if (!ENTITLED_STATUSES.has(normalized)) {
    return { subscription_status: 'free', subscription_tier: 'free', subscription_trial_ends_at: null };
  }

  // Cancelling during a trial leaves `trial_ends_at` set and the status
  // 'cancelled', so the date is carried through on every entitled status rather
  // than only on 'on_trial' - it is what tells the operator when access stops.
  const trialEndsAt = attributes?.trial_ends_at ? String(attributes.trial_ends_at) : null;

  if (!RELATIONSHIP_ACTIVE_STATUSES.has(normalized)) {
    return {
      subscription_status: 'cancelled',
      subscription_tier: tierForVariantId(attributes?.variant_id),
      subscription_trial_ends_at: trialEndsAt,
    };
  }

  return {
    subscription_status: normalized === 'on_trial' ? 'on_trial' : 'active',
    subscription_tier: tierForVariantId(attributes?.variant_id),
    subscription_trial_ends_at: normalized === 'on_trial' ? trialEndsAt : null,
  };
}

export async function lemonSqueezyRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${LEMONSQUEEZY_API_BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(
      payload?.errors?.[0]?.detail || `Lemon Squeezy request failed (${response.status}).`,
    );
    error.status = response.status;
    throw error;
  }
  return payload;
}

export function buildCheckoutBody({ storeId, variantId, userId, email, redirectUrl }) {
  return {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: email || undefined,
          // Comes back as meta.custom_data.user_id on every webhook for this
          // subscription. It is the only link between a payment and an account.
          custom: { user_id: userId },
        },
        product_options: { redirect_url: redirectUrl },
        checkout_options: { embed: false },
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };
}

/**
 * The webhook body, read raw so the signature can be checked over the exact
 * bytes Lemon Squeezy signed.
 *
 * Bounded and error-handled, neither of which it was. This endpoint is public
 * by necessity - a webhook cannot carry a session - and the signature check that
 * protects it happens only *after* the whole body has been read, so anything
 * that can be done before that point can be done by anyone. Unbounded, that is
 * "hold this function open and feed it until it runs out of memory". A real
 * subscription event is a couple of kilobytes.
 */
const MAX_WEBHOOK_BODY_BYTES = 1_000_000;

export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let bytes = 0;
    req.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_WEBHOOK_BODY_BYTES) {
        // Destroying the request is what actually stops the sender; resolving a
        // truncated body would fail the signature check but keep reading.
        req.destroy();
        reject(new Error('Webhook payload too large.'));
        return;
      }
      raw += chunk.toString();
    });
    req.on('end', () => resolve(raw));
    req.on('error', (error) => reject(error));
  });
}

/**
 * Lemon Squeezy signs the raw body with HMAC-SHA256 and sends the hex digest in
 * X-Signature. Compared in constant time: a fast string compare leaks how much
 * of a forged signature was correct.
 */
export function verifyWebhookSignature(rawBody, signature, secret) {
  if (typeof rawBody !== 'string' || typeof signature !== 'string' || !signature || !secret) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const received = Buffer.from(signature.trim(), 'hex');
  if (received.length !== expected.length) return false;
  return timingSafeEqual(expected, received);
}
