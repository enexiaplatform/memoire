# Phase M.41 - Opportunity Action Plan Engine Report

## What Was Added

Phase M.41 turns MEDDIC-lite gaps, stakeholder risks, objection debt, stale next actions, timeline uncertainty, and competition signals into practical next-best-actions for each opportunity.

The implementation remains:

- rule-based
- personal-user focused
- non-CRM-sync
- non-AI-scored
- non-destructive

No opportunity, account, stakeholder, or objection data is changed automatically.

## Files Created

- `src/utils/opportunityActionPlan.ts`
- `docs/briefs/phase-m41-opportunity-action-plan-engine-report.md`

## Files Modified

- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`

## How Action Recommendations Are Generated

The action plan engine uses:

- opportunity fields
- MEDDIC-lite review output
- related stakeholders
- related objections
- linked activities and captured next actions

Action source types:

- `MEDDIC Gap`
- `Stakeholder`
- `Objection`
- `Stale Next Action`
- `Timeline`
- `Competition`

Action priorities:

- `High`
- `Medium`
- `Low`

Example generated actions:

- Confirm economic buyer for the opportunity
- Identify or strengthen champion
- Clarify procurement decision process
- Ask customer for technical decision criteria
- Prepare proof for open objection
- Follow up on stale next action
- Build response plan against competitor presence

## UI Behavior

Opportunity Detail now includes `Recommended Action Plan`.

The panel shows:

- top recommended actions
- priority badge
- source badge
- reason
- related gap/stakeholder when available
- suggested due date when available

Controls:

- `Copy Action`
- `Copy All Actions`
- `Add to Opportunity Next Action`

`Add to Opportunity Next Action` only updates the editable form state. The user still must click `Save Opportunity`; nothing is saved silently.

## Dashboard Integration

Dashboard now includes `Critical Deal Actions` when high-priority deal actions exist.

The block prioritizes:

- missing economic buyer
- missing champion
- unclear decision process
- high-impact open objections
- stale next action
- competitor presence without a response plan

## Reviews Integration

Weekly/Monthly Reviews now include `Recommended Deal Actions` for opportunities touched in the selected period by:

- linked activities
- objection movement
- opportunity updates in the period

## Pipeline Defense Integration

Pipeline Defense Brief generation from opportunities now includes `Next defense actions`.

Generated deal content helps the user answer:

- what must be confirmed next
- what proof must be prepared
- which stakeholder must be engaged
- which objection must be resolved

## Demo Sandbox Behavior

The existing demo data now produces meaningful action recommendations:

- defensible deals get maintenance/defense-prep style actions
- weak recoverable deals get buyer/process/proof actions
- hope-based deals get evidence and decision-process actions
- unsupported deals get next-action/downgrade-style rescue actions

No demo data sync behavior changed.

## Manual QA Checklist

1. Open `/app/opportunities`.
2. Open an opportunity detail panel.
3. Verify `Recommended Action Plan` renders.
4. Verify MEDDIC gaps generate actions.
5. Verify stakeholder gaps generate actions.
6. Verify open objections generate actions.
7. Click `Copy Action`.
8. Click `Copy All Actions`.
9. Click `Add to Opportunity Next Action` and confirm the form changes without auto-saving.
10. Open `/app/dashboard`.
11. Verify `Critical Deal Actions` renders when high-priority deal actions exist.
12. Open `/app/reviews`.
13. Generate a weekly/monthly recap and verify `Recommended Deal Actions` renders when period opportunities exist.
14. Generate a Pipeline Defense Brief from opportunities.
15. Confirm generated deal content includes `Next defense actions`.
16. Confirm demo sandbox still works.
17. Run `npm run build`.
18. Run `npm run lint`.

## Known Limitations

- No persistent task object is created yet.
- No calendar/task integration is added.
- No AI scoring or numeric win probability is added.
- Action priority is rule-based and conservative.
- Review actions are derived at runtime and are not cloud-stored separately.

## Supabase SQL

No Supabase SQL changes are required for M.41.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings.
