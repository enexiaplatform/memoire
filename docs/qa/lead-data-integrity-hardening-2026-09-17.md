# M0.2 — Lead data-integrity hardening

## Scope and checkpoint

Started from `317a5fb9b6273c5672f37aa406f1bde044700a00`, not the earlier verified `3badb07`. The intervening command-bar, sample-data, pipeline-count and Lead presentation changes are preserved. The affected creation/update services had not fixed either reproduced M0.1 blocker. No reset, UI redesign, navigation change, schema migration or new Lead feature.

The exact final checkpoint is the last commit updating this report for M0.2. Resolve with `git log -1 --format=%H -- docs/qa/lead-data-integrity-hardening-2026-09-17.md`. Its full SHA and execution results are recorded in the final execution report and Git note attached to the tested commit. This document cannot embed its own Git hash. All final checks must run from a clean isolated checkout of that SHA, without source overlays.

## Canonical state acceptance

Root cause: `saveLocalOpportunityRecord` discarded `{ ok: false }` from `writeLocalRecords`, after which `updateOpportunity` invalidated projections, emitted history, and returned the mutated object. Leads awaited that result and displayed Discovery. The saved record could still be Lead.

The Opportunity writer now requires successful local persistence through the shared `requireLocalWrite` assertion. Failure rejects the existing Promise API; no updated Opportunity is returned. Missing storage also rejects. No projection invalidation or transition event follows a rejected canonical write. The existing Leads handler only replaces its record and displays success after the Promise resolves, so its catch path now handles this failure without a UI-only patch.

Cloud and browser acceptance have distinct meanings:

| Path | Acceptance and result |
|---|---|
| Local-only or demo | Local write must succeed. Otherwise reject, leaving the existing stored record unchanged. |
| Cloud rejects, local fallback succeeds | Preserve existing fallback behavior: resolve with `mode: local` and an explicit cloud-sync warning. Local copy durably holds the change; no claim that cloud accepted it. |
| Cloud and local fallback reject | Reject; no stage-change event. |
| Cloud accepts, browser mirror succeeds | Resolve with `mode: cloud`. |
| Cloud accepts, browser mirror rejects | Resolve with cloud record and explicit mirror warning. Do not retry cloud insertion, create a second local identity, or report canonical failure. |

`qualifyLead` rereads the saved record in its current persistence mode before applying the transition. A stale UI retry after accepted qualification cannot repeat Lead -> Discovery, even if the first response warned about history. Local fallback records are reread locally rather than disappearing into a cloud-only query. This is a retry guard, not a database compare-and-swap or multi-client transaction.

## History ordering and remaining limitation

Opportunity mutation remains first; `recordOpportunityStateChanges` runs only after canonical acceptance. It requests durable local event append through a narrow optional flag propagated by `recordCommercialEvent`, `appendEvent`, and the kernel repository. Existing unrelated kernel command defaults are unchanged.

A refused local event append throws before announcing an event update or queuing that event for cloud. Opportunity code catches it, reports sync trouble using existing conventions, and returns the accepted state with a material history warning. It never rolls back a real accepted state. The local-write guard already reports quota failures; the debug reporter is safe outside Vite as well.

Cloud event delivery remains asynchronous. A successful local event with a later cloud failure follows existing sync error reporting/retry conventions. State and event history are not atomic. Missing local history is not silently rebuilt on a retry of the state transition. General history coverage, automatic repair, unrelated kernel writers and event transactions remain out of scope.

## Sample workspace and provenance

Root cause: `createLead` received workspace metadata but passed it only to stakeholder creation. `createOpportunity` always created local records as `source: user, isSample: false`, and could use cloud solely based on authentication.

`createOpportunity` now requires explicit workspace scope. Sample flag or demo scope is normalized to `isSample: true, source: demo`; it takes the local-only branch even when an authenticated owner exists and does not attach that real owner to the local sample Opportunity. Real scope stays `isSample: false, source: user`. Lead creation forwards the same normalized workspace to both Opportunity and stakeholder creation. Sample Opportunity updates also refuse the cloud path.

Here Opportunity `source: demo/user` is the existing workspace-origin vocabulary, not the kernel's `SourceMetadata.sourceType` or the Lead acquisition channel. No `user` sourceType is introduced. Existing `manual`, `capture`, `csv_import`, etc. are unchanged. Capture evidence text and activity linkage remain on their existing paths; qualification events retain their existing source semantics.

