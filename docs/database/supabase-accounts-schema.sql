-- Memoire Phase M.26: Account Memory
-- Run this in Supabase SQL editor.
-- Additive-safe for older Memoire projects that already have public.accounts.

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_code text,
  account_name text not null,
  segment text,
  industry text,
  location text,
  account_potential text default 'Unknown',
  relationship_status text default 'New',
  key_stakeholders jsonb default '[]'::jsonb,
  notes text,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.accounts
  add column if not exists account_code text,
  add column if not exists account_name text,
  add column if not exists segment text,
  add column if not exists location text,
  add column if not exists account_potential text default 'Unknown',
  add column if not exists relationship_status text default 'New',
  add column if not exists key_stakeholders jsonb default '[]'::jsonb,
  add column if not exists notes text,
  add column if not exists tags jsonb default '[]'::jsonb;

alter table public.accounts
  drop constraint if exists accounts_account_potential_allowed;

alter table public.accounts
  add constraint accounts_account_potential_allowed check (
    account_potential in ('High', 'Medium', 'Low', 'Unknown')
  );

alter table public.accounts
  drop constraint if exists accounts_relationship_status_allowed;

alter table public.accounts
  add constraint accounts_relationship_status_allowed check (
    relationship_status in ('New', 'Developing', 'Active', 'Dormant', 'At risk', 'Strong')
  );

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accounts'
      and column_name = 'name'
  ) then
    execute $sql$
      update public.accounts
      set
        account_name = coalesce(account_name, name),
        notes = coalesce(notes, summary),
        account_potential = coalesce(account_potential, 'Unknown'),
        relationship_status = coalesce(relationship_status, 'New'),
        key_stakeholders = coalesce(key_stakeholders, '[]'::jsonb),
        tags = coalesce(tags, '[]'::jsonb)
      where account_name is null
         or account_potential is null
         or relationship_status is null
         or key_stakeholders is null
         or tags is null
    $sql$;
  else
    update public.accounts
    set
      account_name = coalesce(account_name, 'Untitled account'),
      account_potential = coalesce(account_potential, 'Unknown'),
      relationship_status = coalesce(relationship_status, 'New'),
      key_stakeholders = coalesce(key_stakeholders, '[]'::jsonb),
      tags = coalesce(tags, '[]'::jsonb)
    where account_name is null
       or account_potential is null
       or relationship_status is null
       or key_stakeholders is null
       or tags is null;
  end if;
end $$;

alter table public.accounts enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.accounts to authenticated;

drop policy if exists "Users can select own accounts" on public.accounts;
create policy "Users can select own accounts"
on public.accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own accounts" on public.accounts;
create policy "Users can insert own accounts"
on public.accounts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own accounts" on public.accounts;
create policy "Users can update own accounts"
on public.accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own accounts" on public.accounts;
create policy "Users can delete own accounts"
on public.accounts
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists accounts_user_updated_idx
on public.accounts (user_id, updated_at desc);

create index if not exists accounts_user_account_name_idx
on public.accounts (user_id, account_name);

create unique index if not exists accounts_user_account_code_unique_idx
on public.accounts (user_id, account_code)
where account_code is not null;
