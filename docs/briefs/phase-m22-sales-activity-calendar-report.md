# Phase M.22 Sales Activity Calendar Report

## Files created

- `docs/briefs/phase-m22-sales-activity-calendar-report.md`

## Files modified

- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/components/layout/ProtectedRoute.tsx`

## Route added

- `/app/calendar` already existed from the earlier calendar surface and is now upgraded for Phase M.22.
- Sidebar already contains `Calendar`.
- `/app/calendar` now supports local-first access when the user is logged out.

## Calendar views added

- Day view
- Week view
- Month view
- Default view: Week
- Date navigation:
  - Previous period
  - Today
  - Next period

## Activity rendering

Activities are loaded from the Phase M.21 `sales_activities` persistence service and grouped by `activityDate`.

Each activity card shows:

- activity type
- account name
- opportunity name
- summary
- next action
- due date
- tags
- local/cloud storage badge

Activity type badges are supported for:

- Customer meeting
- Follow-up
- Demo / technical discussion
- Quote / proposal
- Tender / procurement
- Internal coordination
- Objection handling
- Admin / CRM
- Other

## Summary logic

Weekly/day summary includes:

- total activities
- accounts touched
- opportunities touched
- follow-ups
- objections captured
- internal coordination items
- activities with next actions
- overdue due dates

Monthly summary includes:

- total activities
- active days
- accounts touched
- top activity type
- most touched account
- open next actions
- objection handling count

All summary logic is deterministic and rule-based.

## Activity detail

Clicking an activity card opens a detail modal showing:

- raw note
- structured fields
- created timestamp
- updated timestamp
- copy summary button
- delete activity button

Delete uses the same local/cloud persistence rules as M.21.

## Local/cloud persistence behavior

- Logged-in users with Supabase configured load from `public.sales_activities`.
- Logged-out users load from localStorage.
- If Supabase is unavailable, the shared store falls back to localStorage.

## Empty state

If there are no activities in the selected period:

- Shows `No sales activities captured for this period.`
- Includes CTA linking to `/app/capture`.

## What remains intentionally not built

- Google Calendar integration.
- Gmail integration.
- CRM integration.
- Real AI/LLM analysis.
- Drag-and-drop calendar editing.
- Calendar event reminders.

## Build/lint status

- `npm run build`: passes.
- `npm run lint`: passes with the 5 known pre-existing hook dependency warnings.
