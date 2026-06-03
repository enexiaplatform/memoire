# Phase M.7 Multiple Weekly Pipeline Defense Briefs Report

Date: 2026-05-21

## Files Created

- `docs/briefs/phase-m7-multiple-weekly-briefs-report.md`

## Files Modified

- `src/utils/pipelineDefenseStorage.ts`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## New Storage Key

```text
memoire.pipelineDefenseBriefs.v1
```

## Old Key Migration Behavior

Legacy M.6 key is still recognized:

```text
memoire.pipelineDefenseBrief.v1
```

On load:

1. Memoire first tries `memoire.pipelineDefenseBriefs.v1`.
2. If missing or invalid, Memoire checks `memoire.pipelineDefenseBrief.v1`.
3. If valid legacy deal data exists, Memoire creates one migrated brief:
   - Title: `Migrated Pipeline Defense Brief`
   - Week label: `Current Week`
   - Sales owner: `Henry`
   - Scope: `Demo review pipeline`
   - Deals: migrated legacy deals
4. The migrated brief is saved to the new multi-brief key.
5. The old key is not deleted.

Invalid localStorage data fails gracefully and falls back to a fresh sample brief.

## Brief Management Features

The Pipeline Defense page now supports multiple local weekly briefs.

Added:

- Brief selector dropdown
- New Brief
- Duplicate Brief
- Delete Brief
- Editable brief title
- Editable week label
- Editable sales owner
- Editable scope

Each brief contains:

- `id`
- `title`
- `weekLabel`
- `salesOwner`
- `scope`
- `createdAt`
- `updatedAt`
- `deals`

## Reset Behavior

`Reset to sample data` affects only the active brief.

It replaces the active brief's deals with sample data and saves the updated store locally.

## Clear Storage Behavior

`Clear saved draft` was replaced with:

```text
Clear local brief storage
```

Behavior:

- Clears the new multi-brief localStorage key.
- Creates a fresh sample brief in memory.
- Saves the fresh sample brief back to localStorage.

## Import / Export Behavior

Import applies only to the active brief.

Supported import modes remain:

- Append
- Replace

Export Markdown uses the active brief's:

- current deals
- week label
- sales owner
- scope

## Empty State Behavior

If the active brief has zero deals:

- The empty state is saved for that brief.
- Refresh keeps the empty state.
- Switching to another brief shows that brief's own deals.
- Reset restores sample deals only for the active brief.

## What Remains Intentionally Not Built

- No backend
- No database
- No authentication
- No Gmail OAuth
- No CRM sync
- No AI generation
- No server persistence
- No multi-user workspace
- No new route

## How To Test Manually

1. Open `/app/pipeline-defense`.
2. Rename the current brief title and week label.
3. Refresh and confirm metadata persists.
4. Click `New Brief`.
5. Confirm a new active brief appears.
6. Switch back to the previous brief from the dropdown.
7. Confirm that previous brief data is intact.
8. Click `Duplicate Brief`.
9. Confirm a copied brief becomes active.
10. Delete a brief.
11. Confirm Memoire switches to another brief.
12. Delete until one brief remains, then delete it.
13. Confirm a fresh sample brief is created instead of breaking the app.
14. Import CSV or Markdown into one brief.
15. Switch briefs and confirm import affects only the active brief.
16. Export Markdown and confirm active brief metadata/deals are used.
17. Remove all deals from one brief.
18. Refresh and confirm that brief remains empty.
19. Reset active brief to sample data.
20. Confirm only the active brief resets.
21. Test with old M.6 key data and no M.7 key to confirm migration.

## Build/Lint Status

- `npm run build`: pass
- `npm run lint`: pass with 5 existing legacy hook dependency warnings outside Phase M.7 files

Existing warnings:

- `src/features/entities/useEntities.ts`
- `src/features/entities/useEntityDetail.ts`
- `src/features/history/useCaptures.ts`
- `src/hooks/useDeals.ts`

