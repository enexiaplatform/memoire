# Phase M.47 - Starter Asset Packs Report

## What was added

- Added starter sales asset packs for new users.
- Added a Starter Asset Packs section to `/app/assets`.
- Added pack preview and full-pack import.
- Added duplicate prevention by `title + assetType`.
- Kept imported starter assets local and editable.

## Files changed

- Created:
  - `src/utils/starterAssetPacks.ts`
  - `docs/briefs/phase-m47-starter-asset-packs-report.md`
- Modified:
  - `src/features/assets/SalesAssetsPage.tsx`

## Starter packs included

1. Pharma / Life Science / Lab Sales
   - Validation, GMP, IQ/OQ/PQ, tender, lead time, procurement, competitor, and local support assets.
2. B2B SaaS / Enterprise Software Sales
   - Security review, ROI, champion enablement, procurement/legal delay, competitor displacement, pilot, and enterprise buying committee assets.
3. Industrial / Manufacturing / Equipment Sales
   - Downtime, maintenance, CAPEX, lead time, after-sales support, technical spec comparison, site readiness, and operator adoption assets.

Each pack includes 12 practical starter assets using the existing asset types:

- Proof Asset
- Case Study
- Email Template
- Proposal Snippet
- Objection Response
- Competitor Response
- Compliance Note
- Procurement Justification
- Validation / Documentation Note
- Discovery Question Set
- Follow-up Script

## Import logic

- User explicitly clicks `Import Pack`.
- Assets are written to the existing local asset library.
- Imported assets include starter-pack tags and can be edited/deleted like normal assets.
- Imported assets are not auto-synced to Supabase because the Sales Asset Library remains local-first in this phase.

## Duplicate prevention logic

- Duplicate key: normalized `assetType + title`.
- If an asset with the same title and type already exists, it is skipped.
- Import result message shows imported count and skipped duplicate count.

## Manual QA checklist

1. Open `/app/assets`.
2. Confirm Starter Asset Packs section renders.
3. Preview each pack.
4. Import Pharma / Life Science / Lab pack.
5. Confirm imported assets appear in the asset library.
6. Re-import the same pack.
7. Confirm duplicates are skipped.
8. Search/filter imported assets.
9. Confirm copy asset content still works.
10. Open Playbook and Opportunity detail to confirm existing asset integrations still load.
11. Confirm demo sandbox still works.
12. Run `npm run build`.
13. Run `npm run lint`.

## Known limitations

- M.47 imports full packs only. Selective per-asset import is intentionally left for a later refinement.
- Assets are text snippets only. No file upload or document storage was added.
- Sales assets remain local-only in this phase.

## Supabase SQL

- No Supabase SQL required.

## Build and lint status

- `npm run build`: passed.
- `npm run lint`: passed with the 5 known pre-existing hook dependency warnings.
- Local browser QA: `/app/assets` rendered starter packs, preview worked, import worked, and re-import skipped duplicates.
