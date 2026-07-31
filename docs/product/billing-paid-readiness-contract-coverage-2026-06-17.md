# Billing Paid-Readiness Contract Coverage

Date: 2026-06-17

Roadmap slice: B1-B6 paid early-access checkout readiness

## Decision

Memoire now has an automated static verifier for paid-checkout readiness without enabling checkout.

This verifier does not authorize billing. B1-B6 remain open until the selected offer, Lemon Squeezy configuration, payment QA, billing support evidence, pricing-page update, and paid-access legal review are complete.

Do not enable checkout while this document says B1-B6 remain open.

## What The Verifier Covers

`scripts/verify-billing-paid-readiness-contract.mjs` checks that:

- `.env.example` keeps checkout disabled by default, documents the Lemon Squeezy billing variables, and exposes no client-side billing key.
- `/api/billing` fails closed without Lemon Squeezy config, requires auth, blocks checkout unless `BILLING_CHECKOUT_ENABLED=true`, accepts only configured variant IDs, attaches the account link as checkout custom data, and returns the hosted checkout URL.
- `/api/lemonsqueezy-webhook` keeps raw-body HMAC signature verification, verifies before writing, and updates subscription status/tier for created, updated, cancelled, expired, and order events.
- Stripe is absent from the dependency tree and from the billing surface, so there is only one payment path to watch.
- `/pricing` remains an early pricing hypothesis with no checkout hook or checkout call.
- The checkout exposure guard keeps the B1-B6 prerequisites and the `BILLING_CHECKOUT_ENABLED=false` operator rule.
- The billing QA matrix keeps B3-01 through B3-15, disabled-checkout QA, webhook QA, portal QA, refund/cancellation/failed-payment QA, and account deletion with billing checks.
- The billing support runbook keeps owner fields, issue categories, refund/cancellation/failed-payment/plan-mismatch procedures, severity policy, card-data boundary, and B4 evidence requirements.
- `scripts/verify-commercial-readiness.mjs` still protects inactive public checkout exposure.

## Runtime Evidence Still Required

B1-B6 remain open until the release gate records:

- B1: one selected paid early-access offer with target user, price, limits, refund policy, trial model, and inclusion/exclusion list.
- B2: Lemon Squeezy API key, store ID, webhook secret, selected variant ID, webhook endpoint, and intentional checkout flag configuration are verified in the target environment.
- B3: B3-01 through B3-15 pass in Lemon Squeezy test mode, plus live-mode smoke before real users are charged.
- B4: billing support owner, backup owner, refund approver, Lemon Squeezy dashboard owner, selected offer, variant ID, refund/trial policy, and one test support case are recorded.
- B5: `/pricing` changes from hypothesis mode to the selected paid offer only after B1-B4 are ready.
- B6: legal review covers paid access, refunds, cancellations, service availability, export, deletion, and billing-support obligations.

## Operator Command

Run before any paid-release decision and after billing, pricing, support, or Lemon Squeezy docs change:

```bash
npm run verify:billing-paid-readiness
```

`npm run check` also runs this verifier so paid-checkout drift is caught while checkout remains intentionally inactive.
