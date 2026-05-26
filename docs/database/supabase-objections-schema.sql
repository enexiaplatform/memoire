create table if not exists public.objections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid nullable,
  account_name text,
  opportunity_id uuid nullable,
  opportunity_name text,
  stakeholder_id uuid nullable,
  stakeholder_name text,
  source_activity_id uuid nullable,
  objection_type text default 'Other',
  objection_text text not null,
  impact text default 'Unknown',
  status text default 'Open',
  required_proof text,
  response_plan text,
  resolution_note text,
  due_date date,
  resolved_at timestamptz,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.objections enable row level security;

create policy "Users can select own objections"
  on public.objections
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own objections"
  on public.objections
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own objections"
  on public.objections
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own objections"
  on public.objections
  for delete
  using (auth.uid() = user_id);

create index if not exists objections_user_id_idx on public.objections(user_id);
create index if not exists objections_account_name_idx on public.objections(user_id, account_name);
create index if not exists objections_opportunity_name_idx on public.objections(user_id, opportunity_name);
create index if not exists objections_status_idx on public.objections(user_id, status);
