# Phase M.4 Markdown Export Report

Date: 2026-05-21

## Files Created

- `src/utils/exportPipelineDefenseBrief.ts`
- `docs/briefs/phase-m4-markdown-export-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Export Behavior Added

The `/app/pipeline-defense` page now includes an `Export Markdown` button.

When clicked, Memoire generates Markdown from the current local React state, including any manual edits, added deals, or removed deals.

The generated Markdown includes:

- Brief Header
- Executive Summary
- Top At-Risk Deals
- Missing Context Radar
- Objection Debt
- Forecast Evidence
- Manager Question List
- Recommended Actions This Week
- Decision Log

If all deals are removed, export still works and includes:

> No pipeline deals available for this review.

## Copy / Download Behavior

Added:

- `Copy Markdown`
- `Download .md`
- Read-only Markdown preview textarea
- Clipboard success state: `Copied`
- Clipboard failure fallback: Markdown remains visible for manual copy

Download filename:

- `pipeline-review-defense-brief.md`

## What Remains Intentionally Not Built

- No backend
- No database
- No localStorage persistence
- No Gmail OAuth
- No CRM sync
- No AI generation
- No PDF export
- No new route
- No external storage

## How To Test Manually

1. Open `/app/pipeline-defense`.
2. Click `Export Markdown`.
3. Confirm the Markdown preview appears.
4. Click `Copy Markdown`.
5. Confirm `Copied` appears, or verify manual copy fallback if clipboard fails.
6. Click `Download .md`.
7. Confirm the file downloads as `pipeline-review-defense-brief.md`.
8. Edit a deal.
9. Click `Export Markdown` again.
10. Confirm the exported Markdown reflects the edited state.
11. Add a deal and export again.
12. Remove all deals and export again.
13. Confirm empty-state Markdown is generated.

## Build/Lint Status

- `npm run build`: pass
- `npm run lint`: pass with 5 existing legacy hook dependency warnings outside Phase M.4 files

Existing warnings:

- `src/features/entities/useEntities.ts`
- `src/features/entities/useEntityDetail.ts`
- `src/features/history/useCaptures.ts`
- `src/hooks/useDeals.ts`

