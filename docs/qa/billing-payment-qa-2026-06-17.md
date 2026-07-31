# Billing Payment QA

Date: 2026-06-17

Roadmap link: B3 payment QA and B4 billing support evidence

## Decision

Memoire has a billing QA protocol for the future paid early-access phase.

Do not run this against production charges until the paid offer, legal terms, support owner, and Lemon Squeezy configuration are approved.

Updated 2026-07-31: the payment provider moved from Stripe to Lemon Squeezy, a merchant of record. Two consequences change what QA must look for. Lemon Squeezy handles tax and invoicing itself, so tax and invoice correctness are its responsibility and not a Memoire test case. And a cancelled subscription stays paid until it expires, so cancellation must be checked twice: once at cancellation and once at expiry.

## Preconditions

Required before running:

- One selected paid early-access offer.
- Lemon Squeezy test-mode product and variant IDs.
- `BILLING_CHECKOUT_ENABLED=true` only in the billing QA environment after offer/support/legal approval.
- `LEMONSQUEEZY_API_KEY` configured for the target environment.
- `LEMONSQUEEZY_STORE_ID` configured for the target environment.
- `LEMONSQUEEZY_WEBHOOK_SECRET` configured for the target environment.
- `LEMONSQUEEZY_PERSONAL_VARIANT_ID` or selected paid-offer variant ID configured.
- `VITE_APP_URL` points to the tested preview or production domain.
- Lemon Squeezy webhook endpoint points to `/api/lemonsqueezy-webhook`, subscribed to `order_created` and every `subscription_*` event.
- Store is in test mode for B3-01 through B3-15.
- Billing support runbook exists: `docs/operations/billing-support-runbook-2026-06-17.md`.

## QA Matrix

| ID | Area | Steps | Expected Result | Evidence |
| --- | --- | --- | --- | --- |
| B3-01 | Billing disabled | Unset `LEMONSQUEEZY_API_KEY` in a safe preview and call `/api/billing`. | Endpoint returns `503` and no checkout starts. | HTTP response. |
| B3-02 | Checkout flag disabled | Configure Lemon Squeezy test credentials and variant IDs, keep `BILLING_CHECKOUT_ENABLED=false`, then call checkout. | Endpoint returns `503 Checkout is not enabled.` and no Lemon Squeezy checkout is created. | HTTP response and Lemon Squeezy checkout list. |
| B3-03 | Auth required | Call `/api/billing` without a valid user token. | Endpoint returns `401`. | HTTP response. |
| B3-04 | Invalid price blocked | Call checkout with an unconfigured variant ID after enabling the checkout flag in QA. | Endpoint returns `400 Invalid price.` | HTTP response. |
| B3-05 | Checkout start | Start checkout with the configured test variant as a signed-in user after enabling the checkout flag in QA. | Hosted Lemon Squeezy checkout opens for the correct variant and prefilled email. | Checkout URL and screenshot. |
| B3-06 | Checkout abandoned | Close the hosted checkout without paying. | No subscription is created; profile stays `free`; app state unchanged. | Profile row and Lemon Squeezy subscription list. |
| B3-07 | Checkout success | Complete a test payment. | User returns to `/app/capture?upgrade=success`; the `subscription_created` webhook carries `meta.custom_data.user_id`. | Redirect URL and webhook payload. |
| B3-08 | Webhook signature | Send a payload with an invalid `X-Signature` header. | Webhook returns `400 Invalid webhook signature.` and writes nothing. | HTTP response and unchanged row. |
| B3-09 | Subscription active | Process `subscription_created` or `subscription_updated` with status `active`. | `user_profiles.subscription_status = active`; tier matches the variant; customer and subscription ids are stored. | Row check. |
| B3-10 | Portal open | Open the billing portal from a signed-in account with a stored subscription id. | Signed Lemon Squeezy customer portal opens for that customer. | Portal URL (redacted) and screenshot. |
| B3-11 | Cancellation | Cancel the subscription through the portal or the Lemon Squeezy dashboard. | `subscription_cancelled` sets status `cancelled` while the tier is kept; access continues until the paid period ends. | Webhook event and row check. |
| B3-12 | Expiry after cancellation | Let the cancelled subscription reach its end date, or expire it in test mode. | `subscription_expired` sets status `free` and tier `free`; the account loses paid entitlement exactly once. | Webhook event and row check. |
| B3-13 | Failed payment | Simulate a failed renewal. | Status `past_due` keeps the tier and access; app deletes no data; support flow records the next action. | Subscription state and row check. |
| B3-14 | Refund and duplicate charge support | Process a test refund, then create or simulate a duplicate payment. | Refund appears in Lemon Squeezy; operator identifies the duplicate and records both resolutions using the runbook. | Refund ID and support notes. |
| B3-15 | Account deletion with billing | Cancel the subscription, export data, then delete the account in the test environment. | Billing cancellation and data deletion are separately confirmed. | Lemon Squeezy and Supabase evidence. |

## Pass Criteria

B3 can pass only when:

- B3-01 through B3-15 pass in Lemon Squeezy test mode.
- Production-mode smoke is run with a real low-risk payment before taking real users.
- The store's tax settings and merchant-of-record invoice details are confirmed once in the Lemon Squeezy dashboard. Correctness is Lemon Squeezy's responsibility; confirming the store is configured is not.
- All webhook profile updates are verified.
- No checkout path is exposed on `/pricing` until B1, B4, B5, and B6 are ready.

B4 can pass only when:

- At least one test billing support case is handled through `docs/operations/billing-support-runbook-2026-06-17.md`.
- Refund, cancellation, failed payment, and plan mismatch procedures have named owners.

## Current Status

- QA protocol exists.
- No Lemon Squeezy test-mode run has been completed.
- B3 and B4 remain open.
