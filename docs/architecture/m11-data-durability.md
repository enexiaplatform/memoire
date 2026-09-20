# M1.1 — Data durability foundation

Starting SHA: `24469f85d018ba1a503c6c49b8b957744fcd81e9`. Initial working tree clean; no later commits at audit start. M2 is out of scope.

## Pre-change audit and acceptance model

| Concept | Write / mirror | Export / restore | Initial classification |
| --- | --- | --- | --- |
| Accounts | Relational cloud-first, local fallback/cache; several ignored guard results | Local plus cloud rows exported; restore ignores cloud rows | PARTIAL |
| Opportunities / Leads | M0.2 rejects failed canonical local write; cloud acceptance survives mirror/history failure | Full rows exported, cloud half ignored by restore | PARTIAL |
| Activities | Cloud-first and offline queue; local guard usage needs acceptance review | Source metadata in fields/tags; cloud rows not decoded during restore | PARTIAL |
| Stakeholders, objections | Relational stores, local fallback with ignored write results | Export present, cloud restore absent | PARTIAL |
| Quotes, Plan, expenses, order costs/receivables/milestones, supplier commitments | Browser-first JSON collections, background cloud replication | Payloads exported; local restore supported, cloud half ignored | PARTIAL |
| Threads | Kernel browser-first; failed write can return success; codec/command omit sample tag | Exported but relational cloud restore absent | UNSAFE |
| Commitments | Kernel browser-first; completion event currently precedes state | Exported; due-date history codec exists; cloud restore absent | UNSAFE |
| Events | Only opt-in durable writes; local cap can discard history | Export includes full cloud history but restore ignores it | UNSAFE |
| Evidence | Browser-first; ignored failed write; supersession derived from observation/recording order | Codec preserves provenance/date; export present, cloud recovery missing | UNSAFE |
| Commercial Value Outcomes | Browser-first, ignored failed write | Export present, relational cloud recovery missing | UNSAFE |
| Targets | Separate relational table, composite identity; ignored local failure | Export present, restore ignores cloud target rows | PARTIAL |
| Account merges, knowledge notes, outcomes, assets, review packs, nudges, weekly commitments | JSON collection stores | Local export/restore plus selective cloud pushes | PARTIAL |
| Operating context | User-scoped browser keys and relational table | Exported cloud rows have no recovery adapter | PARTIAL |
| Legacy v31 tables, import audit, profile/usage | Legacy/server records, not current kernel write paths | Exported raw data; not reconstructed by current restore | PARTIAL / administrative recovery distinct from commercial recovery |
| Derived readiness, forecasts, recommendations | Recomputed; not authoritative records | No independent persistence required | NOT APPLICABLE |

Local/offline and kernel command acceptance means the browser accepted a durable write. Background replication is not cloud acknowledgement. Relational core services can accept a cloud write even if the browser mirror fails. Sample work must remain browser-only. Import may normalize/create identities; restore must preserve Memoire identities and all present metadata. No distributed transaction exists.

Proven restore defects: no row preflight, permissive versions, ignored cloudData, clear-before-write with no automatic rollback, partial cloud pushes described as matching other devices, and undo affects only local state. The implementation retains per-collection receipts, adds strict preflight and local rollback, and explicitly describes cloud recovery as non-atomic merge by stable identity, never a destructive cloud replacement.


## Implemented write acceptance contract

There are three outcomes, expressed through the existing result/warning and sync-status mechanisms rather than a new repository abstraction:

- **Accepted:** the authoritative write returned successfully. For the five Kernel stores and Targets this is the browser write; it is not a cloud acknowledgement. Commands return `ok: true` only after it lands. Cloud-first Opportunity acceptance remains the M0.2 contract.
- **Accepted, degraded:** authoritative state landed, but history, replication, or a non-authoritative mirror failed. Preserve the accepted state, show the specific warning, and never tell the operator to recreate it. Kernel history warnings reach both `CommandResult.warning` and the existing global sync-status banner. Background cloud failures use the existing operational telemetry and sync banner.
- **Rejected:** canonical browser storage is absent/full/refuses the write, the record cannot be serialized, or required state is invalid. Kernel commands return `ok: false`; direct repository/event writes throw. No event may describe a state transition that failed to persist. A cache hydration may return already-cloud-accepted records without pretending the browser cache was saved.

`kernelRepository.writeLocal` now defaults to durable acceptance. Only cache refreshes explicitly use `requireDurable: false`. Event append cannot opt out. Invalid persisted date strings are rejected on canonical writes. Event query limits bound the UI, not retained offline history: the former 2,000-record local truncation could delete events before replication and has been removed. Large histories can exhaust browser storage; subsequent writes fail visibly instead of deleting accepted history.

