# M1 — Lead consolidation and acceptance

## Pre-change inventory (2026-09-17)

Audited from `cf4eef16632bd02fcec8ccab988db195d85fa435`. No reset or replacement of M0.2.

| Classification | Evidence and disposition |
| --- | --- |
| ALREADY CORRECT | Registry owns seven destinations; desktop and mobile More expose Leads; `/app/leads` owns the queue; the old Opportunities query redirects. Navigation verifier protects the set. |
| ALREADY CORRECT | `leadQueue` owns five derived work states, readiness evidence, source compatibility, Today signals and Review funnel. Lead drawers and mobile cards use Daylight. No separate Lead table. |
| ALREADY CORRECT | `leadCommands` qualifies the saved record in place, clears nurture, rejects stale retries and preserves M0.2 failure/sample guarantees. Capture uses explicit confirmation and shared creation. |
| PARTIAL | Opportunity list and Today main queue exclude Leads, but dashboard, business lens, account memory, forecast and quality aggregates still admit Lead records. |
| PARTIAL | Account glance distinguishes Leads/deals; Account memory totals do not. Global search finds Leads but labels disqualified Leads as lost Opportunities. |
| MISSING | Deterministic shortcuts for all Leads, quiet Leads and qualified Opportunities; revisit shortcut currently returns every needs-action Lead. Runtime command validation does not enforce the controlled disqualification reason or reject malformed nurture dates. |
| LEGACY DUPLICATION | Inline stage exclusions in qualification and Today overlap the canonical predicate. Stale six-destination comments survive despite the seven-destination registry. |
| CONFLICTING SEMANTICS | Kernel recognizes `new`/`prospecting` as prequalification while Lead predicate recognizes only `Lead`; store falls unknown legacy stages through to Discovery. Forecast calibration can learn from disqualified Lead outcomes as lost deals. |

## Scope

Consolidate the existing implementation and protect canonical derivations. Preserve commercial record history, explicit operator decisions, source/channel text, current evidence rules and existing ranking. No Condition, Dependency, AI, new lifecycle store or restore/atomicity redesign.

## Acceptance (2026-09-17)

The identified product gaps are addressed below; durability and telemetry limits are explicitly retained at the end of this document.

| Row | Resolution |
| --- | --- |
| Aggregates admitting Leads | Master dashboard, business lens, account memory, forecast coverage, forecast calibration, pipeline quality, live pipeline health, revenue horizon, stage funnel, money flow, capture nudges, outcome loop, weekly execution/business review and the policy engine all read the qualified partition. `test/unit/leadPipelineSeparation.test.mjs` compares each engine's output on a mixed book against the qualified-only book. |
| Account memory / search labels | Account memory keeps Lead history but counts only qualified deals as active, won or lost. Global search and Ask label a disqualified lead as a lead, not a lost opportunity. |
| Shortcuts | `show my leads`, `show leads going quiet`, `show leads due for revisit` (`?state=needs-action&revisit=due`) and `show qualified opportunities`. The revisit narrowing is shown on Leads as a removable "Due revisits only" pill, because a hidden narrowing is a lead that silently is not there. Asked on Ask, the same commands answer with the open-lead and open-qualified counts from the shared partition and link to the owning page; the per-state count is left to the queue, which alone reads the plan. |
| Command validation | `nurtureLead` rejects a malformed date without touching an existing schedule; `disqualifyLead` rejects a reason outside the controlled list before any outcome is written; both re-read the saved record, so a stale drawer cannot move a qualified deal back to Lead or Lost. |
| One predicate | `src/utils/leadIdentity.ts` owns the stage aliases and the partition; `leadQueue.ts` re-exports it. `verify-qualification-and-integrity.mjs` fails on a second copy (mutation-tested: 3/3 killed). |
| Legacy stages | `new` / `prospecting` read as Lead. Stage matching on read is now case-insensitive: the live database held one Active row at `proposal`, which read as Discovery and would have been written back as Discovery on its next save. No live row uses `new` or `prospecting` (checked 2026-09-17). |
| Forecast learning | Disqualified-lead outcomes are excluded from calibration and weekly win/loss counts. |
| Nurture history | Qualifying clears the active revisit date; the stage-change event carries `previousNurture` so why the lead was parked is still on record. |

Checkpoint `4465cc6` records a previous 1,594-test run and demo-sandbox browser checks at 1440px and 375px. Those observations are not substituted for the final exact-SHA run. The final checkpoint's Git note contains the command-by-command verification record.

## Final product contract

