# Cohort Wave 1 Operator System + Stage 3 Commercial Intelligence

Date: 2026-07-15
Status: FOUNDER DIRECTIVE - build the cohort operating machinery and the previously-gated Stage 3 intelligence now, ahead of the cohort-evidence gate (same feature-first call as the pivot overrule). Operates inside the canonical direction (`commercial-os-direction-2026-07-09.md`).

## Context

The cohort validation system (`cohort-validation-system-2026-06-16.md`) is fully specified but lives only as docs + a CSV tracker: qualification scoring, invite ordering, activation funnel, and stop/go criteria are all manual. The evidence gate that unlocks Stage 3 (Commercial Intelligence / GTM) depends on running Wave 1. The founder directed building both now, so a real cohort is runnable from inside the app and Stage 3 exists to consume the data it produces.

## Hard constraints (binding)

- **No new API endpoint.** `api/` is at the Vercel Hobby 12-function cap - everything here is client-side, deriving from data already loaded (early-access requests, demo feedback, workspace activities/outcomes) or from operator-entered numbers. No funnel-aggregate endpoint.
- **Money-spine + derive-don't-migrate.** Stage 3 intelligence is computed from existing records, never stored, never a blank canvas; weak data is stated as weak.
- **Honest, no fake confidence.** Scores and verdicts show their basis and their limits.
- Each slice ships with a contract and a demo-sandbox smoke, per the deploy workflow.

## Slices

### C1 - Cohort qualification console (this change)

`scoreCohortRequest(record)` turns the doc's 0-10 rubric into a pure function over the early-access form fields: weekly/forecast review pain, active B2B selling role, importable pipeline, evidence/follow-up/objection/review pain, engagement (willing), and named budget owner. Buckets: invite-first (8-10), backup (6-7), clarify (4-5), skip (0-3). The validation page scores each request, sorts by score, shows the matched signals and bucket, and summarises the bucket distribution. Honest: the rubric is derived from the form and directional; the willingness/14-day-commitment signal the form cannot see is called out, not invented.

### C2 - Stop/Go + activation funnel calculator

An operator surface for the Friday review: enter the week's counts (invited, activated, brief created, review pack/manager summary, first review completed, paid intent) and get the doc's Go / Iterate / Pause verdict derived from the stop-go criteria, with each condition shown met/unmet. Client-side, operator-entered (real funnel aggregates need the analytics DB, which is out of scope under the no-endpoint constraint). Pairs with the existing funnel SQL for the operator who wants raw numbers.

### S3.1 - Stage 3 Commercial Intelligence: GTM / route health

The first Stage 3 surface: derived route-to-market intelligence grown from the operator's own activities + outcomes - which segments/roles/routes convert, typical cycle, where silence concentrates - each deep-linking to a filtered action view. Never a blank canvas: below a minimum outcome density it states the data is too thin and names what to capture. derive-don't-migrate; no new data entry.

## Sequencing

C1 -> C2 make Wave 1 runnable and measurable. S3.1 begins the intelligence layer the cohort will stress-test. Further Stage 3 surfaces (objection-route learning, forecast-calibration-by-segment) follow only if S3.1's density approach proves out - grown from real activities, never ahead of data.

## What stays the founder's job (not code)

Recruiting and running real participants, the onboarding/closeout calls, and recording willingness-to-pay. The app now scores, orders, and evaluates; a human still runs the 14 days.
