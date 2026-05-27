# Phase M.43 - Weekly Execution Review & Learning Loop

## What was added

- Added a rule-based Weekly / Monthly Execution Review layer for Memoire.
- Added execution review intelligence from action outcomes, opportunity action plans, MEDDIC-lite gaps, stakeholders, objections, and activity context.
- Added a compact Execution Review section in Sales Reviews.
- Added Copy Weekly/Monthly Execution Review.
- Added Dashboard Weekly Execution Health.
- Added compact execution learning into generated Pipeline Defense Briefs from Opportunities.

## Files created

- `src/utils/weeklyExecutionReview.ts`
- `docs/briefs/phase-m43-weekly-execution-review-learning-loop-report.md`

## Files modified

- `src/features/reviews/SalesReviewsPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`

## How execution review is calculated

The review remains deterministic and rule-based.

Inputs:

- Active opportunities
- Action outcomes from `memoire.actionOutcomes.v1`
- MEDDIC-lite opportunity review
- Opportunity recommended actions
- Stakeholders
- Objections
- Recent activities

Execution Summary includes:

- recommended actions
- completed actions
- dismissed actions
- unresolved critical actions
- improved outcomes
- worsened outcomes
- unclear outcomes

Deal Movement categories:

- Improved
- Worsened
- Still unclear
- Needs rescue
- Consider downgrade
- Stable / monitor

The movement logic uses:

- recent action outcomes
- open high-impact objections
- missing champion or economic buyer
- unclear decision process
- stale next actions
- MEDDIC-lite category
- downgrade/rescue recommendations

Learning signals include repeated patterns such as:

- unclear outcomes after completed actions
- unresolved high-priority actions
- repeated missing economic buyer
- repeated missing champion
- recurring documentation / validation objections
- unclear procurement path
- competitor risk without response plan

## UI behavior

Sales Reviews now shows:

- Execution Review
- Execution Summary metrics
- Deal Movement Summary
- Execution Quality Signals
- Personal Sales Learning
- Next Week Focus
- Copy Weekly/Monthly Execution Review

Dashboard now shows:

- Weekly Execution Health
- completed actions this week
- unresolved critical actions
- unclear outcomes
- deals needing rescue
- top learning/focus signals

Pipeline Defense generation now includes:

- Execution learning since last review
- latest completed outcome
- unresolved critical action
- review posture: defend, rescue, monitor, or downgrade

## Supabase SQL

No Supabase SQL changes are required for M.43.

M.43 reads existing local-first action outcomes and existing cloud/local sales objects. It does not create a new persistence model.

## Manual QA checklist

1. Open `/app/reviews`.
2. Switch to weekly view.
3. Verify Execution Review renders.
4. Verify Execution Summary counts action outcomes correctly.
5. Verify Deal Movement Summary renders.
6. Verify Execution Quality Signals render.
7. Verify Personal Sales Learning renders.
8. Verify Next Week Focus renders.
9. Verify Copy Weekly Execution Review works.
10. Open `/app/dashboard` and verify Weekly Execution Health renders.
11. Generate Pipeline Defense Brief from Opportunities and confirm execution learning appears in generated deal content.
12. Verify Demo Sandbox still works.
13. Run `npm run build`.
14. Run `npm run lint`.

## Known limitations

- Action outcomes remain local-first through `memoire.actionOutcomes.v1`.
- No numeric win probability is introduced.
- No AI scoring is used.
- No task-management workflow, reminders, calendar sync, Gmail sync, or external CRM sync is added.
- Deal movement is a conservative rule-based interpretation, not a forecast model.

## Build / lint status

- `npm run build`: pass
- `npm run lint`: pass with 5 known pre-existing hook dependency warnings
