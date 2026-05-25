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

alter table public.stakeholders enable row level security;

create policy "Users can select own stakeholders"
  on public.stakeholders
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own stakeholders"
  on public.stakeholders
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own stakeholders"
  on public.stakeholders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own stakeholders"
  on public.stakeholders
  for delete
  using (auth.uid() = user_id);

create index if not exists stakeholders_user_id_idx on public.stakeholders(user_id);
create index if not exists stakeholders_account_name_idx on public.stakeholders(user_id, account_name);
create index if not exists stakeholders_opportunity_name_idx on public.stakeholders(user_id, opportunity_name);
