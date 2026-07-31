# Founder Launch Runbook

Date: 2026-07-26 (supersedes the 2026-07-09 revision)
Purpose: every environment action needed to open Memoire to real users, in order, each with its verification command. These are founder actions (Vercel/Supabase/Lemon Squeezy dashboards) - no code change is involved.

Canonical production host: `https://memoire-blush-eta.vercel.app`. This is the one authoritative application URL. `VITE_APP_URL`, the Supabase Site URL, the email-verification redirect, the password-recovery redirect, the OAuth return URL and the shared-brief base URL must all agree with it. When a custom domain is bought, repeat Step 1 with the new domain in one coordinated change.

## Step 0 - Baseline probe

```bash
curl -s https://memoire-blush-eta.vercel.app/api/health
```

Expect to see which checks fail before touching anything. The health endpoint compares `VITE_APP_URL` against the actual serving host (`app_url_matches_request_host`), so canonical-domain drift can never be silent.

## Step 1 - Unblock signup (CRITICAL - was sending auth emails to a domain this project does not own)

1. Vercel -> Project Settings -> Environment Variables (Production):
   - `VITE_APP_URL = https://memoire-blush-eta.vercel.app`
2. Supabase -> Auth -> URL Configuration:
   - Site URL: `https://memoire-blush-eta.vercel.app`
   - Redirect allowlist (full URLs on the same host):
     - `https://memoire-blush-eta.vercel.app/login?verified=1`
     - `https://memoire-blush-eta.vercel.app/reset-password`
     - `https://memoire-blush-eta.vercel.app/app/today`
3. Redeploy.

Verify: health probe shows `app_url_matches_request_host: true` and zero warnings for app URL. Then run one real signup + email verification + password reset on the production host.

## Step 2 - No AI configuration is required (and none should be set)

Memoire has no AI dependency. Capture parsing, prioritisation, search and every recommendation are deterministic and computed on the user's device.

- Do **not** set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` or any `CAPTURE_AI_*` variable.
- If any of them is still present from an earlier phase, delete it in Vercel and redeploy.

Verify: `/api/health` returns `ok: true` with `no_ai_provider_configured` passing. A leftover key is reported as a warning, never as a required failure - production health does not depend on AI configuration.

## Step 3 - Error and event visibility

1. Vercel env (Production): `VITE_CLIENT_LOG_ENDPOINT = /api/client-log` - without it the global error reporter and sync-failure telemetry stay inert by design.
2. Redeploy, then check Vercel function logs for `client-log` entries after browsing the production app.
3. Product events: confirm rows appear in Supabase `product_events` after a run-through. Product analytics posts to the dedicated `/api/product-events` endpoint, separately from operational telemetry and from the request-access lead endpoint.

## Step 4 - Paid early access only (Phase: after cohort evidence)

1. Vercel env: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, the selected `LEMONSQUEEZY_*_VARIANT_ID`, `BILLING_CHECKOUT_ENABLED=true`.
2. Point the Lemon Squeezy webhook at `https://<domain>/api/lemonsqueezy-webhook`, subscribed to `order_created` and every `subscription_*` event.
3. Run the B1-B6 billing QA in Lemon Squeezy test mode first (see `commercial-release-gate-2026-06-16.md`).

Verify: health probe billing checks pass; `billing_checkout_disabled` flips only when intended.

## Step 5 - After every change

```bash
curl -s https://memoire-blush-eta.vercel.app/api/health
```

Expect `ok: true`, `warnings: 0`. Anything else: the failing check names the exact env var.

## Standing rules

- Never set env values in code or commit them; this runbook exists precisely because these live only in Vercel/Supabase.
- Never add an AI provider key. `npm run verify:no-ai` fails the build if an AI SDK, endpoint or key placeholder is reintroduced.
- When the custom domain arrives: Step 1 with the new domain + Supabase URL config in one sitting, then Step 5. `app_url_matches_request_host` flags any drift immediately.