Lead is potential commercial work before qualification. `Lead`, `new` and `prospecting` are compatible representations of that state; reads normalize to `Lead`. Discovery is the qualification destination. A qualified Opportunity remains the same record, with the same identity, creation date, provenance, values and linked history. Qualification is an explicit operator decision informed by visible evidence, not an automatic score gate.

Nurture is a dated deferral of a Lead, independent of Lost or On hold. Disqualification closes the same record through the existing Lost outcome writer, with required controlled reason and `stageBeforeOutcome: Lead`. The product labels it Disqualified Lead and excludes it from lost-deal learning. Nothing is deleted.

The ten existing sources and source detail remain canonical. Legacy channel mappings are read compatibility; raw channel/source metadata is never rewritten destructively.

### Canonical queue rules, in precedence order

Closed records are historical and have no active queue actions. For open Leads:

1. **Needs Action:** active nurture revisit is at most three days away, including overdue dates.
2. **Nurture:** explicit valid revisit date is more than three days away. Suppress active pursuit until the revisit window.
3. **Ready to Qualify:** fit, contact, need and at least one linked captured touch are present. Fit means a known account or product/brand; contact means a named person or linked stakeholder; need means recorded evidence/technical criteria/objection. A dated next move is shown as the fifth dimension, not an extra qualification gate.
4. **New:** no linked captured touch, provided the preceding rules do not apply. This is not an invented age cutoff or proof that no conversation occurred.
5. **Going Quiet:** at least one touch, not ready, and shared silence classifier is at-risk (7 days) or silent (14 days), without a dated next action or linked open dated commitment.
6. **Needs Action:** remaining engaged Leads; show the first missing evidence dimension or the existing next-move guidance.

All five work states remain derived by `leadQueue`; Today consumes its signals and existing ranking. Generic Opportunity/thread pursuit warnings are suppressed for Leads. Actual money/commitment obligations remain actionable.

### Cross-surface acceptance

- Registry owns exactly seven destinations: Today, Plan, Leads, Accounts, Opportunities, Money, Review. Mobile keeps four tabs plus More; Leads has cards and drawers. No new destination or visual system.
- Canonical numeric derivations exclude Lead stages. Account memory retains all records but separates pipeline counts. Closed Lead outcomes are also excluded from calibration and personal lost-deal learning.
- Review's Lead funnel remains separate from qualified pipeline analytics. Its cohort, qualification receipts and disqualification reasons share the visible record set; sample/deleted-record receipts cannot inflate live conversion counts. Rates remain hidden below five Leads, including per-source rates. Observed time medians are descriptive, not benchmarks; qualification before available event history is not invented.
- Capture still creates only after operator confirmation through the shared command, retaining raw capture/linkage and sample scope. No AI or automatic creation was added.
- Search uses the existing command registry, shows Lead versus qualified context, retains disqualified history and opens the canonical queue. Due-revisit narrowing is visible and removable. Legacy `?view=leads` redirects and full-record editor links remain supported.
- Nurture/disqualify re-read before mutation; stale drawers cannot undo qualification. Clearing nurture on a stage change snapshots its former date/reason into the existing event payload. M0.2 save-failure warnings and sample isolation remain unchanged.

## Database and telemetry

No new table, persisted lifecycle status, migration or production data write is required. `previousNurture` is an optional payload on the existing stage-change event.

New product telemetry is deferred, as the charter permits for an unreliable mechanism. `trackProductEvent` promises never to throw but builds its payload using unguarded storage/window access before its fetch rejection handler; inserting it into critical Lead saves would weaken M0.2. Its event vocabulary is also coupled across client, API and a database CHECK constraint. No unsupported event names or private Lead contents are emitted. Existing commercial events and Review measurements remain usable; product telemetry hardening can be handled separately.

## Remaining debt and milestone boundary

- **BLOCKS M2 (M1.1 prerequisites):** browser/cloud state and event writes are not atomic; an accepted state can have a history warning. Outcome creation followed by record close-out is also a multi-write operation. General durability, recovery and restore guarantees require M1.1 before Commercial Condition. M1 does not claim to solve them.
- **FIX SOON:** make existing telemetry's never-throw contract true, then add semantic Lead event names with synchronized API/database validation. Two pre-existing React dependency warnings remain in FirstRunPage/SettingsPage.
- **SAFE TO DEFER:** complete historical nurture movement analytics and lifetime qualification cohorts beyond the retained event window. No conversion benchmarks, sequence automation or speculative models.

GO for M1.1 is conditional on all final exact-SHA checks passing. Stop after this milestone; do not begin M1.1 or M2 here.
