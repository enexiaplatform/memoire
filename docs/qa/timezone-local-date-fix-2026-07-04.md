# Systemic Timezone Bug: Local Date Keys

Date: 2026-07-04

## The bug

Across ~28 files the codebase computed "today" and date keys with
`new Date().toISOString().slice(0, 10)`, which returns the **UTC** date. For any
user east of UTC (e.g. the target Vietnamese solo operator at UTC+7), from local
midnight until ~07:00 local, this returns **yesterday's** date. West of UTC, the
symmetric error happens in the evening. Impact was pervasive and silent:

- Overdue detection (`isBusinessDateOverdue` default `today`) flagged the wrong day.
- Silence day-counts, proactive nudges, MEDDIC, pipeline-defense, revenue, weekly
  review, command-center, and capture-nudge engines all keyed off a UTC "today".
- Natural-language due dates ("today"/"tomorrow"/"hôm nay"/"ngày mai") in capture
  resolved to the UTC day - directly wrong for the Vietnamese phrases the parser targets.
- "Log as sent" activity date and "Book the next touch" default were UTC-dated.

## The fix

`src/utils/safeDate.ts` gained `todayDateKey()` and `toLocalDateKey(date)`, which
read the local calendar day via `getFullYear/getMonth/getDate`. `isBusinessDateOverdue`
now defaults to `todayDateKey()`. Every `new Date().toISOString().slice(0, 10)`
"today" and every `<date>.toISOString().slice(0, 10)` day-key across the engine,
service, and feature layers was migrated to these helpers (private `todayKey()` /
`toDateKey()` helpers now delegate to them). Demo sample-data date generation was
migrated too, so demo dates and the local "today" agree.

Timestamps that are genuine instants (createdAt/updatedAt ISO strings, quote-id
suffixes) were left as-is.

## Verification

- New contract assertions in `verify-safe-date-and-capture.mjs`: `todayDateKey()`
  equals the local Y/M/D, and `toLocalDateKey` reads local day for fixed instants
  (23:30 local stays the same day; 00:15 local stays the same day).
- `npm run check` passes (full suite).
- Demo-sandbox runtime: silence classifier still fires ("Quiet 16d - no next
  action"), Today health strip shows 4 healthy / 1 silent, Opportunities renders
  7 rows, no console errors.
