# Billing Support Runbook

Date: 2026-06-17

Roadmap slice: B4 paid early-access billing support readiness

## Decision

Memoire now has a billing support runbook for the future paid early-access phase.

This runbook does not authorize enabling checkout. Paid checkout remains blocked until:

- A single paid offer is selected.
- Stripe test-mode and production-mode QA pass.
- Legal terms cover paid access, refunds, cancellations, service availability, export, and deletion obligations.
- Production environment variables and webhook delivery are verified.

## Current Product Boundary

Current state:

- `/pricing` presents early pricing as a hypothesis.
- No payment checkout is active in the public pricing page.
- `/api/billing` fails closed when `STRIPE_SECRET_KEY` is missing.
- `/api/billing` blocks checkout unless `BILLING_CHECKOUT_ENABLED=true`.
- `/api/billing` accepts checkout only for configured Stripe price IDs.
- `/api/stripe-webhook` requires `STRIPE_WEBHOOK_SECRET` and verifies the webhook signature.

Do not send a payment link manually unless it matches the selected paid early-access offer and this runbook has been updated with the specific price ID, refund policy, and support owner.

Keep `BILLING_CHECKOUT_ENABLED=false` until B1, B3, B4, B5, and B6 are ready.

## Required Owners Before Checkout

Record before enabling paid access:

- Billing support owner:
- Backup owner:
- Stripe dashboard access owner:
- Refund approver:
- Legal/commercial approver:
- Incident escalation owner:

## Support Intake Fields

For every billing issue, record:

- Date received.
- User email or account ID.
- Stripe customer ID, if available.
- Stripe subscription ID, if available.
- Current app subscription status.
- Issue category.
- Amount and currency, if money moved.
- Whether the user can still access their workspace.
- Owner.
- Next action and due date.
- Resolution summary.

Never ask users to send full card details. Card data stays inside Stripe.

## Issue Categories

| Category | User Symptom | First Checks | Resolution Path |
| --- | --- | --- | --- |
| Checkout failed | User cannot complete payment. | `/api/billing` logs, Stripe Checkout session, allowed price ID, auth session. | Retry checkout, fix configuration, or pause billing if repeated. |
| Portal failed | User cannot manage billing. | `user_profiles.stripe_customer_id`, Stripe customer existence, `/api/billing` portal action. | Create/fix customer mapping only after ownership is verified. |
| Plan mismatch | User paid but app shows free/cancelled. | Stripe subscription status, webhook delivery, `user_profiles.subscription_status`, `subscription_tier`. | Replay webhook or manually correct profile after evidence is captured. |
| Cancellation request | User wants to stop renewal. | Stripe subscription, cancellation timing, refund policy. | Use Stripe portal or operator cancellation; confirm app status after webhook. |
| Refund request | User asks for money back. | Payment date, usage period, refund policy, Stripe charge/payment intent. | Approve or reject using refund policy; process only in Stripe. |
| Failed payment | Card failed or renewal failed. | Stripe invoice/payment status, email delivery, grace period policy. | Ask user to update payment method; do not delete data. |
| Duplicate charge | User reports multiple payments. | Stripe payments, subscriptions, customer IDs, email aliases. | Refund duplicate if verified; merge support notes, not payment records. |
| Account deletion with billing | User wants account and billing removed. | Subscription state, export status, account deletion request. | Cancel subscription first, confirm refund policy, then proceed with deletion runbook. |
| Dispute/chargeback | Stripe dispute is opened. | Stripe dispute details and support history. | Preserve evidence, respond through Stripe, pause expansion if repeated. |

## Refund Policy Placeholder

This must be replaced by the selected paid offer.

Default early-access recommendation before legal review:

- First 14 days: refund on request.
- After 14 days: operator discretion for cohort users.
- No refund decision should require users to reveal confidential customer data.
- Refunds do not delete workspace data; handle deletion separately if requested.

## Cancellation Procedure

1. Verify the requester controls the Memoire account or billing email.
2. Confirm whether they want to cancel renewal only or delete the Memoire account.
3. Open the Stripe customer record.
4. Cancel the subscription according to the active policy: immediate or end-of-period.
5. Confirm `customer.subscription.deleted` or updated cancellation status is received.
6. Check `user_profiles.subscription_status` and `subscription_tier`.
7. Send confirmation to the user.
8. Record the support note.

## Refund Procedure

1. Verify the account and payment in Stripe.
2. Confirm the refund policy applies.
3. Check whether there is a related cancellation request.
4. Process the refund in Stripe.
5. Record amount, currency, charge/payment ID, and reason.
6. Confirm app access policy after refund.
7. Send confirmation to the user.

## Failed Payment Procedure

1. Check Stripe invoice and subscription status.
2. Confirm whether Stripe email notifications were sent.
3. Ask the user to update the payment method through the Stripe portal.
4. Do not delete cloud data because of failed payment during early access.
5. If access restrictions are added later, document the grace period before enforcing them.
6. Record whether the user recovered payment, cancelled, or churned.

## Plan Mismatch Procedure

Use when Stripe and Memoire disagree.

1. Find the user in `user_profiles`.
2. Confirm `stripe_customer_id`.
3. Find active Stripe subscriptions for that customer.
4. Check the latest webhook delivery for `customer.subscription.created`, `customer.subscription.updated`, or `customer.subscription.deleted`.
5. If webhook failed, fix delivery and replay the event.
6. If manual correction is required, capture evidence before updating `subscription_status` or `subscription_tier`.
7. Add the incident to the weekly operating review if more than one user is affected.

## Stripe Lookup Checklist

Search Stripe by:

- User email.
- `stripe_customer_id` from `user_profiles`.
- Checkout session metadata: `supabase_user_id`.
- Subscription metadata: `supabase_user_id`.

Expected metadata:

- `supabase_user_id` on Checkout session.
- `supabase_user_id` on Stripe subscription.

## Severity

| Severity | Billing Condition | Action |
| --- | --- | --- |
| BILL-SEV0 | Wrong user receives paid access, cross-account billing data exposure, or repeated incorrect charges. | Pause checkout, preserve evidence, investigate immediately. |
| BILL-SEV1 | Paid user cannot access paid state, cancellation/refund cannot be completed, or webhook mapping breaks for multiple users. | Resolve within 1 business day before expanding paid access. |
| BILL-SEV2 | Single-user checkout, portal, or payment issue with no data exposure and no double charge. | Resolve within 2 business days. |
| BILL-SEV3 | Pricing question, invoice copy request, or offer clarification. | Respond within 3 business days. |

## Evidence Required To Close B4

B4 can move from runbook-ready to operational evidence only when:

- Billing support owner and backup are named.
- Selected paid offer, price ID, refund policy, and trial policy are filled in.
- Stripe test-mode cancellation, refund, failed payment, and portal flows are tested.
- One test support ticket is run through the intake and resolution workflow.
- Weekly operating review includes billing support status once paid testing begins.

Current status:

- Billing support runbook exists.
- Operational billing evidence is missing.
- B3 payment QA, B5 pricing-page update, and B6 legal review remain open.
