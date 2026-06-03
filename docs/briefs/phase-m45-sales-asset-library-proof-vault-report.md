# Phase M.45 - Sales Asset Library & Proof Vault

## What Was Added

Phase M.45 adds a lightweight Sales Asset Library for reusable B2B sales proof:

- Proof assets
- Case studies
- Email templates
- Proposal snippets
- Objection responses
- Competitor responses
- Compliance notes
- Procurement justification snippets
- Validation / documentation notes
- Discovery question sets
- Follow-up scripts

The library is intentionally text-first and local-first. It does not add file upload, document storage, CRM sync, Gmail, Google Calendar, AI scoring, or external integrations.

## Files Created

- `src/services/salesAssetStore.ts`
- `src/utils/salesAssetSuggestions.ts`
- `src/features/assets/SalesAssetsPage.tsx`
- `docs/briefs/phase-m45-sales-asset-library-proof-vault-report.md`

## Files Modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/features/playbook/SalesPlaybookPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`
- `src/utils/sampleData.ts`

## Data Model

Sales assets use localStorage key:

```text
memoire.salesAssets.v1
```

Asset fields:

- `id`
- `title`
- `assetType`
- `content`
- `summary`
- `tags`
- `relatedAccountName`
- `relatedOpportunityId`
- `relatedOpportunityName`
- `relatedObjectionType`
- `relatedPlaybookPatternId`
- `relatedPlaybookPatternTitle`
- `useCase`
- `createdAt`
- `updatedAt`
- `source`
- `isSample`

No Supabase SQL is required for M.45.

## Suggested Asset Logic

Asset suggestions are rule-based from:

- Playbook patterns
- Open objections
- Opportunity context
- Procurement/tender risk
- Validation/documentation/compliance signals
- Competitor risk

Examples:

- Documentation pattern -> Validation / Documentation Note
- Competitor risk -> Competitor Response
- Procurement risk -> Procurement Justification
- Lead time/local support objection -> Objection Response
- Champion/economic buyer gaps -> Discovery Question Set

## UI Behavior

New route:

```text
/app/assets
```

Assets page supports:

- Create asset
- Edit asset
- Delete asset
- Search
- Filter by type
- Filter by tag/use case
- Copy asset content
- Copy summary
- Copy as email/proposal snippet

Assets are clearly labeled local-only in M.45.

## Playbook Integration

Playbook pattern cards now show:

- Suggested Asset Needed
- Create Asset Draft
- Copy Asset Draft

Create Asset Draft opens `/app/assets` with a prefilled draft. The user must review and save manually.

## Opportunity Integration

Opportunity Detail now includes:

```text
Relevant Sales Assets
```

It shows:

- Existing relevant assets
- Suggested missing assets based on objections, playbook patterns, and deal context

No opportunity/account/stakeholder/objection data is updated automatically.

## Pipeline Defense Integration

Generated Pipeline Defense Briefs now include:

```text
Relevant Proof Assets
```

For each generated deal, Memoire includes matching asset titles or concise missing-asset suggestions.

## Reviews and Dashboard Integration

Reviews now include:

```text
Asset Needs
```

Dashboard now includes:

```text
Asset Gaps
```

These panels stay compact and point users to `/app/assets`.

## Demo Sandbox

Demo sandbox now includes local-only sample assets:

- IQ/OQ/PQ documentation proof note
- Procurement justification snippet
- Incumbent Vendor competitor response note
- Lead time objection response
- Validation and compliance proof asset

Demo records are marked `source: "demo"` and `isSample: true` so Clear Demo Data removes them safely without touching cloud data.

## Known Limitations

- Assets are local-first only in M.45.
- No file attachments.
- No document storage.
- No Supabase table for assets yet.
- No AI-generated asset authoring.
- No automatic linking or auto-update to opportunities.

## Manual QA Checklist

1. Open `/app/assets`.
2. Confirm Assets route renders.
3. Create a new asset.
4. Edit the asset.
5. Copy asset content.
6. Copy summary.
7. Copy email/proposal snippet.
8. Delete the asset.
9. Verify search and type filters work.
10. Open `/app/playbook`.
11. Confirm Suggested Asset Needed appears.
12. Click Create Asset Draft.
13. Confirm `/app/assets` opens with prefilled draft.
14. Open Opportunity Detail.
15. Confirm Relevant Sales Assets renders.
16. Generate Pipeline Defense Brief.
17. Confirm Relevant Proof Assets appears in generated deal content.
18. Open Reviews.
19. Confirm Asset Needs appears when applicable.
20. Open Dashboard.
21. Confirm Asset Gaps appears when applicable.
22. Load Demo Sandbox.
23. Confirm sample assets appear.
24. Run `npm run build`.
25. Run `npm run lint`.

## Build / Lint Status

- `npm run build`: pass
- `npm run lint`: pass with the existing 5 hook dependency warnings only
