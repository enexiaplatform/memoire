# Billing Support Runbook

Date: 2026-06-17

Roadmap slice: B4 paid early-access billing support readiness

## Decision

Memoire now has a billing support runbook for the future paid early-access phase.

Updated 2026-07-31: the payment provider moved from Stripe to Lemon Squeezy. Lemon Squeezy is the **merchant of record**, which changes two things for support. Lemon Squeezy is the seller on the invoice and owns tax handling, so tax and invoice questions are answered from its dashboard, not reconstructed here. And disputes are raised against Lemon Squeezy, so the operator supplies evidence rather than responding to the card network directly.

This runbook does not authorize enabling checkout. Paid checkout remains blocked until:

- A single paid offer is selected.
- Lemon Squeezy test-mode and production-mode QA pass.
- Legal terms cover paid access, refunds, cancellations, service availability, export, and deletion obligations.
- Production environment variables and webhook delivery are verified.

## Current Product Boundary

Current state:

- `/pricing` presents early pricing as a hypothesis.
- No payment checkout is active in the public pricing page.
- `/api/billing` fails closed when `LEMONSQUEEZY_API_KEY` or `LEMONSQUEEZY_STORE_ID` is missing.
- `/api/billing` blocks checkout unless `BILLING_CHECKOUT_ENABLED=true`.
- `/api/billing` accepts checkout only for configured Lemon Squeezy variant IDs.
- `/api/lemonsqueezy-webhook` requires `LEMONSQUEEZY_WEBHOOK_SECRET` and verifies the `X-Signature` HMAC before writing anything.

Do not send a payment link manually unless it matches the selected paid early-access offer and this runbook has been updated with the specific variant ID, refund policy, and support owner.

Keep `BILLING_CHECKOUT_ENABLED=false` until B1, B3, B4, B5, and B6 are ready.

## Required Owners Before Checkout

Record before enabling paid access:

- Billing support owner:
- Backup owner:
- Lemon Squeezy dashboard access owner:
- Refund approver:
- Legal/commercial approver:
- Incident escalation owner:

## Support Intake Fields

For every billing issue, record:

- Date received.
- User email or account ID.
- Lemon Squeezy customer ID, if available.
- Lemon Squeezy subscription ID, if available.
- Current app subscription status.
- Issue category.
- Amount and currency, if money moved.
- Whether the user can still access their workspace.
- Owner.
- Next action and due date.
- Resolution summary.

Never ask users to send full card details. Card data stays inside Lemon Squeezy.

## How Status Maps To Access

Two columns, and they do not mean the same thing.

- `subscription_tier` is the entitlement gate. It is the only field the server reads to decide whether a user has paid access.
- `subscription_status` describes the relationship, for support and reporting.

| Lemon Squeezy status | `subscription_status` | `subscription_tier` | User has paid access |
| --- | --- | --- | --- |
| `active`, `on_trial` | `active` | personal or team | Yes |
| `past_due` | `active` | kept | Yes - dunning, do not cut access or delete data |
| `cancelled` | `cancelled` | kept | Yes, until it expires - the period is already paid for |
| `expired`, `unpaid`, `paused` | `free` | `free` | No |

The one that surprises people: a cancellation does not remove access. `subscription_expired` does. A user reporting "I cancelled but still have access" is seeing correct behavior.

## Issue Categories

