# Phase M.25: Link Sales Activities to Opportunities Report

## Files created

- `src/utils/activityOpportunityLinker.ts`
- `src/features/opportunities/ActivityOpportunityLinkPanel.tsx`
- `docs/database/supabase-sales-activities-linking-migration.sql`
- `docs/briefs/phase-m25-link-activities-to-opportunities-report.md`

## Files modified

- `src/services/salesActivityStore.ts`
- `src/services/opportunityStore.ts`
- `src/utils/salesActivityRecap.ts`
- `src/utils/opportunityQuality.ts`
- `src/features/dailyCapture/DailyCapturePage.tsx`
- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/features/reviews/SalesReviewsPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`

## Data model changes

Sales activities now support:

- `linkedOpportunityId`
- `linkedOpportunityName`
- `linkedAccountName`
- `linkStatus`: `Unlinked`, `Suggested`, `Linked`, or `Ignored`

The localStorage sales activity loader defaults older records to `Unlinked`.

## SQL migration doc

Created `docs/database/supabase-sales-activities-linking-migration.sql`.

The live Supabase project was also updated additively with the new link columns and link status check constraint.

## Matching rules

`activityOpportunityLinker` uses deterministic matching only:

- account exact or partial match
- opportunity exact or partial match
- raw note or summary mentions account name
- raw note or summary mentions opportunity name
- product / solution token overlap

Confidence labels:

- High
- Medium
- Low

No real AI or external enrichment is used.

## UI behavior

Capture:

- Structured preview shows likely opportunity matches when opportunities exist.
- After saving an activity, the user can link it to an opportunity.
- User can choose Link only, Link + apply suggested updates, Ignore, or Unlink.
- If no opportunities exist, the page links to `/app/opportunities`.

Calendar:

- Activity detail modal shows linked opportunity state.
- Unlinked activities can be linked manually or via suggestions.
- Linked activities can be unlinked.

Reviews:

- Open next actions, objections, and follow-ups show linked opportunity name when available.
- Unlinked activity rows show `Unlinked`.

Opportunities:

- Opportunity detail panel includes a Linked Activities timeline.
- Opportunity cards show linked activity count and last linked activity date.
- Empty timeline state: `No activities linked to this opportunity yet.`

## Optional opportunity update behavior

When the user chooses Link + apply suggested updates:

- activity `nextAction` can update opportunity `nextAction`
- activity `dueDate` can update opportunity `nextActionDate`
- objection/risk language can append to `objectionDebt`
- proof/confirmed language can append to `evidence`
- procurement/tender language can append to `procurementPath` and `missingContext`

Link only does not modify opportunity data.

## Local/cloud behavior

Logged out:

- Link state persists in `memoire.salesActivities.v1`.
- Optional opportunity updates persist in `memoire.opportunities.v1`.

Logged in:

- Link state persists to Supabase `sales_activities`.
- Optional opportunity updates persist to Supabase `opportunities`.
- RLS remains enabled and unchanged.

## What remains intentionally not built

- No Gmail integration
- No Google Calendar integration
- No Salesforce/HubSpot sync
- No real AI
- No automatic opportunity overwrite
- No automatic Pipeline Defense generation

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the 5 known pre-existing hook dependency warnings:
  - `src/features/entities/useEntities.ts`
  - `src/features/entities/useEntityDetail.ts`
  - `src/features/history/useCaptures.ts`
  - `src/hooks/useDeals.ts` lines 48 and 87
