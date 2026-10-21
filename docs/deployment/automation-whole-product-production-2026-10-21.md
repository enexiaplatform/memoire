# Whole-product automation — Production receipt, 2026-10-21

## Delivered behavior

Memoire prepares internal work and dated operating outputs from confirmed
owner-scoped cloud records while the browser is closed. Owners can keep daily
execution or opt into rechecks every 15 minutes after their chosen local start
hour. A daily Plan cap applies across cycles, with stable IDs, leases,
revision/source checks and atomic Plan/output receipts.

Seven work rules cover quotes, customer/self/internal promises, collection
installments, supplier/principal promises, Lead first touch/nurture, order
milestones and qualified opportunities without a dated next action. Handled or
deleted tasks stay handled. Manual edits are preserved; unknown money or receipt
FX cannot dismiss collection work as settled.

Preparation covers Today, Capture reconciliation, overdue Plan work,
Accounts/stakeholders, weekly Review, Margin exceptions, catalog classification,
objections/knowledge/assets, import quality, cloud/recovery context, saved Reports
and saved Dashboards. Saved definitions and canonical financial engines are
reused with an immutable per-run money basis. Missing preferences use the app's
USD default. Browser-only FX overrides are explicitly excluded.

Ask provides supported plain-language rule drafts; preview and Save remain
explicit. No primary destination was added. Configure in
[Settings → Automations](https://www.memoire-official.com/app/settings?tab=automations).
Availability does not activate an account. Email/calendar and outbound messaging
remain deferred. Payments, outcomes, qualification, evidence acceptance, merges,
completion, restore and access changes retain their human workflows. Outputs are
included in export and archive-only on restore; backups cannot replay work or
enable standing permissions.

## Application evidence

- Functional source: `ac298713b0d2a68f9cebf154a49a95564ed2040e`.
- [Exact-source CI](https://github.com/enexiaplatform/memoire/actions/runs/39567806080):
  both jobs passed, including 2,324 tests and the full canonical contract suite.
- Production: `dpl_F32dN8mkke9goTtdyYA8LNqvSy1L`, READY for that source.
- Final display polish reuses canonical metric labels/formatting, shows saved
  report names and removes internal IDs from period labels. Worker and data
  authority are unchanged by that polish.
- Automation tests: 31 cases. Local Settings controls: 1440×900 and 390×900.
  Authenticated Production Today, Reports and Dashboards were exercised;
  the mobile prepared-output view had no page overflow.

## Shared database recovery and apply

Target `mlmpcpkucurylkrobain` was independently checked. Shared Memoire/Helm catalog
and ownership were reconciled; unrelated schema and Cron jobs were preserved.
The ledger advanced from 163 to 166 through exactly these forward files:

1. `20261021072856_memoire_whole_workspace_automation.sql`
2. `20261021075951_memoire_automation_bounded_source_projection.sql`
3. `20261021081049_memoire_automation_uuid_source_validation.sql`

Every apply had a fresh external full database archive and roles backup,
checksums, isolated restore rehearsal and exact pending-chain dry run. Rehearsals
compared 188/189 tables, restoring 18,078 / 18,092 / 18,123 rows respectively and
re-applying captured checks. A large restored owner's snapshot passed below
5 MB after projecting preparation fields. Unused imported notes/provenance and
private contact details are excluded from the preparation snapshot.

The last restored backup also ran the complete worker against its actual schema:
9 Plan creations, 11 outputs, all 7 rules and USD 200 outstanding. Direct
Production probes verified two-owner settings/source isolation, owner reads,
anonymous/direct-write denial and service-only execution. Probe writes rolled back.

Recovery evidence stays outside the checkout under `E:/Memoire-recovery/`, in
separate `automation-2026-10-21-v2`, `automation-2026-10-21-projection` and
`automation-2026-10-21-uuid` directories. They contain sensitive recovery material
and must not be committed or shared as a whole. Managed extensions remain in the
full archive; the local PostgreSQL-compatible rehearsal replays application
schemas, not provider infrastructure or storage-object bytes.

## Scheduled acceptance

Fictional QA was the only enabled owner during acceptance. A temporary one-minute
test trigger used the Production worker while the regular 15-minute job remained
unchanged. The temporary trigger was removed after the first successful run.
A later regular 15-minute Cron cycle ran without Run now starting it.

- First accepted run: 9 Plan items across all 7 rules, a saved brief and 11
  outputs. Immediate repeat skipped; pause was enforced.
- Regular intraday run: 0 creations, 9 items retained, daily cap preserved,
  all 11 outputs refreshed.
- Saved report, browser report and Dashboard: USD 200 outstanding; the confirmed
  overdue installment was USD 30. Source IDs/definition versions were retained.
- Authenticated full export: 11 output rows, 9 Plan rows, no warnings or foreign
  owner rows. Restore routing remains archive-only.

Transient QA issues (oversized imported context and UUID/text validation) were
fixed through forward migrations and rerun successfully. An incomplete fictional
quote label was completed before browser parity comparison; no financial field
was changed for that fixture correction.

## Limits and final state

Bounds: 5,000 rows per source, a 5 MB snapshot, up to 100 outputs / approximately
2 MB per run and a 45-second worker budget. Incomplete or oversized work fails
explicitly. History and output lists are bounded windows; exports retain durable
records. Dated snapshots exclude unsynced device changes and live FX. Cloud
health cannot certify local backups or perform a restore. Review drafts do not
invent reflections or causal outcomes.

Final cleanup verified zero QA users, Plans, settings, runs, outputs, quotes,
commitments and state revisions. QA sessions were revoked and temporary test
scheduler entries removed. The regular 15-minute scheduler remains. No existing
account was enabled by delivery. Final evidence is retained privately with this
receipt.
