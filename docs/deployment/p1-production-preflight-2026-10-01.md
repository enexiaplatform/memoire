# Production preflight — 2026-10-01

The user asked to resolve the remaining Production schema/recovery gate and publish Portfolio. Starting remote `main`: `e3b91d5bacf1e09a8c80814a04fd90e0c55f9e6a`. This document records preparation, not Production approval.

## Verified target and actual drift

Authenticated Supabase Management access reidentified `mlmpcpkucurylkrobain` (`memories`, ap-south-1, PostgreSQL 17.6.1.104) as active. The shared target contains Memoire and Helm. The fresh ledger has **133** entries, including Helm changes since the September 28 audit. The former 94-entry ledger must not be reused as a deployment baseline.

Fresh column, constraint, policy and ledger metadata is retained under the ignored `.memoire-private/production-release-2026-10-01/` directory. It contains **metadata only and is not a database backup**. Matching legacy column types and nullability have no differences in this comparison, but absent legacy columns/objects remain in captures, deals, early-access operator functions/views, usage_monthly and user_profiles. Column agreement does not prove function, grant, policy, constraint, data or historical migration equivalence.

The 14 previously identified required roadmap tables are still absent, as are the internal history-restore context, `portfolio_records` and `report_definitions`. Supabase Auth and Helm objects remain outside Memoire's migration ownership. Missing legacy views and the unused legacy deals table are separate reconciliation items; they are not automatically recreated from a table-name comparison.

## Release chain and isolated verification

The source snapshot has 67 migration files. The 23-file forward chain starts with `20260918143518_commercial_conditions.sql` and ends with `20261001074206_report_definitions.sql`. A private inventory records each file's SHA-256 and compares its version with the live ledger. All 23 versions are currently unrecorded. This does **not** authorize blindly running `db push`: older source filenames also differ from the live migration history, and equivalent effects need explicit reconciliation.

The complete source migration chain and the pre-M2-to-current transition replayed successfully in isolated PostgreSQL. The source release passed `npm run check` with **2,059 tests and zero failures**, build, API typecheck, lint and the full contract suite. Portfolio and Reports browser checks passed separately, including owner/demo isolation, save refusal, primary classifications, frozen report results, drill-through, complete CSV exports, linked cash figures, lifecycle edits and mobile layout. These results certify the tested source snapshot, not the full shared live target or a recovery rehearsal.

## Remaining operational input

The process and workspace have no `DATABASE_URL`, direct PostgreSQL password, `PGPASSWORD` or Supabase personal access token. Existing project URL, browser key and service-role API key are not PostgreSQL backup credentials. No PostgreSQL dump tools or Docker runtime were found in the inspected standard paths.

A fresh authenticated dashboard check at this target's Database → Backups page shows the organization is still on **Free** and explicitly states that the Free plan does not include project backups. No existing provider recovery point was offered in this view. No upgrade was requested or performed.

Configure a direct or session-pooler PostgreSQL connection for **this target** as `DATABASE_URL` in the ignored `.env.local`; do not send secrets through chat or commit them. After access is available, use a compatible PostgreSQL client to retain roles (without role passwords), schema, data and migration history; include Memoire and Helm, retain checksums and rehearse restoration outside Production. Do not reset the database password or upgrade the subscription implicitly.

Re-capture the actual target and migration ledger immediately before preparing the bounded additive reconciliation. Replay that captured baseline with the reviewed reconciliation and all forward migrations, then execute the [release runbook](next-gen-core-release-runbook.md), including RLS, revision rollback, restore, owner isolation and authenticated browser checks. Apply the reviewed sequence once. Only after those gates pass should Vercel Production be switched to `main` and the exact verified application release deployed.

**Production remains NO-GO until recoverable backup, restoration evidence and actual-target reconciliation are complete.** No live DDL, canonical mutations, ledger repairs, password resets, billing changes or Production promotion were performed during this preflight.
