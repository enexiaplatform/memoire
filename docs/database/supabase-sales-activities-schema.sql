-- Daily Capture Foundation cloud persistence schema
-- Run this in the Supabase SQL editor for the target project.

create table if not exists public.sales_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  raw_note text not null,
  activity_type text not null,
  account_name text,
  opportunity_name text,
  summary text,
  next_action text,
  due_date date,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sales_activities enable row level security;

grant select, insert, update, delete on public.sales_activities to authenticated;

drop policy if exists "Users can select their own sales activities"
  on public.sales_activities;

create policy "Users can select their own sales activities"
  on public.sales_activities
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own sales activities"
  on public.sales_activities;

create policy "Users can insert their own sales activities"
  on public.sales_activities
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own sales activities"
  on public.sales_activities;

create policy "Users can update their own sales activities"
  on public.sales_activities
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own sales activities"
  on public.sales_activities;

create policy "Users can delete their own sales activities"
  on public.sales_activities
  for delete
  using (auth.uid() = user_id);

create index if not exists sales_activities_user_activity_date_idx
  on public.sales_activities (user_id, activity_date desc, created_at desc);
