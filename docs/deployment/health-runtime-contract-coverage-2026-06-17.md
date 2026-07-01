# Health Runtime Contract Coverage

Date: 2026-06-17

Roadmap slice: A1 production readiness, A6 auth redirect readiness, and A7 monitoring readiness.

## What This Verifies

`scripts/verify-health-runtime-contract.mjs` transpiles `api/health.ts` locally, invokes the real handler with mock requests, and verifies the runtime response contract.

The verifier confirms:

- Complete required environment values return HTTP `200` with `ok: true`.
- Missing required environment values return HTTP `503` with `ok: false`.
- `GET` responses include `Cache-Control: no-store`.
- `HEAD` responses return the same readiness status without a JSON body.
- Unsupported methods return HTTP `405` and `Allow: GET, HEAD`.
- The response includes `service: "memoire"`, summary counts, auth redirects, and the full checks array.
- Auth redirect URLs are derived from `VITE_APP_URL` for `/login?verified=1`, `/reset-password`, and `/app/today`.
- Invalid `VITE_APP_URL` fails the `app_url_valid` check and does not generate redirect URLs.
- Secret environment values are not returned in the response body.

## Relationship To Existing A1/A7 Evidence

This complements `scripts/verify-production-readiness-contract.mjs`.

- `npm run verify:production-readiness` confirms the static `/api/health` and `/api/client-log` contracts do not drift.
- `npm run verify:health-runtime` confirms the local `/api/health` handler returns the documented status codes, headers, redirect output, checks, and non-secret response shape.
- The production operator must still capture a real production or protected-preview `/api/health` result with HTTP `200` and `ok: true`.
- The production operator must still confirm deployment dashboard environment values, log visibility, Supabase error review, and AI cost review.

## Gate Impact

A1 improves from static readiness instrumentation to static readiness plus local runtime health proof.

A6 improves because auth redirect URL generation is now runtime-verified from `VITE_APP_URL`.

A7 improves because the health endpoint status and `no-store` behavior are runtime-verified before production monitoring evidence is collected.

A1, A6, and A7 remain open until deployed environment, Supabase Auth dashboard, and production/protected-preview monitoring evidence are captured.

## Operator Command

Run before production-readiness signoff and after changing `api/health.ts`:

```bash
npm run verify:health-runtime
```

`npm run check` also runs this verifier.
