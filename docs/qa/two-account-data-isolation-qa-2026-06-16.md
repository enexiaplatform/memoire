# Memoire Two-Account Data Isolation QA

Date: 2026-06-16

Roadmap session: Session 4 - Two-Account Auth, RLS, And Data Isolation QA

## Decision

Session 4 static audit and QA protocol are complete.

Operational two-account QA is not passed yet because this local session does not have two production test accounts, deployed production controls, or direct Supabase project execution evidence.

The cohort gate remains closed until the operational run proves:

1. User A cannot read, mutate, export, or resurrect User B records.
2. User B cannot read, mutate, export, or resurrect User A records.
3. Demo data does not leak into either signed-in account.
4. Account deletion removes the signed-in user's cloud data without touching the other user.

## Current Evidence Reviewed

Code:

- `src/auth/AuthProvider.tsx`
- `src/components/layout/ProtectedRoute.tsx`
- `src/lib/demoMode.ts`
- `src/services/workspaceData.ts`
- `src/services/cloudJsonCollectionStore.ts`
- `src/services/accountStore.ts`
- `src/services/pipelineDefenseCloudStore.ts`
- `src/features/settings/ExportTab.tsx`
- `api/export.ts`
- `api/delete-account.ts`
- `api/_auth.js`

Schema:

- `supabase/migrations/001_initial.sql`
- `supabase/migrations/005_master_plan_v31_core.sql`
- `supabase/migrations/006_objection_memory_bank_v1.sql`
- `supabase/migrations/20260420000001_deal_archive_and_onboarding.sql`
- `supabase/migrations/20260615124612_early_access_requests.sql`
- `supabase/migrations/20260615130620_product_funnel_events.sql`
- `supabase/migrations/20260615132000_cloud_browser_collections.sql`
- `supabase/migrations/20260615142528_explicit_server_only_rls.sql`
- `docs/database/supabase-pipeline-defense-schema.sql`
- `docs/database/supabase-sales-activities-schema.sql`
- `docs/database/supabase-stakeholders-schema.sql`
- `docs/database/supabase-objections-schema.sql`
- `docs/database/supabase-opportunities-schema.sql`

Verification run in this session:

- `npm run typecheck:api`: pass.
- Later hardening pass added `docs/qa/export-integrity-guard-2026-06-16.md`.
- Later contract pass added `docs/qa/data-isolation-contract-coverage-2026-06-17.md` and `npm run verify:data-isolation`.

## Fix Completed In This Session

`api/export.ts` now exports the broader owned cloud workspace:

- `user_profiles`
- `usage_monthly`
- `sales_activities`
- `accounts`
- `opportunities`
- `stakeholders`
- `objections`
- `pipeline_defense_briefs`
- `review_packs`
- `sales_assets`
- `action_outcomes`
- `deals`
- `captures`
- `entities`
- `relationships`
- `contacts`
- `interactions`
- `actions`

Why it mattered:

- The previous export path omitted new cloud/browser sync tables: `review_packs`, `sales_assets`, and `action_outcomes`.
- It also omitted `deals`, `usage_monthly`, and `user_profiles`.
- Export completeness is part of Memoire's trust posture because the product promises export-first, user-owned sales memory.

## Follow-Up Fix: Export Integrity Guard

`api/export.ts` now blocks the response if any returned cloud row does not match the authenticated user's owner column.

The export response also includes a `manifest` with table count, total row count, per-table owner column, per-table row counts, and warnings.

`src/features/settings/ExportTab.tsx` now stops signed-in export when the cloud export endpoint returns an integrity or availability error instead of silently producing a browser-only ZIP.

## Static Audit Findings

### Positive Evidence

