# M7.2 — Historical reconstruction readiness

Starting code SHA: `0649441f04b499f10d5891143e229d2eede5fb5f`. The target Supabase migration has not been applied or verified; local PGlite verification is a code gate, not a production release gate.

## Cloud restore and lineage

Backup format 10 carries the cloud coverage lineage ID, original revisions, complete current rows for the seven covered sources, and parent Accounts. The authenticated `restore_commercial_history` RPC verifies owner, source completeness, revision identities and sequence, per-entity system-time order, and agreement between current source state and each entity's last revision. It serializes concurrent historical writes per owner. Current covered rows, original revisions, and the coverage marker commit in one database transaction. A transaction-scoped protected context suppresses revision triggers only during this validated restore; an error rolls back every write and the context. Commercial Events are not replayed.

An empty owner scope accepts a revision-aware backup and preserves its original verified boundary and lineage. An existing scope accepts only the same lineage and an incoming chain containing every already accepted cloud revision unchanged. A newer or different cloud revision, or cloud current state inconsistent with its own chain, returns `diverged`; another lineage returns `different_lineage`. Equal complete chains return `no_op`. The browser copy rolls back when this RPC fails. Other, nonhistorical cloud collections still use the older per-table merge after the historical transaction and can fail independently; the restore result reports those failures. Local undo never claims to undo account changes.

Legacy backups without revisions can establish a **new** boundary at restore time only in an empty owner scope. Their deterministic backup identity permits an identical retry; they cannot claim continuity with an existing verified lineage. Format 9 revision-aware backups without lineage can restore into an empty owner scope with a derived lineage, but should be refused against an existing different lineage. Browser-only historical revisions cannot be promoted into cloud history because their original cloud row identities and snake-case source snapshots are absent. Older supported backups remain readable; format 10 is required to preserve explicit cloud lineage across export and restore.

The semantic state comparator excludes `updatedAt`, which can change during a cosmetic save without a new revision. Full M7.2 snapshots include it for domain validation. M7.1 snapshots omitted it; batch composition supplies creation time only as validator metadata and sets `metadataInferred=true`. That inferred timestamp is not an asserted historical edit time. Commercial facts and system `recordedAt` remain the original accepted values. Time-zone spellings of database timestamps are normalized through each table's SQL record type before state comparison.

## Buyer Progress source audit

The exhaustive `buyerProgressSourceAudit` contract forces every current signal kind to declare its historical status at compile time. Current and as-of derivation run the same `deriveBuyerProgress` classifier on different source collections. As-of composition supplies only revisions accepted by cutoff; it never reads current Condition links or later Evidence.

| Current signal | Current source | Cutoff-safe source | Historical status |
| --- | --- | --- | --- |
| Customer commitment made | Customer-party Commercial Commitment | Commitment revision and creation state | Verified |
| Customer commitment kept | Completed customer-party Commitment | Commitment revision showing `completedAt` | Verified |
| Buyer requirement confirmed | Customer-provided Evidence supporting a resolved Requirement through the then-current Condition link | Evidence, Condition, Requirement revisions; actor provenance retained | Verified |
| PO received | Selective Commercial Event | Quote `poStatus` exists but has no historical revisions or stable mapping to the Event | Unavailable |
| Payment received | Selective Commercial Event | Quote `paymentStatus` and Order Receivable receipts exist but are mutable and unversioned | Unavailable |
| Seller activity comparison | Linked Sales Activity | Created and last-edited times only for unchanged current records | Partial: later entry excluded; earlier edited/deleted version unavailable |

Commitment reschedules remain visible through the selected Commitment revision and do not create a new buyer signal. Seller commitments never qualify. Evidence needs explicit `providedBy: customer`; prose alone is insufficient. Activities entered after the cutoff with an old business activity date do not leak backward. An Activity edited after cutoff is excluded because its prior form is unrecoverable, and deleted Activities are absent; the projection therefore remains `partial` even when current rows are supplied. PO and payment Events are deliberately excluded from historical derivation rather than backdated. A new canonical milestone entity was not justified.

Coverage states are `full` when every signal type and comparison source is reconstructable; `partial` when verified signals can be returned with named gaps; `unavailable` when source composition is unavailable; `pre_coverage` before activation; and `corrupt` for invalid history. Buyer Progress currently returns `partial` for verified cutoffs. Core Condition epistemics, Requirement resolution, next blocking question, dependency blockers, Commercial Time, and Forecast Defensibility depend on the seven covered canonical sources and can be recomputed at a verified cutoff. Decision Basis Snapshots remain immutable records of a decided basis, not a replacement for mutable source history.

## Measurement and release boundary

The synthetic three-year workload in `scripts/benchmark-historical-readiness.mjs` has 300 Opportunities, 11,400 revisions across seven source types, and 2,100 selected current records. On this development host its JSON revision payload was 6.64 MiB and in-process composition took 24.4 ms. Separate local PGlite runs restored 300 Opportunities and 300 original revisions in about 130–165 ms. These exclude browser storage overhead, network transfer, target PostgreSQL restore latency, and real customer schema sizes. Browser quota and target-scale restore remain release measurements.

M8 development may use verified core source history from the recorded coverage boundary and must expose Buyer Progress gaps. Production release still requires the target migration, live RLS/trigger/RPC verification, and an end-to-end backup/restore round trip. No Time Machine UI or Decision Learning work is included here.
