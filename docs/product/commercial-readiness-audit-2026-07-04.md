# Commercial Readiness Audit

Date: 2026-07-04
Question: are the features unique and commercial enough; if not build, then polish and verify deploy.

## Uniqueness verdict: yes, the loop is the moat

Feature-level differentiation vs generic CRM/spreadsheets is real and shipped:

1. **The silence loop nobody else closes end-to-end**: 7/14-day behavioral silence classifier -> prefilled Follow-up Composer -> Log as sent (records the touch) -> Book the next touch (schedules the next action). Detection-to-cadence in four clicks, consistent on Today, Opportunities, and Accounts.
2. **Evidence-based forecast defense**: every deal carries forecast-evidence categories and defend/rescue/downgrade decisions; the Pipeline Defense Brief is a reviewable artifact, not a dashboard.
3. **Zero-admin capture as memory**: raw notes/email threads structured by AI into accounts, opportunities, stakeholders, objections - the accumulated memory is the switching cost.
4. **Glance-to-action charts**: five hand-rolled charts that each answer one operating question and deep-link into the filtered action view.
5. **Solo-by-design**: no team features required, local-first with cloud sync, dual-audience copy.

Verdict: no additional feature is needed for Phase 1-2 commercial viability. Building more surface before cohort evidence would violate the anti-breadth strategy.

## Commercial funnel status (by design)

- Pricing page frames early access honestly ($15-25/month indicative); CTA routes to `/request-access`. Checkout is intentionally disabled (`billing_checkout_disabled` passes) per GTM Phase 1.
- Stripe env (secret + webhook) is unconfigured - required only when Phase 2 (paid early access) starts.

## Critical finding: production signup was broken

`GET https://memoire-blush-eta.vercel.app/api/health` returned `ok: false` and exposed two env problems:

1. **`VITE_APP_URL` points to `https://memoire.vercel.app` - a domain this project does not own.** It serves a third-party Spotify playlist site. Supabase auth emails (verification, password reset) build their redirect URLs from `VITE_APP_URL`, so every real signup was sent to a stranger's website. Demo mode masked this because it skips auth.
2. **`OPENAI_API_KEY` missing** (the one failing required check) - semantic search/embeddings degraded; Ask Memoire falls back to local rules (graceful, verified in code: `/api/search` guards with 503, embedding generation is fire-and-forget).

## Hardening shipped (code)

`/api/health` now compares `VITE_APP_URL`'s hostname against the actual serving host (`x-forwarded-host`/`host`): new `app_url_matches_request_host` warning check plus `appUrlHost`/`requestHost` in the payload for diagnosis. This class of bug can never be silent again. Contract coverage added in `verify-health-runtime-contract.mjs` (match, mismatch, missing host, port/case normalization) and `verify-production-readiness-contract.mjs`.

## Backend funnel verified (Supabase project `mlmpcpkucurylkrobain`, memories)

All 22 app tables exist with RLS enabled. The Phase-1 conversion sink `early_access_requests` (RLS on, service-role insert path in `/api/request-access`) and `product_funnel_events` are present. Every table has 0 rows - consistent with pre-cohort and corroborating that no real signup has completed (broken by the wrong `VITE_APP_URL`). No hardcoded wrong domain exists in source (only `api/billing.ts` falls back to localhost); the bad value lives solely in the Vercel env var.

## Founder decision (2026-07-04)

Stay on the current Vercel alias now; buy and switch to a custom domain later, once everything else is done, to save cost. Config steps below target the alias accordingly.

## Founder actions required (env, not code - no MCP tool exists for Vercel env)

1. **Unblock signup (critical).** On Vercel → Project Settings → Environment Variables, set `VITE_APP_URL = https://memoire-blush-eta.vercel.app` (Production). Then in Supabase → Auth → URL Configuration, set Site URL to the same, and add to the redirect allowlist: `https://memoire-blush-eta.vercel.app/login?verified=1`, `.../reset-password`, `.../app/today`. Redeploy.
2. **Enable semantic search.** Add `OPENAI_API_KEY` (clears the one failing required health check; until then Ask Memoire runs on local rules - graceful, not broken).
3. **Phase 2 (paid access) only.** Add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, set `BILLING_CHECKOUT_ENABLED=true`.
4. **Later, when the custom domain is bought.** Repeat step 1 with the new domain (Vercel env + Supabase Auth in one coordinated change), then redeploy. `app_url_matches_request_host` will flag it immediately if the two drift.
5. **After each change**, probe `https://memoire-blush-eta.vercel.app/api/health`; expect `ok: true`, `warnings: 0`, and `app_url_matches_request_host: true`.