- Most user-owned cloud tables include `user_id uuid references auth.users(id) on delete cascade`.
- Core V1 tables have RLS enabled and policies scoped by `auth.uid() = user_id`.
- New cloud JSON collection tables use `PRIMARY KEY (user_id, id)`.
- New cloud JSON collection tables revoke anon access and grant CRUD only to `authenticated`.
- `early_access_requests` and `product_funnel_events` revoke `anon` and `authenticated`; only `service_role` receives table access.
- `api/export.ts` verifies the Supabase user token before export and now filters each table by the appropriate owner column.
- `api/delete-account.ts` verifies the token belongs to the requested `userId` before using the service role to delete the auth user.
- Demo cleanup is invoked on password login and signup through `clearDemoWorkspaceForAccount()`.
- Google login stores a safe app redirect and pending auth completion also calls `clearDemoWorkspaceForAccount()`.
- Cloud JSON sync ignores demo/sample records with `source === 'demo'` or `isSample === true`.
- Cloud JSON deletion writes a tombstone payload instead of simply removing the row, reducing browser resurrection risk.

### Risks Requiring Operational QA

- RLS policies exist in migrations and docs, but the live production schema must be verified directly.
- Some schema artifacts live in `docs/database/*.sql` rather than `supabase/migrations`; production may differ from the local file set.
- `delete-account` relies on `ON DELETE CASCADE`; live schema must prove every user-owned table cascades or is explicitly deleted.
- Local browser fallback can preserve records when cloud sync fails; two-account QA must prove ownership markers prevent cross-account cache inheritance.
- Export now includes more tables, but production export must be tested with actual data in every table.
- Google OAuth and password reset must be tested on the production domain because local source inspection cannot prove dashboard redirect settings.

## Test Dataset

Use deliberately unique labels so leaks are obvious:

User A:

- Email: `memoire.qa.a+YYYYMMDD@example.com`
- Account: `QA-A-Northstar-YYYYMMDD`
- Opportunity: `QA-A-Expansion-YYYYMMDD`
- Contact: `QA-A-Alex`
- Stakeholder: `QA-A-Procurement`
- Objection: `QA-A-Service-SLA`
- Review Pack: `QA-A-Review-Pack`
- Sales Asset: `QA-A-Proof-Asset`
- Action Outcome: `QA-A-Outcome`

User B:

- Email: `memoire.qa.b+YYYYMMDD@example.com`
- Account: `QA-B-Orion-YYYYMMDD`
- Opportunity: `QA-B-Renewal-YYYYMMDD`
- Contact: `QA-B-Blair`
- Stakeholder: `QA-B-Finance`
- Objection: `QA-B-Budget`
- Review Pack: `QA-B-Review-Pack`
- Sales Asset: `QA-B-Proof-Asset`
- Action Outcome: `QA-B-Outcome`

Never use real customer or confidential data in QA.

## Operational QA Matrix

