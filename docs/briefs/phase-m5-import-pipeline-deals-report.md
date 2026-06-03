# Phase M.5 Import Pipeline Deals Report

Date: 2026-05-21

## Files Created

- `src/utils/importPipelineDefenseBrief.ts`
- `docs/briefs/phase-m5-import-pipeline-deals-report.md`

## Files Modified

- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`

## Import Formats Supported

### CSV

Supported headers:

```text
account,opportunity,pipelineContext,dealTruth,riskType,evidence,missingContext,objectionDebt,forecastEvidenceCategory,recommendedAction,pipelineReviewAnswer,decisionRecommendation
```

Rules:

- Header names are normalized, so simple casing/spacing differences are tolerated.
- `riskType`, `evidence`, and `missingContext` support semicolon, pipe, or newline-separated values.
- Missing fields are filled with safe defaults.
- `forecastEvidenceCategory` defaults to `Unsupported`.
- `decisionRecommendation` defaults to `Monitor`.

### Markdown / Plain Text

Supported repeated block format:

```text
### Orion Pharma / Procurement Review
Pipeline context: ...
Deal truth: ...
Risk type: ...
Evidence: ...
Missing context: ...
Objection debt: ...
Forecast evidence category: Hope-based
Recommended action: ...
Pipeline review answer: ...
Decision recommendation: Rescue
```

Rules:

- Blocks are split by `###` headings.
- Account and opportunity are parsed from `Account / Opportunity`.
- Known labels are parsed by line prefix.
- Unknown lines are ignored.
- Missing fields are filled with safe defaults.

## Import UI Added

The `/app/pipeline-defense` page now includes an `Import Deals` button.

The import panel includes:

- Import textarea
- CSV / Markdown format hint
- `Parse Import`
- Parsed deal preview
- Append / Replace selection
- `Apply Import`
- `Cancel`

Default behavior:

- Append imported deals to the current brief.

Optional behavior:

- Replace current deals with imported deals.

## Validation Behavior

Helpful messages were added:

- `No deals detected. Check your headers or markdown format.`
- `Parsed X deals.`
- `Imported X deals.`
- `Some fields were missing and filled with defaults.`

Malformed input does not crash the page. If no deals are detected, the parser returns an empty preview and warnings.

## Dynamic Behavior

Imported deals update the existing local React state.

After import, deals appear in:

- Executive summary
- Top At-Risk Deals
- Missing Context Radar
- Objection Debt
- Recommended Actions This Week
- Decision Log
- Markdown export

Imported deals remain editable using the Phase M.3 edit controls.

## What Remains Intentionally Not Built

- No backend
- No database
- No localStorage persistence
- No Gmail OAuth
- No CRM sync
- No AI generation
- No new route
- No complex CSV parsing library
- No file upload import

## How To Test Manually

1. Open `/app/pipeline-defense`.
2. Click `Import Deals`.
3. Paste a CSV with supported headers.
4. Click `Parse Import`.
5. Confirm parsed deal preview appears.
6. Choose `Append`.
7. Click `Apply Import`.
8. Confirm imported deals appear in the page and remain editable.
9. Click `Import Deals` again.
10. Paste a Markdown block starting with `### Account / Opportunity`.
11. Click `Parse Import`.
12. Choose `Replace`.
13. Click `Apply Import`.
14. Confirm current deals are replaced.
15. Click `Export Markdown`.
16. Confirm exported Markdown reflects imported deals.
17. Paste malformed input.
18. Confirm the page shows a helpful warning and does not crash.

## Build/Lint Status

- `npm run build`: pass
- `npm run lint`: pass with 5 existing legacy hook dependency warnings outside Phase M.5 files

Existing warnings:

- `src/features/entities/useEntities.ts`
- `src/features/entities/useEntityDetail.ts`
- `src/features/history/useCaptures.ts`
- `src/hooks/useDeals.ts`

