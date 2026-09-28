# Current backup restore compatibility repair

Starting SHA: `e5e58d0d1ea2edb0407f54a20881a5f3e2984459`.

The audit before M12 found that `BACKUP_FORMAT_VERSION` is 11, while the last deployed-source definition of `restore_commercial_history` rejected formats above 10. Existing database tests used format 10 and therefore did not exercise the application's current envelope. A second defect treated JSON `coverage: null` (the actual service payload when no cloud history is activated) differently from a missing SQL JSON field, rejecting a legitimate recovery before its honest baseline could be established.

The additive migration replaces the existing restore function, retaining its source registry, original-owner checks, lineage/divergence protection and single transaction. It accepts numeric integer formats 1–11, rejects missing/malformed/future versions, and recognizes both absent and explicitly null history coverage. A legacy restore must contain an empty Revision array; unanchored Revisions cannot be laundered into a new baseline. It introduces no new canonical entity, top-level navigation, derived engine or product flow.

The R1 migration-order contracts now verify the original nine-file contiguous sequence at its original position, allowing subsequent additive migrations without weakening the order check. The original migration files remain unchanged.

Regression coverage uses the full production migration chain in PostgreSQL, takes its format from the real export constant, and covers verified restore, retry, unactivated history, all older supported envelopes, future/malformed version denial, orphan Revision denial, ownership and anonymous access. An explicit upgrade test first reproduces the format-11 rejection on the original R1 chain, applies the repair, then verifies successful idempotent restore and unchanged coverage/lineage.

Production application remains pending the P1 recovery/access and schema-reconciliation gate. Local verification is not a production claim. M12 is not complete merely because its prerequisite audit found and repaired this defect.

Verification: `npm run check` passed (1,841 tests, zero failures, production build, API typecheck, lint and all repository contracts). `node scripts/verify-next-gen-browser.mjs` passed the integrated Opportunity, Scenario non-mutation, Decision, console and narrow-viewport checks. GO for continued local roadmap development; production deployment remains pending.
