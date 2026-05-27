# Phase M.44 - Personal Sales Playbook & Pattern Library

## What was added

- Added a derived Personal Sales Playbook / Pattern Library.
- Added `/app/playbook`.
- Added sidebar Playbook navigation.
- Added reusable pattern detection from opportunities, MEDDIC-lite reviews, action plans, action outcomes, objections, stakeholders, activities, and weekly execution review signals.
- Added copy actions for playbook response, reusable action, and full pattern summary.
- Added Suggested Playbook Learnings to Reviews.
- Added Top Sales Pattern to Dashboard.
- Added Relevant Playbook Pattern to generated Pipeline Defense Briefs from Opportunities.

## Files created

- `src/utils/salesPlaybook.ts`
- `src/features/playbook/SalesPlaybookPage.tsx`
- `docs/briefs/phase-m44-personal-sales-playbook-pattern-library-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/features/dashboard/DashboardPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/utils/opportunityToPipelineBrief.ts`

## Pattern categories

- Objection Pattern
- Stakeholder Gap
- MEDDIC Gap
- Proof Asset Needed
- Winning Move
- Repeated Mistake
- Follow-up Risk
- Competitor Risk
- Procurement Risk
- Documentation / Compliance Pattern

## How patterns are detected

The Playbook is derived at runtime and remains rule-based.

Inputs:

- active opportunities
- MEDDIC-lite reviews
- opportunity action plans
- action outcomes
- objections
- stakeholders
- activities
- weekly execution review signals where available

Examples:

- Open objection groups create Objection Patterns.
- Missing champion or economic buyer creates Stakeholder Gap patterns.
- Missing metrics, criteria, or decision process creates MEDDIC/procurement patterns.
- Validation, compliance, documentation, local support, or proof signals create Proof Asset patterns.
- Improved or resolved action outcomes create Winning Move patterns.
- Still unclear / no change / worsened outcomes create Repeated Mistake patterns.
- Missing or overdue next actions create Follow-up Risk patterns.
- Competitor objections or extracted competitor mentions create Competitor Risk patterns.

Each pattern includes:

- title
- category
- severity
- frequency
- evidence
- why it matters
- suggested playbook response
- reusable action
- related accounts
- related opportunities
- related objection types

## UI behavior

`/app/playbook` shows:

- Pattern summary cards
- Search
- Category filter
- Severity filter
- Pattern cards
- Detail panel
- Copy Playbook Response
- Copy Reusable Action
- Copy Pattern Summary

Reviews shows:

- Suggested Playbook Learnings for the selected period

Dashboard shows:

- Top Sales Pattern

Pipeline Defense generation includes:

- Relevant Playbook Pattern
- reusable response/action guidance per generated deal where applicable

## Supabase SQL

No Supabase SQL changes are required for M.44.

The Playbook is derived from existing data at runtime. No new table was added.

## Manual QA checklist

1. Open `/app/playbook`.
2. Verify Playbook route renders.
3. Verify pattern summary cards render.
4. Verify category and severity filters work.
5. Verify search works.
6. Verify pattern cards show evidence, why it matters, suggested response, and reusable action.
7. Verify copy actions work or show fallback text.
8. Open `/app/reviews` and verify Suggested Playbook Learnings render.
9. Open Dashboard and verify Top Sales Pattern renders.
10. Generate Pipeline Defense Brief and confirm Relevant Playbook Pattern appears.
11. Verify Demo Sandbox still works.
12. Run `npm run build`.
13. Run `npm run lint`.

## Known limitations

- Patterns are derived at runtime and are not manually curated yet.
- No user-saved playbook table exists yet.
- No AI scoring or AI writing is used.
- No numeric win probability is introduced.
- No Gmail, Google Calendar, external CRM sync, team workspace, or manager dashboard is added.

## Build / lint status

- `npm run build`: pass
- `npm run lint`: pass with 5 known pre-existing hook dependency warnings
