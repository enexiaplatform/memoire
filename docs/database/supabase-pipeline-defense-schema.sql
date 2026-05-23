-- Pipeline Defense cloud persistence schema
-- Run this in the Supabase SQL editor for the target project.

create table if not exists public.pipeline_defense_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  week_label text,
  sales_owner text,
  scope text,
  deals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pipeline_defense_briefs enable row level security;

drop policy if exists "Users can select their own pipeline defense briefs"
  on public.pipeline_defense_briefs;

create policy "Users can select their own pipeline defense briefs"
  on public.pipeline_defense_briefs
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own pipeline defense briefs"
  on public.pipeline_defense_briefs;

create policy "Users can insert their own pipeline defense briefs"
  on public.pipeline_defense_briefs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own pipeline defense briefs"
  on public.pipeline_defense_briefs;

create policy "Users can update their own pipeline defense briefs"
  on public.pipeline_defense_briefs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own pipeline defense briefs"
  on public.pipeline_defense_briefs;

create policy "Users can delete their own pipeline defense briefs"
  on public.pipeline_defense_briefs
  for delete
  using (auth.uid() = user_id);

create index if not exists pipeline_defense_briefs_user_updated_idx
  on public.pipeline_defense_briefs (user_id, updated_at desc);
