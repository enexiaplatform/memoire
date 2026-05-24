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
