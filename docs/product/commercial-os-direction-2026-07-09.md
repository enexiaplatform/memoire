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
| 7.1 Unified Activity Ledger | SHIPPED | `/app/activity`, business domains, dual badges. Gap: per-activity state-change + outcome trail display |
| 7.2 Context linking | MOSTLY SHIPPED | linking + suggestions + correction memory exist. Gap: activity <-> initiative linking |
| 7.3 Commercial state & journey | PARTIAL | silence/evidence/money per object exist; flexible journey model not built (money flow lanes approximate the B2B journey tail) |
| 7.4 Today as action surface | SHIPPED | cockpit (5 questions) + capped nudges; analysis lives in Review/detail pages |
| 7.5 Weekly Commercial Review | SHIPPED (v1) | money lanes, wins/losses, stalled initiatives, next-week priorities + Pipeline Defense Brief as one output. Gap: commitments ledger, customer-signal digest, named Learning Brief |
| 7.6 Initiatives & experiments | PARTIAL | offer/experiment types, stalled detection, review section. Gap: hypothesis/expectation/signals/decision fields (use existing `payload`), related-activity view |
| 7.7 Workspace lenses | NOT BUILT | approved direction: light lenses (copy, template order, Today emphasis) over one data model - NOT separate modes |
| 7.8 GTM/RTM intelligence | CORRECTLY DEFERRED | Stage 3; requires activity+outcome density; funnel instrumentation shipped 2026-07-09 feeds it |
| State-change suggestions (Stage 1 keystone) | SHIPPED 2026-07-09 | `suggestQuoteStateChanges`: payment/delivery/PO capture proposes the quote state change; user confirms; money flow updates |

## Stage sequencing (with owners of remaining gaps)

- **Stage 1 - Commercial Activity Foundation:** complete as of 2026-07-09 (ledger, taxonomy, linking, state-change suggestions, cockpit). Remaining polish: per-activity state trail in ledger cards.
- **Stage 2 - Commercial Operating Loop:** next. Order: (a) initiative depth on `payload` (hypothesis/expected signal/decision) + related activities, (b) commitments in the Weekly Review (promised next actions vs done), (c) workspace lenses (light), (d) flexible journey read-model over existing states.
- **Stage 3 - Commercial Intelligence:** gated on Stage 2 usage data (funnel events shipped). GTM signals, route health, learning briefs - grown from real activities, never a blank canvas, weak data stated as weak.

## Standing evaluation questions

Before shipping anything: does it serve the loop; does it connect or silo; action or information; buildable from existing capabilities; does it drift toward CRM/PM; does it demand new data entry; is the insight evidenced; is there a simpler path; demote instead of delete; does it unify the OS.
