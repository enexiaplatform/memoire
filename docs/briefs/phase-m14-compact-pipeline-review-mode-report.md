# Phase M.14 Compact Pipeline Review Mode Report

## Files Created

- `src/features/pipeline/PipelineDefenseReviewDealCard.tsx`
- `docs/briefs/phase-m14-compact-pipeline-review-mode-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Review Mode Behavior

The `/app/pipeline-defense` page now includes a local `Review Mode` toggle.

When clicked, the page switches into a compact read-only review surface for the active brief.

The button changes to `Exit Review Mode`.

Exiting review mode restores the full editing workspace without losing deal data or local state.

## Controls Hidden In Review Mode

Review Mode hides or prevents access to heavy editing and destructive controls:

- Import Deals button and import panel
- Draft Assist panels
- deal edit forms
- Add Deal
- Remove deal
- Reset to sample data
- Clear local brief storage
- Delete brief
- Duplicate brief
- New Brief
- full workspace supporting sections such as rules explainer, radar, objection debt grid, forecast evidence definitions, manager questions, recommended actions, and decision log

Entering Review Mode also closes:

- import panel
- open deal edit form
- Draft Assist panel
- existing Markdown preview

## Controls Preserved In Review Mode

Review Mode keeps compact review-safe controls:

- Exit Review Mode
- Export Markdown
- Print / Save PDF
- Review Brief Quality
- Generate Action Plan
- Analyze All Deals

No data is modified automatically by entering or exiting Review Mode.

## Review Content Shown

Review Mode shows:

- active brief metadata
- Executive Summary
- Pipeline Review Summary strip
- Brief Quality Review panel, if already generated
- Weekly Action Plan panel, if already generated
- Deal Risk Rules summary, if already generated
- Top At-Risk Deals

Each compact deal card shows:

- account / opportunity
- pipeline context
- risk type
- forecast evidence category
- decision recommendation
- deal truth
- missing context
- objection debt
- recommended action
- pipeline review answer

## Review Mode Summary Strip

The summary strip includes:

- total deals
- at-risk deals
- unsupported / hope-based count
- rescue / downgrade count
- readiness status if quality review has been run

If quality review has not been run, it shows `Not run` and includes a `Review Brief Quality` button.

## Empty State Behavior

If the active brief has zero deals, Review Mode safely shows:

`No pipeline deals available for this review.`

It does not show Add Deal or Reset controls in Review Mode.

## Print / Export Behavior

Print behavior is unchanged. The existing print-only brief remains clean and excludes edit controls.

Export Markdown remains available in Review Mode. The Markdown preview appears only when Henry explicitly clicks `Export Markdown`.

## Existing Behavior Preserved

Preserved behavior:

- full editing workspace after exiting Review Mode
- edit/add/remove/import deals in full workspace
- localStorage persistence
- multiple weekly briefs
- Markdown export
- browser print / Save as PDF
- Analyze Deal
- Apply Suggestions
- Analyze All Deals
- Brief Quality Review
- Weekly Action Plan
- local/mock Draft Assist through provider abstraction

## Intentionally Not Built

Phase M.14 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- real AI
- API call
- network request
- new route
- permanent persisted review mode preference
- full app redesign

## Manual Test

1. Open `/app/pipeline-defense`.
2. Select a brief with deals.
3. Click `Review Mode`.
4. Confirm compact review view appears.
5. Confirm active brief metadata, executive summary, summary strip, and top at-risk deals are visible.
6. Confirm compact deal cards show deal truth, forecast category, decision recommendation, missing context, objection debt, recommended action, and pipeline review answer.
7. Confirm Add Deal, Remove, edit forms, Draft Assist, Import Deals, Reset, Clear storage, Delete, and Duplicate controls are hidden.
8. Click `Review Brief Quality` and confirm quality review works.
9. Click `Generate Action Plan` and confirm action plan works.
10. Click `Export Markdown` and confirm export still works.
11. Click `Print / Save PDF` and confirm print still works.
12. Click `Exit Review Mode` and confirm the full editing workspace returns.
13. Edit a deal in full workspace.
14. Enter Review Mode again and confirm edited data appears.
15. Remove all deals in full workspace.
16. Enter Review Mode and confirm the empty state appears without a crash.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
