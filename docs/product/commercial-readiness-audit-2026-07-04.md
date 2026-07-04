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

## Founder actions required (env, not code)

1. On Vercel, set `VITE_APP_URL=https://memoire-blush-eta.vercel.app` (or attach a custom domain and use that), then update Supabase Auth Site URL + redirect allowlist to match, and redeploy.
2. Add `OPENAI_API_KEY` to enable semantic search/embeddings (clears the failing required check).
3. When Phase 2 starts: add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, set `BILLING_CHECKOUT_ENABLED=true`.
4. Re-probe `/api/health` after each change; expect `ok: true` and `app_url_matches_request_host: true` when probed via the canonical domain.
