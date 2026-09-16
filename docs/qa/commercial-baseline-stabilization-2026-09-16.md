# M0.1 — baseline stabilization and current Leads audit

Scope: one behavior-preserving lint correction, review of current Leads and M0 integrity findings, and a fixed Git checkpoint. No M1 implementation, UI/navigation change, migration, ranking change or live database operation.

## Checkpoint identity and verification

Starting revision: `0b3a3c5f9abc31a19aa6059668ee77df0c1aad98`. The checkpoint is the commit introducing this report, titled `Stabilize M0.1 architecture baseline and audit existing Leads`. Resolve its exact SHA with `git log -1 --format=%H -- docs/qa/commercial-baseline-stabilization-2026-09-16.md`. The execution report supplies that full SHA; the document cannot embed its own commit hash. Verification must use an isolated checkout of that commit, with no later source overlays.

Run every command in `package.json`'s `check` chain (115 commands), including build/TypeScript, API type checking, lint, unit tests, navigation, kernel, data integrity, performance, no-AI and restore/export contracts. Do not infer acceptance from the earlier M0 results. Record results against this exact commit; a passing suite alone does not resolve the reproduced persistence defects below.

The checkpoint also tracks the previously delivered M0 ADR, verification report and five-test file, which were still untracked. Their addition to Git is preservation of M0 deliverables, not new M0.1 architecture implementation. Unrelated untracked `src/utils/commandRegistry.ts` is excluded; no tracked caller imports it at the inspected checkpoint. It cannot be counted as completed command-bar functionality.

## Lint root cause and correction

`opportunityToFormInput` destructured seven identity/storage fields (`id`, `userId`, `createdAt`, `updatedAt`, `storageMode`, `source`, `isSample`) solely to exclude them from the rest object. The previous concurrent change correctly replaced an incomplete field allowlist, preserving fields such as `closedOn`, but left seven unused bindings under the existing lint rules. This is an incomplete lint-cleanup aspect of that change (category C); the exclusions themselves are required (category D), not obsolete fields or unwired event history.

The correction copies the record, removes exactly those seven keys from the copy with `Reflect.deleteProperty`, and retains existing brand normalization. It neither mutates the original nor enumerates an allowlist that could drop new commercial fields. No rule suppression or underscore placeholders. Existing `leadCommands.test.mjs` checks both metadata exclusion and field retention; no speculative test was added.

## Existing Leads inventory

| Area | Actual implementation and boundary |
|---|---|
| Route | `App.tsx` lazy-loads `LeadsPage` at `/app/leads`. `/app/opportunities?view=leads` redirects, retaining remaining query/hash. |
| Registry/navigation | Seven primary IDs: today, leads, accounts, opportunities, money, timeline, review. Rail order: Today, Plan, Leads, Accounts, Opportunities, Money, Review; `navIcons.tsx` has a Leads icon. |
| Mobile | Bottom tabs remain Today/Plan/Accounts/Opportunities; Leads is reachable through More. `LeadQueueList` uses desktop table and smaller-screen cards, shared row actions and accessible labels. Static contracts verified; no physical-device interaction test claimed. |
| Opportunity UI | Qualified pipeline excludes Lead-stage and disqualified-Lead records. Underlying collection retains all records; ID deep links still resolve in the existing editor. `from=leads` returns to Leads. Stage list filter omits Lead. |
| Lead UI | Search, state filters, add drawer, qualification evidence, next action, source, nurture date/reason, disqualified history. No separate Lead store/table, no lead-value total or numeric lead score. |
| Semantics | Canonical stage is `Lead`; qualification is `Discovery`, status Active. `New` is a derived readiness/queue label, not a second persisted stage. `isLeadStage` recognizes Lead case-insensitively; it does not classify arbitrary persisted `new` as Lead. |
| Qualification | `leadCommands.qualifyLead` calls `updateOpportunity` for the same record, clears nurture date/reason, and retains the other input fields. It checks Lead stage, not readiness. The operator can qualify before the advisory checklist is complete. |
| Disqualification | Writes an OpportunityOutcome with reason, Lost and `stageBeforeOutcome: Lead`, then updates the same Opportunity to Lost with `closedOn`. Retained on Leads via the outcome-based partition. The two writes are not atomic. |
| Nurture | Existing stage remains Lead. Stores revisit date/reason; shared queue surfaces it three days early. Supports reschedule and immediate return. No durable scheduler: resurfacing is computed when consumers rebuild the queue. |
| Source | Ten controlled categories, case-insensitive normalization, optional detail. Read fallback maps only legacy `channel`; unrecognized channel labels remain visible. No invented default source. Existing migration comments incorrectly describe fallback to three legacy fields. |
| Capture | Explicit `leadDraft.enabled` and no selected opportunity are required. Creates a lead through `createLead`, then links the activity; displayed need sentences become evidence text. Person proposals remain in fact review. No unconditional parser-driven lead creation. These writes are not a transaction. |
| Today | Dashboard builds `buildLeadQueue`/`buildLeadSignals`; unified command center consumes the signals. Qualified pipeline uses shared partitioning. Signals navigate to relevant queue filters; this is not proof of a direct Today qualify command. |
| Accounts | `accountGlance` separates leads from qualified deals; Accounts links to `/app/leads?q=<accountName>`. This is text search, not a strict account-ID filter. |
| Review | `ChangesSinceReviewPanel`/`LeadFunnelPanel`, `reviewChanges`, `buildLeadFunnel`: added/qualified/disqualified changes, time to first touch/qualification, conversion by source, reasons dropped. Rates require at least five leads; event reads are bounded to 365 days/2,000 records. |
| Analytics | Domain funnel analytics exist. No dedicated create/qualify/nurture/disqualify product-telemetry event wiring was found in Lead commands or the product event vocabulary. Sales acquisition leads in admin/lead-ops checks are a separate concept. |
| Persistence | Existing migration `20260916090000_lead_source_and_nurture.sql` adds four nullable columns to opportunities, authenticated column grants and a partial owner/date index for Lead stage. Local/cloud readers and writer include those four fields. No new migration in M0.1; deployed status not inspected. |
| Tests | Existing `leadCommands.test.mjs` exercises real local stores, identity continuity, stakeholder linkage, nurture/disqualify and form retention. `leadQueue.test.mjs` covers classification, source/readiness, nurture, signals/funnel and extraction. Navigation contracts cover route/registry/mobile reachability and one-record partitioning. None proves deployed cloud behavior or storage-failure safety. |