Targets retain sample identity separately from the real fiscal-year/quarter identity. Sample edits cannot overwrite the real period or reach cloud. Failed real target replication is offered again when the workspace loads. Their cloud identity is `(user_id, fiscal_year, period)`.

## Current coverage matrix

Legend: **K** = hardened browser-first Kernel acceptance; **T** = hardened target acceptance; **R** = existing relational cloud-first service with local fallback; **J** = existing browser-first JSON collection with background replication. **B+C** means browser replacement plus awaited, stable-ID cloud merge through the registry. **S** means sample tags are filtered at the replication and restore boundaries. This matrix explicitly distinguishes the completeness of backup recovery from residual ordinary-write debt.

| Canonical record | CREATE / UPDATE / DELETE or ARCHIVE | Local / cloud write | Sample | Export / restore | Import | Sync / mirror / failure signaling | Overall contract |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Accounts | C/U, physical D | R; ignored local guard results remain outside this milestone | Existing source/sample convention | B+C; imported metadata retained | Business import allocates identities; restore does not | Cloud-first cache/fallback; some false local acceptance remains | PARTIAL — FIX SOON |
| Opportunities / Leads | C/U/D; stage/status transitions | M0.2 canonical local guard and cloud/mirror separation | Explicit scope, retained | B+C, shared table; Lead is not a separate store | Existing Lead/import mapping distinct from restore | M0.2 warnings and accepted-state history contract retained | COMPLETE for supported save/recovery; physical delete has existing sync limits |
| Activities | C/U/D, offline pending flag | R; some local writer results still unchecked | Existing tags | B+C; explicit links, raw source tags and timestamps | Capture/business import, not backup replay | Existing offline queue; provenance fields outside cloud schema retained locally/archive | PARTIAL — FIX SOON |
| Stakeholders | C/U/D | R | Existing source/sample tags | B+C, no relink by name | Capture/import may create identity | Existing local fallback can ignore refusal | PARTIAL — FIX SOON |
| Objections | C/U/D | R | Existing source/sample handling; no new sample redesign | B+C; source-activity and stakeholder IDs retained | Capture/import | Existing local fallback can ignore refusal | PARTIAL — FIX SOON |
| Quotes | C/U/D | J | S | B+C, full payload and money links | Business import separate | Guard failures can still be ignored by create/update wrappers | PARTIAL — FIX SOON |
| Plan items | C/U/D | J | S | B+C, full payload | Capture/derived completion marks | Ordinary writer guard handling remains partial | PARTIAL — FIX SOON |
| Commercial Threads | C/U, archive, physical D helper | K; cloud async | Fixed codec + creation flag; sample delete does not call cloud | B+C, actual codec | No separate lossy import used | State/save complete; failed hard delete can reappear on merge | COMPLETE for C/U/archive/recovery; PARTIAL hard-delete replication |
| Commercial Commitments | C/U, reschedule/complete/cancel, physical D helper | K; cloud async | S; sample delete does not call cloud | B+C including complete due-date history | Capture invokes the same command | State-first completion fixed; hard-delete retry remains limited | COMPLETE for lifecycle/recovery; PARTIAL hard-delete replication |
| Commercial Events | Append; no normal U/D | K; cloud async | S, including legacy `source: demo` sanitation | B+C, full exported history; no local retention truncation | Explicit event/idempotency semantics; restore does not emit events | Append refusal throws; duplicate idempotency key returns stored identity | DURABILITY CONTRACT COMPLETE within supported local/merge model |
| Commercial Evidence | C; later dated observation supersedes; no normal destructive D | K; cloud async | S | B+C, content/source/business and recording dates, all observations | Capture uses the same command | Visible rejection/history warning; projection order fixed | DURABILITY CONTRACT COMPLETE within supported local/merge model |
| Commercial Value Outcomes | C; save-by-ID; no normal destructive D | K; cloud async | S | B+C, actual outcome codec | No lossy import mapping | UI only acknowledges accepted outcomes; history failure is degraded acceptance | DURABILITY CONTRACT COMPLETE within supported local/merge model |
| Commercial Targets | C/U by year/quarter; no normal D | T; cloud async/retried on load | Fixed separate sample identity | B+C with composite identity | No general import | Guarded local acceptance; cache failures do not invalidate cloud truth | DURABILITY CONTRACT COMPLETE within supported local/merge model |
| Expenses | C/U/D | J | S | B+C, full payload | Business entry/import separate | Existing unchecked local results | PARTIAL — FIX SOON |
| Order costs | C/U/D | J | S | B+C, quote/opportunity links | No backup-as-import | Existing unchecked local results | PARTIAL — FIX SOON |
| Order receivables | C/U/D | J | S | B+C, money checkpoints | No backup-as-import | Existing unchecked local results | PARTIAL — FIX SOON |
| Order milestones | C/U/D | J | S | B+C, full payload | No backup-as-import | Existing unchecked local results | PARTIAL — FIX SOON |
| Supplier commitments | C/U/D | J | S | B+C, full payload | No backup-as-import | Existing unchecked local results | PARTIAL — FIX SOON |
| Opportunity outcomes | C/U/D | J | S | B+C, outcome identity/linkage | Existing business workflow | Existing JSON mirror/write conventions | PARTIAL — FIX SOON |
| Weekly commitments | C/U/D | J | S | B+C | Existing business workflow | Existing JSON mirror/write conventions | PARTIAL — FIX SOON |
| Action outcomes | C/U/D as store supports | J | S | B+C | Existing business workflow | Existing JSON mirror/write conventions | PARTIAL — FIX SOON |
| Account merges | Persist merge decision | J | S | B+C; no re-execution of a merge command | Not restore | Existing JSON mirror/write conventions | PARTIAL — FIX SOON |
| Knowledge notes | C/U/D | J | S | B+C | User entry/import | Existing JSON mirror/write conventions | PARTIAL — FIX SOON |
| Sales assets / Review packs / Nudges | Persist/update/delete per existing store | J | S | B+C, payloads and tombstones | Not restore | Existing JSON mirror/write conventions | PARTIAL — SAFE TO DEFER for M2 |
| Operating context (initiative/play/offer/experiment) | C/U/D | R with user-scoped local key | Existing source behavior; restore filters sample tags | B+C; source system/external key retained | Existing context import separate | Existing local write limitations | PARTIAL — FIX SOON |
| Profile / usage / import audit / legacy v31 rows / generated pipeline briefs | Server/legacy workflows, not current canonical Kernel mutation | Administrative or legacy | No replay into live commercial tables | Exported raw and retained in `memoire.backup.cloudArchive.v1`; archive-only, explicitly disclosed | Audit is retained, never re-executed | No claim of active account reconstruction | DOCUMENTED LIMITATION, not silent omission |
| Derived readiness / recommendations / forecasts / supersession projection | Recompute, not canonical writes | N/A | Use scoped inputs | Recompute from recovered records | N/A | No independent persistence promised | NOT APPLICABLE |