| ID | Area | Steps | Expected Result | Evidence To Capture |
| --- | --- | --- | --- | --- |
| QA-01 | Password signup | Create User A and User B using password signup. | Both accounts can verify email and log in. Password policy rejects weak passwords. | Screenshots or notes with timestamps; Supabase auth users exist. |
| QA-02 | Google OAuth | Sign in as one test user with Google on production domain. | Redirect returns to intended `/app/*` route; no demo data remains. | Route before/after, user ID, screenshot. |
| QA-03 | Password reset | Request reset for User A and complete it. | Reset link opens `/reset-password`; new password works; old password fails. | Timestamped notes and result. |
| QA-04 | User A create core data | In User A, create account, opportunity, capture, interaction/action, stakeholder, objection, sales activity, review pack, sales asset, action outcome, and pipeline defense brief. | User A sees all own records after reload. | UI screenshots and row counts. |
| QA-05 | User B invisibility | In a clean browser/session as User B, search/list every route. | No User A labels appear anywhere. | Screenshots of Accounts, Opportunities, Reviews, Assets, Settings export. |
| QA-06 | User B create core data | In User B, create the equivalent unique records. | User B sees only User B records after reload. | UI screenshots and row counts. |
| QA-07 | User A invisibility | Return to User A in a clean session. | No User B labels appear anywhere. | Screenshots and search notes. |
| QA-08 | Direct RLS negative select | With User B token, query User A known record IDs through Supabase client or REST. | Select returns 0 rows, not User A data. | Query and result. |
| QA-09 | Direct RLS negative update | With User B token, attempt to update User A known record IDs. | Update affects 0 rows or returns RLS denial. | Query and result. |
| QA-10 | Direct RLS negative insert | With User B token, attempt insert with `user_id = User A id`. | Insert is rejected by `WITH CHECK`. | Query and error. |
| QA-11 | Export User A | Export User A workspace. | ZIP contains only User A cloud rows and local User A/browser rows. New cloud tables are present. `cloudData.manifest.complete` is true. | Export JSON table list, manifest row counts, and absence of User B labels. |
| QA-12 | Export User B | Export User B workspace. | ZIP contains only User B cloud rows and local User B/browser rows. `cloudData.manifest.complete` is true. | Export JSON table list, manifest row counts, and absence of User A labels. |
| QA-13 | Demo to account | Start demo, load sample data, then sign up or log in. | Demo/sample records are cleared before real account workspace opens. | LocalStorage keys before/after; no sample records in account routes. |
| QA-14 | Demo reset | In demo mode, reset demo data. | Only demo/sample records are removed; signed-in cloud data remains untouched. | Before/after screenshots and cloud row counts. |
| QA-15 | Cloud tombstone | Delete a review pack, sales asset, and action outcome for User A, reload and resync. | Deleted records do not reappear from browser cache. | Row payload shows `__deleted` tombstone or UI absence after reload. |
| QA-16 | Clear browser only | Clear local Memoire data for User A. | Browser keys are removed; cloud data reappears after sign-in reload. | LocalStorage check and UI reload result. |
| QA-17 | Delete account A | Export User A, then delete User A account. | User A can no longer log in; User A cloud rows are gone; User B rows remain. | Auth result and service-role row-count queries. |
| QA-18 | User B after A deletion | Log in as User B after A deletion. | User B data is unchanged. | UI screenshots and row counts. |

## Service-Role Verification Queries

Run from Supabase SQL editor or a safe admin context after operational QA.

Replace the two IDs:

```sql
-- Replace before running:
-- select 'USER_A_UUID'::uuid as user_a, 'USER_B_UUID'::uuid as user_b;
```

Owned table row counts:

```sql
with users as (
  select 'USER_A_UUID'::uuid as user_id, 'user_a' as label
  union all
  select 'USER_B_UUID'::uuid as user_id, 'user_b' as label
),
tables as (
  select label, 'accounts' as table_name, (select count(*) from public.accounts where user_id = users.user_id) as rows from users
  union all select label, 'opportunities', (select count(*) from public.opportunities where user_id = users.user_id) from users
  union all select label, 'contacts', (select count(*) from public.contacts where user_id = users.user_id) from users
  union all select label, 'interactions', (select count(*) from public.interactions where user_id = users.user_id) from users
  union all select label, 'actions', (select count(*) from public.actions where user_id = users.user_id) from users
  union all select label, 'captures', (select count(*) from public.captures where user_id = users.user_id) from users
  union all select label, 'entities', (select count(*) from public.entities where user_id = users.user_id) from users
  union all select label, 'relationships', (select count(*) from public.relationships where user_id = users.user_id) from users
  union all select label, 'deals', (select count(*) from public.deals where user_id = users.user_id) from users
  union all select label, 'usage_monthly', (select count(*) from public.usage_monthly where user_id = users.user_id) from users
  union all select label, 'sales_activities', (select count(*) from public.sales_activities where user_id = users.user_id) from users
  union all select label, 'stakeholders', (select count(*) from public.stakeholders where user_id = users.user_id) from users
  union all select label, 'objections', (select count(*) from public.objections where user_id = users.user_id) from users
  union all select label, 'pipeline_defense_briefs', (select count(*) from public.pipeline_defense_briefs where user_id = users.user_id) from users
  union all select label, 'review_packs', (select count(*) from public.review_packs where user_id = users.user_id) from users
  union all select label, 'sales_assets', (select count(*) from public.sales_assets where user_id = users.user_id) from users
  union all select label, 'action_outcomes', (select count(*) from public.action_outcomes where user_id = users.user_id) from users
)
select * from tables order by label, table_name;
```

