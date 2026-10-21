# Memoire automation implementation plan — 2026-10-21

User instruction: plan and implement the whole reviewed automation scope.
Email/calendar intake and outbound messaging remain deferred. Keep the ten
approved destinations. New workflows are opt-in and use confirmed owner-scoped
cloud data; proposals never silently accept evidence, payment, completion,
identity merges, access changes or commercial outcomes.

## Delivery sequence

### A. Shared execution foundation

- [x] Preserve legacy rules/settings and existing receipts.
- [x] Add bounded intraday cycles alongside daily/weekly outputs, with owner
  leases, source/revision rechecks, stable semantic IDs and a daily creation cap.
- [x] Expand the authoritative snapshot to the sources actually needed.
- [x] Give prepared outputs durable owner-only storage and export coverage;
  restore must not replay work or re-enable standing permissions.
- [x] Keep manual edits, dismissals, completion marks and deletion tombstones.
- [x] Make readiness, cadence, preview, missing data, failures and rule scope
  understandable in Settings and existing working surfaces.

### B. Highest-value work rules

- [x] Collections: upcoming/overdue installment work using canonical calculations.
- [x] Supplier/principal promises: due work linked to its original source.
- [x] Leads: nurture revisit and first-touch work; no autonomous qualification.
- [x] Existing quote/commitment rules: intraday re-evaluation and retirement.
- [x] Orders: recorded milestone gaps/dates and stalled-work preparation.
- [x] Opportunities: blockers/next-action gaps, coalesced with existing Plan work.

### C. Prepared operating outputs across the product

- [x] Today: saved brief plus exceptions/output links.
- [x] Capture: source-backed review/reconciliation proposals.
- [x] Plan: weekly planning and overdue-work proposals, never silent rescheduling.
- [x] Accounts/stakeholders: current-context briefs and missing-information work.
- [x] Review: dated weekly draft, open promises and changes, without invented
  reflections, causal explanations or claimed value saved.
- [x] Margin: missing cost / threshold exceptions with explicit money basis.
- [x] Products & Brands: classification-quality proposals, exact identity only.
- [x] Reports: opted-in saved-report execution with definition and source basis.
- [x] Dashboards: opted-in refresh snapshots with shared context and stale errors.
- [x] Objections/knowledge/assets: source-backed unresolved-work preparation.
- [x] Imports/data quality: bounded validation queues, no automatic fuzzy merge.
- [x] Sync/recovery/backup: freshness and recovery-state preparation, no silent
  restore, deletion or assumption that unsynced browser data is on the server.
- [x] Search/Ask: deterministic plain-language rule setup for supported actions,
  preview and explicit activation; optional AI consent stays separate.

### D. Verification and rollout

- [ ] Test the actual migrated schema/RPCs, owner isolation, cycle/day/week
  boundaries, races, pause, uncertainty, caps, cross-rule dedupe and tombstones.
- [ ] Match money/FX and report/dashboard results to canonical engines; preserve
  missing values and source/definition versions.
- [ ] Exercise Settings and output surfaces on desktop and mobile.
- [ ] Run the full canonical `npm run check` and relevant focused regressions.
- [ ] Capture fresh shared-target ledger/catalog, external DB/roles backup,
  isolated restore rehearsal and exact migration dry run before Production DDL.
- [ ] Publish the verified source, wait for exact-SHA CI and Vercel READY, then
  verify authenticated API/UI and an actual scheduled isolated-QA run.
- [ ] Remove QA records and retain a secret-free release receipt.

## Acceptance boundaries

Every named group must have a working rule or a working prepared output tied to
its real sources, a visible entry point, a no-write preview and a clear stop or
review boundary. A toggle alone is not completion. Missing source/FX support must
be reported, not replaced with guessed values. Server readiness, owner activation
and successful scheduled execution are separate states. No account is enabled by
migration or delivery. This checklist is updated from verification evidence,
never from intent or the existence of code alone.

## Current checkpoint

Implementation completed from source commit `31f454e`; release verification in progress.

Local verification: canonical check passed, with additional automation regressions
covering actual SQL, daily caps, missing-money preservation and destination links.
Controls were exercised at 1440×900 and 390×900 using isolated fictional data.
Fresh backup restored 188 tables / 18,078 rows, with 709 exact checks re-applied;
Production apply and authenticated scheduled acceptance remain pending.
The previous live release has three supported workflows and a 15-minute Cron,
while execution is still limited to one completed owner/day run. The comprehensive
review and earlier deployment records remain separate historical artifacts.
