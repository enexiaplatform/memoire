# Phase M.13 AI Provider Abstraction Report

## Files Created

- `src/services/draftAssistProvider.ts`
- `docs/briefs/phase-m13-ai-provider-abstraction-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Provider Interface Created

Phase M.13 adds a provider interface for Draft Assist generation.

Provider types:

- `DraftAssistProviderId`
- `DraftAssistRequest`
- `DraftAssistResponse`
- `DraftAssistProvider`

The request includes:

- deal
- draft type
- optional brief context

The response includes:

- provider id
- provider label
- draft result

## Active Provider

The only active provider is:

- `LocalMockDraftProvider`

The provider registry helper is:

- `getActiveDraftAssistProvider()`

For now, it always returns `LocalMockDraftProvider`.

## Why No Real API Was Added

M.13 prepares the UI and code boundaries for future provider switching without changing the current safety model.

No real AI provider was added.

No backend, API key, environment variable, network request, OpenAI, Claude, Gemini, or LLM call was added.

## Draft Assist Behavior Preserved

The existing local mock Draft Assist behavior remains the same:

- `Deal truth` can apply to `dealTruth`
- `Pipeline review answer` can apply to `pipelineReviewAnswer`
- `Recommended action` can apply to `recommendedAction`
- `Objection handling note` remains copy-only
- `Manager question` remains copy-only
- Copy Draft still uses browser clipboard with visible fallback text

The UI now calls the active provider instead of directly calling the draft utility.

## Provider Label

The Draft Assist panel now shows:

`Draft provider: Local Mock`

This makes the provider source visible without implying real AI generation.

## Loading / Error Behavior

Draft generation is now asynchronous.

While generating, the button shows:

`Generating local draft...`

If provider generation fails, the panel stays open and shows:

`Draft provider failed. No deal data changed. You can retry.`

No deal data changes unless Henry clicks `Apply Draft` for a safe target field.

## Existing Behavior Preserved

Preserved behavior:

- local mock drafts still generate
- safe apply still works
- copy still works
- Analyze Deal
- Analyze All Deals
- Brief Quality Review
- Weekly Action Plan
- import deals
- Markdown export
- browser print / Save as PDF
- localStorage persistence
- multiple weekly briefs

## Intentionally Not Built

Phase M.13 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- OpenAI / Claude / Gemini calls
- LLM API
- API keys
- environment variables
- network requests
- settings UI for provider switching
- real AI generation

## Manual Test

1. Open `/app/pipeline-defense`.
2. Select a brief with deals.
3. Click `Draft Assist` on one deal.
4. Confirm `Draft provider: Local Mock` appears.
5. Select `Deal truth`.
6. Click `Generate Draft`.
7. Confirm loading text appears briefly or generation completes safely.
8. Confirm draft appears.
9. Click `Apply Draft`.
10. Confirm only `dealTruth` updates.
11. Select `Pipeline review answer`.
12. Generate and apply.
13. Confirm only `pipelineReviewAnswer` updates.
14. Select `Recommended action`.
15. Generate and apply.
16. Confirm only `recommendedAction` updates.
17. Select `Manager question`.
18. Generate.
19. Confirm copy-only behavior remains.
20. Review implementation and confirm no network request, API key, or env var was added.
21. Click `Analyze Deal` and confirm rules still work.
22. Click `Review Brief Quality` and confirm quality review still works.
23. Click `Generate Action Plan` and confirm action plan still works.
24. Export Markdown and confirm export still works.
25. Click `Print / Save PDF` and confirm print still works.
26. Refresh page and confirm applied draft persists locally.

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
