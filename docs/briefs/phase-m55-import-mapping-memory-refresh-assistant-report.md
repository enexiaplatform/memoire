# Phase M.55 - Import Mapping Memory & Refresh Assistant Report

## What was added

Phase M.55 adds local CSV mapping memory and a guided refresh assistant to the Opportunities import workflow.

Users can now:

- Review detected CSV headers before import or refresh.
- Map CSV columns to Memoire opportunity fields.
- Save mapping profiles locally for repeated CRM/Excel exports.
- Reuse recognized mappings when the same CSV format is pasted or uploaded again.
- See import/refresh history with mapping profile context.
- Follow a compact refresh workflow before generating Pipeline Defense Briefs.

## Files changed

- `src/utils/opportunityCsvImport.ts`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `docs/briefs/phase-m55-import-mapping-memory-refresh-assistant-report.md`

## Mapping memory behavior

Mapping profiles are stored locally with:

- `id`
- `name`
- `sourceType`
- `detectedHeaders`
- `fieldMap`
- `createdAt`
- `updatedAt`
- `lastUsedAt`
- `usageCount`

Storage key:

```text
memoire.csvMappingProfiles.v1
```

Supported mapped Memoire fields:

- account name
- opportunity name
- stage
- value
- currency
- expected close period
- product / solution
- next action
- evidence
- missing context
- forecast category
- status

## Refresh Assistant

The Opportunities CSV panel now shows a five-step refresh assistant:

1. Paste/upload latest CRM or Excel export
2. Confirm mapping
3. Preview new, changed, and skipped rows
4. Apply safe refresh
5. Generate Pipeline Defense Brief

The UI reinforces that Memoire updates only the private working copy and never writes back to CRM.

## Saved profiles

Saved CSV Mapping Profiles show:

- profile name
- source type
- last used date
- usage count
- delete action

Memoire can recognize familiar CSV formats by comparing normalized headers with saved profiles.

## Import history

Import/refresh batch records can now store:

- `mappingProfileId`
- `mappingProfileName`
- `sourceType`

This keeps refresh history easier to audit.

## What remains intentionally not built

- No Salesforce/HubSpot/Gmail/Google Calendar integration.
- No CRM write-back.
- No automatic sync of mapping profiles to Supabase.
- No backend or database schema change.
- No AI mapping detection.
- No destructive overwrite of protected opportunity fields.

## Manual QA checklist

1. Open `/app/opportunities`.
2. Click `Import CSV`.
3. Paste a Salesforce-style, HubSpot-style, or Excel-style CSV.
4. Confirm the mapping review appears.
5. Adjust one column mapping.
6. Save a mapping profile.
7. Parse or compare CSV.
8. Confirm import/refresh preview uses the mapping.
9. Apply import or refresh.
10. Confirm import/refresh history shows mapping profile context.
11. Reopen the same CSV format and confirm Memoire recognizes the saved mapping.
12. Delete a saved profile and confirm it is removed.
13. Confirm no CRM write-back behavior exists.

## Build and lint status

- `npm run build`: pass
- `npm run lint`: run during final verification

## Supabase SQL

No Supabase SQL is required for M.55.