| Current creation entry | Scope source / coverage |
|---|---|
| Add Lead | Existing `sampleDataActive` -> `createLead` -> required Opportunity scope; tested real and sample. |
| Capture -> Create Lead | Existing explicit opt-in plus workspace flag -> same command; shared behavior tested, caller wiring checked separately. Captured notes and reviewed person proposals remain unchanged. |
| Shared Opportunity editor | Passes explicit scope derived from `sampleDataActive`; can create a Lead stage through the existing form. |
| Both existing Opportunity import entry paths | Forward the same scope to `createOpportunity`; imported content/provenance is otherwise unchanged. |
| Seeded sample dataset | Existing direct seed records already carry demo/sample tags; unchanged. Existing sample/live contracts cover cleanup wiring. |

The existing backup restore filter now recognizes these newly created sample records and drops them from a live restore. No export/restore redesign was attempted.

## Continuity

Qualification preserves record ID, created date, account-name linkage, recorded evidence, acquisition source/detail, import source-system/external-key context, commercial value/currency, and existing source/sample metadata. Activities/raw notes, stakeholders and structured evidence keep their existing Opportunity IDs. Old event IDs and other historical links are not replaced. Runtime checks preserve linked collection bytes and verify existing people/events remain attached.

The intended current nurture behavior is unchanged: qualification clears the active revisit date and reason. There is no new nurture-history journal, nor a claim that past nurture values can now be reconstructed.

## Regression coverage

- Canonical local quota failure: Promise rejects, UI success continuation is not reached, saved Lead unchanged, no transition event or event-update notification; retry after storage recovery succeeds once.
- Local storage unavailable: creation rejects instead of returning an unsaved identity.
- Event storage refusal after accepted state: Discovery remains durable, warning returned, no event announcement, stale retry refused without another mutation.
- Cloud + local refusal: no accepted qualification and no event.
- Cloud refusal with durable local fallback: explicit local result and warning.
- Cloud acceptance with failed mirror: state remains accepted, warning returned, no duplicate create; same rule for update.
- Cloud acceptance with failed event append: accepted state and history warning, no rollback or retry transition.
- Local-fallback Lead can still qualify while signed in.
- Real/sample creation through shared Lead and Opportunity services; sample creation with signed-in owner makes zero cloud calls, including the person and qualification event path.
- Sample flags survive qualification and restore excludes samples; real records remain real.
- Failed sample creation does not create an orphan stakeholder.
- Every existing production creation wrapper passes explicit sample scope; record continuity remains covered.

Tests use the existing in-memory browser pattern. Cloud tests substitute only the network client via Node's module hook; actual commands, stores, codecs and guards run. They do not validate deployed RLS or make external network requests. The focused files are `test/unit/leadCommands.test.mjs` and `test/unit/leadCloudIntegrity.test.mjs`.

The first full verification exposed outdated harness assumptions: event-idempotency checks invoked the write path without browser storage, and source checks required a parameterless catch and the stale input variable name. `eventReliability.test.mjs` and the Delta verifier now provide storage and also assert that exactly two genuine events persist despite a retry. The Delta catch check accepts a named error; qualification wiring now requires the saved-state reread and its full form round-trip. These changes retain the existing guarantees rather than weakening durability requirements.

## Verification and acceptance

Run all 115 commands from the `check` chain separately against the final SHA, plus the two focused regression files explicitly and `npx tsc -b --pretty false`. Preserve failures rather than combining earlier passes. The final Git note contains the per-command results and test counts for the exact checkpoint.

Acceptance requires those checks to pass and the two M0.1 reproductions to be prevented by the regression tests. This is a gate for accepting existing Leads work, not authorization to implement M1 or Condition.

## Existing affected records and deferred debt

No live workspace was inspected and no contaminated record was deleted or relabeled. Old incorrectly labeled sample Leads cannot be identified deterministically from customer names, a current demo flag, or `source: user/isSample: false` alone. Safe identification requires independent evidence linking creation to a demo session (for example a trusted contemporaneous backup/log or explicit operator confirmation). Otherwise manual review is required. Do not bulk-repair real-looking records by guessing identity.

Still deferred: full cloud export/restore symmetry, epistemic evidence semantics, general event coverage and atomicity, cloud/local reconciliation beyond existing fallback behavior, multi-client concurrency control, and independent stakeholder/outcome write failure contracts. No migration or destructive cleanup is needed for the two forward-write fixes here.
