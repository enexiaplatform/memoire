# Rate-Limit Runtime Contract Coverage

Date: 2026-06-17

Roadmap slice: A2 expensive endpoint protection and R1 rate-limit drift prevention.

## What This Verifies

`scripts/verify-rate-limit-runtime-contract.mjs` executes the shared app-level rate-limit helper directly.

The verifier confirms:

- The first request inside a bucket is allowed.
- Remaining count decreases across repeated requests.
- A request beyond the configured limit is blocked.
- The blocked response returns HTTP `429`.
- The blocked JSON body includes `error` and `retryAfterSeconds`.
- The blocked response includes `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- Allowed header application does not add `Retry-After`.
- Buckets are isolated by identity.
- Buckets are isolated by scope.
- Missing identity falls back to the forwarded client address.

## Relationship To Existing A2 Evidence

This complements `scripts/verify-ai-rate-limit-coverage.mjs`.

- `npm run verify:ai-rate-limits` proves expensive routes still call the shared limiter before provider invocation.
- `npm run verify:rate-limit-runtime` proves the shared limiter's runtime 429/header/body contract behaves as documented.
- The production operator must still capture one real deployed app-level 429 response from an expensive endpoint before using A2 as cohort evidence.
- The production operator must still capture Vercel Firewall, deployment protection, WAF, or equivalent distributed-control evidence.

## Gate Impact

A2 improves from static app-level route coverage to static route coverage plus local runtime helper proof.

R1 improves because future changes that break `Retry-After`, rate-limit headers, JSON shape, identity isolation, or scope isolation will fail `npm run check`.

A2 remains open until distributed protection and deployed endpoint evidence are captured on production or protected preview.

## Operator Command

Run before expensive-endpoint QA, and after changing `api/_rateLimit.js` or endpoint rate-limit usage:

```bash
npm run verify:rate-limit-runtime
```

`npm run check` also runs this verifier.
