# Phase M.48 - Low-friction Capture Trigger Report

## What was added

Phase M.48 adds a faster capture path for B2B sales updates. Users can now capture a structured update in roughly 30 seconds without leaving the existing sales activity storage model.

## Files changed

- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`

## Files created

- `src/utils/captureNudges.ts`
- `docs/briefs/phase-m48-low-friction-capture-trigger-report.md`

## Quick Capture behavior

`/app/capture` now supports Quick Capture mode through:

- page toggle between Quick Capture and Full Note + AI Assist
- URL prefill with `mode=quick`, `account`, `opportunity`, and `date`
- fields for account, opportunity, interaction type, what happened, next action, due date, and signal type
- save into the existing `sales_activities` local/cloud persistence flow

Supported interaction types:

- Customer meeting
- Dealer call
- Proposal sent
- Objection received
- Procurement update
- Technical discussion
- Follow-up
- Internal review

Supported signal types:

- Buying signal
- Risk signal
- Objection
- Stakeholder update
- Timeline update
- Competitor signal
- Procurement signal
- No major change

## Template behavior

Quick Capture includes template buttons for common moments:

- After customer meeting
- After dealer call
- After proposal sent
- After objection received
- After procurement update
- After technical discussion
- After internal pipeline review

Templates prefill interaction/signal type and provide focused prompts for the update and next action.

## Entry points added

- Opportunity detail: `Capture Update`
- Dashboard: `Capture Nudges`
- Calendar: `Add Meeting Note`
- Dashboard quick actions now point to Quick Capture

## Dashboard nudges

The Dashboard now derives compact capture nudges from:

- stale next actions
- open objections
- missing champion or economic buyer
- unclear or worsened action outcomes
- active opportunities with no recent captured activity

Each nudge links into Quick Capture with account/opportunity prefilled.

## Existing behavior preserved

- Full natural-language capture still works.
- Optional Capture AI Assist still works and remains user-confirmed.
- Rule-based classification still works.
- Link-to-opportunity suggestions still work after saving.
- Stakeholder and objection creation suggestions still work after saving.
- Calendar, Reviews, Dashboard, Accounts, Opportunities, Assets, and Pipeline Defense continue using the same sales activity records.

## Supabase SQL

No Supabase SQL changes are required. Quick Capture saves through the existing `sales_activities` schema and service.

## Known limitations

- Quick Capture does not auto-link activities to opportunities. The user still confirms links after save.
- Quick Capture does not auto-update opportunities, accounts, stakeholders, or objections.
- No notifications, voice recording, Gmail, Google Calendar, or CRM sync were added.

## Manual QA checklist

1. Open `/app/capture?mode=quick`.
2. Confirm Quick Capture mode appears.
3. Fill account, update, and next action.
4. Save quick capture.
5. Confirm activity appears in Recent activities.
6. Confirm opportunity link suggestion appears when relevant.
7. Open `/app/opportunities`, open an opportunity, click `Capture Update`.
8. Confirm `/app/capture` opens with account/opportunity prefilled.
9. Open `/app/dashboard`, confirm Capture Nudges render.
10. Open `/app/calendar`, click `Add Meeting Note`.
11. Confirm `/app/capture` opens in quick mode with date prefilled.
12. Confirm Full Note + AI Assist still works.
13. Run `npm run build`.
14. Run `npm run lint`.

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings.
- Local browser QA passed for `/app/capture?mode=quick`, `/app/dashboard`, `/app/calendar`, and Opportunity Detail `Capture Update`.
