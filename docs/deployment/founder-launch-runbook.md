# Founder Launch Runbook

Date: 2026-07-26 (supersedes the 2026-07-09 revision)
Purpose: every environment action needed to open Memoire to real users, in order, each with its verification command. These are founder actions (Vercel/Supabase/Lemon Squeezy dashboards) - no code change is involved.

Canonical production host: **`https://memoire-official.com`** (custom domain, purchased 2026-07-31; supersedes the interim `https://memoire-blush-eta.vercel.app`). This is the one authoritative application URL. `VITE_APP_URL`, the Supabase Site URL, the email-verification redirect, the password-recovery redirect, the OAuth return URL and the shared-brief base URL must all agree with it - a link built against any other host sends a user, or a signup email, to a domain this project does not serve.

## Custom domain cutover (2026-07-31) - do this first, in one sitting

The domain is bought but not yet attached anywhere in the stack. None of the code changed - `VITE_APP_URL` was always meant to be read from environment, never hard-coded - so this is entirely dashboard work, and it is exactly the case Step 1 below already covers. Do these four things together, not spread across separate sessions: a host attached in Vercel but not yet the Supabase Site URL sends real signup emails to a domain that will 404 until Supabase agrees.

1. **Vercel -> Project Settings -> Domains:** add `memoire-official.com` (and `www.memoire-official.com` if you want the redirect). Follow Vercel's DNS instructions at your registrar (GoDaddy) - typically an `A`/`ALIAS` record for the apex and a `CNAME` for `www`. Wait for the certificate to issue before continuing.
2. Run Step 1 below, with `https://memoire-official.com` as the host everywhere it appears.
3. **Keep the old Vercel host reachable, do not delete it.** Any auth email already sent, or any bookmark/deep link a beta user holds, points at `memoire-blush-eta.vercel.app`. Vercel serves both hosts for the same deployment once the custom domain is attached, so this needs no extra step - just do not remove the old domain from the project.
4. Run Step 5's health probe against **both** hosts. The new host must show `app_url_matches_request_host: true`; the old host will show `false` (its request host no longer matches `VITE_APP_URL`), which is expected and fine - it is being kept reachable, not treated as canonical.

## Step 0 - Baseline probe

```bash
curl -s https://memoire-official.com/api/health
```

Expect to see which checks fail before touching anything. The health endpoint compares `VITE_APP_URL` against the actual serving host (`app_url_matches_request_host`), so canonical-domain drift can never be silent.

## Step 1 - Unblock signup (CRITICAL - was sending auth emails to a domain this project does not own)

1. Vercel -> Project Settings -> Environment Variables (Production):
   - `VITE_APP_URL = https://memoire-official.com`
2. Supabase -> Auth -> URL Configuration:
   - Site URL: `https://memoire-official.com`
   - Redirect allowlist (full URLs on the same host):
     - `https://memoire-official.com/login?verified=1`
     - `https://memoire-official.com/reset-password`
     - `https://memoire-official.com/app/today`
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

## Step 3b - Email reminders (the daily digest and the Monday review)

Added 2026-08-02. Until these are set, the scheduled send runs and does nothing:
the cron endpoint refuses an unset `CRON_SECRET` rather than allowing it, and
the sender reports "not configured" rather than failing. Nothing is emailed to
anybody until an operator turns it on in Settings either - both preferences
default to off in the database, not in the interface.

1. Apply the migration `20260802090000_digest_delivery.sql` (Supabase -> SQL
   editor, or `supabase db push`). It adds the preference columns to
   `user_profiles` and creates `digest_deliveries`.
2. Vercel env (Production):
   - `CRON_SECRET` - any long random string. Vercel sends it as
     `Authorization: Bearer <value>` on scheduled invocations, and the endpoint
     refuses every caller that does not present it.
   - `EMAIL_API_KEY` - the transactional provider's key.
   - `EMAIL_FROM` - e.g. `Memoire <hello@memoire-official.com>`. The domain has
     to be verified with the provider first or every send bounces.
   - `EMAIL_API_URL` - optional. Defaults to Resend's endpoint; set it to use
     another provider that accepts `{from, to, subject, text, html}`.
3. Redeploy. `vercel.json` already declares the hourly schedule; the cron
   appears in the Vercel dashboard after the first deploy that includes it.

Verify: in Vercel -> Cron Jobs, run `/api/send-digests` once by hand and read
the JSON it returns (`considered`, `sent`, `skipped`, `failed`). Then turn the
daily digest on for your own account in Settings, set the hour to the next one,
and wait for it. `digest_deliveries` records every attempt with its outcome, so
"the email never arrived" has an answer.

Note on cadence: the schedule is hourly and the endpoint decides whose local
hour has arrived. That is deliberate - the operators this is for are not in one
timezone, and a 7am digest that lands at midnight is not a digest.

## Step 4 - Paid early access only (Phase: after cohort evidence)

1. Vercel env: `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`, `LEMONSQUEEZY_WEBHOOK_SECRET`, the selected `LEMONSQUEEZY_*_VARIANT_ID`, `BILLING_CHECKOUT_ENABLED=true`.
2. Point the Lemon Squeezy webhook at `https://memoire-official.com/api/lemonsqueezy-webhook`, subscribed to `order_created` and every `subscription_*` event.
3. Run the B1-B6 billing QA in Lemon Squeezy test mode first (see `commercial-release-gate-2026-06-16.md`).

Verify: health probe billing checks pass; `billing_checkout_disabled` flips only when intended.

## Step 5 - After every change

```bash
curl -s https://memoire-official.com/api/health
```

Expect `ok: true`, `warnings: 0`. Anything else: the failing check names the exact env var.

## Standing rules

- Never set env values in code or commit them; this runbook exists precisely because these live only in Vercel/Supabase.
- Never add an AI provider key. `npm run verify:no-ai` fails the build if an AI SDK, endpoint or key placeholder is reintroduced.
- If the domain ever changes again: Step 1 with the new domain + Supabase URL config in one sitting, then Step 5. `app_url_matches_request_host` flags any drift immediately.
