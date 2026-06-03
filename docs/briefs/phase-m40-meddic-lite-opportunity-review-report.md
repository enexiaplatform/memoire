# Phase M.40 - MEDDIC-lite Opportunity Review Report

## What Was Added

Phase M.40 adds a lightweight, rule-based MEDDIC-style review layer for personal B2B sales work.

The review is intentionally practical and non-enterprise:

- no numeric win probability
- no AI scoring
- no CRM integration
- no automatic data mutation
- no new Supabase schema

## Files Created

- `src/utils/meddicLite.ts`
- `docs/briefs/phase-m40-meddic-lite-opportunity-review-report.md`

## Files Modified

- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`
- `src/utils/sampleData.ts`

## MEDDIC-lite Logic

The utility derives a review from existing Memoire data:

- opportunity fields
- related stakeholders
- related objections
- linked activities and capture extraction fields

Fields reviewed:

- Metrics
- Economic Buyer
- Decision Criteria
- Decision Process
- Identify Pain
- Champion
- Competition

Each field returns:

- status: `Strong`, `Partial`, or `Missing`
- evidence
- gaps
- recommended questions

Overall deal category:

- `Defensible`
- `Weak but recoverable`
- `Hope-based`
- `Unsupported`

Rules are conservative. Missing buyer/champion/process, weak evidence, high-impact open objection debt, and missing next action pull deals toward riskier categories.

## UI Behavior

Opportunity Detail now includes a compact `MEDDIC-lite Review` panel.

The panel shows:

- overall deal review category
- field-by-field status
- evidence per field
- missing MEDDIC gaps
- recommended defense answer
- recommended questions
- recommended actions

The Dashboard now includes a small MEDDIC-lite risk signal when active opportunities have missing champion, missing economic buyer, unclear decision process, hope-based, or unsupported status.

## Pipeline Defense Integration

When generating a Pipeline Defense Brief from opportunities, generated deal cards now include MEDDIC-lite context:

- MEDDIC-lite category appears in deal truth
- MEDDIC-lite gaps are added to risk/missing context
- objection debt includes a MEDDIC-lite gap summary
- pipeline review answer includes a recommended defense answer

No existing briefs are overwritten.

## Demo Support

The existing demo sandbox data already contains mixed-quality opportunities:

- Apex Labs / Validation Expansion: defensible
- Northstar Foods / Lab workflow: weak but recoverable
- Orion Pharma / Procurement review: hope-based
- Summit Diagnostics / QC workflow: unsupported

Stakeholder and objection demo data now feed the MEDDIC-lite review without adding new sample storage behavior.

## Manual QA Checklist

1. Open `/app/opportunities`.
2. Open an opportunity detail panel.
3. Confirm `MEDDIC-lite Review` renders.
4. Confirm stakeholder data affects Champion and Economic Buyer fields.
5. Confirm objection data affects Identify Pain and objection debt.
6. Open Dashboard and confirm MEDDIC-lite risk signal appears when gaps exist.
7. Generate Pipeline Defense Brief from one or more opportunities.
8. Confirm generated brief includes MEDDIC-lite gaps and defense answer.
9. Open Demo Sandbox.
10. Confirm sample opportunities show a mix of defensible, weak, hope-based, and unsupported reviews.
11. Run `npm run build`.
12. Run `npm run lint`.

## Known Limitations

- MEDDIC-lite is rule-based and not a full MEDDPICC implementation.
- No numeric win probability is calculated.
- No AI scoring or coaching is added.
- Competition detection uses captured competitors, structured objections, and simple text hints only.
- No new database fields are added; review is derived at runtime from existing data.

## Build / Lint Status

- `npm run build` passes.
- `npm run lint` passes with 5 known pre-existing hook dependency warnings.
