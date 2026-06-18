# Memoire AI Endpoint Rate-Limit Coverage

Date: 2026-06-17

Roadmap slice: Gate A2 / R1 app-level coverage verification

## Decision

Memoire now has an automated static verifier for app-level rate-limit coverage on the expensive AI and embedding endpoints.

This does not close A2. It proves that the code path still has a shared app-level limiter before provider invocation. A2 remains open until distributed protection is applied and evidenced on production or protected preview.

## Covered Expensive Routes

| Route | Expected Scope | Provider Call Must Occur After Limiter | Current Static Status |
| --- | --- | --- | --- |
| `/api/ask-memoire` | `ask-memoire` | Ask Memoire synthesis | Covered by verifier |
| `/api/search` | `search` | embedding plus Groq synthesis | Covered by verifier |
| `/api/structure-capture` | `structure-capture` | Claude or Groq structuring | Covered by verifier |
| `/api/capture-ai-classify` | `capture-ai-classify` | configured openAI-compatible provider call | Covered by verifier |
| `/api/generate-embedding` | `generate-embedding` | OpenAI embedding generation | Covered by verifier |

## Automated Guard

Added:

- `scripts/verify-ai-rate-limit-coverage.mjs`
- `scripts/verify-rate-limit-runtime-contract.mjs`
- `npm run verify:ai-rate-limits`
- `npm run verify:rate-limit-runtime`

Included in:

- `npm run check`

The verifier checks:

- Each expensive route imports the shared rate-limit helper.
- Each route uses the expected rate-limit scope.
- Each route checks `rateLimit.allowed`.
- Each route uses the shared JSON 429 helper.
- Each route reaches provider invocation only after the limiter.
- The shared helper returns rate-limit headers and `retryAfterSeconds`.
- `docs/deployment/vercel-firewall-cohort-rules.json` still references every expensive route.
- The release gate and cohort release packet point to this verifier.
- The runtime helper verifier proves the shared 429/header/body behavior, identity isolation, scope isolation, and forwarded-address fallback.

## Runtime Evidence Still Required

Before inviting the first cohort, capture:

| Evidence | Pass Rule |
| --- | --- |
| App-level runtime 429 | A repeated authenticated call to at least one expensive endpoint returns HTTP 429. |
| App-level headers | The 429 includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. |
| Distributed rule proof | Vercel Firewall, deployment protection, WAF, or equivalent distributed control is active for the five expensive routes. |
| Firewall event proof | Firewall logs show excess traffic denied or rate-limited before app execution. |
| Normal user proof | A normal signed-in cohort workflow still reaches AI functionality without being challenged. |

## Gate Impact

A2 improves from "documented app-level limiter and firewall payload" to "documented app-level limiter, firewall payload, and automated static coverage verification."

A2 remains open because static code coverage cannot prove distributed protection is active in production.
