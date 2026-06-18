# Memoire First-Run Activation Hardening

Date: 2026-06-16

Roadmap session: Session 5 - First-Run Activation Hardening

## Decision

Memoire's first-run path is now more focused, but it is not yet fully proven for cohort launch.

The intended first activation path is:

1. Import a CSV, add one opportunity, or open the demo sandbox.
2. Review the first opportunity signals.
3. Generate a Pipeline Defense Brief.
4. Save or copy a review-ready outcome.

This session tightened the first screen and corrected a cloud-data mismatch in the first review guide. Operational proof still depends on the Session 4 two-account QA matrix.

## What Changed

### Empty Dashboard Entry Point

Updated `src/features/dashboard/DashboardPage.tsx` so an empty account now leads with the pipeline setup actions that matter most:

- Import CSV: `/app/opportunities?import=csv`
- Add opportunity: `/app/opportunities?new=1`
- Try demo first

Before this pass, the empty account primary action pushed users toward Quick Capture. Quick Capture is still valuable after a pipeline exists, but it is not the shortest path to the first review outcome.

### Empty State Reinforcement

Updated the dashboard empty state copy and buttons to reinforce the same activation path:

- Import CSV
- Add Opportunity

This keeps the empty dashboard from presenting two competing starts.

### Opportunity Route Entry Reliability

Updated `src/features/opportunities/OpportunitiesPage.tsx` so the CSV import and add-opportunity URL entry points respond to the current query string, not only the first component mount.

This matters when a user is already inside the opportunities area and is routed back to a specific start action.

### First Review Cloud Data Fix

Updated `src/features/onboarding/FirstPipelineReviewFlow.tsx` so the first pipeline review guide loads cloud sales assets for signed-in users through `loadSalesAssetsForUser(userId)`.

Before this pass, the guide always loaded local sales assets. That could make a signed-in user's first review metrics undercount reusable proof or objection assets that exist in cloud storage.

## Existing Behaviors Confirmed

The opportunities page supports the two dashboard entry URLs:

- `?import=csv` opens the CSV importer as a one-shot entry point.
- `?new=1` opens the add-opportunity panel as a one-shot entry point.

The opportunities page also already marks the first-review and trial checklist milestones when:

- Opportunities are imported or added.
- A Pipeline Defense Brief is generated.

## Verification

Static checks completed:

- Confirmed route parameters are handled in `src/features/opportunities/OpportunitiesPage.tsx`.
- Confirmed the first review guide now mirrors the cloud/local asset loading pattern used by `src/services/workspaceData.ts`.

Automated verification:

- `npm run build` passed.
- Local browser check passed for `/app/dashboard` in demo workspace mode with no visible runtime error.
- Local browser check confirmed `/app/opportunities?import=csv` opens the CSV import modal and clears the query string.
- Local browser check confirmed `/app/opportunities?new=1` opens the add-opportunity panel and clears the query string.

## Remaining Activation Risks

- The empty dashboard still shows several downstream surfaces after the first-start panel. This is acceptable for now, but a real user test should confirm the user does not drift into secondary actions.
- Review Pack activation recognition should be verified in the next funnel-measurement pass.
- Demo-to-real-account transition still needs the operational QA evidence from the two-account matrix.
- The first-run path should be observed with at least one real seller before treating the copy and action order as final.

## Next Recommended Session

Proceed to Session 6 only after acknowledging that Session 4's operational QA remains a launch gate.

The next best product session is Session 6: Funnel Measurement And Operator Dashboard.

Focus:

- Verify product funnel events for import, demo, request access, signup, brief creation, and review-pack save.
- Create operator queries or a lightweight internal view for activation review.
- Define the weekly activation dashboard used during the first cohort.
