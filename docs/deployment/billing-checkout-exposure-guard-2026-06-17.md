# Billing Checkout Exposure Guard

Date: 2026-06-17

Roadmap slice: R8 accidental checkout exposure guard

## Decision

Memoire now requires an explicit server-side checkout flag before creating Stripe Checkout sessions.

This protects the product from accidentally exposing checkout just because Stripe secrets and price IDs are present in the deployment environment.

## Code Change

Updated:

- `api/billing.ts`
- `api/health.ts`
- `.env.example`
- `scripts/verify-commercial-readiness.mjs`
- `package.json`

Behavior:

- `/api/billing` still fails closed when `STRIPE_SECRET_KEY` is missing.
- Checkout now also requires `BILLING_CHECKOUT_ENABLED=true`.
- If Stripe is configured but the checkout flag is not true, checkout returns `503` with `Checkout is not enabled.`
- Portal access remains separate for future paid users who already have a Stripe customer.
- `/api/health` reports `billing_checkout_disabled` as an optional check that should pass during cohort/private beta.

## Operator Rule

Keep this value unless B1-B6 are ready:

```text
BILLING_CHECKOUT_ENABLED=false
```

Only set it to `true` after:

- Paid offer selected.
- Stripe price ID confirmed.
- Billing payment QA passed.
- Billing support owner and refund/trial policy recorded.
- Pricing page matches the active offer.
- Legal review covers paid access.

## Gate Impact

Improves:

- R8: checkout is harder to expose accidentally.
- B2/B3: billing QA now has an explicit disabled-checkout test.
- B5: pricing can remain hypothesis-mode while backend Stripe config is prepared in preview.

Still open:

- B1 selected paid offer.
- B3 Stripe test/live evidence.
- B4 named owners and test support case.
- B5 pricing page update.
- B6 paid-access legal review.

## Verification

Static verification required:

- `npm run verify:commercial` passes.
- `npm run check` includes `npm run verify:commercial`.
- API typecheck passes.
- `/api/health` includes the `billing_checkout_disabled` check.
- Billing QA includes a case where Stripe is configured but checkout flag is false.
- `vercel.json` keeps `X-Robots-Tag: noindex, nofollow` before public selling.
- Landing and pricing pages keep public checkout inactive and do not call the checkout hook while B1-B6 are open.

Operational verification required later:

- In protected preview, configure Stripe test keys and price IDs while `BILLING_CHECKOUT_ENABLED=false`; a signed-in checkout attempt must return `503` and create no Stripe Checkout session.