This milestone deliberately does not refactor all R/J stores or claim their pre-existing ignored guard results have been fixed. M2 must use the hardened Kernel path, not copy those older patterns. Archive-only tables are enumerated separately from the 27 active canonical registry entries; adding an export table without declaring one of those routes fails the coverage test.

## Export, format and preflight

The canonical artifact remains the Settings ZIP containing `memoire-workspace-export.json`. Format **3** retains `exportedAt`, `mode`, `localBrowserData` and the existing `/api/export` `cloudData` envelope. Optional `localBrowserRawData` retains original browser representation for preferences; it cannot bypass record validation. The two legacy money preferences retain their bare storage representation, so restoring SGD does not reopen the workspace in the fallback currency. Auth tokens, owner markers, demo flags and recovery-journal controls are not exported/restored as workspace data.

Cloud export is unchanged in breadth: all 39 currently enumerated account datasets remain in the export. The API's paged export provides the entire event table, including history outside the UI query window. A partial cloud manifest is visibly marked on export and rejected for replacement restore. A failed export request is not downgraded to an apparently complete local backup.

Preflight is pure: parse JSON → validate envelope/version → validate manifest shape/counts → validate rows and existing identity/time/closed Kernel enums → decode through actual current codecs → merge cloud/local record versions by stable identity and existing timestamp → serialize all writes → only then apply. Equal timestamps favor the browser copy, matching the existing local/cloud merge convention. Additional local metadata on a winning local record survives. Canonical array duplicates are rejected; sample rows are excluded and counted before live validation. Versions 1/2 and unversioned v1 files are supported where they contain valid existing records. Required Kernel temporal/source semantics are not guessed for malformed legacy files. Unknown future versions and unknown exported tables fail before mutation.

Restore is not import: it never allocates substitute IDs, guesses relationships from customer names, backdates new records, or emits fresh business events for historical rows. Current kernel links are optional/textual scope pointers, not mandatory foreign keys between Kernel tables. Historical orphans remain with their original IDs. Relational foreign-key/RLS failures are explicit per-collection cloud failures, not an excuse to erase or reassign a link.

## Apply and recovery boundary

