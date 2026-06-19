create table if not exists public.quotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.quotes enable row level security;

drop policy if exists "Users can manage own quotes" on public.quotes;
create policy "Users can manage own quotes"
  on public.quotes
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.quotes from anon;
grant select, insert, update, delete on table public.quotes to authenticated;
grant select, insert, update, delete on table public.quotes to service_role;

create index if not exists quotes_user_updated_idx
  on public.quotes (user_id, updated_at desc);
