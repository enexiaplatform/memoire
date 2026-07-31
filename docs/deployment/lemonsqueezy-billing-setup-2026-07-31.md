# Lemon Squeezy Billing Setup

Date: 2026-07-31

Replaces: Stripe billing (`api/stripe-webhook.ts`, `STRIPE_*` environment variables), removed in this change.

## Why the provider changed

Lemon Squeezy is a **merchant of record**. It is the legal seller on the invoice, it collects and remits VAT/GST in the buyer's jurisdiction, and it handles disputes with the card networks. Stripe is a payment processor: the seller of record is you, and so is the tax registration in every country you sell into.

For a single operator selling B2B software across borders, that difference is the whole reason. It also removes the dependency on holding a Stripe account in a supported country.

Three consequences run through the rest of this document:

1. **Tax and invoicing are not Memoire's job.** Do not build or reconcile them here.
2. **There is no client-side payment key.** Checkout is a hosted URL minted server-side, so no billing credential ever reaches the browser bundle. `verify:billing-paid-readiness` fails the build if a `VITE_*` billing key appears.
3. **Cancelling is not the same as losing access.** A cancelled subscription is paid until it expires. Entitlement ends on `subscription_expired`.

## What is in the code

| Piece | Location |
| --- | --- |
| Shared client, signature check, status mapping | `api/_lemonsqueezy.js` |
| Checkout and customer portal | `api/billing.ts` |
| Webhook receiver | `api/lemonsqueezy-webhook.ts` |
| Billing columns | `supabase/migrations/20260731090000_lemonsqueezy_billing_columns.sql` |
| Contract | `scripts/verify-billing-paid-readiness-contract.mjs` |
| Unit tests | `test/unit/lemonSqueezyBilling.test.mjs` |

Checkout remains gated behind `BILLING_CHECKOUT_ENABLED=false`. This setup prepares billing; it does not switch it on. The conditions for switching it on are in `billing-checkout-exposure-guard-2026-06-17.md` and are unchanged.

## Dashboard steps

1. **Create the store.** Lemon Squeezy dashboard > Stores. Note the store ID (a number).
2. **Stay in test mode** while doing everything below. The toggle is in the dashboard header.
3. **Create the product and its variants.** One subscription product; a variant per plan. Note each variant ID (a number, from the variant's URL or the API).
4. **Create an API key.** Settings > API. Copy it once - it is not shown again.
5. **Create the webhook.** Settings > Webhooks.
   - URL: `https://<your-domain>/api/lemonsqueezy-webhook`
   - Signing secret: generate one and keep it; it becomes `LEMONSQUEEZY_WEBHOOK_SECRET`.
   - Events: `order_created` plus every `subscription_*` event. The handler needs `subscription_created`, `subscription_updated`, `subscription_cancelled` and `subscription_expired` at minimum; subscribing to all of them costs nothing and avoids a silent gap later.
6. **Apply the migration.** `supabase/migrations/20260731090000_lemonsqueezy_billing_columns.sql`, in filename order with the rest.
7. **Set the environment variables** in Vercel (below), for Preview first.
8. **Run the QA matrix** in `docs/qa/billing-payment-qa-2026-06-17.md`, B3-01 through B3-15, in test mode.

## Environment variables

```text
BILLING_CHECKOUT_ENABLED=false
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=
LEMONSQUEEZY_PERSONAL_VARIANT_ID=
LEMONSQUEEZY_TEAM_VARIANT_ID=
```

`/api/health` reports `lemonsqueezy_api_key`, `lemonsqueezy_store`, `lemonsqueezy_webhook_secret` and `billing_checkout_disabled` as optional checks, so an operator can confirm both that billing is configured and that checkout is still off.

## How a payment becomes access

```text
/api/billing (checkout) → hosted Lemon Squeezy checkout → payment
  → subscription_created webhook → user_profiles.subscription_tier → api/_plan.js
```

The account link is the one fragile part. `/api/billing` puts `user_id` into the checkout's custom data, and Lemon Squeezy returns it as `meta.custom_data.user_id` on every webhook for that subscription. A webhook without it cannot be mapped to an account: the handler answers `200` so Lemon Squeezy stops retrying, and the subscription must then be mapped by hand after verifying ownership by email. This is why the checkout must always be started from `/api/billing` and never from a raw Lemon Squeezy payment link.

### Status to entitlement

`subscription_tier` is the entitlement gate - `api/_plan.js` reads only this field. `subscription_status` describes the relationship.

| Lemon Squeezy status | `subscription_status` | `subscription_tier` | Paid access |
| --- | --- | --- | --- |
| `active`, `on_trial` | `active` | personal or team | Yes |
| `past_due` | `active` | kept | Yes - dunning, do not cut access |
| `cancelled` | `cancelled` | kept | Yes, until expiry |
| `expired`, `unpaid`, `paused` | `free` | `free` | No |
| anything unrecognised | `free` | `free` | No - fails closed |

## Security boundary

- The webhook verifies an HMAC-SHA256 signature over the **raw** body, compared in constant time, **before** any database write. `bodyParser` is disabled because a parsed-then-restringified body no longer matches the signature. The contract asserts the verify call precedes the write.
- Billing columns are written only by the webhook, under `service_role`. The browser's grant on `user_profiles` is column-scoped to `display_name`, so a signed-in user cannot write their own tier.
- No billing credential is exposed to the client. There is no publishable key to leak.
- Exclude `/api/lemonsqueezy-webhook` from firewall rate limiting. A throttled webhook leaves a paying user on the free tier, and the failure is silent.

## Going live

Only after B1-B6 in `docs/product/commercial-release-gate-2026-06-16.md` have evidence:

1. Switch the store out of test mode; recreate the API key, webhook secret and variant IDs for live mode.
2. Update the Vercel production environment with the live values.
3. Set `BILLING_CHECKOUT_ENABLED=true`.
4. Run one real low-risk payment end to end.
5. Confirm `user_profiles` reflects it, then cancel and confirm access continues to the period end.