Grant and RLS check:

```sql
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'accounts',
    'opportunities',
    'contacts',
    'interactions',
    'actions',
    'captures',
    'entities',
    'relationships',
    'deals',
    'usage_monthly',
    'sales_activities',
    'stakeholders',
    'objections',
    'pipeline_defense_briefs',
    'review_packs',
    'sales_assets',
    'action_outcomes',
    'early_access_requests',
    'product_funnel_events'
  )
order by tablename;
```

Policy check:

```sql
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

Post-delete cascade check for deleted User A:

```sql
select 'accounts' as table_name, count(*) from public.accounts where user_id = 'USER_A_UUID'::uuid
union all select 'opportunities', count(*) from public.opportunities where user_id = 'USER_A_UUID'::uuid
union all select 'contacts', count(*) from public.contacts where user_id = 'USER_A_UUID'::uuid
union all select 'interactions', count(*) from public.interactions where user_id = 'USER_A_UUID'::uuid
union all select 'actions', count(*) from public.actions where user_id = 'USER_A_UUID'::uuid
union all select 'captures', count(*) from public.captures where user_id = 'USER_A_UUID'::uuid
union all select 'entities', count(*) from public.entities where user_id = 'USER_A_UUID'::uuid
union all select 'relationships', count(*) from public.relationships where user_id = 'USER_A_UUID'::uuid
union all select 'deals', count(*) from public.deals where user_id = 'USER_A_UUID'::uuid
union all select 'usage_monthly', count(*) from public.usage_monthly where user_id = 'USER_A_UUID'::uuid
union all select 'sales_activities', count(*) from public.sales_activities where user_id = 'USER_A_UUID'::uuid
union all select 'stakeholders', count(*) from public.stakeholders where user_id = 'USER_A_UUID'::uuid
union all select 'objections', count(*) from public.objections where user_id = 'USER_A_UUID'::uuid
union all select 'pipeline_defense_briefs', count(*) from public.pipeline_defense_briefs where user_id = 'USER_A_UUID'::uuid
union all select 'review_packs', count(*) from public.review_packs where user_id = 'USER_A_UUID'::uuid
union all select 'sales_assets', count(*) from public.sales_assets where user_id = 'USER_A_UUID'::uuid
union all select 'action_outcomes', count(*) from public.action_outcomes where user_id = 'USER_A_UUID'::uuid;
```

## Pass Criteria

Operational QA passes only if:

- All P0 tests QA-01 through QA-18 pass.
- Service-role row counts match the expected owner after create/export/delete.
- Direct negative RLS tests cannot read or mutate another user's records.
- Export contains every expected owned table and no other user's labels.
- Export manifest is complete, table row counts match service-role queries, and the integrity guard does not block valid owned exports.
- Account deletion removes User A records and leaves User B records untouched.
- Demo/sample records are absent from signed-in cloud tables.

## Current Status

Static QA status:

- Pass with export coverage expanded, export integrity guard added, and data-isolation contract verifier added.

Operational QA status:

- Not run in this session.
- Requires two test accounts, production domain auth settings, and access to Supabase/Vercel evidence.

Commercial gate impact:

- A3 remains open until operational two-account QA passes.
- A4 remains open until demo-to-account and demo-reset tests pass.
- R2 remains open until direct RLS negative tests and service-role row counts are captured.

## Next Best Action

Run the operational QA matrix above against the protected production or preview deployment after Session 3 infrastructure controls are applied.

Do not invite real early-access users until QA-01 through QA-18 pass or every failure has an explicit accepted-risk decision.
