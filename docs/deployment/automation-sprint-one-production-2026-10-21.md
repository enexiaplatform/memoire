# Automation Sprint 1 — Production setup, 2026-10-21

## Outcome

The opt-in Today brief, quote follow-up reminders and commitment reminders now
have Production storage, configured execution and a working background scheduler.
Email/calendar integration is deferred following the user's instruction.

This configures availability; it does not enable standing permissions for
existing accounts. The final check found zero saved rules, zero enabled owners
and zero run receipts after the temporary QA account was removed.

Owners can open [Settings → Automations](https://www.memoire-official.com/app/settings?tab=automations),
select rules/timezone/hour/limits, preview, enable and save. The scheduler checks
every 15 minutes. Each owner can complete only one run per local business date;
the owner's configured hour determines when it becomes eligible. Additional
changes after that completed run take effect on the next local day.

## Application and target

- Source: `master`, commit `31f454ef6bc45a4c195fff9779c91ef391a7e42a`.
- [Exact-source CI](https://github.com/enexiaplatform/memoire/actions/runs/39454948576):
  both jobs completed successfully, rechecked during setup.
- Vercel Production deployment: `dpl_B4y9bVDsgHJKnBQRg4XWWW87TVYi`, READY;
  alias `www.memoire-official.com`. This redeployed the same source with the new
  Production-only configuration; no application code was changed in this setup.
- Supabase: `mlmpcpkucurylkrobain`, shared with Helm and other application tables.

## Recovery and migration evidence

Evidence is retained privately outside the checkout at
`E:/Memoire-recovery/automation-2026-10-20/`. The directory includes sensitive
recovery material and must not be committed or shared as a whole.

- Full PostgreSQL custom archive and roles without role passwords; SHA-256
  checksums recorded. TLS used the official Supabase CA with `verify-full`.
- A consistent exported snapshot supplied both archive and application restore
  data. The isolated rehearsal matched 186 application tables and 18,077 rows.
- Existing cross-table CHECK constraints were restored after loading the data,
  then the exact captured definitions were re-applied. The data portion,
  including recorded migration SQL, was preserved unchanged.
- Rehearsal used PostgreSQL-compatible PGlite. Managed provider extensions remain
  in the full archive and were not replayed locally; Storage object bytes were
  not changed by this migration and were outside this rehearsal.
- Fresh catalog/ledger comparison immediately before application matched the
  reviewed baseline. The reconciled CLI dry run contained exactly
  `20261020153802_memoire_automation_sprint_one.sql`.
- Migration SHA-256:
  `390fcd529331df4405f133aa6ca8576add676c11586fd307268d0e3f2911a44e`.
- The ledger advanced from 162 to 163. Existing columns, relations, functions,
  policies, triggers and constraints were preserved. No history repair, password
  reset, ownership change or unrelated migration was performed.

Primary private receipts: `backup-manifest.json`, `rehearsal-verification.json`,
`dry-run-verification.json`, `deployment-receipt.json`, `database-smoke.json`.

## Scheduler and secret handling

- Production-only `AUTOMATION_ENABLED=true`; `CRON_SECRET` stored as a Vercel
  Secret. The existing service role key remains server-only.
- Job: `memoire_automation_tick`, id `4`, active, schedule `*/15 * * * *`.
- Destination and bearer credential are stored under dedicated Memoire Vault
  entries. The job command reads them at execution; no credential is embedded in
  the checked-in source, URL, cron command text or this report.
- Transport: `net.http_post` to the existing commercial automation-worker route,
  with a 60-second HTTP timeout. The application retains its bounded worker and
  per-owner lease/retry/deduplication behavior.
- Commissioning temporarily used a one-minute cadence to observe a real tick;
  the final cadence was then changed to every 15 minutes.
- Existing Sentinel jobs `1`, `2` and `3` retained their schedules and active state.

## Production acceptance

1. Transaction-rolled-back SQL checks exercised actual RLS/grants, two-owner
   settings/source isolation, denial of worker authority to authenticated users,
   claim/read/completion and same-day deduplication. No test rows remained.
2. A separately created, clearly fictional QA account authenticated through the
   real Auth service and Production API. Preview returned two candidates and
   wrote no Plan items; the rules were enabled only for this QA account.
3. The actual Cron tick at **12:09 ICT, 2026-10-21** invoked the deployed worker
   without a browser or manual Run now starting the completed run. It created
   exactly one quote reminder, one commitment reminder and a saved Today brief.
   The run completed at approximately 12:09:03 ICT. Cron transport returned 200.
4. Subsequent Run now was skipped for the completed day. Pausing rules succeeded
   and a further Run now was refused. No messages were sent.
5. QA sources were removed while the temporary owner still existed, allowing
   history to be recorded correctly; Auth then deleted the owner and cascaded
   its remaining rows. Checks found zero QA users, quotes, commitments, Plan
   items, settings, runs and commercial history revisions. QA credentials were
   removed from the fixture receipt.
6. Final worker health: authenticated call 200, `complete=true`, `failed=0`;
   anonymous call 401. No real account's rules were enabled by this setup.
7. Supabase security advisors reported no notice referencing the new automation
   objects. This is a scoped result, not a claim that unrelated project notices
   were remediated.

Private receipts: `cloud-preview-receipt.json`, `scheduled-cloud-acceptance.json`,
`scheduler-receipt.json`, `scheduler-final.json`, `qa-cleanup.json`,
`final-health.json`.

These checks establish live API, database and scheduled-worker behavior on an
isolated fictional account. They do not claim real customer outcomes or a new
authenticated Production browser/UI audit. Earlier responsive controls checks
were local UI evidence.

## Operations

- Owners pause their own rules in Settings. A worker must recheck those standing
  permissions before final application.
- To stop all scheduled invocations during an incident, an authorized operator
  can deactivate only job `4` with `cron.alter_job(4, active := false)`. Leave
  other shared-project jobs untouched. Owners can still request manual runs
  while server execution remains enabled.
- To disable execution entirely, set the Production `AUTOMATION_ENABLED` flag
  false and redeploy. Do not remove populated automation tables or modify ledger
  entries as an operational rollback.
- A scheduler configuration or server flag alone does not prove an owner's run.
  Check the owner's dated receipt and created Plan items. The UI conservatively
  retains `schedulerVerified=false`; it does not infer scheduler verification
  from environment flags.

Reference: [Automation architecture](../architecture/automation-sprint-one.md).
