-- Memoire Founder Core Import metadata and operating context.
-- Additive-only: supports confidential first-user workbook imports without
-- storing raw workbook rows in logs or public tables.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  summary text,
  industry text,
  status text not null default 'active',
  pain_points text[] not null default '{}',
  objections text[] not null default '{}',
  account_name text,
  segment text,
  location text,
  account_potential text default 'Unknown',
  relationship_status text default 'New',
  key_stakeholders jsonb default '[]'::jsonb,
  notes text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null references public.accounts(id) on delete set null,
  title text,
  stage text not null default 'active',
  estimated_value numeric,
  blocker text,
  next_action_text text,
  last_touch_at timestamptz,
  urgency text not null default 'medium',
  confidence text not null default 'medium',
  account_name text,
  opportunity_name text,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stakeholders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid null,
  account_name text,
  opportunity_id uuid null,
  opportunity_name text,
  name text not null,
  role_title text,
  stakeholder_role text default 'Unknown',
  influence_level text default 'Unknown',
  relationship_strength text default 'Unknown',
  stance text default 'Unknown',
  email text,
  phone text,
  notes text,
  tags jsonb default '[]'::jsonb,
  last_interaction_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  raw_note text not null,
  activity_type text not null,
  account_name text,
  opportunity_name text,
  contact_name text,
  stakeholder_name text,
  stakeholder_role text,
  competitors jsonb not null default '[]'::jsonb,
  buying_signals jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  timeline_signals jsonb not null default '[]'::jsonb,
  next_actions jsonb not null default '[]'::jsonb,
  summary text,
  next_action text,
  due_date date,
  tags jsonb not null default '[]'::jsonb,
  linked_opportunity_id uuid null,
  linked_opportunity_name text,
  linked_account_name text,
  link_status text default 'Unlinked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accounts
  add column if not exists name text,
  add column if not exists summary text,
  add column if not exists status text default 'active',
  add column if not exists pain_points text[] not null default '{}',
  add column if not exists objections text[] not null default '{}',
  add column if not exists account_name text,
  add column if not exists segment text,
  add column if not exists industry text,
  add column if not exists location text,
  add column if not exists account_potential text default 'Unknown',
  add column if not exists relationship_status text default 'New',
  add column if not exists key_stakeholders jsonb default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists tags jsonb default '[]'::jsonb,
  add column if not exists external_source_key text,
  add column if not exists source_system text,
  add column if not exists source_file text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists source_hash text,
  add column if not exists import_batch_id uuid,
  add column if not exists territory text,
  add column if not exists state_province text,
  add column if not exists ka_flag boolean,
  add column if not exists priority text,
  add column if not exists fy26_target_sgd numeric,
  add column if not exists fy27_target_sgd numeric,
  add column if not exists account_master_stage text,
  add column if not exists strategy text,
  add column if not exists strategy_owner text,
  add column if not exists next_follow_up date,
  add column if not exists overdue_status text;

update public.accounts
set
  name = coalesce(name, account_name, 'Untitled account'),
  account_name = coalesce(account_name, name, 'Untitled account'),
  status = coalesce(status, 'active'),
  pain_points = coalesce(pain_points, '{}'),
  objections = coalesce(objections, '{}'),
  account_potential = coalesce(account_potential, 'Unknown'),
  relationship_status = coalesce(relationship_status, 'New'),
  key_stakeholders = coalesce(key_stakeholders, '[]'::jsonb),
  tags = coalesce(tags, '[]'::jsonb)
where name is null
   or account_name is null
   or status is null
   or pain_points is null
   or objections is null
   or account_potential is null
   or relationship_status is null
   or key_stakeholders is null
   or tags is null;

alter table public.stakeholders
  add column if not exists external_source_key text,
  add column if not exists source_system text,
  add column if not exists source_file text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists source_hash text,
  add column if not exists import_batch_id uuid,
  add column if not exists last_activity_type text,
  add column if not exists last_activity_summary text;

alter table public.sales_activities
  add column if not exists contact_name text,
  add column if not exists stakeholder_name text,
  add column if not exists stakeholder_role text,
  add column if not exists competitors jsonb not null default '[]'::jsonb,
  add column if not exists buying_signals jsonb not null default '[]'::jsonb,
  add column if not exists risks jsonb not null default '[]'::jsonb,
  add column if not exists timeline_signals jsonb not null default '[]'::jsonb,
  add column if not exists next_actions jsonb not null default '[]'::jsonb,
  add column if not exists linked_opportunity_id uuid null,
  add column if not exists linked_opportunity_name text,
  add column if not exists linked_account_name text,
  add column if not exists link_status text default 'Unlinked',
  add column if not exists external_source_key text,
  add column if not exists source_system text,
  add column if not exists source_file text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists source_hash text,
  add column if not exists import_batch_id uuid;

alter table public.sales_activities
  drop constraint if exists sales_activities_link_status_allowed;

alter table public.sales_activities
  add constraint sales_activities_link_status_allowed check (
    link_status in ('Unlinked', 'Suggested', 'Linked', 'Ignored')
  );

update public.sales_activities
set
  competitors = coalesce(competitors, '[]'::jsonb),
  buying_signals = coalesce(buying_signals, '[]'::jsonb),
  risks = coalesce(risks, '[]'::jsonb),
  timeline_signals = coalesce(timeline_signals, '[]'::jsonb),
  next_actions = coalesce(next_actions, '[]'::jsonb),
  link_status = coalesce(link_status, 'Unlinked')
