-- JSON-collection tables (2026-07-18)
--
-- Every table below is the same shape, because they all ride the one pattern in
-- src/services/cloudJsonCollectionStore.ts: the app owns the record's structure,
-- Postgres owns ownership and recency. Adding a collection should never mean
-- designing a schema.
--
-- Three collections shipped before this file existed and have been working
-- local-first, with cloud sync failing softly:
--   weekly_commitments  (2026-07-18)
--   plan_items          (2026-07-18)
--   account_merges      (2026-07-18)
-- Run this once per Supabase project to give them cloud persistence. It is
-- idempotent, so re-running it is safe.

do $$
declare
  collection text;
begin
  foreach collection in array array['weekly_commitments', 'plan_items', 'account_merges']
  loop
    execute format($fmt$
      create table if not exists public.%I (
        user_id uuid not null references auth.users (id) on delete cascade,
        id text not null,
        payload jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key (user_id, id)
      );
    $fmt$, collection);

    -- The store orders by updated_at within one user's rows.
    execute format(
      'create index if not exists %I on public.%I (user_id, updated_at desc);',
      collection || '_user_updated_idx',
      collection
    );

    execute format('alter table public.%I enable row level security;', collection);

    -- One policy per operation: a user reaches their own rows and no others.
    -- This is the same isolation the data-isolation contract asserts.
    execute format($fmt$
      drop policy if exists %I on public.%I;
    $fmt$, collection || '_owner_all', collection);

    execute format($fmt$
      create policy %I on public.%I
        for all
        using (auth.uid() = user_id)
        with check (auth.uid() = user_id);
    $fmt$, collection || '_owner_all', collection);
  end loop;
end $$;
