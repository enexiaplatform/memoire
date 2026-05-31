# Phase M.49 - Shareable Pipeline Defense Brief Report

## What Was Added

- Added a share-ready Pipeline Defense layer for manager review.
- Added Manager Review Summary with copy action.
- Added Copy Share-ready Markdown action.
- Added Deal Defense Table with account, opportunity, value, stage, forecast category, defense status, evidence, gap, and next action.
- Added Deals to Defend, Deals to Rescue, and Deals to Downgrade / Deprioritize sections.
- Added Top Missing Proof / MEDDIC Gaps section.
- Added compact Brief Quality Checklist before sharing/export.
- Improved print/PDF output with generated date, manager summary, deal defense table, grouped decisions, gaps, next defense actions, and data-mode privacy note.
- Added Dashboard Prepare Pipeline Review CTA.

## Files Changed

- `src/utils/shareablePipelineDefenseBrief.ts`
- `src/features/pipeline/PipelineReviewDefenseBriefPage.tsx`
- `src/features/pipeline/PipelineDefensePrintableBrief.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/index.css`
- `docs/briefs/phase-m49-shareable-pipeline-defense-brief-report.md`

## How The Brief Is Calculated

- Defendable deals are derived from `Defensible` forecast evidence or `Defend` recommendation.
- Rescue deals are derived from `Rescue`, `Weak but recoverable`, or `Hope-based` posture.
- Downgrade/deprioritize deals are derived from `Downgrade`, `Deprioritize`, or `Unsupported` posture.
- Risk themes and proof/MEDDIC gaps are derived from deal risk type and missing context.
- Next defense actions use the existing Pipeline Defense action plan engine when available, otherwise the deal recommended action.
- Brief Quality Checklist is rule-based and checks economic buyer, champion, decision process, objections, proof assets, next actions, and unsupported deal flags.

## Manual QA Checklist

1. Open `/app/pipeline-defense`.
2. Confirm Manager Review Summary renders.
3. Confirm Deal Defense Table renders.
4. Confirm Deals to Defend / Rescue / Downgrade sections render.
5. Confirm Brief Quality Checklist renders.
6. Click Copy Manager Summary.
7. Click Copy Share-ready Markdown.
8. Click Print / Save PDF and confirm print view includes share-ready sections.
9. Open `/app/dashboard`.
10. Confirm Prepare Pipeline Review CTA renders and links to Pipeline Defense.
11. Confirm Review Mode still works.
12. Confirm Export Brief still works.
13. Confirm generated opportunity-to-defense briefs still work.

## Known Limitations

- Pipeline value is only shown when value text can be detected from existing deal context; no new structured value field was added.
- Public share links and backend sharing were intentionally not built.
- The manager-ready markdown is copied locally and does not create an external document.

## Supabase SQL

No Supabase SQL changes are required for M.49.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings.
- Local route checks passed for `/app/pipeline-defense` and `/app/dashboard`.
