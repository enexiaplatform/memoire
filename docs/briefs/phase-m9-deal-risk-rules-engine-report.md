# Phase M.9 Deal Risk Rules Engine Report

## Files Created

- `src/utils/pipelineDefenseRules.ts`
- `docs/briefs/phase-m9-deal-risk-rules-engine-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Rules Implemented

Phase M.9 adds a deterministic, transparent rules utility for Pipeline Defense deals.

Exported rule helpers:

- `analyzePipelineDefenseDeal(deal)`
- `suggestForecastEvidenceCategory(deal)`
- `suggestDecisionRecommendation(deal)`
- `detectRiskFlags(deal)`
- `suggestNextAction(deal)`

The rules inspect:

- missing context
- objection debt
- evidence
- pipeline review answer
- recommended action
- risk type

Risk flags include missing decision maker, missing budget owner, missing procurement path, missing decision timeline, missing next action, missing decision criteria, unresolved objection debt, empty evidence, weak evidence language, indefensible review answer, and stalled follow-up signals.

The rules stay conservative:

- Missing decision context increases risk.
- Unresolved objection debt raises rescue priority.
- Empty or weak evidence pushes deals toward `Hope-based` or `Unsupported`.
- Strong customer-confirmed evidence can improve defensibility.
- `Defensible` is suggested only when evidence is strong and high-risk flags are absent.

No numeric score, win probability, model, LLM, or AI generation was added.

## UI Behavior Added

Each deal card now includes `Analyze Deal`.

When clicked, Memoire runs the deterministic rules for that deal and shows a suggestion panel inside the card with:

- suggested forecast evidence category
- suggested decision recommendation
- risk flags with severity and reasons
- suggested next action
- rule explanation

The page also includes `Analyze All Deals`.

When clicked, Memoire analyzes every current deal in the active brief and shows a compact rollup:

- high-risk deals
- objection debt flags
- unsupported / hope-based suggestions
- rescue count
- downgrade / monitor counts

## Apply Suggestion Behavior

Each suggestion panel includes `Apply Suggestions`.

Applying suggestions updates only these safe fields:

- `forecastEvidenceCategory`
- `decisionRecommendation`
- `recommendedAction`

It does not overwrite:

- account
- opportunity
- pipeline context
- deal truth
- risk type
- evidence
- missing context
- objection debt
- pipeline review answer

Suggestions are never applied automatically.

## Dynamic Suggestion Behavior

The implementation clears stale suggestions when a deal is edited, removed, imported, reset, switched, duplicated, or when storage is cleared.

Henry can click `Analyze Deal` again to recalculate the latest rule suggestion from the current deal state.

## Rules Visibility

The page now includes a `How rules work` note explaining:

- missing decision context increases risk
- unresolved objection debt increases rescue priority
- weak evidence makes forecasts less defensible
- confirmed next customer action improves defensibility

## Analyze All Behavior

`Analyze All Deals` generates suggestions for all deals and shows the rollup summary.

No `Apply All Suggestions` button was added. This keeps Phase M.9 safer by requiring Henry to apply suggestions deal by deal.

## Existing Behavior Preserved

The rules engine is local-only and does not change existing persistence or import/export paths.

Preserved behavior:

- multiple weekly briefs
- localStorage persistence
- active brief switching
- create / rename / duplicate / delete
- manual deal edit / add / remove
- deal import
- Markdown export
- browser print / Save as PDF
- empty state

## Intentionally Not Built

Phase M.9 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- AI generation
- LLM API calls
- scoring model
- numeric win probability
- automatic suggestion application
- wholesale page redesign

## Manual Test

1. Open `/app/pipeline-defense`.
2. Confirm `Analyze All Deals` appears in the page action buttons.
3. Click `Analyze All Deals`.
4. Confirm the rules summary appears with high-risk, objection debt, hope / unsupported, rescue, downgrade, and monitor counts.
5. Click `Analyze Deal` on an individual deal.
6. Confirm the suggestion panel appears inside the card.
7. Confirm the panel shows forecast category, decision recommendation, risk flags, suggested next action, and explanation.
8. Click `Apply Suggestions`.
9. Confirm only forecast evidence category, decision recommendation, and recommended action update.
10. Edit any field on that deal.
11. Confirm the old suggestion clears and can be recalculated by clicking `Analyze Deal` again.
12. Confirm import, Markdown export, print, multiple brief switching, local persistence, and empty state still work.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
