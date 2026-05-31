# Phase M.50 - CSV / CRM Read-only Import Foundation Report

## What Was Added

- Added an `Import CSV` entry point on `/app/opportunities`.
- Added local browser CSV paste/upload support.
- Added CSV preview before saving.
- Added duplicate detection by account name + opportunity name.
- Added skip-duplicates behavior enabled by default.
- Added copyable CSV template.
- Added read-only CRM import microcopy.
- Added imported opportunity enrichment signal.

## Files Changed

- `src/utils/opportunityCsvImport.ts`
- `src/features/opportunities/OpportunitiesPage.tsx`
- `docs/briefs/phase-m50-csv-crm-read-only-import-foundation-report.md`

## CSV Mapping Logic

Supported common headers include:

- `Account`, `Account Name`, `Company`
- `Opportunity`, `Opportunity Name`, `Deal Name`
- `Stage`
- `Value`, `Amount`
- `Currency`
- `Close Date`, `Expected Close Period`
- `Product`, `Product / Solution`, `Solution`
- `Next Step`, `Next Action`
- `Forecast Category`
- `Notes`
- `Evidence`
- `Risk`
- `Missing Context`

Mapped Memoire fields:

- `accountName`
- `opportunityName`
- `stage`
- `estimatedValue`
- `currency`
- `expectedClosePeriod`
- `productOrSolution`
- `nextAction`
- `evidence`
- `missingContext`
- `forecastEvidenceCategory`
- `decisionRecommendation`
- `status`

Unknown stages are normalized to the closest supported stage when possible, otherwise `Lead`.

## Duplicate Detection Logic

Duplicates are detected by normalized:

```text
accountName + opportunityName
```

Duplicates are shown in preview and skipped by default. Existing opportunities are not overwritten silently.

## Import Preview Behavior

Before import, Memoire shows:

- account
- opportunity
- stage
- value
- expected close period
- forecast category
- decision recommendation
- row warnings

Warnings include:

- missing account name
- missing opportunity name
- unknown stage mapping
- missing value
- missing close period
- duplicate candidate
- missing next action
- missing evidence

## Read-only Positioning

The UI explains:

```text
Memoire imports a read-only copy of your pipeline. It does not write back to your CRM.
Use imported opportunities for review, enrichment, and Pipeline Defense Briefs.
```

No Salesforce, HubSpot, Gmail, Google Calendar, or external CRM API integration was added.

## Enrichment Signal

Imported opportunities are tagged through a local evidence note:

```text
CSV import: read-only pipeline copy.
```

The enrichment signal counts imported opportunities missing:

- economic buyer
- champion
- decision process
- next action
- evidence
- proof asset context

## Manual QA Checklist

1. Open `/app/opportunities`.
2. Click `Import CSV`.
3. Paste or upload sample CSV.
4. Click `Parse CSV`.
5. Verify preview table renders.
6. Verify mapped fields are correct.
7. Verify warnings render for missing fields.
8. Import valid rows.
9. Verify opportunities appear in opportunity list.
10. Re-import same CSV and verify duplicates are skipped.
11. Verify imported opportunities work with MEDDIC-lite review.
12. Generate Pipeline Defense Brief from imported opportunities.
13. Verify Dashboard/Opportunity enrichment signal where applicable.
14. Verify existing opportunity create/edit/delete still works.
15. Verify demo sandbox still works.
16. Run `npm run build`.
17. Run `npm run lint`.

## Known Limitations

- No external CRM API integration is included.
- No two-way sync or CRM writeback exists.
- Import metadata is stored in opportunity evidence text instead of a new database column, avoiding Supabase SQL changes.
- CSV import is intentionally lightweight and does not attempt complex ETL.

## Supabase SQL

No Supabase SQL changes are required for M.50.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings.
- Local browser QA passed for `/app/opportunities` import UI and CSV preview.