## Gap against the planned M1

- **ALREADY DONE:** first-class destination, route/registry/icon, shared Opportunity identity, queue, add/qualify/disqualify/nurture, source fields, reviewed Capture creation, Today/Accounts/Review integrations, responsive presentation and existing tests. Reimplementing M1 promotion verbatim would duplicate work.
- **PARTIAL:** continuity under failed storage; sample isolation during lead creation; atomicity of disqualification/Capture; event-backed funnel completeness; account search specificity; source migration prose; advisory readiness. Engagement currently means at least one linked activity, not necessarily a proven two-way customer response, despite some UI copy saying two-way.
- **NOT IMPLEMENTED:** dedicated Lead product telemetry, direct qualify action from the command bar/Today proven by a tracked caller, full cloud restore, complete historical lead conversion reconstruction. These are inventory gaps, not automatic requirements for M1.
- **CONFLICTING:** false save-success and sample creation tagged as live conflict with preservation/isolation guarantees. The core decision to keep Leads as Opportunities is compatible with the charter. No requirement to introduce a new Lead entity, AI, Condition or Dependency was found.

## Record continuity: Lead to Discovery

On the successful current write path, `qualifyLead` updates the existing ID; it does not copy/delete the record or relink children.

| Item | Finding |
|---|---|
| ID and created date | Preserved; existing runtime tests reread stored data, not just the returned object. Cloud update addresses owner + ID and does not patch `created_at`. |
| Activities / captured notes | Linked activity IDs and raw notes are untouched by qualification; no activity write occurs. Explicit links remain valid. Account-only legacy links remain ambiguous rather than being repaired. |
| Stakeholders | Same opportunity ID; existing runtime test rereads the linked person after qualification. |
| Evidence | Opportunity evidence text is carried by form and row writer. Structured Commercial Evidence records are untouched and continue to reference the same ID. This is preservation, not a new epistemic guarantee. |
| Source/provenance | Lead source/detail retained. Local input excludes only storage metadata, which `updateOpportunity` retains from the original. Cloud patch leaves existing source-system/external-key columns untouched; response reader reconstructs them. No qualification-time provenance copy is necessary. |
| Commercial value | Value/currency preserved by form and update; a local reproduction used nonzero value 12,345. |
| Event history | Existing events remain linked. Lead -> Discovery normally emits a stage-change event through `recordOpportunityStateChanges`. It is best-effort, not atomic or guaranteed durable. |
| Intentional changes | Stage/status, updated time and cleared nurture date/reason. Historical nurture revisions are not separately journaled. |

