# Memoire PR #20 — stabilization and release readiness (2026-11-25)

**Status:** development-only. **No production GO.** This packet records inspected source relationships and an executable hosted-validation checklist; it does **not** attest hosted staging.

## Source / dependency map

| Layer | Source | Decision |
| --- | --- | --- |
| Production baseline | `master` at `f888f06e5c86108a5509a561bbd72f551bf0cb89` when inspected | Do not change without a separate approved release |
| Integration verification | Draft PR #19 at `58be1131d82d71dddf4cf3008a5e261df459ef8f` | Verification-only; **do not** merge the entire tree |
| UX + Review/Capture/Plan development | Draft PR #20, stacked on PR #19 | Integration candidate only; isolate intended implementation from verification infrastructure |
| Plan completion | Draft PR #8 and related stacked changes | Disposable PostgreSQL/PostgREST and Chrome pass, but hosted release **NO-GO** |
| Review Plan status projection | `supabase/migrations/20261122080000_review_plan_status.sql` | Depends on Plan receipt schema below; do not apply ahead of it |
| Plan receipt schema | `supabase/migrations/20261118053205_plan_completion_receipts.sql` | Additive schema, with private receipts and legacy writer protection |

The Review RPC uses a `SECURITY DEFINER` function, empty `search_path`, authenticated-only execution grant, live Auth session verification, effective workspace resolution, and private receipt matching. Its privileges, policy dependencies, session-revocation behavior, deployment ordering, and rollback handling must be rechecked on **hosted isolated staging**, not inferred from a disposable service.

## Development UX increment

The Review follow-up UI presents authorized status counts (Planned, Reported Done, Verified Done, confirmed outcomes), more structured row cards and a primary **Open in Plan** link with other existing actions grouped in a labelled navigation region. The UI uses the already-authorized Review result; it adds no network reads, schema change, or commercial writes.

- UI implementation commit: `3288650b783c99a4401ab95f4fb39213a29db36e`
- Targeted browser assertions commit: `8fad2f77004f79e5ec6e5f153c5ad6a3a037a39a`
- Exact-head CI and Chrome must pass **after** these commits before the UX increment is called verified.
- No actual hosted visual usability session has been completed by this packet.

## Hosted release gates — all remain BLOCKED pending evidence

| Gate | Reproducible hosted test | PASS evidence |
| --- | --- | --- |
| G1: Actual Auth token revocation | Login to isolated hosted project; revoke real session while Review/Capture is open; attempt scoped read and pending completion | Auth-side revocation timestamp, denied HTTP result, cleared stale UI and redacted logs |
| G2: Offline / uncertain ACK | During Plan completion, disconnect after request dispatch, interrupt ACK, reconnect and replay identical request | Same durable receipt, no double Activity, correct Plan state after refresh |
| G3: In-flight workspace switch | Hold a live hosted Plan/Review read; switch between personal and named workspaces; then release old response | No stale records/caches rendered or persisted, correct subsequent authorized data |
| G4: Migration and rollback | Apply Plan receipt migration **before** Review projection on isolated staging with synthetic legacy data; exercise rollback with `PLAN_COMPLETION_ENABLED=false` | Applied migration ledger, verified receipt-read compatibility, preserved legacy rows, rollback rehearsal and operator sign-off |

**Do not use production Supabase**, live commercial data, or a production Vercel deployment as a substitute for isolated staging. Real hosted infrastructure is not identified or provisioned in this packet. Provisioning paid or production resources is out of scope. Avoid publishing secrets or test-user tokens.

## Clean integration sequence (preparation only)

1. Freeze the exact heads and source PR dependencies; inventory changed files and verify no verification-only scripts or preview credentials are unintentionally promoted.
2. Build a **separate** release candidate from approved baseline, bringing in narrowly approved source changes and their dependency order. Never merge PR #19 wholesale merely to get PR #20.
3. Apply the **Plan receipt** schema before the **Review status** projection on isolated staging. Test supported rollback/flag behavior; do not drop receipt tables to roll back UI.
4. Run typecheck, lint, unit/contract, PostgreSQL/PostgREST (incl. RLS), real Auth/GoTrue, repeat Chrome and accessibility / mobile checks against the candidate exact head.
5. Close G1–G4 using real hosted evidence, and verify the production change/rollback decision separately.
6. Keep autonomous consequential writes/dispatch disabled until separately authorized; preserve human confirmation for Plan and Capture writes.

## Decision log

- **Engineering development:** UX and regression changes committed on Draft PR #20; CI status must be checked against its newest head.
- **Hosted staging:** **NO-GO / unverified**.
- **Production merge, migration and deployment:** **NO-GO**, no action authorized here.
- **Rollback:** Plan completion feature flag `PLAN_COMPLETION_ENABLED=false` per PR #8. Confirm this strategy in hosted staging before relying on it; retain additive migrations and durable receipts.

Links: [PR #8](https://github.com/enexiaplatform/memoire/pull/8) · [PR #19](https://github.com/enexiaplatform/memoire/pull/19) · [PR #20](https://github.com/enexiaplatform/memoire/pull/20)
