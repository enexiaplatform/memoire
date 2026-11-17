# Memoire release readiness

Assessment date 2026-11-17. The development branch contains the architecture baseline and part of Phase 1. The commercial extension has not passed its release gate.

| Requested acceptance | Evidence or gap |
| --- | --- |
| Current product remains operational | Baseline `npm run check` passed with 2,324 tests. Branch `npm run check` passed with 2,335 tests. Local browser Review/sharing preview and signed-out route gating were checked with fictional data. |
| Preserve existing data | The added migration writes no business rows. Populated upgrade tests preserve legacy links and verify same-owner behavior. A hosted data rehearsal and validation of legacy links are pending. |
| Workspace switching and isolation | Existing different-account stale browser responses are rejected on the changed paths. Same-account creation, switching, scope across all channels and copy are still open. |
| Capture integration and deduplication | Existing Capture/Plan and Commercial Event tests run in the full suite. Direct-edit event unification is pending. |
| Optional AI and editable output | Existing Chat consent and draft regressions ran. RFQ extraction, quote drafting and workspace consent for the extension are pending. |
| Money, authorization and failures | Existing deterministic money, RLS, automation lease/retry, visible run history and backup tests ran locally. New commercial approval and event-triggered rule cases are pending. |
| UI continuity | Navigation and route contracts ran. The observed Review retained its existing panel and disclosure controls. Full authenticated, mobile and multi-tab switch workflows remain unverified for this branch. |
| Confidential-data handling | Verification used fictional data and loopback. No production credentials or data were used for testing, and no model provider was contacted. |
| Additive deployment | One local migration adds a trigger. Tests applied it to an isolated migrated PostgreSQL-compatible harness with fictional rows. Hosted migration ledger, backups, production dry run, advisors and deployment are pending. |

## Migration

[`20261117070117_guard_opportunity_account_owner.sql`](../../supabase/migrations/20261117070117_guard_opportunity_account_owner.sql) verifies the account owner on insert and on changed owner/account pair. It uses invoker privileges, a pinned search path, a row lock on a matching account and a revoked direct function grant. It leaves the existing foreign key and its delete semantics in place.

The migration does not repair already divergent links or govern soft references. Existing unchanged legacy links retain current behavior. On a new or changed link the write can fail with the standard foreign-key violation code. SQL-level verification used the local harness. Managed Supabase lock timing and catalog state were not measured.

## Gate status

| Phase | Status |
| --- | --- |
| 0. Audit and safeguards | Complete locally. |
| 1. Workspace reliability | In progress. Current owner isolation hardening is verified. Full same-account isolation, settings and previewed copy remain open. |
| 2. Capture and consistency | Pending the Phase 1 gate. |
| 3. Automation foundation extension | Pending. The existing scheduled engine remains available to extend. |
| 4. Commercial AI MVP | Pending. |
| 5. Release | Pending. No production migrations, access changes or deployments were performed. |

A production approval request is premature until the remaining workspace gate and applicable release tests pass. The branch assumes the working single-owner data model remains the default through any staged schema transition. Distinct workspace identity requires coordinated changes across browser cache, query and link authorization, report/export scope and background execution.
