# Dashboard schema incident — 2026-10-02

Status: root cause verified; production repair blocked by invalid database credentials and no verified recovery point. No production schema changes made.

## Live evidence

- Vercel production deployment `dpl_4GWHY45MXbskijn7xweBgM4FuVRG` is READY at commit `9ab5df28ea15e36503cde9aff5beda82158f1429`; aliases include `www.memoire-official.com` and `memoire-official.com`.
- Public production JavaScript embeds `https://mlmpcpkucurylkrobain.supabase.co`. That matches the repository configuration and Supabase project `memories`, ACTIVE_HEALTHY, ap-south-1, PostgreSQL 17.6.1.104. A deployment rebuild or project switch does not repair this missing schema.
- PostgreSQL catalog inspection returns no `public.portfolio_records`, `public.report_definitions`, or `public.dashboard_definitions`, and no Portfolio-named relation in another application schema.
- Fresh production ledger has 133 entries, latest `20260930111633`; neither Portfolio migration nor the Reports/Dashboards migrations is recorded.
- Read-only REST requests reproduce HTTP 404 / `PGRST205` for all three tables. This is an absent physical table, not merely a stale PostgREST cache or a missing role grant.
- `public.restore_commercial_history(jsonb)` is also absent. The later backup-format migrations cannot run against the current baseline.
- A fresh read-only direct PostgreSQL connection attempt using the existing `.env.local` session-pooler credential fails with `28P01`, password authentication failed. No credential is recorded here. Details without secrets are in ignored `.memoire-private/schema-audit-runtime/connection-result.json`.

## Intended canonical entity and code references

`portfolio_records` is the canonical owner-scoped, versioned catalog and primary classification collection, with kinds `unit`, `brand`, `group`, `product`, and `assignment`. Business facts remain in Opportunities, Orders and the existing money sources. Its stable text ID and `payload` history are part of the persistence contract.

Direct reads/writes are in `src/services/portfolioStore.ts` (`loadPortfolio` and cloud upsert); the table is registered in `src/services/cloudJsonCollectionStore.ts`, `src/services/canonicalDurability.ts`, `src/utils/workspaceBackup.ts`, and `api/export.ts`. `src/features/dashboards/DashboardsPage.tsx` loads Portfolio, Reports and Dashboards together; Reports also loads Portfolio. Tests and browser verification reference the same table.

The initial `public.entities` table is the legacy generic entity graph with UUID identities and attributes. `public.helm_entities` belongs to Helm's organization-scoped ontology with `org_id`, type IDs and canonical keys. Neither has the Portfolio payload/ownership/history contract. No repository migration renames Portfolio to either entity, and no inspected schema supplies a compatible replacement. Redirecting Portfolio queries there would change the data model and access boundaries.

## Existing repair migrations

| File | Purpose / prerequisite |
| --- | --- |
| `20261001071024_portfolio_records.sql` | Canonical table, authenticated owner RLS, explicit grants, payload constraints, divergent revision protection. Depends on Supabase Auth. |
| `20261001073327_portfolio_backup_format.sql` | Extends existing verified format-15 restore RPC to format 16. |
| `20261001074206_report_definitions.sql` | Saved report definitions and revision guard; extends restore format 16 to 17 in the same migration. |
| `20261001113530_dashboard_definitions.sql` | Saved dashboard definitions and revision guard; extends restore format 17 to 18 in the same migration. |

Creating only Portfolio would leave the two other dashboard dependencies missing. Applying the last three files directly would fail because the restore RPC and its predecessor migrations are absent. Do not split their restore guards away, create a duplicate catalog, mark absent migrations applied, or silently fall back to another entity.

## Execution path

1. Configure a valid existing database credential privately. If replacing/resetting it is necessary, coordinate the shared Memoire/Helm consumers; do not reset it implicitly.
2. Retain a recoverable shared-target backup outside the checkout and rehearse restoration, as required by `next-gen-core-release-runbook.md` steps 1–2 and `p1-production-gate-resolution-2026-10-02.md`.
3. Capture fresh live schema and ledger; reconcile legacy Memoire versions and the separate Helm chain without changing Helm ownership. The existing 24-file forward inventory is preparation, not proof that a blind repository push is safe.
4. Replay the reconciled shared baseline and reviewed prerequisite chain in isolation. Verify `restore_commercial_history(jsonb)` through format 15, then apply the four existing catalog migrations in order above. Dry-run alone does not validate their SQL.
5. Apply the reconciled migrations once to the verified production target, then verify ledger, tables, policies, grants, constraints and revision guards. Refresh the PostgREST cache only if the tables now exist but API discovery remains stale.
6. Verify signed-in dashboard load, owner CRUD/reload, foreign-owner rejection, demo exclusion and backup/restore format 18. Report production repaired only after those checks pass.

## Validation performed

The existing Portfolio domain, storage and database tests pass: 14 tests, zero failures, including two-owner isolation, anonymous denial, demo rejection, divergent revision rejection and linked backup integrity. The Reports and Dashboards database tests also pass (two additional tests), covering owner/anonymous/demo/revision boundaries. These are isolated tests, not production acceptance. Live schema/catalog/ledger and REST evidence were checked independently.

The actionable blocker is a credential rejected by PostgreSQL, followed by backup/restoration and shared-schema reconciliation. Management SQL access is available for inspection; it does not establish a recoverable backup.
