# Memoire App Rate Limit Contract

Date: 2026-06-17

Roadmap link: Gate A2 - Expensive endpoint protection

## Purpose

Vercel Firewall remains the required distributed protection before cohort invite, but Memoire also needs a consistent application-level fallback for expensive API routes.

This contract documents the response shape QA and operators should expect when the app-level limiter blocks a request.

## Current Behavior

Shared helper:

- `api/_rateLimit.js`

Static coverage verifier:

- `scripts/verify-ai-rate-limit-coverage.mjs`

Runtime helper verifier:

- `scripts/verify-rate-limit-runtime-contract.mjs`

Blocked requests now return:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: <seconds>
X-RateLimit-Limit: <limit>
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <unix timestamp seconds>
```

Body:

```json
{
  "error": "Too many requests",
  "retryAfterSeconds": 60
}
```

Some endpoints use a more specific `error` message, but `retryAfterSeconds` and headers remain consistent.

## Covered Routes

The shared 429 contract is used by:

- `/api/ask-memoire`
- `/api/search`
- `/api/structure-capture`
- `/api/capture-ai-classify`
- `/api/generate-embedding`
- `/api/claude-extract`
- `/api/anonymize`
- `/api/request-access`

Privacy-minimized product funnel events intentionally keep accepting with `202` after their quiet limit so analytics failures do not interrupt the user journey.

## QA Evidence

Before cohort invite, capture:

| Evidence | Pass Rule |
| --- | --- |
| App-level limit test | A repeated authenticated call to one expensive endpoint returns `429`. |
| Headers | Response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. |
| Body | JSON includes `retryAfterSeconds`. |
| WAF proof | Vercel Firewall or equivalent protection also denies excess traffic before app execution. |

Automated static verification:

- `npm run verify:ai-rate-limits` confirms the five expensive AI/embedding routes use the shared limiter before provider invocation.
- `npm run verify:rate-limit-runtime` confirms the shared helper returns the documented local runtime 429 body, headers, identity isolation, scope isolation, and forwarded-address fallback.
- `npm run check` includes both verifiers.

## Remaining Gap

This is not distributed protection. In-memory app rate limits can reset across serverless instances and deployments.

A2 remains open until Vercel Firewall, deployment protection, or equivalent distributed controls are applied and evidenced on production or protected preview.
