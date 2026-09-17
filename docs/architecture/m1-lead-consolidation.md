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

Every PARTIAL, MISSING, LEGACY DUPLICATION and CONFLICTING SEMANTICS row above is now closed.

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

Verification: `npm run check` (115 commands) green, unit suite 1,594 tests with 0 failures, lint 0 errors (2 pre-existing warnings). Demo-sandbox browser checks: Leads at 1440px and 375px (no horizontal scroll), revisit pill applies and clears, Ask lead shortcuts, Opportunities excludes the three demo leads, no console errors.
