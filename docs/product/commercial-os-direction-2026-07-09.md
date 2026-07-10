# Personal Commercial Operating System - Canonical Direction

Date: 2026-07-09
Status: FOUNDER DIRECTION - the authoritative product strategy. Refines and supersedes the framing in `pivot-business-activity-os-2026-07-09.md` (whose hard rules remain in force: money-spine, one product one voice, derive-don't-migrate). Read this together with `docs/positioning.md`.

## Vision

Memoire is a **Personal Commercial Operating System** for people who personally create commercial motion: B2B salespeople, account managers, BD managers, solo owners, selling founders, consultants/freelancers, distributor/channel managers.

North star: *Capture what happened. Understand what changed. See what is stuck. Know what to do next. Learn how your business actually works.*

## The core operating loop (every feature must serve it)

Activity -> Context -> Commercial State -> Next Action -> Outcome -> Review -> Learning

Center of gravity: **commercial activity** is the source record; every module is an organization or interpretation of activities. The priority is CONNECTING existing capabilities into one loop, not adding independent modules.

## Boundaries (unchanged, binding)

Not a full CRM (no territories, hierarchies, comp, enterprise workflow). Not project management (no sprints, dependencies, workload). Not accounting (money states yes; bookkeeping/tax/statements no). Not a general second brain (commercial impact only). AI is assistive: it extracts, links, suggests state changes, summarizes, and answers on memory - it never mutates state unconfirmed, never acts externally, never fakes confidence on weak data.

## Direction vs shipped state (gap map, audited 2026-07-09)

| Direction item | State | Evidence / gap |
|---|---|---|
| 7.1 Unified Activity Ledger | SHIPPED (2026-07-10) | `/app/activity`, business domains, dual badges + per-activity state trail chips (`activityStateTrail`): captured buying signals, risks, timeline signals, competitors on each ledger card - never inferred |
| 7.2 Context linking | SHIPPED (2026-07-10) | linking + suggestions + correction memory + explicit activity <-> initiative links (`initiativeActivityLink`, ids on the operating-context payload); linked activities count as touches for the stall detector |
| 7.3 Commercial state & journey | SHIPPED (2026-07-10) | `buildCommercialJourneySnapshot`: position from money flow or stage, last touch, quiet days, commitment, blocker, risk - in the ledger detail. Solo journey head derived alongside (`soloPosition`: Audience -> Conversation -> Offer -> Sale -> Fulfillment -> Payment -> Retention) with an honest retention read-model (`retentionStatus`); the solo lens speaks that language in the ledger detail |
| 7.4 Today as action surface | SHIPPED | cockpit (5 questions) + capped nudges; analysis lives in Review/detail pages |
| 7.5 Weekly Commercial Review | SHIPPED (v3, 2026-07-10) | money lanes, wins/losses, stalled initiatives, commitments ledger (60dbf45), customer-signal digest (b141a1d), next-week priorities + three copyable briefs composed from the same commercial memory model: Commercial Learning Brief (`commercialLearningBrief`), Revenue Risk Brief (`revenueRiskBrief`), Follow-up Brief (`followUpBrief`). Pipeline Defense Brief stays the manager-facing artifact. All five named outputs of 7.5 now exist |
| 7.6 Initiatives & experiments | SHIPPED 2026-07-09 | hypothesis/expected signal/current signal/decision on `payload`; related-activity read-model on the operating page |
| 7.7 Workspace lenses | SHIPPED (complete, 2026-07-10) | Settings selector; Solo leads capture templates, B2B leads the cockpit, review sections re-order per lens (`orderReviewSectionsForLens`), onboarding welcome speaks the lens's language (`onboardingEmphasisForLens`), the ledger's journey chip uses solo naming under the solo lens; contract enforces reorder-only (never add/hide) across all surfaces |
| 7.8 GTM/RTM intelligence | CORRECTLY DEFERRED | Stage 3; requires activity+outcome density; funnel instrumentation shipped 2026-07-09 feeds it |
| State-change suggestions (Stage 1 keystone) | SHIPPED 2026-07-09 | `suggestQuoteStateChanges`: payment/delivery/PO capture proposes the quote state change; user confirms; money flow updates |

## Stage sequencing (with owners of remaining gaps)

- **Stage 1 - Commercial Activity Foundation:** complete as of 2026-07-10 (ledger, taxonomy, linking, state-change suggestions, cockpit, per-activity state trail chips on ledger cards).
- **Stage 2 - Commercial Operating Loop: COMPLETE (shipped 2026-07-09, one push per step).** (a) initiative depth on `payload` + related activities (`initiativeExperiment`, 80811fe), (b) commitments ledger in the Weekly Review (60dbf45), (c) workspace lenses - emphasis re-weighting only, one data model (ebcccb0), (d) commercial journey read-model surfaced in the Activity Ledger detail (`commercialJourney`, ca5d183).
- **Stage 3 - Commercial Intelligence:** gated on Stage 2 usage data (funnel events shipped). GTM signals, route health, learning briefs - grown from real activities, never a blank canvas, weak data stated as weak.

## Standing evaluation questions

Before shipping anything: does it serve the loop; does it connect or silo; action or information; buildable from existing capabilities; does it drift toward CRM/PM; does it demand new data entry; is the insight evidenced; is there a simpler path; demote instead of delete; does it unify the OS.
