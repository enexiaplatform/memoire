# Phase M.6 Local Draft Persistence Report

Date: 2026-05-21

## Files Created

- `src/utils/pipelineDefenseStorage.ts`
- `docs/briefs/phase-m6-local-draft-persistence-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Storage Key Used

```text
memoire.pipelineDefenseBrief.v1
```

## Save / Load Behavior

The Pipeline Defense page now uses browser-only `localStorage` for draft persistence.

On page load:

- Memoire tries to load `memoire.pipelineDefenseBrief.v1`.
- If the saved value is a valid array, it becomes the current draft.
- If no saved draft exists, sample data is used.
- If localStorage data is invalid, Memoire falls back to sample data without crashing.

On deal changes:

- Current deal state is auto-saved to localStorage.
- This includes edits, imports, additions, removals, and empty arrays.

Save status shown in the header:

- `Unsaved changes`
- `Saved locally`
- `Local save unavailable`
- `Saved draft cleared`

## Clear Draft Behavior

Added button:

- `Clear saved draft`

Behavior:

- Removes the localStorage draft only.
- Keeps the current screen data unchanged.
- If the user refreshes after clearing without making more changes, Memoire loads sample data.
- If the user edits after clearing, the updated screen state is saved again.

## Reset Behavior

`Reset to sample data` now:

- Resets local React state to the original sample deals.
- Auto-saves the sample deals through the same persistence flow.

This keeps reset behavior simple and predictable.

## Empty State Persistence Behavior

If the user removes all deals:

- The empty array is saved to localStorage.
- Refreshing the page keeps the empty state.
- `Reset to sample data` restores the sample deals.

## What Remains Intentionally Not Built

- No backend
- No database
- No authentication changes
- No Gmail OAuth
- No CRM sync
- No AI generation
- No server persistence
- No cross-browser sync
- No new route

## How To Test Manually

1. Open `/app/pipeline-defense`.
2. Edit a deal.
3. Wait for `Saved locally`.
4. Refresh the page.
5. Confirm the edit remains.
6. Import deals with CSV or Markdown.
7. Wait for `Saved locally`.
8. Refresh and confirm imported deals remain.
9. Remove a deal.
10. Refresh and confirm it stays removed.
11. Remove all deals.
12. Refresh and confirm the empty state remains.
13. Click `Reset to sample data`.
14. Confirm sample deals return and save locally.
15. Click `Clear saved draft`.
16. Refresh without making new changes.
17. Confirm sample data loads again.
18. Manually corrupt localStorage data for `memoire.pipelineDefenseBrief.v1`.
19. Refresh and confirm the app does not crash.

## Build/Lint Status

- `npm run build`: pass
- `npm run lint`: pass with 5 existing legacy hook dependency warnings outside Phase M.6 files

Existing warnings:

- `src/features/entities/useEntities.ts`
- `src/features/entities/useEntityDetail.ts`
- `src/features/history/useCaptures.ts`
- `src/hooks/useDeals.ts`