| Category | User Symptom | First Checks | Resolution Path |
| --- | --- | --- | --- |
| Checkout failed | User cannot complete payment. | `/api/billing` logs, Lemon Squeezy checkout list, allowed variant ID, auth session. | Retry checkout, fix configuration, or pause billing if repeated. |
| Portal failed | User cannot manage billing. | `user_profiles.lemonsqueezy_subscription_id` and `lemonsqueezy_customer_id`, subscription existence, `/api/billing` portal action. | Create/fix customer mapping only after ownership is verified. Portal links are short-lived and reissued per request. |
| Plan mismatch | User paid but app shows free/cancelled. | Lemon Squeezy subscription status, webhook delivery, `user_profiles.subscription_status`, `subscription_tier`. | Replay webhook or manually correct profile after evidence is captured. |
| Cancellation request | User wants to stop renewal. | Lemon Squeezy subscription, cancellation timing, refund policy. | Cancel through the customer portal or dashboard; confirm app status after the webhook. Explain access continues until expiry. |
| Refund request | User asks for money back. | Payment date, usage period, refund policy, Lemon Squeezy order. | Approve or reject using refund policy; process only in Lemon Squeezy. |
| Failed payment | Card failed or renewal failed. | Lemon Squeezy subscription/invoice status, email delivery, grace period policy. | Ask user to update payment method through the portal; do not delete data while `past_due`. |
| Duplicate charge | User reports multiple payments. | Lemon Squeezy orders, subscriptions, customer IDs, email aliases. | Refund duplicate if verified; merge support notes, not payment records. |
| Account deletion with billing | User wants account and billing removed. | Subscription state, export status, account deletion request. | Cancel subscription first, confirm refund policy, then proceed with deletion runbook. |
| Dispute/chargeback | A dispute is opened against the Lemon Squeezy charge. | Lemon Squeezy dispute notice and support history. | Preserve evidence and supply it to Lemon Squeezy, which is the merchant of record and responds to the network. Pause expansion if repeated. |
| Tax or invoice question | User asks about VAT/GST, invoice details, or the name on their statement. | Lemon Squeezy order and invoice. | Answer from the Lemon Squeezy invoice. Lemon Squeezy is the seller of record and handles tax; do not recompute or reissue by hand. |

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
3. Open the Lemon Squeezy subscription, found from `lemonsqueezy_subscription_id`.
4. Cancel the subscription according to the active policy.
5. Confirm the `subscription_cancelled` webhook is received.
6. Check `user_profiles.subscription_status` is `cancelled` and the tier is unchanged.
7. Tell the user the date access ends. It is the end of the paid period, not today.
8. Record the support note, including the expected expiry date.
9. On that date, confirm `subscription_expired` arrived and the tier dropped to `free`.

## Refund Procedure

1. Verify the account and payment in Lemon Squeezy.
2. Confirm the refund policy applies.
3. Check whether there is a related cancellation request.
4. Process the refund in Lemon Squeezy.
5. Record amount, currency, order ID, and reason.
6. Confirm app access policy after refund.
7. Send confirmation to the user.

## Failed Payment Procedure

1. Check the Lemon Squeezy subscription and invoice status.
2. Confirm whether Lemon Squeezy dunning emails were sent.
3. Ask the user to update the payment method through the customer portal.
4. Do not delete cloud data because of failed payment during early access. `past_due` deliberately keeps the tier.
5. If access restrictions are added later, document the grace period before enforcing them.
6. Record whether the user recovered payment, cancelled, or churned.

## Plan Mismatch Procedure

Use when Lemon Squeezy and Memoire disagree.

1. Find the user in `user_profiles`.
2. Confirm `lemonsqueezy_customer_id` and `lemonsqueezy_subscription_id`.
3. Find active Lemon Squeezy subscriptions for that customer.
4. Check the latest webhook delivery for `subscription_created`, `subscription_updated`, `subscription_cancelled`, or `subscription_expired`.
5. If webhook delivery failed, fix it and resend the event from the Lemon Squeezy dashboard.
6. If manual correction is required, capture evidence before updating `subscription_status` or `subscription_tier`.
7. Add the incident to the weekly operating review if more than one user is affected.

## Lemon Squeezy Lookup Checklist

Search Lemon Squeezy by:

- User email.
- `lemonsqueezy_customer_id` from `user_profiles`.
- `lemonsqueezy_subscription_id` from `user_profiles`.

Expected custom data:

- `user_id` in the checkout's custom data.
- `meta.custom_data.user_id` on every subscription and order webhook.

A subscription with no `user_id` in its custom data cannot be mapped to an account automatically. Map it by hand only after verifying ownership by email.

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
- Selected paid offer, variant ID, refund policy, and trial policy are filled in.
- Lemon Squeezy test-mode cancellation, expiry, refund, failed payment, and portal flows are tested.
- One test support ticket is run through the intake and resolution workflow.
- Weekly operating review includes billing support status once paid testing begins.

Current status:

- Billing support runbook exists.
- Operational billing evidence is missing.
- B3 payment QA, B5 pricing-page update, and B6 legal review remain open.
