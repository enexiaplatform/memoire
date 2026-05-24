# Phase M.26: Account Memory Report

## Files created

- `src/features/accounts/AccountsPage.tsx`
- `src/services/accountStore.ts`
- `src/utils/accountMemory.ts`
- `docs/database/supabase-accounts-schema.sql`
- `docs/briefs/phase-m26-account-memory-report.md`

## Files modified

- `src/App.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/features/calendar/SalesActivityCalendarPage.tsx`
- `src/features/opportunities/OpportunitiesPage.tsx`

## Route added/upgraded

- Upgraded `/app/accounts` into the Account Memory workspace.
- Added `/app/accounts` to the local-first route allowlist so logged-out users can still use local account memory.
- Kept the existing legacy `/app/accounts/:accountId` route untouched.

## Account data model

Account Memory now supports:

- `id`
- `accountName`
- `segment`
- `industry`
- `location`
- `accountPotential`
- `relationshipStatus`
- `keyStakeholders`
- `notes`
- `tags`
- `createdAt`
- `updatedAt`

Allowed account potential values:

- `High`
- `Medium`
- `Low`
- `Unknown`

Allowed relationship status values:

- `New`
- `Developing`
- `Active`
- `Dormant`
- `At risk`
- `Strong`

## Persistence behavior

- Logged-out users use browser localStorage under `memoire.accounts.v1`.
- Logged-in users use Supabase `public.accounts` when Supabase is configured.
- If Supabase is unavailable or missing env config, the account store falls back to localStorage.
- Account create, edit, and delete operations preserve the personal-user boundary through `user_id`.

## Supabase setup

Created additive SQL schema doc:

- `docs/database/supabase-accounts-schema.sql`

The SQL:

- creates or upgrades `public.accounts`
- adds Account Memory columns without dropping older columns
- enables RLS
- adds own-row select/insert/update/delete policies
- adds useful account lookup indexes

The migration was applied to the live Supabase project `mlmpcpkucurylkrobain`. Verification confirmed the Account Memory columns and RLS policies are present.

## Aggregation logic

Created `src/utils/accountMemory.ts`.

Account memory aggregates:

- opportunities for the account
- linked activities for the account
- unlinked activities matching the account name
- open next actions
- unresolved objection debt
- latest activity date
- estimated active value
- active opportunity count
- won/lost/on-hold opportunity counts
- account health and risk signals

## Candidate creation

The Accounts page derives suggested accounts from:

- opportunity `accountName`
- sales activity `linkedAccountName`
- sales activity `accountName`

Users can create an account from a candidate without changing source opportunity or activity records.

## Cross-links

Opportunities:

- Opportunity detail now includes `View Account Memory`.
- If the account exists, the Accounts page opens it.
- If not, the Accounts page can show it as a suggested account candidate.

Calendar:

- Activity detail now includes `View Account Memory` when the activity has an account.
- If no account exists yet, the Accounts page can offer candidate creation.

## Local/cloud mode

- Account Memory works in logged-out localStorage mode.
- Account Memory works in logged-in Supabase mode after the SQL schema is applied.
- No Gmail, Google Calendar, Salesforce, HubSpot, CRM sync, or real AI was added.

## What remains intentionally not built

- No Gmail inbox integration.
- No Google Calendar integration.
- No Salesforce/HubSpot/external CRM sync.
- No team account ownership model.
- No real AI account summarization.
- No automatic opportunity or activity rewriting from account memory.

## Build/lint status

- `npm run build` passes.
- `npm run lint` passes with the existing 5 hook dependency warnings documented from earlier phases.

