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

export function tierForVariantId(variantId) {
  const id = String(variantId ?? '').trim();
  const teamId = String(process.env.LEMONSQUEEZY_TEAM_VARIANT_ID ?? '').trim();
  if (id && teamId && id === teamId) return 'team';
  return 'personal';
}

/**
 * Maps a Lemon Squeezy subscription status onto the two columns Memoire keeps.
 *
 * `subscription_tier` is the entitlement gate (api/_plan.js reads only this).
 * `subscription_status` describes the relationship. A cancelled subscription
 * has been paid for until it expires, so it keeps its tier until Lemon Squeezy
 * sends the expiry - cancelling is not the same as losing access today.
 */
export function subscriptionStateFor(status, variantId) {
  const normalized = String(status ?? '').trim().toLowerCase();
  if (!ENTITLED_STATUSES.has(normalized)) {
    return { subscription_status: 'free', subscription_tier: 'free' };
  }
  return {
    subscription_status: RELATIONSHIP_ACTIVE_STATUSES.has(normalized) ? 'active' : 'cancelled',
    subscription_tier: tierForVariantId(variantId),
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

export function readRawBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk.toString(); });
    req.on('end', () => resolve(raw));
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
