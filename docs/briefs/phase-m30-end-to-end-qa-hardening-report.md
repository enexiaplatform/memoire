# Phase M.30 End-to-End QA Hardening Report

## Files Created

- `docs/qa/phase-m30-end-to-end-data-flow-checklist.md`
- `docs/qa/phase-m30-data-source-map.md`
- `docs/qa/phase-m30-regression-summary.md`
- `docs/briefs/phase-m30-end-to-end-qa-hardening-report.md`

## Files Modified

- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/salesActivityRecap.ts`

## QA Checklist Location

- `docs/qa/phase-m30-end-to-end-data-flow-checklist.md`

## Data Source Map Location

- `docs/qa/phase-m30-data-source-map.md`

## Consistency Fixes

- Calendar summary metrics now prefer linked account/opportunity context when activities are linked to opportunities.
- Calendar copied activity summaries now prefer linked account/opportunity context.
- Sales recap account metrics and lists now prefer linked account context.
- This prevents linked activities from being undercounted when the original natural-language note did not cleanly extract the account name.

## Sync / Mode Clarity Changes

- Calendar now shows clearer states:
  - `Cloud sync enabled`
  - `Cloud unavailable - local calendar`
  - `Local mode - sign in to sync`
- Reviews now shows clearer states:
  - `Cloud sync enabled`
  - `Cloud unavailable - local reviews`
  - `Local mode - sign in to sync`

## Navigation Fixes

- Existing cross-module CTAs were reviewed and retained:
  - Dashboard -> Capture / Opportunities / Accounts / Reviews / Pipeline Defense
  - Capture -> Opportunities when no opportunities exist
  - Calendar activity detail -> Account Memory
  - Opportunities -> Account Memory
  - Opportunities -> Pipeline Defense after brief generation
  - Reviews empty state -> Capture

## Known Limitations

- Sample data remains local-only by design and is not written to Supabase while signed in.
- Historical linked activity labels are preserved after opportunity deletion rather than destructively rewritten.
- Onboarding state remains browser-local only.
- Supabase cloud mode still requires external SQL migration and env-var setup.
- Guard search still finds legacy API/Claude/fetch references in older app areas outside the current local-first Personal B2B Sales OS modules. No new Gmail, Google Calendar, external CRM, or real AI integration was added in this phase.

## What Remains Intentionally Not Built

- Gmail integration
- Google Calendar integration
- Salesforce or HubSpot sync
- External CRM sync
- Real AI / LLM API calls
- Cloud-synced onboarding state
- Destructive cross-module cascade cleanup

## Build / Lint Status

- Build: passed with `npm run build`.
- Lint: passed with `npm run lint`; 5 known pre-existing hook dependency warnings remain in legacy hooks:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` (2 warnings)
- Local route smoke check: passed for `/app/dashboard`, `/app/capture`, `/app/calendar`, `/app/reviews`, `/app/accounts`, `/app/opportunities`, and `/app/pipeline-defense`.
