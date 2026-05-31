# Phase M.46 - Product Hardening & Navigation Refactor Report

## What was added

- Added shared currency formatter:
  - `src/utils/currency.ts`
- Added this report:
  - `docs/briefs/phase-m46-product-hardening-navigation-refactor-report.md`

## Files modified

- `src/components/layout/Sidebar.tsx`
- `src/components/layout/TopNav.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/v31/AskMemoirePage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/accounts/AccountsPage.tsx`
- `src/utils/meddicLite.ts`

## Dashboard hardening

- Moved repeated dashboard analysis work into one memoized `dashboardInsights` layer.
- Reused the same derived weekly execution review, playbook patterns, asset gap summary, MEDDIC summary, outcome loop, and critical action list across dashboard widgets.
- Kept top dashboard lists capped and compact.
- Preserved existing dashboard data loading and local/cloud fallback behavior.

## Navigation refactor

Sidebar navigation is now grouped by product workflow:

- Today: Dashboard, Capture, Calendar, Ask Memoire
- Deals: Opportunities, Stakeholders, Objections
- Memory: Accounts, Reviews, Journey
- Library: Playbook, Assets
- Pipeline Review: Pipeline Defense

All existing routes remain intact.

## Data mode trust cleanup

- Removed the global top-bar `DataModePill`.
- Each main page continues to own its page-level data mode status.
- This avoids duplicated "Local only" / "Synced" pills while preserving the trust signal.

## Ask Memoire UX

- Preset buttons continue to run immediately.
- Ask Memoire no longer silently does nothing when the user is not signed in.
- Signed-out/local mode now returns rule-based fallback answers.
- Endpoint failures show a friendly fallback status instead of raw technical errors.
- Loading, empty, fallback, and answer-ready copy were clarified.
- Legacy `/app/today#quick-capture` CTAs inside Ask Memoire were pointed to `/app/capture`.

## Onboarding and demo sandbox

- Demo sandbox data no longer auto-completes onboarding steps as if it were real user data.
- The onboarding guide now clarifies that demo records are local and the checklist reflects the real workspace journey.
- Demo sandbox remains local-only and does not change cloud sync behavior.

## Currency formatting

- Standardized active value / estimated value formatting to:
  - `5,240,000,000 VND`
- Applied shared formatting to Opportunities, Accounts, and MEDDIC-lite value evidence.

## What remains intentionally not built

- No new product module.
- No Gmail or Google Calendar integration.
- No Salesforce, HubSpot, or external CRM sync.
- No AI scoring or numeric win probability.
- No new Supabase schema or SQL migration.
- No storage behavior changes.

## Manual QA checklist

1. Open `/app/dashboard`.
2. Confirm sidebar sections render and routes remain clickable.
3. Confirm only one page-level data mode pill appears.
4. Confirm Dashboard loads without sluggish repeated widget recompute.
5. Open `/app/ask`.
6. Click an Ask preset and confirm it runs.
7. Confirm fallback/local-rule copy appears when endpoint is unavailable or user is signed out.
8. Open Demo Sandbox and confirm onboarding steps are not marked complete only because of demo data.
9. Open `/app/opportunities` and confirm money displays as `number VND`.
10. Open `/app/accounts` and confirm active value displays consistently.
11. Confirm Playbook, Assets, Reviews, Pipeline Defense routes still work.

## Build and lint status

- `npm run build`: passed.
- `npm run lint`: passed with the 5 known pre-existing hook dependency warnings.
- Local browser QA: passed for `/app/dashboard`, `/app/ask`, and `/app/opportunities`.

## Supabase SQL

- No Supabase SQL changes required.
