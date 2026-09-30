# M23 — Agent runtime

Starting green SHA: `de7c99adbb6856325691b66e1e9f48c93310fb2f`.

The audit identified the stable SDK/API and existing immutable observation command as the safe execution boundary. M23 adds a model-independent host runtime that observes bounded owner state, returns attributed transient proposals and executes only original-source receipt proposals under an explicit expiring host namespace/budget allowance. Read/propose is the default. Model output cannot carry authority or confirmation, replace source content or invoke consequential writes.

No new canonical entity, migration, RLS expansion, backup field or navigation is introduced. Follow-up proposals remain suggestions; receipt Events retain existing owner isolation, source identity, durability and export. Grants and proposals are transient and cannot be restored as authority. The runtime pins its session, bounds proposal batches, serializes operations and preserves uncertain receipt reservations for exact retries. UI remains the host's responsibility; existing human-confirmed product commands remain authoritative.

Seven focused tests exercise real migrated database/API behavior, read-only default, forged confirmation and foreign-reference rejection, original-source execution, budget/expiry/namespace enforcement, revocation, session pinning, lost acknowledgement recovery and concurrent output limits. Built-module browser verification covers both SDK transport and runtime host allowance/revocation. Full repository verification passed: application build, API type checking, SDK/runtime build and declarations, lint, all 1,971 unit/database tests and every contract check. **GO for M24**.

Production remains **PRODUCTION DEPLOYMENT PENDING**. This is not an arbitrary-code sandbox, authenticated agent identity provider, distributed quota, persistent job runner or durable proposal ledger. Callbacks and host grants are trusted application code; model output is untrusted data. No high-consequence command is exposed. Detailed authority, cancellation and recovery limits are in `docs/architecture/governed-agent-runtime.md`.