The supported operation is **browser reconstruction plus, when signed in, an awaited cloud merge into the original account**. It is not a database replacement. Existing account records outside the file remain. Registry order is explicit: Accounts → Opportunities → Stakeholders/Objections/Activities/Operating context → Threads → Commitments → Events/Evidence/Value Outcomes → JSON collections → Targets. No JavaScript object ordering establishes a foreign-key contract. Cloud requests use current table conflict identities in batches of at most 200. Retry uses the same IDs. No cloud delete, administrator credential, or new restore endpoint was added.

Before any local collection changes, a persistent journal contains original values for every affected key, including absence. If staging the journal fails, nothing changes. If any apply write/removal/read-back fails, rollback restores the old values and verifies every affected key. If rollback itself fails, the journal remains, guarded writes are blocked, and app startup retries recovery before mounting the workspace. If recovery cannot finish, the app displays a recovery screen instead of silently opening an ambiguous workspace. This requires temporary storage headroom for the old values; refusal when full is intentional.

There is no distributed transaction. Local apply completes synchronously; cloud collection results are awaited and reported independently. A failed cloud collection leaves the local recovery and original backup available, marks the result unsuccessful, and names the incomplete collection in the receipt. A completed cloud request is never called undone by local undo. Undo uses the same local journal/verification boundary. Restore analytics fire only for an overall successful result.

Residual limits: use one active workspace tab and avoid concurrent writes from another device while restoring. Existing in-flight remote writes cannot be cancelled by a browser journal. Closing the browser during cloud merge can leave a partial account merge; retry the same original file and identities. After a failed cloud merge, some existing cloud-first readers can prefer their old cloud copy on reload, so the file must be kept and account failures resolved before treating another device or a reload as verified recovery. Browser eviction/clearing can destroy browser-only records and the journal; an exported file or confirmed cloud copy is still required for device-loss recovery. No false claim of cross-device atomicity is made.

## Temporal, provenance and event contracts

All five Kernel codecs are exercised in actual cloud-row → backup → restore → repository-codec tests. Event `occurredAt` and `recordedAt` remain distinct. Evidence `observedAt` and `recordedAt` remain distinct. Threads/Commitments/Evidence preserve `createdAt`, `updatedAt`, `sourceType`, `sourceId`, `sourceUrl`, `sourceUpdatedAt` and all applicable scope pointers. Commitments preserve original/current due dates, every due-date-history entry, completion/cancellation fields and event pointers. JSON payloads retain money/outcome links and tombstones unchanged.

Evidence has no stored `supersedesId` field today. Supersession is derived per scope/category from observed day, recording time, then ID. Previously `supersededBy` could point at an intermediate winner depending on restore order. Projection now links each superseded record to the final current winner, independent of array order; all historical observations remain. No epistemic-state model or new commercial entity was added.

State is authoritative. Commands persist state, then append the event. Commitment completion/cancellation no longer append first. If event persistence fails, the accepted state stays accepted and gets a degraded-history warning. A completion can retain a preallocated optional `completionEventId` whose event failed; it is a history gap, not evidence of an event having landed. M2 must not infer state existence from that pointer alone. Standalone `recordCommercialEvent` is inherently an event write: the event itself is its authoritative record, and rejection throws. Read-only/no-op commands create no invented transition.

Value Outcomes retain their actual model: outcome type, user assessment, recommendation/account/opportunity/thread links, impact/confidence/note, occurrence and creation timestamps. They do not currently define the Kernel `SourceMetadata` fields; this milestone does not invent them. Save-by-ID and backup retry are idempotent. A fresh `recordValueOutcome` command allocates a fresh ID: intentionally repeating it can create a second assessment. The Saved-by-Memoire prompt now acknowledges only successful persistence and does not invite retry after a degraded accepted outcome.

## Database and validation

No migrations, RLS changes, backfill, or production commercial-data mutation are needed for the implemented contract. Existing table policies still authorize every account write. The reviewed Supabase upsert API is the existing `upsert(rows, { onConflict })` path, not an administrative restore API. Cloud behavior is tested against a network-boundary fake using real codecs/repositories; this is not a claim that a live customer account has been restored. Existing server triggers can stamp operational `updated_at` on legacy relational updates; original backup values and the retained raw cloud archive remain available. Kernel schema does not add speculative bitemporal columns.

Regression protection covers the five actual Kernel codecs, retained provenance/time/links, due-date history, evidence supersession permutations, all JSON collection payloads, real Account/Activity codecs, sample isolation, identity/idempotency, all Kernel quota/unavailable-storage failures, state-before-event ordering, target separation, malformed/future/partial backups, rollback and interrupted rollback, cloud partial failure/retry, local undo, preference representation, and the exhaustive exported-table/Kernel/JSON registry comparison. Existing restore contracts now assert journaled replacement and the shared registry instead of the obsolete JSON-only table map. Capture command tests provide actual writable browser storage rather than passing by returning phantom objects.

