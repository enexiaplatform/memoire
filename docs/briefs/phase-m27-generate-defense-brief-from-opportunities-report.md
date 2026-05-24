# Phase M.27: Generate Pipeline Defense Brief from Opportunities Report

## Files created

- `src/utils/opportunityToPipelineBrief.ts`
- `docs/briefs/phase-m27-generate-defense-brief-from-opportunities-report.md`

## Files modified

- `src/data/pipelineDefenseBrief.ts`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/utils/importPipelineDefenseBrief.ts`

## Mapping logic

Created `src/utils/opportunityToPipelineBrief.ts`.

Opportunity fields map into Pipeline Defense deals as follows:

- `accountName` -> `account`
- `opportunityName` -> `opportunity`
- `stage`, `expectedClosePeriod`, `productOrSolution`, `status` -> `pipelineContext`
- `evidence`, `missingContext`, `objectionDebt`, and `stage` -> deterministic `dealTruth`
- `missingContext`, `objectionDebt`, `forecastEvidenceCategory`, `decisionRecommendation`, and missing key fields -> `riskType`
- `evidence` -> `evidence`
- `missingContext` -> `missingContext`
- `objectionDebt` -> structured `objectionDebt`
- `forecastEvidenceCategory` -> `forecastEvidenceCategory`
- `nextAction` -> `recommendedAction`
- opportunity state -> rule-based `pipelineReviewAnswer`
- `decisionRecommendation` -> `decisionRecommendation`

The generated deal also includes optional source metadata:

- `sourceType: "opportunity"`
- `sourceOpportunityId`

These optional fields are preserved by Pipeline Defense import/storage normalization.

## UI behavior

The Opportunities page now supports:

- selecting opportunities with per-card checkboxes
- page-level `Generate Defense Brief`
- validation when no opportunities are selected
- preview modal before creating a brief
- editable proposed metadata:
  - title
  - week label
  - sales owner
  - scope
- generated deal card preview
- `Create Brief`
- `Cancel`

The opportunity detail panel now includes:

- `Create Defense Brief from this Opportunity`

This opens the same preview flow for a one-deal brief.

## Local/cloud persistence behavior

Brief creation reuses the existing Pipeline Defense storage architecture.

Logged out or Supabase unavailable:

- creates a new local Pipeline Defense Brief
- saves to `memoire.pipelineDefenseBriefs.v1`
- makes the generated brief active locally

Logged in with Supabase configured:

- creates a new row in `pipeline_defense_briefs`
- also preserves a local backup
- makes the generated brief active locally
- Pipeline Defense cloud loading naturally shows the newest generated cloud brief first

Existing briefs are never overwritten.

## Navigation behavior

After `Create Brief`:

- the app navigates to `/app/pipeline-defense`
- the generated brief is stored as the active local brief
- in cloud mode, the generated cloud brief is the latest updated brief and loads first

## Validation and empty states

- If no opportunities are selected, the user sees `Select at least one opportunity to generate a brief.`
- Opportunities with missing data can still generate a brief.
- Missing fields are surfaced as missing context, default evidence, or context-gap objection debt.

## What remains intentionally not built

- No Gmail integration.
- No Google Calendar integration.
- No Salesforce/HubSpot/external CRM sync.
- No real AI or LLM generation.
- No automatic overwrite of existing Pipeline Defense briefs.
- No automatic mutation of opportunity records during brief generation.

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the existing 5 hook dependency warnings from older modules:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`

