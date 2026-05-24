# Phase M.24: Opportunity CRM-lite Upgrade Report

## Files created

- `src/features/opportunities/OpportunitiesPage.tsx`
- `src/services/opportunityStore.ts`
- `docs/database/supabase-opportunities-schema.sql`
- `docs/briefs/phase-m24-opportunity-crm-lite-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/utils/opportunityQuality.ts`

## Route added/upgraded

- Upgraded existing `/app/opportunities`.
- Sidebar already exposed `Opportunities`, so no sidebar label change was required.
- `/app/opportunities` now uses the CRM-lite local/cloud opportunities module instead of the older v31 opportunity memory view.

## Data model

The CRM-lite opportunity record includes:

- account name
- opportunity name
- stage
- estimated value
- currency
- expected close period
- product or solution
- decision maker
- budget owner
- procurement path
- technical criteria
- next action
- next action date
- evidence
- missing context
- objection debt
- forecast evidence category
- decision recommendation
- status
- created/updated timestamps

Allowed values are defined in `src/services/opportunityStore.ts`.

## Persistence behavior

- Logged out or missing Supabase env vars: uses localStorage key `memoire.opportunities.v1`.
- Logged in with Supabase configured: uses `public.opportunities`.
- Cloud load failure falls back to local opportunities.
- Cloud save/update failure preserves a local copy and shows a warning.
- Delete uses cloud deletion for cloud records and local deletion for local records.

## Pipeline quality logic

`src/utils/opportunityQuality.ts` now exports:

- `analyzeOpportunityQuality(opportunity)`
- `analyzePipelineQuality(opportunities)`

The checks cover:

- missing decision maker
- missing next action
- objection debt
- unsupported / hope-based forecast evidence
- missing close period
- rescue / downgrade / deprioritize recommendations
- stale next action dates
- weak evidence language
- active value by forecast category

Legacy v31 quality exports are preserved so older code still builds.

## UI behavior added

- Add Opportunity
- Search
- Filter by stage
- Filter by forecast category
- Filter by decision recommendation
- Filter by status
- Pipeline Quality Summary
- Opportunity cards with forecast, decision, status, next action, and quality flags
- Detail edit panel for all CRM-lite fields
- Safe delete with confirmation
- Empty state with CTAs to add an opportunity or go to Capture
- Placeholder note for future Pipeline Defense integration

## Local/cloud mode

The page shows whether opportunities are being stored locally or in Supabase cloud mode.

## What remains intentionally not built

- No Salesforce, HubSpot, or CRM integration
- No Gmail integration
- No Google Calendar integration
- No real AI
- No team workspace
- No automatic Pipeline Defense generation from opportunities yet

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` lines 48 and 87
