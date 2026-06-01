# Phase M.57 — Lightweight Review Pack Export & Brief History Report

## What was added
- Added local saved Pipeline Defense Review Pack snapshots.
- Added **Save Review Pack**, **Update saved pack**, and **Save as new pack** actions in Pipeline Defense.
- Added **Review Pack History** inside `/app/pipeline-defense`.
- Added read-only saved pack route:
  - `/app/pipeline-defense/review-pack/:id`
- Added saved-pack copy, markdown, print, and delete actions.
- Added Dashboard integration in **This Week's Pipeline Review** showing the latest saved pack for the current week.

## Files created
- `src/utils/reviewPacks.ts`
- `src/features/pipeline/PipelineReviewPackPage.tsx`
- `docs/briefs/phase-m57-lightweight-review-pack-export-brief-history-report.md`

## Files modified
- `src/App.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Review pack model
Review packs are local snapshots with:
- title
- week ID
- generated/saved timestamps
- deal count
- defend/rescue/downgrade counts
- total value label
- manager summary
- share-ready markdown
- quality checklist summary
- top proof/MEDDIC gaps
- next defense actions
- deal defense table rows
- source brief ID

## Storage
- Uses localStorage key:
  - `memoire.reviewPacks.v1`
- No Supabase SQL was added.
- No cloud sync behavior was changed.
- Saved packs are user-controlled local snapshots.

## Save/open/delete behavior
- Saving a pack creates a new snapshot.
- If a current-week pack already exists for the active brief, the user can explicitly:
  - update the saved pack
  - save as a new pack
- Saved packs can be reopened from history or the Dashboard.
- Delete removes only the selected saved pack from this browser.

## Export/print behavior
- Saved packs can copy:
  - manager summary
  - review pack markdown
- Saved packs can be printed from:
  - the history section
  - the read-only review pack route
- Saved pack export uses snapshot data, not live recalculated data.

## M.56 habit integration
- Saving or updating a review pack marks the weekly **Generate Defense Brief** step.
- Copying manager summary from a saved pack marks the weekly **Copy Manager Summary** step.
- Existing M.56 auto-mark behavior remains intact.

## Dashboard integration
- The Dashboard weekly review habit card now shows the latest saved review pack for the current week when available.
- CTAs:
  - Open Latest Review Pack
  - Save This Week's Pack
  - Go to Pipeline Defense

## Known limitations
- Review packs are local-only in M.57.
- No public share links.
- No team workspace or manager dashboard.
- No full cross-week comparison analytics yet.
- No CRM writeback.

## Manual QA checklist
1. Open `/app/pipeline-defense`.
2. Enter Review Mode or generate a brief.
3. Click **Save Review Pack**.
4. Confirm pack appears in **Review Pack History**.
5. Open saved pack.
6. Confirm read-only view renders.
7. Copy Manager Summary from saved pack.
8. Copy Review Pack Markdown.
9. Print / Save PDF saved pack.
10. Delete saved pack.
11. Confirm Dashboard shows latest saved review pack when one exists.
12. Confirm M.56 habit checklist updates.
13. Confirm existing Pipeline Defense export/print still works.
14. Confirm demo sandbox still works.

## Build/lint status
- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing React hook dependency warnings in legacy hooks.
