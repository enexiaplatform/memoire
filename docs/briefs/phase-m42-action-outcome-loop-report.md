# Phase M.42 - Action Outcome Loop Report

## What Was Added

Phase M.42 closes the loop between rule-based recommended deal actions and real execution outcomes.

Memoire can now remember:

- which recommended actions were marked done
- which actions were dismissed or deprioritized
- what happened after the action
- whether the outcome improved, worsened, resolved, or remained unclear
- whether a deal needs another quality review

This remains a lightweight personal sales memory layer, not a task manager or team CRM.

## Files Created

- `src/services/actionOutcomeStore.ts`
- `src/utils/actionOutcomeLoop.ts`
- `docs/briefs/phase-m42-action-outcome-loop-report.md`

## Files Modified

- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`
- `src/utils/sampleData.ts`

## Data Model

Action outcomes are stored locally with key:

```text
memoire.actionOutcomes.v1
```

Fields:

- `id`
- `opportunityId`
- `opportunityName`
- `accountName`
- `actionTitle`
- `actionSourceType`
- `status`: `Suggested`, `Accepted`, `Done`, `Dismissed`
- `outcomeType`: `Improved`, `Worsened`, `No change`, `Still unclear`, `Resolved`, `Downgrade recommended`
- `outcomeNote`
- `relatedStakeholderName`
- `relatedObjectionId`
- `relatedGap`
- `createdAt`
- `updatedAt`
- `completedAt`
- optional demo markers: `source`, `isSample`

## Outcome Signals

`src/utils/actionOutcomeLoop.ts` derives:

- latest completed actions
- dismissed/deprioritized actions
- unresolved critical actions
- stale actions
- improved/resolved signals
- worsened/downgrade signals
- unclear/no-change signals
- whether the deal quality may need review
- last action outcome for Pipeline Defense

The logic is deterministic and rule-based.

## UI Behavior

Opportunity Detail now includes:

- `Mark Done`
- `Dismiss`
- `Add Outcome`
- compact outcome form
- `Action Outcome History`

No opportunity, stakeholder, objection, or account data is changed automatically.

`Add to Opportunity Next Action` still only updates the editable form. The user must save the opportunity manually.

## Dashboard Integration

Dashboard `Critical Deal Actions` now includes:

- unresolved critical actions
- recently completed action outcomes
- negative or unclear outcomes

The panel remains compact and links back to Opportunities.

## Reviews Integration

Weekly/Monthly Reviews now include:

- completed action outcomes
- dismissed/deprioritized outcomes
- improved/resolved outcomes
- unclear/worsened outcomes
- unresolved critical deal actions

## Pipeline Defense Integration

Generated Pipeline Defense Briefs now include:

- `Last action outcome`
- existing next defense actions
- unresolved recommended actions

This helps answer what was done since the last review, what changed, and what remains unresolved.

## Demo Support

Demo sandbox now includes action outcome examples:

- VHP action completed with improved outcome
- Control Union action completed but still unclear
- Bidiphar action dismissed with downgrade recommendation
- TV Pharm critical action accepted but unresolved

Demo outcomes are local-only and are cleared with demo sandbox data.

## Supabase SQL

No Supabase SQL is required for M.42.

Action outcomes are localStorage-first for this phase. Cloud persistence can be added later with an additive table if needed.

## Manual QA Checklist

1. Open `/app/opportunities`.
2. Open an opportunity detail panel.
3. Confirm `Recommended Action Plan` still renders.
4. Click `Mark Done` on one action.
5. Confirm `Action Outcome History` appears.
6. Click `Add Outcome`.
7. Select an outcome type and save a note.
8. Confirm the history updates.
9. Click `Dismiss` on another action.
10. Confirm dismissed action appears in history.
11. Open `/app/dashboard`.
12. Confirm `Critical Deal Actions` shows unresolved/completed/unclear signals.
13. Open `/app/reviews`.
14. Confirm `Action Outcomes` appears when outcomes exist.
15. Generate a Pipeline Defense Brief from an opportunity.
16. Confirm `Last action outcome` appears in generated deal text.
17. Open Demo Sandbox.
18. Confirm demo outcome examples appear.
19. Run `npm run build`.
20. Run `npm run lint`.

## Known Limitations

- Action outcomes are local-only in M.42.
- There is no calendar/task integration.
- There is no automatic stage, objection, stakeholder, or forecast update from an outcome.
- There is no AI scoring or numeric win probability.
- There is no team workflow or manager assignment.

## Build/Lint Status

- `npm run build`: pass
- `npm run lint`: pass with the 5 known pre-existing hook dependency warnings
