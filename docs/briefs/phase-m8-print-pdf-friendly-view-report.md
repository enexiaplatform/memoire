# Phase M.8 Print / PDF-Friendly Brief View Report

## Files Created

- `src/features/pipeline/PipelineDefensePrintableBrief.tsx`
- `docs/briefs/phase-m8-print-pdf-friendly-view-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/index.css`

## Print Behavior Added

The `/app/pipeline-defense` page now includes a `Print / Save PDF` button for the active Pipeline Defense Brief.

When clicked, the page:

1. Closes the import panel if it is open.
2. Closes the Markdown preview if it is open.
3. Resets Markdown copy status.
4. Calls `window.print()` so Henry can use browser print or Save as PDF.

No PDF generation library was added. The implementation relies on the browser print dialog.

## Printable Sections Included

The print-only brief renders the active local brief state in a clean read-only layout with:

- Brief Header
- Executive Summary
- Top At-Risk Deals
- Missing Context Radar
- Objection Debt
- Forecast Evidence categories
- Manager Question List
- Recommended Actions This Week
- Decision Log

## Active Brief Metadata Printed

The printable header includes:

- Title
- Week label
- Sales owner
- Scope
- Pipeline period
- Created date
- Updated date

## Active Edited / Imported Data Printed

The printable component receives the same active brief and deals state used by the editor, so it reflects:

- manual edits
- imported deals
- removed deals
- active brief switching
- empty deal lists

## Hidden In Print

Print CSS hides the interactive app shell and controls, including:

- sidebar/navigation
- top navigation
- brief management controls
- edit buttons
- add/remove/reset controls
- import controls
- Markdown export controls
- form inputs, textareas, and selects
- app-only panels marked with `no-print`

The print output uses a white background, black readable text, reduced shadow styling, A4 page sizing, and `print-break-inside-avoid` helpers for printable cards.

## Empty State Behavior

If the active brief has zero deals, the printable Top At-Risk Deals section shows:

`No pipeline deals available for this review.`

Related deal-driven print sections also show simple empty explanations instead of app controls.

## Intentionally Not Built

Phase M.8 does not add:

- backend
- database
- authentication
- Gmail or CRM sync
- AI generation
- server-side PDF creation
- client-side PDF generation libraries
- changes to the existing edit workflow

## Manual Test

1. Open `/app/pipeline-defense`.
2. Confirm `Print / Save PDF` appears in the action buttons.
3. Edit a brief title, week label, owner, scope, and at least one deal.
4. Click `Print / Save PDF`.
5. Confirm the browser print dialog opens.
6. Confirm print preview shows the clean printable brief, not the editor.
7. Confirm sidebar, top navigation, import/export panels, edit buttons, and brief controls are hidden.
8. Confirm title, week label, sales owner, scope, created date, and updated date appear.
9. Confirm current active deals appear with their edited/imported values.
10. Remove all deals and print again.
11. Confirm the print preview shows `No pipeline deals available for this review.`

## Build / Lint Status

- `npm run build`: passes.
- `npm run lint`: passes with 5 existing hook dependency warnings in unrelated files:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts`
