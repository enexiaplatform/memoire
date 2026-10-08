# Dashboard schema repair — 2026-10-03

Status: **REPAIRED — authenticated Production acceptance passed.** This supersedes the missing-schema and credential blockers recorded in `dashboard-schema-incident-2026-10-02.md` for this incident. It does not certify every separate Next-Gen product workflow.

## Cause and deployed repair

Production at `https://www.memoire-official.com` uses Supabase `mlmpcpkucurylkrobain`, shared with Helm. Fresh read-only inspection confirmed that `portfolio_records`, `report_definitions`, `dashboard_definitions`, and `restore_commercial_history(jsonb)` were absent. The migration ledger contained 133 entries. Reloading the library or rebuilding the frontend could not create these objects.

The updated private database credential connected successfully. The existing 24-file forward chain, from `20260918143518_commercial_conditions.sql` through `20261001113530_dashboard_definitions.sql`, was replayed successfully against a restored copy of the actual shared application baseline, then applied through Supabase CLI 2.119.0. The resulting live ledger has 157 entries, including all four catalog/backup migration versions. The restore RPC now accepts format 18. No application source change or redeployment was needed; the verified application SHA remains `9ab5df28ea15e36503cde9aff5beda82158f1429`.

## Backup, reconciliation and execution evidence

- Full PostgreSQL 17 custom archive, roles without passwords, archive inventory and checksums were retained outside the checkout at `E:/Memoire-recovery/dashboard-2026-10-03/full-backup`. Archive SHA-256: `B39D4B9896F4A33D110E66905698FAFD16C36D017ED0187D69ADA82D95928296`.
- Restoration rehearsal covered the shared `public`, `auth`, `storage`, `supabase_migrations`, `helm_private` application schemas, using PostgreSQL-compatible PGlite with vector, pgcrypto and uuid extensions. All 163 original tables compared with matching row counts and content digests. Live Storage contained zero objects. Provider infrastructure and managed extensions outside this scope remain in the full archive; this was not a full Supabase service disaster-recovery rehearsal.
- Helm columns, policies, functions and triggers matched after rehearsal and deployment. Post-deployment comparison confirmed that original data and all 133 original migration records remained unchanged; the 24 new ledger records were the expected addition.
- The isolated CLI migration workspace materialized the exact 133 recorded remote SQL histories, plus the 24 unchanged, SHA-256-verified repository migrations. Fresh schema/ledger capture immediately before execution matched the rehearsed baseline. CLI migration-list and dry-run identified exactly the reviewed 24 files. `db push --include-all --skip-vault --yes` applied them in order. No ledger repair, historical migration replay, Helm mutation, password reset or Vault update was performed.
- Private receipts: `live-before.json`, `live-immediately-before.json`, `live-after.json`, `forward-manifest.json`, CLI logs, `rehearsal-result.json`, `rehearsal-verification.json`, `deployment-result.json`, and `live-acceptance.json` in the external recovery directory.

## Acceptance

- `npm run check`: build, API typecheck, lint, contract suite and **2,078 tests passed**, zero failures. The three focused database tests also passed.
- Real Production Auth and REST acceptance used two disposable authenticated accounts. Owner insert/read/update/delete succeeded across all three catalogs; foreign reads returned no records, foreign writes were rejected, anonymous access was denied, and sample/demo writes failed constraints. A divergent dashboard revision was rejected. Both test accounts and their associated data were removed; original data digests still matched.
- The live format-18 restore RPC succeeded for an empty disposable workspace.
- Authenticated Production browser acceptance passed dashboard cloud load, execution, save/reload, desktop and 390px mobile rendering. Reports and Products & Brands also loaded without missing-schema errors. No browser runtime errors or failed catalog REST requests were observed.
- `scripts/verify-dashboards-browser.mjs` ran against the Production application in isolated demo mode: creation/reorder, shared report results, filters, drill-through, export, failed-refresh state, archive/restore, mobile, quota refusal, and demo reset/isolation passed. Demo catalog calls stayed outside cloud persistence.
- Supabase security/performance advisors were checked after DDL. No notices identified any of the three new catalog tables. Existing project-wide notices were not expanded into unrelated changes. Reference: [Supabase database advisors](https://supabase.com/docs/guides/database/database-linter).

Authenticated browser screenshots are retained as `dashboard-production-desktop.png` and `dashboard-production-mobile.png` in the recovery directory. These use disposable test data, not the customer's records.

The user can reload the existing Dashboards page. The backend objects and owner policies are now deployed and verified.