The final release verification must run every command in `package.json`'s `check` chain against one committed SHA in a clean detached worktree, with the outcome attached to that commit's Git note. Failed exploratory runs are not release evidence.

## Remaining debt and M2 boundary

- **BLOCKS M2:** any remaining failing required check on the final SHA; any attempt to add Condition without the checklist below. Do not claim GO before exact-SHA verification passes.
- **FIX SOON:** ordinary R/J writer acceptance gaps listed above; reliable hard-delete tombstones/retry for Threads/Commitments; automatic reconciliation of accepted-state/missing-event gaps; clearer long-lived interrupted-cloud-restore status; source metadata not yet modeled by legacy Activity cloud columns.
- **SAFE TO DEFER:** a distributed restore transaction, cross-device concurrent-restore coordination, schema redesign, an unbounded-history storage backend, active replay of profile/usage/import audit/legacy v31 records. Those are explicitly outside the supported restore claim.

M2 may rely on the hardened Evidence/Kernel creation, temporal preservation, deterministic supersession and tested recovery contract after final verification. It must not rely on physical deletion being synchronously replicated, assume local acceptance means cloud acknowledgement, or inherit unguarded R/J write patterns.

## ADDING A NEW CANONICAL COMMERCIAL ENTITY

M4 applies this checklist to `commercial_dependencies`: canonical registry, export, format-6 preflight and cloud merge after Requirements; guarded browser state before audit history; sample isolation; explicit operator provenance; owner-scoped SQL and actual local Postgres/RLS tests. Restore rejects cycles and missing or foreign endpoints before mutation. Buyer Progress remains derived and has no backup collection. Evidence gains nullable `provided_by` without inferring a provider for historical records. See [M4 architecture](m4-commercial-dependency-buyer-progress.md). Target Supabase migration application remains a separate deployment check.

M3's `commercial_outcome_requirements` follows this checklist. Its canonical route is `requirementCodec` → `canonicalContracts` → export manifest → format-5 restore preflight. Restore requires Account and Opportunity anchors, and a same-owner/scope Condition only when `conditionId` is present; an unlinked Requirement is valid and derives unknown. Cloud restore order places the Requirement after Conditions. Browser acceptance precedes event history and reports degraded history rather than repeating an accepted state change. Actual RLS and codec tests cover the new relation. See [M3 architecture](m3-outcome-requirements.md).

- [ ] Define the type/model, closed vocabularies, identity, lifecycle and required versus historical/optional references.
- [ ] Declare authoritative persistence for local, signed-in, offline and sample modes; reject a refused canonical write.
- [ ] Add/review cloud schema, ownership predicates and RLS when cloud persistence is required; do not assume a service-role restore.
- [ ] Preserve applicable source metadata and distinguish business-valid time from recording time; do not invent provenance.
- [ ] Implement actual local/cloud codecs and prove semantic round-trip, including history and linkage.
- [ ] Preserve sample tagging on create/read/update/delete; keep sample records out of all cloud paths and live restore.
- [ ] Add full export coverage, including paging and manifest accounting.
- [ ] Register restore decode/encode/key/conflict identity/dependency order in `canonicalContracts`; add strict preflight rules before any destructive mutation.
- [ ] Define legacy-version compatibility and malformed/unknown-version behavior. Do not route restore through business import.
- [ ] Define rejected versus accepted-degraded outcomes and actionable UI/telemetry behavior; no phantom success or duplicate retry after acceptance.
- [ ] Specify event implications: state first, history second; document any inherently event-authoritative command and idempotency strategy.
- [ ] Test actual codecs/repositories, failed storage/cloud operations, rollback, sample separation, references, provenance and temporal fields.
- [ ] Check performance and storage growth, query windows versus retention, payload/batch bounds, and build/bundle budgets.
- [ ] Pass the exported-table/Kernel-table registry coverage test and the entire required suite on one clean final SHA.
- [ ] For mutable commercial sources needed by historical derivations, register State Revision coverage, a verified `historyGuaranteedFrom` boundary, and an atomic canonical/revision write in every local and cloud writer. Do not substitute selective Commercial Events or backdate the baseline.
- [ ] Verify cutoff reads, gap/schema handling, sample isolation, revision-aware backup/restore, and source-to-derived-projection coverage before claiming historical reconstruction. A cloud restore that cannot preserve both original revisions and the boundary must fail before mutation.
