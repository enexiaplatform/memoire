# Lead Operations Runtime Contract Coverage

Date: 2026-06-17

Roadmap slice: A5 request-access operations, A9 cohort intake readiness, and R5 lead handling risk.

## What This Verifies

`scripts/verify-lead-operations-runtime-contract.mjs` transpiles `api/request-access.ts` locally and executes the pure request-access helpers.

The verifier confirms:

- The product-event allowlist includes every expected funnel event.
- The data-mode allowlist includes demo, cloud, browser-only, sync-issue, and unknown modes.
- Lead text fields are trimmed and capped before storage.
- Work email is normalized to lowercase before rate limiting and insertion.
- Invalid email, missing consent, missing current tool, and missing required fields are rejected.
- Honeypot submissions are detected and classified for quiet success without storage.
- Lead payload stores only the normalized operational fields and `source: "request_access_page"`.
- Lead payload does not store the honeypot website field or raw consent boolean.
- Product funnel events preserve allowlisted event name, anonymous id, clean route, and data mode.
- Event routes with query strings or fragments are blanked.
- Unknown events, short anonymous ids, and unknown data modes are rejected.

## Relationship To Existing A5 Evidence

This complements `scripts/verify-lead-operations-contract.mjs`.

- `npm run verify:lead-ops` confirms the Request Access UI, endpoint, migrations, query pack, runbook, release gate, and cohort packet stay aligned.
- `npm run verify:lead-ops-runtime` confirms the lead and funnel-event payload builders behave correctly before Supabase insertion.
- The production operator must still submit one production or protected-preview Request Access lead and process it through the operator queue.

## Gate Impact

A5 improves from static lead-operations coverage to static coverage plus local runtime payload proof.

A9 improves because the cohort intake path now has runtime proof for normalized lead fields and privacy-minimized funnel events.

R5 improves because future changes that weaken validation, normalization, honeypot handling, route cleaning, event allowlists, or payload shape will fail `npm run check`.

A5 remains open until one real lead is submitted, retrieved, claimed, contacted, decided, and retention-reviewed in production or protected preview.

## Operator Command

Run before first cohort invite and after changing `api/request-access.ts`:

```bash
npm run verify:lead-ops-runtime
```

`npm run check` also runs this verifier.