where competitors is null
   or buying_signals is null
   or risks is null
   or timeline_signals is null
   or next_actions is null
   or link_status is null;

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
  add column if not exists status text default 'Active',
  add column if not exists external_source_key text,
  add column if not exists source_system text,
  add column if not exists source_file text,
  add column if not exists source_sheet text,
  add column if not exists source_row integer,
  add column if not exists source_hash text,
  add column if not exists import_batch_id uuid,
  add column if not exists fy26_value numeric,
  add column if not exists fy27_value numeric,
  add column if not exists quarter_values jsonb not null default '{}'::jsonb,
  add column if not exists forecast_metadata jsonb not null default '{}'::jsonb,
  add column if not exists brand text,
  add column if not exists channel text,
  add column if not exists opportunity_type text,
  add column if not exists pipeline_probability numeric,
  add column if not exists is_stage_inferred boolean not null default false,
  add column if not exists source_stage_confidence text not null default 'explicit';

update public.opportunities
set
  account_name = coalesce(account_name, 'Unknown account'),
  opportunity_name = coalesce(opportunity_name, title, 'Untitled opportunity'),
  title = coalesce(title, opportunity_name, 'Untitled opportunity'),
  currency = coalesce(currency, 'VND'),
  forecast_evidence_category = coalesce(forecast_evidence_category, 'Weak but recoverable'),
  decision_recommendation = coalesce(decision_recommendation, 'Monitor'),
  status = coalesce(status, case when stage = 'won' then 'Won' when stage = 'lost' then 'Lost' when stage = 'paused' then 'On hold' else 'Active' end)
where account_name is null
   or opportunity_name is null
   or title is null
   or currency is null
   or forecast_evidence_category is null
   or decision_recommendation is null
   or status is null;

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

alter table public.accounts enable row level security;
alter table public.opportunities enable row level security;
alter table public.stakeholders enable row level security;
alter table public.sales_activities enable row level security;

revoke all on table public.accounts, public.opportunities, public.stakeholders, public.sales_activities from anon;
grant select, insert, update, delete on table public.accounts, public.opportunities, public.stakeholders, public.sales_activities to authenticated;

drop policy if exists "Users can manage own founder import accounts" on public.accounts;
create policy "Users can manage own founder import accounts"
  on public.accounts
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own founder import opportunities" on public.opportunities;
create policy "Users can manage own founder import opportunities"
  on public.opportunities
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own founder import stakeholders" on public.stakeholders;
create policy "Users can manage own founder import stakeholders"
  on public.stakeholders
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own founder import sales activities" on public.sales_activities;
create policy "Users can manage own founder import sales activities"
  on public.sales_activities
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_email text not null,
  scope text not null default 'founder_core',
  mode text not null default 'commit' check (mode in ('dry_run', 'commit')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'rolled_back')),
  dry_run boolean not null default true,
  source_files jsonb not null default '[]'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_by text not null default 'scripts/import-founder-core.mjs',
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.import_row_results (
  id bigint generated by default as identity primary key,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_row integer,
  target_table text not null,
  action text not null check (action in ('insert_or_update', 'skip', 'warning', 'error')),
  warning_codes text[] not null default '{}',
  error_code text,
  source_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.operating_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_type text not null check (context_type in ('play', 'initiative')),
  title text not null,
  status text,
  period text,
  owner text,
  value_at_stake numeric,
  next_action text,
  next_date date,
  summary text,
  payload jsonb not null default '{}'::jsonb,
  external_source_key text,
  source_system text,
  source_file text,
  source_sheet text,
  source_row integer,
  source_hash text,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_batches enable row level security;
alter table public.import_row_results enable row level security;
alter table public.operating_context enable row level security;

drop policy if exists "Users can select own import batches" on public.import_batches;
create policy "Users can select own import batches"
  on public.import_batches
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own import batches" on public.import_batches;
create policy "Users can insert own import batches"
  on public.import_batches
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own import batches" on public.import_batches;
create policy "Users can update own import batches"
  on public.import_batches
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can select own import row results" on public.import_row_results;
create policy "Users can select own import row results"
  on public.import_row_results
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own import row results" on public.import_row_results;
create policy "Users can insert own import row results"
  on public.import_row_results
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage own operating context" on public.operating_context;
create policy "Users can manage own operating context"
  on public.operating_context
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.import_batches, public.import_row_results, public.operating_context from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.import_batches, public.import_row_results, public.operating_context to authenticated;
grant select, insert, update, delete on table public.import_batches, public.import_row_results, public.operating_context to service_role;
grant usage, select on sequence public.import_row_results_id_seq to authenticated, service_role;

create index if not exists import_batches_user_created_idx
  on public.import_batches (user_id, created_at desc);

create index if not exists import_row_results_batch_idx
  on public.import_row_results (batch_id, source_file, source_sheet, source_row);

create index if not exists operating_context_user_updated_idx
  on public.operating_context (user_id, updated_at desc);

create unique index if not exists accounts_user_source_key_unique_idx
  on public.accounts (user_id, source_system, external_source_key);

create unique index if not exists stakeholders_user_source_key_unique_idx
  on public.stakeholders (user_id, source_system, external_source_key);

create unique index if not exists sales_activities_user_source_key_unique_idx
  on public.sales_activities (user_id, source_system, external_source_key);

create unique index if not exists opportunities_user_source_key_unique_idx
  on public.opportunities (user_id, source_system, external_source_key);

create unique index if not exists operating_context_user_source_key_unique_idx
  on public.operating_context (user_id, source_system, external_source_key);

create index if not exists accounts_user_import_batch_idx
  on public.accounts (user_id, import_batch_id);

create index if not exists stakeholders_user_import_batch_idx
  on public.stakeholders (user_id, import_batch_id);

create index if not exists sales_activities_user_import_batch_idx
  on public.sales_activities (user_id, import_batch_id);

create index if not exists opportunities_user_import_batch_idx
  on public.opportunities (user_id, import_batch_id);
