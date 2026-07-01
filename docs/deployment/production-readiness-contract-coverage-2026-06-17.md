# Memoire Production Readiness Contract Coverage

Date: 2026-06-17

Roadmap slice: Gate A1 / A7 production readiness contract verification

## Decision

Memoire now has actual `/api/health` and `/api/client-log` endpoints plus automated static and local runtime verifiers for the production readiness and operator monitoring contracts.

This does not close A1 or A7. It proves the app still has the expected health-check endpoint, response shape, and sanitized client-log endpoint behavior. A1 and A7 remain open until production or protected-preview evidence is captured.

## Covered Contracts

| Surface | Contract | Current Static Status |
| --- | --- | --- |
| `/api/health` | Supports `GET` and `HEAD`, returns `405` for other methods, and sets `Cache-Control: no-store`. | Covered by verifier |
| `/api/health` | Required checks cover Supabase URL, anon key, service-role key, app URL, valid app URL, AI generation provider, and OpenAI embeddings. | Covered by verifier |
| `/api/health` | Warning checks cover HTTPS app URL, non-localhost app URL, demo mode, and founder workspace mode. | Covered by verifier |
| `/api/health` | Optional checks cover capture AI config, Stripe config, and `billing_checkout_disabled`. | Covered by verifier |
| `/api/health` | Auth redirect output includes verification, reset-password, and `/app/today` return paths without exposing secret values. | Covered by verifier |
| `/api/client-log` | Accepts only allowlisted operational events and data modes. | Covered by verifier and local runtime invocation |
| `/api/client-log` | Rejects arbitrary event names without logging them. | Covered by local runtime invocation |
| `/api/client-log` | Rate limits repeated submissions and quietly returns `202` after the quiet limit. | Covered by verifier and local runtime invocation |
| `/api/client-log` | Writes sanitized server-log JSON with the `Memoire client operational event` marker. | Covered by verifier and local runtime invocation |

## Automated Guard

Added:

- `scripts/verify-production-readiness-contract.mjs`
- `scripts/verify-health-runtime-contract.mjs`
- `npm run verify:production-readiness`
- `npm run verify:health-runtime`

Included in:

- `npm run check`

The static verifier checks that the health endpoint, monitoring endpoint, readiness docs, monitoring docs, release gate, and cohort release packet stay aligned.

The runtime verifier transpiles `api/health.ts` locally and confirms:

- Complete required env returns HTTP `200` with `ok: true`.
- Missing required env returns HTTP `503` with `ok: false`.
- `GET` returns `Cache-Control: no-store`, readiness summary, checks, and auth redirect output.
- `HEAD` returns readiness status without a JSON body.
- Unsupported methods return HTTP `405` with `Allow: GET, HEAD`.
- Auth redirect URLs are derived from `VITE_APP_URL`.
- Secret environment values are not returned in the response body.

The same verifier transpiles `api/client-log.ts` locally and confirms:

- A valid allowlisted operational event returns HTTP `202`.
- The server log includes `Memoire client operational event`.
- Routes with query strings are rejected from the logged route field.
- Error text is capped at 240 characters.
- Unknown event names return HTTP `400`.
- Unsupported methods return HTTP `405` with `Allow: POST`.
- Repeated logs over the local limit return HTTP `202` without writing another server log.

## Runtime Evidence Still Required

Before inviting the first cohort, capture:

| Evidence | Pass Rule |
| --- | --- |
| Production or protected-preview `/api/health` | HTTP `200`, `ok: true`, `requiredFailed: 0`. |
| Auth redirect proof | `/api/health` auth redirect URLs match Supabase Auth Site URL and Redirect URL allowlist. |
| Client operational log proof | A test or real client failure emits `Memoire client operational event` in deployment logs. |
| Operator log filter proof | Operator can filter Vercel logs for both allowlisted client event names. |
| Monitoring owner | Named daily review owner is recorded in the cohort packet. |
| AI cost proof | AI usage/cost page or alert destination is captured for the cohort environment. |
| Supabase operational proof | Auth and database logs are reviewed for the deployment environment. |

## Gate Impact

A1 improves from "readiness endpoint is described" to "readiness endpoint exists and its local runtime response shape is automatically verified."

A6 improves because auth redirect URL generation is now checked at local runtime.

A7 improves from "client-log instrumentation is described" to "client-log endpoint exists and monitoring, sanitization, quiet rate-limit, and health response contracts are automatically verified."

A1 remains open because the production deployment still needs real `/api/health` evidence.

A7 remains open because deployment logs, owner, Supabase review, and AI cost evidence still need to be captured.