The success-path continuity claim does not hold as a durability guarantee when local storage rejects a write. An event can be recorded even when the source-record write was refused, because the store ignores the guard result.

## Current M0 integrity findings, reclassified

| Finding | Current status | Gate |
|---|---|---|
| A. Cloud export/restore asymmetry | Still present: `buildRestorePlan` consumes local browser records, not cloud rows; explicit cloud restore map covers JSON collections, not all relational/kernel records. Cloud-only evidence export produces zero planned writes. | **BLOCKS M2** before adding more canonical persistence; not independently a Lead-promotion blocker. |
| B. `closedOn` lost through form helper | Fixed by the already-present concurrent copy-all-fields change, retained by the lint fix. Local read/update and row writer carry it. Existing test and local reproduction confirm preservation through an unrelated save. | **SAFE TO DEFER** broader serializer audit; this specific helper omission is resolved. No deployed cloud end-to-end claim. |
| C. Local failure reported as success | Still present in Opportunity store as well as kernel repository. A direct qualification reproduction returns Discovery/no warning while reread remains Lead. | **BLOCKS M1**: directly threatens Lead persistence; also blocks M2. |
| D. Incomplete event coverage | Stage qualification is observed, but history failures are swallowed; fields/events remain selective, reads bounded, nurture changes not journaled. | **FIX SOON** for general coverage; complete historical reconstruction can wait. False-history-after-failed-write belongs to blocker C. |
| E. Epistemic distinctions | Evidence still uses direction/category; positive/negative/neutral does not encode supported/assumed/hypothesis/contradicted, and neutral can satisfy evidence-presence checks. | **BLOCKS M2** semantic design/implementation, not M1 navigation. |

Additional **BLOCKS M1** finding: `createLead(..., { source: 'demo', isSample: true })` forwards sample metadata to stakeholder creation but not to `createOpportunity`. The Opportunity writer creates `{ source: 'user', isSample: false }`. A new lead created from the sample workspace can therefore survive sample cleanup as live data. This is a code/runtime finding, not evidence of an observed production incident.

Additional **FIX SOON** limitations: stakeholder creation errors are swallowed by `createLead`; disqualification's outcome write and Opportunity mutation are separate, so partial completion can leave a misleading outcome. These require explicit failure reporting and retry design, not a lint refactor. No larger behavioral fix was attempted here.

## Reproduction evidence

A temporary Node harness supplied in-memory browser storage and imported actual current `leadCommands`, Opportunity store and backup planner. It created a lead, qualified it, and reread it; then repeated with `setItem` throwing `QuotaExceededError` for `memoire.opportunities.v1` only. Results:

```json
{
  "normalQualification": "ID, createdAt, value, evidence, closedOn preserved",
  "quota": { "returned": "Discovery", "persisted": "Lead", "warning": null },
  "demo": { "requestedSample": true, "returnedSample": false, "returnedSource": "user" },
  "cloudOnlyRestoreWrites": 0
}
```

The failures above are expected observations of defects, not new regression tests that redefine those defects as correct behavior. The harness does not access production data. For the quota check, the global shell can announce a storage failure, but that does not make the command's returned success or the page's optimistic transition durable.

## Review of the M0 round-trip test

`commercialKernelRoundTrip.test.mjs` uses exported real codec objects and the existing backup parser/planner, not duplicated codec logic. Codecs are an appropriate persistence boundary for this architecture test. Four nontrivial fixtures compare to the original fixture after row serialization and local backup restoration, preventing symmetric sanitizer loss from hiding a missing field.

The event fixture has distinct `occurredAt`/`recordedAt`; evidence has distinct `observedAt`/`recordedAt`; both carry provenance. Commitment original/current due dates, due-date history, completion and event links are asserted. Thread linkage survives. The fifth test intentionally removes sample evidence while retaining the real evidence's two clocks. Thread sample handling is not tested or claimed. No speculative State Engine contract, browser interaction or full cloud recovery claim. No change needed.

## Acceptance decision

**NO-GO for M1 acceptance even if all existing verification commands pass.** The lint blocker is corrected, but the audit reproduced two direct Lead integrity blockers: false success after refused storage and sample leads persisted as live records. Resolve these in a separately scoped behavioral fix, add meaningful failure-path coverage, then verify one fixed commit again. Do not rebuild the already-present Leads destination. M0.1 intentionally stops with these findings rather than changing product behavior.
