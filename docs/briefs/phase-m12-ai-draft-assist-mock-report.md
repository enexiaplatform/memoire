# Phase M.12 AI Draft Assist Mock Report

## Files Created

- `src/utils/pipelineDefenseDraftAssist.ts`
- `docs/briefs/phase-m12-ai-draft-assist-mock-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Draft Types Supported

Phase M.12 adds deal-level `Draft Assist` using deterministic local mock generation only.

Supported draft types:

- `Deal truth`
- `Pipeline review answer`
- `Recommended action`
- `Objection handling note`
- `Manager question`

Exported helpers:

- `generateDealTruthDraft(deal)`
- `generatePipelineReviewAnswerDraft(deal)`
- `generateRecommendedActionDraft(deal)`
- `generateObjectionHandlingDraft(deal)`
- `generateManagerQuestionDraft(deal)`
- `generatePipelineDefenseDraft(deal, draftType)`

## Deterministic / Mock Behavior

Drafts are generated from current deal fields with local string templates.

Inputs include:

- account
- opportunity
- pipeline context
- deal truth
- risk type
- evidence
- missing context
- objection debt
- forecast evidence category
- decision recommendation
- recommended action

The panel is clearly labeled:

- `Local draft assist`
- `Mock AI draft`
- `Deterministic local drafting only. No AI API or network request is used.`

No backend, network request, AI provider, LLM API key, OpenAI, Claude, Gemini, or real AI generation was added.

## Apply Behavior

`Apply Draft` appears only for draft types with a safe target field:

- `Deal truth` updates `dealTruth`
- `Pipeline review answer` updates `pipelineReviewAnswer`
- `Recommended action` updates `recommendedAction`

Copy-only draft types:

- `Objection handling note`
- `Manager question`

These do not auto-apply because there is no single safe target field.

## Copy Behavior

`Copy Draft` uses `navigator.clipboard.writeText`.

When copying succeeds, the panel shows `Copied`.

When clipboard access fails, the draft remains visible in a textarea for manual copy.

## Print / Export Behavior

Draft Assist is part of the interactive page and remains hidden from print because the print output uses the separate print-only brief.

Mock drafts are not included in:

- print output
- main Markdown export
- action plan copy output

## Existing Behavior Preserved

Preserved behavior:

- Analyze Deal
- Apply Suggestions
- Analyze All Deals
- Brief Quality Review
- Weekly Action Plan
- import deals
- Markdown export
- browser print / Save as PDF
- localStorage persistence
- multiple weekly briefs
- empty state

## Empty State Behavior

If the active brief has zero deals, no deal cards render, so `Draft Assist` does not appear.

## Intentionally Not Built

Phase M.12 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- real AI generation
- LLM API
- API key
- OpenAI / Claude / Gemini call
- network request
- automatic application for copy-only drafts
- print/export inclusion of mock drafts
- full app redesign

## Manual Test

1. Open `/app/pipeline-defense`.
2. Select a brief with deals.
3. Click `Draft Assist` on one deal.
4. Select `Deal truth`.
5. Click `Generate Draft`.
6. Confirm a local mock draft appears.
7. Click `Apply Draft`.
8. Confirm only `dealTruth` updates.
9. Select `Pipeline review answer`.
10. Generate and apply.
11. Confirm only `pipelineReviewAnswer` updates.
12. Select `Recommended action`.
13. Generate and apply.
14. Confirm only `recommendedAction` updates.
15. Select `Objection handling note`.
16. Generate draft.
17. Confirm copy works and no apply button appears.
18. Select `Manager question`.
19. Generate draft.
20. Confirm copy works and no apply button appears.
21. Click `Analyze Deal` and confirm the rules engine still works.
22. Click `Review Brief Quality` and confirm quality review still works.
23. Click `Generate Action Plan` and confirm action plan still works.
24. Export Markdown and confirm export remains unchanged.
25. Click `Print / Save PDF` and confirm Draft Assist UI is hidden from print.
26. Refresh page and confirm applied drafts persist locally.
27. Remove all deals and confirm Draft Assist does not appear.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
