# M17 — governed external observation receipts

Starting green SHA: `218e399686880811b76f4bcff2090e5473586da4`.

## Domain and architecture

The audit found an existing Commercial Event log, source provenance, durable event codecs and export/restore. M17 reuses these for immutable ingestion receipts. A receipt says that Memoire received source text; it never says the source claim is accepted. Source-reported time stays in the payload, separate from receipt time. No Opportunity, Evidence, Commitment, Decision or State Revision is created by ingestion.

The versioned, bounded envelope covers source kind, namespace, record identity, source version, reported time, summary and original text. Identity hashes owner, sample scope and the source identity/version tuple. Identical retries return the original receipt; changed content under the same source version is rejected. Unreadable local history and failed durable writes cannot report ingestion success.

The audit also found that the older shared Kernel repository could merge another browser owner's records and serialize them under the signed-in owner. Reads, offline fallbacks, cloud writes and event retries now enforce exact ownership/sample scope. Conflicting record identities fail closed while preserving local data. Six regression tests exercise these boundaries.

## Persistence and UX

Receipts use `commercial_events`, existing owner RLS, local storage, export and restore. Backup format remains 14. The migration validates receipt structure, prevents client rewrites/deletions and enforces per-owner source identity uniqueness. Same-content database retries preserve the first receipt time. Privileged account deletion remains possible. Ordinary events and the State Revision registry are unchanged.

The existing Capture page has a folded source observation intake with human-readable fields and bounded receipt review. It labels source statements unaccepted and distinguishes browser persistence from eventual account synchronization. There is no new primary navigation, automatic commercial interpretation, vendor authentication or external delivery.

## Verification and phase gate

Full `npm run check` passed: build, API typecheck, lint, all unit/database tests and repository contracts. Dedicated browser verification passed receipt intake, duplicate retries, changed-content rejection, unchanged commercial truth, reload and narrow layout. The Time Machine browser regression passed. Database tests exercise a populated-log upgrade, fresh full migration chain, immutable receipts, source uniqueness, two-owner RLS, anonymous denial and idempotent restoration into the real table contract. Local codec/backup tests retain original text and reported time.

**GO for M18** from the commit containing this report. Production remains **PRODUCTION DEPLOYMENT PENDING** under P1. Live connector transports are not implemented in M17; M18 owns adapter boundaries. The UI lists receipts available in the browser and does not claim a complete remotely synchronized inbox.
