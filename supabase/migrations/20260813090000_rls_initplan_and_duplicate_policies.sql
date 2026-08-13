-- Row level security: one auth.uid() per query, and one policy per action.
--
-- NOT YET APPLIED to the live database. Reviewed and written on 2026-08-13 as
-- part of the post-go-live audit; it changes the access path on every table the
-- product owns, so it waits for an explicit go-ahead rather than riding along
-- with an application deploy.
--
-- Two findings from `get_advisors`, both on live tables:
--
-- 1. `auth_rls_initplan` (30 policies). `auth.uid()` written bare is re-evaluated
--    once per row, because Postgres cannot prove it is stable inside the policy.
--    Wrapped as `(select auth.uid())` it becomes an InitPlan: evaluated once per
--    query. On the workspace this was measured against - 1,739 stakeholders,
--    1,083 accounts - that is the difference between 2,822 function calls and 2
--    on a single workspace load, and the workspace is loaded on every navigation.
--    The predicate is identical either way; nothing about who can see what
--    changes.
--
-- 2. `multiple_permissive_policies` (21 combinations). `accounts` and
--    `opportunities` each carry a `FOR ALL` policy to `public` *and* a full set
--    of per-command policies to `authenticated`. Permissive policies are OR'd,
--    so the pair is redundant: every row the `FOR ALL` policy admits, the
--    matching per-command policy already admits on the same `user_id = auth.uid()`
--    test. Postgres still evaluates both. The `FOR ALL` copy is dropped, which
--    is why the four per-command policies are re-created first and in full - the
--    coverage has to exist before the catch-all goes away.
--
-- Nothing here widens access. Every predicate remains "the row belongs to the
-- caller"; only how many times that question is asked changes.

begin;

-- ---------------------------------------------------------------------------
-- accounts: keep the four per-command policies, drop the FOR ALL duplicate.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can select own accounts" on public.accounts;
drop policy if exists "Users can insert own accounts" on public.accounts;
drop policy if exists "Users can update own accounts" on public.accounts;
drop policy if exists "Users can delete own accounts" on public.accounts;

create policy "Users can select own accounts" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own accounts" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own accounts" on public.accounts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own accounts" on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own accounts" on public.accounts;
-- Named for the founder CSV import; the four policies above already cover it.
drop policy if exists "Users can manage own founder import accounts" on public.accounts;

-- ---------------------------------------------------------------------------
-- opportunities: same shape, same reason.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can select own opportunities" on public.opportunities;
drop policy if exists "Users can insert own opportunities" on public.opportunities;
drop policy if exists "Users can update own opportunities" on public.opportunities;
drop policy if exists "Users can delete own opportunities" on public.opportunities;

create policy "Users can select own opportunities" on public.opportunities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own opportunities" on public.opportunities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own opportunities" on public.opportunities
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own opportunities" on public.opportunities
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own opportunities" on public.opportunities;
drop policy if exists "Users can manage own founder import opportunities" on public.opportunities;

-- ---------------------------------------------------------------------------
-- sales_activities and pipeline_defense_briefs: already one policy per command,
-- but granted to `public` and evaluating auth.uid() per row.
-- ---------------------------------------------------------------------------
-- Dropped by their exact names. These do not follow the table name - the
-- policies read "sales activities", the table is `sales_activities` - so a
-- generated name would silently match nothing and leave the old policy in place
-- for the create below to collide with.
drop policy if exists "Users can select their own sales activities" on public.sales_activities;
drop policy if exists "Users can insert their own sales activities" on public.sales_activities;
drop policy if exists "Users can update their own sales activities" on public.sales_activities;
drop policy if exists "Users can delete their own sales activities" on public.sales_activities;
drop policy if exists "Users can manage own founder import sales activities" on public.sales_activities;

drop policy if exists "Users can select their own pipeline defense briefs" on public.pipeline_defense_briefs;
drop policy if exists "Users can insert their own pipeline defense briefs" on public.pipeline_defense_briefs;
drop policy if exists "Users can update their own pipeline defense briefs" on public.pipeline_defense_briefs;
drop policy if exists "Users can delete their own pipeline defense briefs" on public.pipeline_defense_briefs;

create policy "Users can select their own sales activities" on public.sales_activities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own sales activities" on public.sales_activities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own sales activities" on public.sales_activities
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own sales activities" on public.sales_activities
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can select their own pipeline defense briefs" on public.pipeline_defense_briefs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert their own pipeline defense briefs" on public.pipeline_defense_briefs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own pipeline defense briefs" on public.pipeline_defense_briefs
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete their own pipeline defense briefs" on public.pipeline_defense_briefs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- stakeholders needs nothing else: its four per-command policies already read
-- `(select auth.uid())`. It carries the same redundant founder-import copy,
-- with an identical predicate, and that is all that is removed here.
drop policy if exists "Users can manage own founder import stakeholders" on public.stakeholders;

-- ---------------------------------------------------------------------------
-- The single-policy tables. Each keeps exactly one FOR ALL policy; only the
-- auth.uid() call moves into an InitPlan.
--
-- A FOR ALL policy with no WITH CHECK reuses its USING expression as the check,
-- so these are written with both stated explicitly rather than relying on that.
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
  policy_name text;
begin
  foreach target in array array[
    'actions', 'activity_log', 'captures', 'contacts', 'entities',
    'interactions', 'objections', 'relationships', 'usage_monthly'
  ] loop
    for policy_name in
      select polname from pg_policy where polrelid = format('public.%I', target)::regclass
    loop
      execute format('drop policy if exists %I on public.%I', policy_name, target);
    end loop;

    execute format(
      'create policy "Users can manage own rows" on public.%I '
      'for all to authenticated '
      'using ((select auth.uid()) = user_id) '
      'with check ((select auth.uid()) = user_id)',
      target
    );
  end loop;
end $$;

-- user_profiles is keyed on `id`, not `user_id`. Column-level GRANTs are what
-- stop a caller writing subscription_tier; this only changes how often the row
-- test runs, so those GRANTs are left exactly as they are.
drop policy if exists "Users can only see own profile" on public.user_profiles;
create policy "Users can only see own profile" on public.user_profiles
  for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Read-only for the owner: a delivery record is written by the service role.
drop policy if exists "digest deliveries are readable by their owner" on public.digest_deliveries;
create policy "digest deliveries are readable by their owner" on public.digest_deliveries
  for select to authenticated using ((select auth.uid()) = user_id);

commit;
