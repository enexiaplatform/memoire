# P1 production audit — deployment pending

Starting SHA: `6df0a583ceae41fc09d3bd3d6f392ec8535c11bc` (clean).

The configured application target and authenticated Supabase project inventory agree on `mlmpcpkucurylkrobain` (`memories`, ap-south-1). The production project contains both Memoire and Helm in the public schema. No production DDL, canonical mutations, migration-history repairs, deployment, password reset, or plan changes were performed.

## Evidence and boundary

- Authenticated SQL inspection returned 94 migration-history entries. Most historical Memoire migration versions differ from their repository filenames, and Helm owns a separate chain. Blind `db push`, wholesale migration repair, and marking the repository chain applied are not justified.
- All nine R1 tables are absent: Conditions, Requirements, Dependencies, Timing, Decisions, history coverage, State Revisions, Money Gates and Decision Observations. `commercial_evidence` and `pipeline_defense_briefs` already exist; existence alone does not prove complete shape equivalence.
- A fresh embedded PostgreSQL replay of the complete pre-M2 repository chain was compared with the live column catalog. Matching columns have matching PostgreSQL types and nullability. Older differences include Capture anonymization fields, profile acknowledgment fields, the legacy deals table, usage-month fields, and operator fields/views. This is a column comparison, not proof of constraint, function or policy equivalence.
- Raw catalog evidence and the comparison are retained locally under `.memoire-private/p1-20260928/` and excluded from version control. The catalog is metadata, **not a database backup**.
- Supabase CLI 2.118.0 is available through npx, but project listing fails with `AccessTokenRequiredError`. No linked-project configuration, direct PostgreSQL credentials, pg_dump installation or Docker runtime was found in the inspected environment.
- Normal GitHub sign-in reached the Supabase dashboard. It shows the Free plan and **No backups** for the target. No paid upgrade or new credentials were created. A full pre-deployment recovery point remains unavailable through the currently configured deployment tooling.

## Reconciliation path

1. Supply deployment-grade database access and retain a restorable full target backup, including roles, schema, data and migration history. Protect Helm as well as Memoire. Rehearse recovery outside production.
2. Capture the actual target schema and historical migration statements. Compare each Memoire migration's effects, including constraints, policies, grants, functions and triggers. Retain Helm ownership and history; do not import Helm into Memoire's domain model.
3. Review a bounded additive reconciliation for genuinely absent legacy objects. Match equivalent historical versions using evidence; never infer equivalence from a migration name or table name.
4. Replay that target baseline plus the reviewed reconciliation and all nine R1 migrations in an isolated database. Execute the release runbook's RLS, revision rollback, historical restore and two-user matrix there before target writes.
5. Apply the evidenced sequence once, then execute every live release gate against the exact release SHA. The local suite cannot substitute for target verification.

## Verification and gate

`npm run check` passed: build, API typecheck, lint, **1,834 tests**, and all repository contracts. `node scripts/verify-next-gen-browser.mjs` passed the rich Opportunity, Scenario non-mutation, comparable Decision cases, console-error and narrow-viewport checks against the local app.

Persistence/UX: no application schema, persisted commercial concepts or product UI changed in P1. Target backup/restore, live migration application, target RLS execution, authenticated browser verification and production latency remain unverified.

**PRODUCTION DEPLOYMENT PENDING.** Production is NO-GO until recovery access and reconciliation are complete. Roadmap development may continue under the user's explicit P1 access exception; this does not certify production or mark P1 complete.
