# Phase M.29: Onboarding & First-Run Guided Flow Report

## Files created

- `src/utils/onboardingState.ts`
- `docs/briefs/phase-m29-onboarding-first-run-flow-report.md`

## Files modified

- `src/features/dashboard/DashboardPage.tsx`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/accounts/AccountsPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/services/salesActivityStore.ts`

## Onboarding state behavior

Created a simple local onboarding state using:

- `memoire.onboarding.v1`

Fields:

- `hasSeenWelcome`
- `hasCompletedFirstCapture`
- `hasCreatedFirstOpportunity`
- `hasCreatedFirstAccount`
- `hasGeneratedFirstDefenseBrief`
- `dismissedAt`
- `updatedAt`

Onboarding is local/browser-only for M.29, even when the user is logged in. No cloud onboarding persistence was added.

Utility functions added:

- `loadOnboardingState`
- `saveOnboardingState`
- `markOnboardingStepComplete`
- `dismissOnboarding`
- `resetOnboarding`

## Welcome panel behavior

Dashboard now shows a dismissible Welcome to Memoire panel when onboarding has not been dismissed.

The panel explains Memoire as:

`Your personal B2B sales operating system for capturing activity, managing opportunities, remembering accounts, and preparing pipeline reviews.`

Steps shown:

1. Capture your first sales activity
2. Add your first opportunity
3. Create or confirm an account memory
4. Review your dashboard
5. Generate your first pipeline defense brief

Each step shows:

- Done / Not started
- short explanation
- CTA link to the relevant route

Buttons:

- Load sample sales data
- Dismiss guide
- Reset guide

## Auto-detection logic

Dashboard infers completion from current loaded data:

- first capture: activities count > 0
- first opportunity: opportunities count > 0
- first account: accounts count > 0
- first defense brief: non-default pipeline defense brief exists
- dashboard review: marked complete when Dashboard is visited

This means onboarding progress reflects existing local or cloud data instead of relying only on manual state.

## Empty-state improvements

Capture:

- Textarea now includes an example first note:
  `Met Orion Pharma today. Need to clarify tender timeline next week.`
- Empty recent activity state suggests the same first note pattern.

Opportunities:

- Empty state now explains that opportunities are deals the user wants to track and defend.

Accounts:

- Empty state now explains that accounts remember relationship context behind deals.

Pipeline Defense:

- Empty deal state now points users to create a brief from selected opportunities.

Dashboard:

- Empty state says:
  `Start by capturing one activity or adding one opportunity.`

## Sample data behavior

Implemented lightweight local sample data from the Dashboard onboarding panel.

When clicked, Memoire creates browser-local sample records only:

- 2 sales activities
- 2 opportunities
- 1 account
- 1 demo pipeline defense brief

Sample data is written to localStorage only:

- `memoire.salesActivities.v1`
- `memoire.opportunities.v1`
- `memoire.accounts.v1`
- `memoire.pipelineDefenseBriefs.v1`

If the user is logged in, the UI explicitly states that cloud records were not changed.

## What remains intentionally not built

- No Gmail integration.
- No Google Calendar integration.
- No Salesforce/HubSpot/external CRM sync.
- No real AI or LLM calls.
- No heavy product tour library.
- No cloud onboarding persistence.
- No automatic cloud sample data insertion.

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the existing 5 hook dependency warnings from older modules:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

