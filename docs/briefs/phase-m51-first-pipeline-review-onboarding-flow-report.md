# Phase M.51 - First Pipeline Review Onboarding Flow Report

## What Was Added

- Added a guided first pipeline review flow at `/app/onboarding/pipeline-review`.
- Added a Dashboard CTA: `Prepare Your First Pipeline Review`.
- Added local onboarding progress for the first Pipeline Defense activation path.
- Added query-param entry points for Opportunities:
  - `/app/opportunities?import=csv`
  - `/app/opportunities?new=1`
- Improved Opportunities empty state with import/onboarding CTAs.
- Improved Pipeline Defense empty state with first-review CTA.
- Added an Assets empty-state CTA to starter packs.

## Files Changed

- `src/utils/firstPipelineReviewOnboarding.ts`
- `src/features/onboarding/FirstPipelineReviewFlow.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/features/assets/SalesAssetsPage.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/App.tsx`
- `docs/briefs/phase-m51-first-pipeline-review-onboarding-flow-report.md`

## Onboarding Progress Model

Storage key:

```text
memoire.firstPipelineReviewOnboarding.v1
```

Tracked fields:

- `hasImportedOrAddedOpportunities`
- `hasReviewedOpportunities`
- `hasViewedGaps`
- `hasGeneratedPipelineDefense`
- `completedAt`
- `updatedAt`

Real non-demo data can help infer progress. Demo sandbox data does not automatically complete all steps. Demo only marks the pipeline-data step when the user explicitly loads it from the first-review flow.

## Routes / CTAs Added

- New route: `/app/onboarding/pipeline-review`
- Dashboard CTA: `Prepare Your First Pipeline Review`
- Opportunities empty state:
  - `Import CSV`
  - `Add Opportunity`
  - `Start First Pipeline Review`
- Pipeline Defense empty state:
  - `Create from opportunities`
  - `Start First Pipeline Review`
- Assets empty state:
  - `Open Starter Packs`

## Flow Behavior

The flow guides users through:

1. Bring in pipeline data
2. Review opportunities
3. Fix top gaps
4. Generate Pipeline Defense Brief

Top gaps are rule-based and include:

- missing value
- missing close period
- missing evidence
- missing next action
- missing economic buyer
- missing champion
- unclear decision process
- unresolved objection/proof gaps

## Known Limitations

- This is a lightweight activation flow, not a full tutorial system.
- The flow uses localStorage only; no cloud onboarding state is added.
- Gap review is user-confirmed through a simple `I reviewed top gaps` action.
- Pipeline Defense completion can be marked by creating a brief or by the user confirming manually.

## Supabase SQL

No Supabase SQL changes are required for M.51.

## Manual QA Checklist

1. Open `/app/dashboard` with fresh localStorage.
2. Verify `Prepare Your First Pipeline Review` CTA appears.
3. Open `/app/onboarding/pipeline-review`.
4. Verify the 4-step flow renders.
5. Click Import CSV path and verify it reaches Opportunities import.
6. Use demo or add opportunity path.
7. Verify progress updates without falsely completing all steps from demo data.
8. Open `/app/opportunities` and verify empty state CTAs if no data.
9. Open `/app/pipeline-defense` and verify empty state CTA if no brief.
10. Generate or mark Pipeline Defense step complete.
11. Verify success state appears.
12. Verify demo sandbox still works.
13. Verify CSV import still works.
14. Verify Dashboard still loads smoothly.
15. Run `npm run build`.
16. Run `npm run lint`.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings.
