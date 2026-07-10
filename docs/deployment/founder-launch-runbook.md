# Founder Launch Runbook

Date: 2026-07-09
Purpose: every environment action needed to open Memoire to real users, in order, each with its verification command. These are founder actions (Vercel/Supabase/Stripe dashboards) - no code change is involved. Source findings: `docs/product/commercial-readiness-audit-2026-07-04.md`.

Production host referenced below: `https://memoire-blush-eta.vercel.app` (current alias; when a custom domain is bought, repeat Step 1 with the new domain in one coordinated change).

## Step 0 - Baseline probe

```bash
curl -s https://memoire-blush-eta.vercel.app/api/health | python3 -m json.tool
```

Expect to see which checks fail before touching anything. The health endpoint compares `VITE_APP_URL` against the actual serving host (`app_url_matches_request_host`), so drift can never be silent.

## Step 1 - Unblock signup (CRITICAL - was sending auth emails to a stranger's domain)

1. Vercel -> Project Settings -> Environment Variables (Production):
   - `VITE_APP_URL = https://memoire-blush-eta.vercel.app`
2. Supabase -> Auth -> URL Configuration:
   - Site URL: `https://memoire-blush-eta.vercel.app`
   - Redirect allowlist: `/login?verified=1`, `/reset-password`, `/app/today` (full URLs on the same host).
3. Redeploy.

Verify: health probe shows `app_url_matches_request_host: true` and zero warnings for app URL. Then run one real signup + email verification + password reset on the production host (two-account isolation QA per the release gate).

## Step 2 - Enable semantic search / Ask Memoire cloud answers

1. Vercel env (Production): `OPENAI_API_KEY` (embeddings) and the configured AI provider key for `/api/ask-memoire` and `/api/capture-ai-classify` if different.
2. Redeploy.

Verify: health probe `ok: true` with the embeddings check passing; on production, Ask Memoire status line switches from local-rules fallback to the configured endpoint. Note: measured-history questions ("did my follow-ups work", "where is the money", "what happened this week", calibration) never use AI by design - do not treat their "no AI involved" status as a failure.

## Step 3 - Error and event visibility (pairs with the in-app instrumentation)

1. Vercel env (Production): `VITE_CLIENT_LOG_ENDPOINT = /api/client-log` - without it the global error reporter and sync-failure telemetry stay inert by design.
2. Redeploy, then check Vercel function logs for `client-log` entries after browsing the production app.
3. Funnel events: confirm rows appear in Supabase `product_funnel_events` after a demo run-through (the deep-loop events shipped 2026-07-09: ledger/review/money opens, follow-up logged, next touch booked, cockpit and morning-brief clicks, calibration views, proven-response copies, dictation use).

## Step 4 - Paid early access only (Phase: after cohort evidence)

1. Vercel env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BILLING_CHECKOUT_ENABLED=true`.
2. Run the B1-B6 billing QA in Stripe test mode first (see `commercial-release-gate-2026-06-16.md`).

Verify: health probe billing checks pass; `billing_checkout_disabled` flips only when intended.

## Step 5 - After every change

```bash
curl -s https://memoire-blush-eta.vercel.app/api/health | python3 -m json.tool
```

Expect `ok: true`, `warnings: 0`. Anything else: the failing check names the exact env var.

## Standing rules

- Never set env values in code or commit them; this runbook exists precisely because these live only in Vercel/Supabase.
- When the custom domain arrives: Step 1 with the new domain + Supabase URL config in one sitting, then Step 5. `app_url_matches_request_host` flags any drift immediately.
