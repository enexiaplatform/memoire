# Commercial Operating Loop Contract Coverage

Date: 2026-06-17

Roadmap slice: C3 weekly production monitoring, R7 operator funnel usability, and Session 12 commercial operating loop.

## What This Verifies

`scripts/verify-commercial-operating-loop-contract.mjs` keeps the operating loop from drifting while Memoire moves toward paid early access.

The verifier confirms:

- The weekly operating review template still requires funnel SQL, cohort tracker rows, support notes, `/api/health`, Vercel errors, client operational events, Supabase errors, AI cost, and data-boundary issues.
- The weekly review still includes scorecard targets for activation, value, retention, trust, paid intent, support, reliability, and AI spend.
- The release-gate review still covers A1 through A10 plus C3 and C5.
- The monitoring review still covers health, function errors, client operational events, Supabase Auth/database errors, AI provider cost, and Stripe/webhook errors if enabled.
- The operator funnel query pack still covers daily funnel metrics, 7-day activation, anonymous journey progress, early-access queue, lead workflow actions, and retention review.
- Operator funnel views remain service-role-only and privacy-minimized.
- Completed weekly reviews have a durable storage location under `docs/operations/weekly-reviews/`.
- The release gate, roadmap, and cohort packet all reference the operating-loop verifier.

## Commercial Impact

R7 improves from missing query-pack evidence to static operating-loop coverage because the funnel SQL pack and weekly operating review are now bound together by `npm run verify:commercial-operating-loop`.

C3 improves from template-only readiness to guarded operating-loop readiness. C3 remains open because no completed weekly review with real cohort/production evidence has been saved yet.

A7 improves because daily/weekly monitoring expectations are tied to the same operating cadence, including `/api/health`, client operational events, Supabase errors, and AI cost.

## Runtime Evidence Still Required

Before C3 can pass, the operator must save at least one completed review in:

```text
docs/operations/weekly-reviews/YYYY-MM-DD-operating-review.md
```

That completed review must include:

- Funnel metrics from `docs/product/operator-funnel-queries-2026-06-16.sql`.
- Support status and any SEV0/SEV1 decisions.
- Production `/api/health` result.
- Vercel function error and client operational event review.
- Supabase Auth/database error review.
- AI usage/cost review.
- Release-gate decisions and named next-action owners.
- Any accepted risk, or an explicit statement that no risk was accepted.

## Operator Command

Run before weekly operating review signoff and after changes to funnel queries, monitoring runbooks, cohort packet, or release gate:

```bash
npm run verify:commercial-operating-loop
```

`npm run check` also runs this verifier so operating-loop drift is caught with the rest of the commercial release gates.
