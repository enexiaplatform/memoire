# Billing Payment QA

Date: 2026-06-17

Roadmap link: B3 payment QA and B4 billing support evidence

## Decision

Memoire has a billing QA protocol for the future paid early-access phase.

Do not run this against production charges until the paid offer, legal terms, support owner, and Stripe configuration are approved.

## Preconditions

Required before running:

- One selected paid early-access offer.
- Stripe test-mode product and price IDs.
- `BILLING_CHECKOUT_ENABLED=true` only in the billing QA environment after offer/support/legal approval.
- `STRIPE_SECRET_KEY` configured for the target environment.
- `STRIPE_WEBHOOK_SECRET` configured for the target environment.
- `STRIPE_PERSONAL_PRICE_ID` or selected paid-offer price ID configured.
- `VITE_APP_URL` points to the tested preview or production domain.
- Stripe webhook endpoint points to `/api/stripe-webhook`.
- Billing support runbook exists: `docs/operations/billing-support-runbook-2026-06-17.md`.

## QA Matrix

| ID | Area | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| B3-01 | Billing disabled | Unset Stripe secret in a safe preview and call `/api/billing`. | Endpoint returns `503` and no checkout starts. | HTTP response. |
| B3-02 | Checkout flag disabled | Configure Stripe test secrets and price IDs, keep `BILLING_CHECKOUT_ENABLED=false`, then call checkout. | Endpoint returns `503 Checkout is not enabled.` and no Stripe session is created. | HTTP response and Stripe session search. |
| B3-03 | Auth required | Call `/api/billing` without a valid user token. | Endpoint returns `401`. | HTTP response. |
| B3-04 | Invalid price blocked | Call checkout with an unconfigured price ID after enabling the checkout flag in QA. | Endpoint returns `400 Invalid price.` | HTTP response. |
| B3-05 | Checkout start | Start checkout with configured test price as signed-in user after enabling the checkout flag in QA. | Stripe Checkout session opens for the correct price and customer. | Session ID and screenshot. |
| B3-06 | Checkout cancel | Cancel Stripe Checkout. | User returns to `/pricing?upgrade=cancelled`; app state unchanged. | URL and profile state. |
| B3-07 | Checkout success | Complete test payment. | User returns to app success URL; Stripe session has `supabase_user_id` metadata. | Session and metadata. |
| B3-08 | Webhook signature | Send invalid webhook signature. | Webhook rejects request. | HTTP response. |
| B3-09 | Subscription active | Process `customer.subscription.created` or `updated`. | `user_profiles.subscription_status = active`; tier matches price. | Row check. |
| B3-10 | Portal open | Open billing portal from signed-in account with Stripe customer. | Stripe portal opens and returns to `/app/settings`. | Portal session. |
| B3-11 | Cancellation | Cancel subscription through portal or Stripe dashboard. | Webhook updates profile to `cancelled/free`. | Stripe event and row check. |
| B3-12 | Failed payment | Simulate failed renewal or payment method. | Stripe status is visible; app does not delete data; support flow records next action. | Invoice/subscription state. |
| B3-13 | Refund | Process test refund. | Refund appears in Stripe; support ticket records amount, reason, and access decision. | Refund ID and support note. |
| B3-14 | Duplicate charge support | Create or simulate duplicate payment. | Operator can identify duplicate and record resolution using runbook. | Support note. |
| B3-15 | Account deletion with billing | Cancel subscription, export data, then delete account in test environment. | Billing cancellation and data deletion are separately confirmed. | Stripe and Supabase evidence. |

## Pass Criteria

B3 can pass only when:

- B3-01 through B3-15 pass in Stripe test mode.
- Production-mode smoke is run with a real low-risk payment or approved Stripe live-mode test path before taking real users.
- All webhook profile updates are verified.
- No checkout path is exposed on `/pricing` until B1, B4, B5, and B6 are ready.

B4 can pass only when:

- At least one test billing support case is handled through `docs/operations/billing-support-runbook-2026-06-17.md`.
- Refund, cancellation, failed payment, and plan mismatch procedures have named owners.

## Current Status

- QA protocol exists.
- No Stripe test-mode run has been completed.
- B3 and B4 remain open.
