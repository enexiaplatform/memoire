# Next-Gen Core R1 release evidence

Evidence was collected on 2026-09-22 from the release-candidate workspace. The actual production Supabase project was not linked, so the target-only checks in the deployment runbook remain the sole release gate.

## Database and integrity

- Fresh embedded PostgreSQL with real `pgvector`: every production migration applied in repository timestamp order. Final M2-M11 tables, foreign keys, indexes, RLS flags, policies, triggers and RPCs were inspected.
- Realistic pre-M2 upgrade: Account, qualified Opportunity, Lead, Activity, Commitment, Quote, Receivable and Capture rows survived. M2-M11 source collections began empty. Historical activation created one honest baseline and remained idempotent.
- Two-owner execution matrix: owner access succeeded and cross-owner Condition reads/writes failed. The consolidated suite also exercises per-entity RLS, revision, restore, lineage, corruption and rollback contracts.
- The audit found one fresh-install defect: `pipeline_defense_briefs` had existed only as dashboard-managed SQL while a later migration referenced it. `20260615131500_pipeline_defense_briefs.sql` now owns the idempotent table, index and policies before that dependency.

## Browser and product flow

- The R1 Opportunity smoke uses a current Opportunity with Condition/Evidence, two Requirements, a Dependency, Timing, a Money Gate, Decisions, an execution link and three Observations. It opens progressive disclosures, runs and discards a Scenario, confirms canonical browser data is byte-for-byte unchanged, retrieves 3/3 comparable cases and checks causal disclosure.
- Time Machine verified URL/reload behavior, current/as-of distinction, read-only mode, invalid and pre-coverage cutoffs, timezone handling and return to current. The consolidated history tests cover late Evidence and Activity, future Dependency retirement and future target changes.
- Money verified Gate creation, shared current/historical display, source deduplication, currency separation, partial payment and paid/realized semantics.
- All browser smoke runs reported zero console or page errors.

## Performance and storage

Measurements are tripwires rather than service-level guarantees and vary by host.

| Workload | Measured result |
|---|---:|
| Today/master dashboard, 300 Opportunities / 900 Activities | 15.6 ms |
| Opportunity Money derivation, representative deal | 0.2 ms |
| Money portfolio, 300 Opportunities / 900 Requirements / 300 Dependencies / 300 Gates | 7.0 ms |
| Historical Money composition | 8.8 ms |
| Time Machine, dense Opportunity with 53 Revisions | 4.4 ms total (0.7 ms source composition) |
| Multi-year history, 300 Opportunities / 11,400 Revisions / 2,100 selected records | 53.3 ms |
| Format-11 history backup generation, 6.64 MiB payload | 14.4 ms |
| Format-11 backup parse and integrity validation | 144.0 ms |
| Format-11 restore planning, 11,401 history records | 45.0 ms |
| Browser history compression / decompression | 88.5 ms / 36.6 ms |
| Decision case retrieval | bounded scan of 300 Decisions, 20 returned, under the 250 ms test budget |
| Scenario | three projections over a 12-Requirement graph, under the 250 ms test budget |
| Browser current-state fixture | 2.05 MB |
| Three-year State Revision JSON | 6.64 MiB |
| Dense single-Opportunity Time Machine payload | 33,104 bytes |

Measured production-preview surface render times were 432-773 ms across Today, Opportunities, Accounts, Money, Review, Timeline, Business and Activity, below the 2,000 ms budget. The largest observed long frames were 109 ms on Money, 104 ms on Business and 103 ms on Activity; these are follow-up performance work, not functional release blockers.

The uncompressed three-year Revision JSON is 6.64 MiB, which was unsafe beside the 2.05 MB current workspace on browsers with a roughly 5 MiB Web Storage ceiling. R1 now losslessly stores mature Revision collections in a versioned zlib/base64 representation and compacts the rollback journal too. A real Chromium write measured 1,182,168 bytes for stored history, 3.17 MiB steady-state for the full 300-Opportunity workspace and 3.83 MiB at the rollback-journal peak. Small and legacy JSON remains directly readable. Export decodes the full chain, restore compacts it again, and a corrupt compressed value fails explicitly. Backup format 1 through 11 remains compatible.

`npm audit fix` removed every high-severity and development-tool advisory available without a breaking upgrade. Two moderate React Router advisories remain because the available fix requires the v6-to-v7 migration. Memoire is a client-rendered app (the SSR hydration path is unused), and login redirects accept only internal `/app/` locations originating from the route guard. The controlled Router 7 upgrade remains follow-up work.

## Responsive and accessibility sanity

- Twelve primary destinations fit at 390 px after containing Activity period tabs and Calendar period tabs.
- Capture and Today keyboard traversals reached the primary controls; the skip link was present.
- Ask Memoire's input now meets the minimum control height used by the sanity harness.
- Empty-state contract checks and the dense Opportunity progressive-disclosure smoke passed.

## Cloud query shape

Workspace collections use paged reads and concurrent consumers share in-flight loads. Time Machine reads coverage plus paged owner Revisions and scoped Decisions; it does not query once per entity. Decision cases and Money derive locally after bounded collection reads. Target network latency was not measured because no production project credentials or link were available.
