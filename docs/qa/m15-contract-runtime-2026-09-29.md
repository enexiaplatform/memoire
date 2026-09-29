# M15 — operational contract runtime

Starting green SHA: `487252016f54fd72a8481fe9a4a26a4356bee44a`.

## Audit and boundary

Requirements already resolve through Conditions and Evidence; Commitments own promised dates and completion; Timing assertions link promises to Requirements; contractual Money Gates connect required outcomes to money references. Those systems remain authoritative. What was missing was an explicit, durable statement that a person had mapped an accepted contract clause onto those operational records.

M15 introduces one `commercial_contract_obligations` aggregate for that mapping. A person provides contract reference/version, acceptance date/reference, clause, existing Requirement and Commitment, and a rationale. Confirmation is mandatory. Acceptance is the operator's recorded assertion, not a signature verification, legal interpretation or AI inference. An accepted Quote alone does not silently create a contract mapping. Each clause has its own mapping; the system does not pretend to interpret or fully inventory the whole contract.

## Architecture and persistence

Only the mapping and acceptance provenance are new canonical facts. Acceptance identity is immutable; a different signed contract needs a new mapping. Corrections to operational interpretation and retirement are consecutive versions in the existing Revision chain. New links require an active Requirement and open Commitment in the same owner, sample, account and Opportunity scope. Retirement remains possible after those endpoints settle.

The derived runtime reads the existing Requirement/Condition outcome, supporting Evidence references, Commitment status/date, explicit commitment Timing links, and contractual Money Gate references. A completed promise never substitutes for a supported required outcome. Missing links remain visible. No monetary realization or legal discharge is inferred. The neighboring existing timing and money views retain their detailed derivations.

The shared versioned Kernel store provides local-first state/history atomicity, offline version synchronization and conflict reporting. The additive SQL migration enforces owner RLS, parent scope, immutable acceptance identity, versions and required-history rollback. Backup format 14 registers the source in canonical export, sample exclusion, reference validation, history baseline and transactional restore. Older formats and legacy lineage retries remain compatible. Restore inserts parents before mappings and removes child mappings before parents.

## UX and history

Opportunity details contains Contract obligations with confirmed clause linking, revision and retirement. The form selects existing outcomes and promises rather than creating them implicitly. Time Machine reconstructs each mapping and its linked canonical records at the selected cutoff; acceptance recorded later cannot appear earlier. Historical quote values remain unavailable under the existing coverage boundary, while the recorded money reference can be shown without inventing its value.

## Verification and release

Domain tests cover confirmation, future acceptance dates, scope, stale versions, immutable acceptance identity, retired/closed endpoints, simulation exclusion, explicit timing/money links, required-history rollback, backup references and future-free reconstruction. Full PostgreSQL-chain tests cover fresh schema, populated upgrade, consecutive versions, RLS across owners, anonymous and hard-delete denial, required-revision failure, legacy lineage and format-14 restoration with original versions. The durability fixture exercises the actual codec, backup and restore path.

The contract browser test passed confirmation, unchanged Commitment state, immutable acceptance fields, correction/retirement, reload and read-only narrow-viewport history. R1, Time Machine, Incident and attention-budget browser regressions also passed.

Production deployment remains **PENDING** under P1. Contract document storage, legal interpretation, signature validation, and automatically extracted obligations are non-goals. No new top-level navigation or separate obligation execution engine was introduced.

Final verification: `npm run check` passed with **1,905 tests**, zero failures, build, API typecheck, lint and every repository contract. The five browser checks above passed. **GO for M16** from the commit containing this report.
