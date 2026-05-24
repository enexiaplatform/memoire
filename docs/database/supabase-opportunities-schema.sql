-- Memoire Phase M.24: CRM-lite Opportunities
-- Run this in the Supabase SQL editor for the target project.

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_name text not null,
  opportunity_name text not null,
  stage text,
  estimated_value numeric,
  currency text default 'VND',
  expected_close_period text,
  product_or_solution text,
  decision_maker text,
  budget_owner text,
  procurement_path text,
  technical_criteria text,
  next_action text,
  next_action_date date,
  evidence text,
  missing_context text,
  objection_debt text,
  forecast_evidence_category text,
  decision_recommendation text,
  status text default 'Active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Compatibility for older Memoire projects that already have a legacy
-- public.opportunities table with account_id/contact_id/title fields.
alter table public.opportunities
  add column if not exists account_name text,
  add column if not exists opportunity_name text,
  add column if not exists currency text default 'VND',
  add column if not exists expected_close_period text,
  add column if not exists product_or_solution text,
  add column if not exists decision_maker text,
  add column if not exists budget_owner text,
  add column if not exists procurement_path text,
  add column if not exists technical_criteria text,
  add column if not exists next_action text,
  add column if not exists next_action_date date,
  add column if not exists evidence text,
  add column if not exists missing_context text,
  add column if not exists objection_debt text,
  add column if not exists forecast_evidence_category text,
  add column if not exists decision_recommendation text,
  add column if not exists status text default 'Active';

alter table public.opportunities
  drop constraint if exists opportunities_stage_check;

alter table public.opportunities
  drop constraint if exists opportunities_stage_allowed;

alter table public.opportunities
  add constraint opportunities_stage_allowed check (
    stage is null or stage in (
      'new', 'active', 'proposal', 'negotiation', 'won', 'lost', 'paused',
      'Lead', 'Discovery', 'Qualification', 'Technical discussion', 'Demo',
      'Proposal', 'Negotiation', 'Procurement', 'Won', 'Lost', 'On hold'
    )
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'opportunities'
      and column_name = 'title'
  ) then
    execute $sql$
      update public.opportunities
      set
        account_name = coalesce(account_name, 'Legacy account'),
        opportunity_name = coalesce(opportunity_name, title),
        currency = coalesce(currency, 'VND'),
        next_action = coalesce(next_action, next_action_text),
        objection_debt = coalesce(objection_debt, blocker),
        forecast_evidence_category = coalesce(forecast_evidence_category, 'Weak but recoverable'),
        decision_recommendation = coalesce(decision_recommendation, 'Monitor'),
        status = coalesce(status, case when stage = 'won' then 'Won' when stage = 'lost' then 'Lost' when stage = 'paused' then 'On hold' else 'Active' end)
      where account_name is null
         or opportunity_name is null
         or currency is null
         or forecast_evidence_category is null
         or decision_recommendation is null
         or status is null
    $sql$;
  else
    update public.opportunities
    set
      account_name = coalesce(account_name, 'Legacy account'),
      opportunity_name = coalesce(opportunity_name, 'Untitled opportunity'),
      currency = coalesce(currency, 'VND'),
      forecast_evidence_category = coalesce(forecast_evidence_category, 'Weak but recoverable'),
      decision_recommendation = coalesce(decision_recommendation, 'Monitor'),
      status = coalesce(status, 'Active')
    where account_name is null
       or opportunity_name is null
       or currency is null
       or forecast_evidence_category is null
       or decision_recommendation is null
       or status is null;
  end if;
end $$;

alter table public.opportunities enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.opportunities to authenticated;

drop policy if exists "Users can select own opportunities" on public.opportunities;
create policy "Users can select own opportunities"
on public.opportunities
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own opportunities" on public.opportunities;
create policy "Users can insert own opportunities"
on public.opportunities
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own opportunities" on public.opportunities;
create policy "Users can update own opportunities"
on public.opportunities
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own opportunities" on public.opportunities;
create policy "Users can delete own opportunities"
on public.opportunities
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists opportunities_user_updated_idx
on public.opportunities (user_id, updated_at desc);

create index if not exists opportunities_user_status_idx
on public.opportunities (user_id, status);
