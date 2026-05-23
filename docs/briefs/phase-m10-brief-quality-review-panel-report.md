# Phase M.10 Brief Quality Review Panel Report

## Files Created

- `src/utils/pipelineDefenseBriefQuality.ts`
- `docs/briefs/phase-m10-brief-quality-review-panel-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/features/pipeline/PipelineDefensePrintableBrief.tsx`

## Quality Rules Implemented

Phase M.10 adds deterministic whole-brief quality analysis for the active Pipeline Defense Brief.

Exported helpers:

- `analyzePipelineDefenseBriefQuality(brief)`
- `getBriefReadinessStatus(analysis)`
- `getBriefCleanupActions(analysis)`

The analysis checks:

- deals missing next action
- unsupported / hope-based forecast evidence
- unresolved objection debt
- missing decision context
- missing or unclear pipeline review answer
- deals that should be downgraded
- deals that should be rescued this week
- weak or vague deal truth
- missing pipeline context
- evidence that exists but is not concrete

No deal data is changed by the quality review.

## Readiness Statuses

The panel can return:

- `Review-ready`
- `Needs cleanup`
- `High risk / not defensible`

Conservative status logic:

- `Needs cleanup` when the brief has zero deals.
- `High risk / not defensible` when there are multiple high-risk issues or more than 40% of deals are unsupported / hope-based.
- `Needs cleanup` when high-risk issues are limited or medium / low issues remain.
- `Review-ready` only when at least one deal exists and no issues are detected.

## UI Behavior Added

The `/app/pipeline-defense` action bar now includes `Review Brief Quality`.

When clicked, the page shows a `Brief Quality Review` panel with:

- readiness status badge
- total deals
- high-risk issue count
- medium-risk issue count
- low-risk issue count
- recommended cleanup actions
- issue lists grouped by High, Medium, and Low

Each issue shows:

- account / deal when applicable
- issue label
- reason
- suggested cleanup action

Deal-specific issues include `Go to deal`, which scrolls to the matching deal card. This is navigation only and does not edit any data.

## Empty State Behavior

If the active brief has zero deals, `Review Brief Quality` does not crash.

It shows:

- status: `Needs cleanup`
- issue: `No deals available for review`
- cleanup action: add deals manually, import deals, or reset to sample data

## Print / Export Behavior

Print now includes a concise `Brief Quality Review` section in the print-only brief:

- readiness status
- high-risk issue count
- medium-risk issue count
- low-risk issue count
- up to five recommended cleanup actions

Markdown export is intentionally unchanged in Phase M.10. Quality analysis remains a screen and print feature only.

## Existing Behavior Preserved

Preserved behavior:

- Analyze Deal per card
- Apply Suggestions to safe fields only
- Analyze All Deals and rules summary
- import deals
- Markdown export
- browser print / Save as PDF
- localStorage persistence
- multiple weekly briefs
- create / switch / rename / duplicate / delete briefs
- empty state

## Intentionally Not Built

Phase M.10 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- AI generation
- LLM API
- win probability
- heavy scoring model
- automatic deal edits
- Markdown quality export
- full app redesign

## Manual Test

1. Open `/app/pipeline-defense`.
2. Confirm `Review Brief Quality` appears in the action buttons.
3. Click `Review Brief Quality`.
4. Confirm the `Brief Quality Review` panel appears.
5. Confirm the panel shows readiness status, total deals, high-risk issues, medium-risk issues, low-risk issues, and cleanup actions.
6. Confirm issues are grouped by High, Medium, and Low.
7. Click `Go to deal` on a deal-specific issue and confirm the matching card scrolls into view.
8. Remove all deals and click `Review Brief Quality` again.
9. Confirm status is `Needs cleanup` and the empty-brief issue appears.
10. Confirm Analyze Deal, Apply Suggestions, Analyze All Deals, import, Markdown export, print, local persistence, and multiple brief switching still work.
11. Print / Save PDF and confirm the printable brief includes the concise Brief Quality Review section.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
