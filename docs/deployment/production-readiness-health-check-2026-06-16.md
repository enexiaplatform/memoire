# Memoire Production Readiness Health Check

Date: 2026-06-16

Roadmap link: Session 3 operational bridge for A1 and A7

## Purpose

`/api/health` gives the operator a safe, non-secret production readiness check before inviting the first controlled cohort.

It is not a substitute for Vercel, Supabase, or AI provider dashboards. It is a fast pass/fail signal that the deployed serverless environment has the minimum variables needed for cohort operation.

## Endpoint

```text
GET /api/health
HEAD /api/health
```

Expected behavior:

- `200` when all required checks pass.
- `503` when one or more required checks fail.
- `405` for unsupported methods.
- `Cache-Control: no-store`.
- No secret values are returned.

## Required Checks

The endpoint returns `ok: true` only when these are configured:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_APP_URL`
- `VITE_APP_URL` must parse as a valid URL
- `ANTHROPIC_API_KEY` or `GROQ_API_KEY`
- `OPENAI_API_KEY`

Why these are required:

- Supabase URL, anon key, and service role key support auth, cloud sync, lead capture, export, and operator analytics.
- `VITE_APP_URL` supports redirects and billing callbacks.
- `/api/health` derives the required auth redirect URLs from `VITE_APP_URL` so the operator can compare them with Supabase Auth settings.
- Anthropic or Groq supports Memoire's generation endpoints.
- OpenAI supports semantic search and embeddings.

## Warning Checks

The endpoint reports warnings when customer-facing production has risky local/demo flags:

- `VITE_ENABLE_DEMO_MODE=true`
- `VITE_ENABLE_FOUNDER_WORKSPACE=true`
- `VITE_APP_URL` is not HTTPS
- `VITE_APP_URL` points to localhost

Warnings do not fail the endpoint because the operator may intentionally run a public demo or founder workspace in a preview environment. For a real customer-facing cohort, warnings must be explicitly accepted or cleared.

## Optional Checks

The endpoint reports optional checkout and capture-AI configuration:

- `CAPTURE_AI_PROVIDER`
- `CAPTURE_AI_ENDPOINT`
- `CAPTURE_AI_API_KEY`
- `CAPTURE_AI_MODEL`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILLING_CHECKOUT_ENABLED`

These do not fail the cohort readiness check because checkout remains disabled until pricing and billing QA pass.

For controlled cohort readiness, `billing_checkout_disabled` should stay passing. If it fails, checkout has been explicitly enabled and the operator must confirm B1-B6 before inviting or charging users.

## Operator Evidence Capture

Before inviting the cohort, capture this evidence:

| Check | Evidence To Store | Pass Rule |
| --- | --- | --- |
| Health endpoint | Screenshot or copied JSON from production `/api/health` | HTTP `200`, `ok: true`, requiredFailed `0` |
| Auth redirects | Same `/api/health` output | `authRedirects.requiredUrls` match Supabase Auth Site URL and Redirect URL allowlist |
| Demo/founder flags | Same `/api/health` output | Warnings are zero, or warning acceptance is written down |
| Vercel logs | Screenshot of recent function logs | No repeated 5xx from core API routes |
| Supabase logs | Screenshot of recent auth/database logs | No repeated auth or database errors |
| AI provider usage | Screenshot of provider usage/cost page | Daily budget/alert destination is known |

Store the result under `docs/qa/` or in the operator workspace before sending cohort invites.

## Static Contract Verification

Before capturing production evidence, run:

```bash
npm run verify:production-readiness
```

This confirms the `/api/health` contract still includes required checks, warning checks, optional checks, auth redirect output, no-store behavior, and the no-secret response boundary expected by this runbook.

## Manual Test Script

Production:

```bash
curl -i https://YOUR_MEMOIRE_DOMAIN/api/health
```

Preview:

```bash
curl -i https://YOUR_PREVIEW_DOMAIN/api/health
```

Expected successful body shape:

```json
{
  "ok": true,
  "service": "memoire",
  "summary": {
    "requiredFailed": 0
  },
  "authRedirects": {
    "requiredUrls": [
      "https://YOUR_MEMOIRE_DOMAIN/login?verified=1",
      "https://YOUR_MEMOIRE_DOMAIN/reset-password",
      "https://YOUR_MEMOIRE_DOMAIN/app/dashboard"
    ]
  }
}
```

Do not paste full response bodies into public docs if they include deployment timing or version data the operator considers sensitive. The endpoint itself does not return secrets.

## Gate Impact

This improves A1, A6, and A7 from pure checklist documentation to app-level readiness instrumentation.

Remaining evidence still needed:

- Actual production `/api/health` result.
- Supabase Auth redirect allowlist proof matching `/api/health` auth redirect output.
- Vercel Firewall/rate-limit proof.
- Monitoring owner and daily review cadence.
- Supabase auth/database dashboard proof.
- AI provider budget or alert proof.
