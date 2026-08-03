-- Reaching the operator when the app is closed.
--
-- Every mechanism that delivers "nothing goes silent" - going-quiet detection,
-- overdue commitments, stuck money, the weekly scoreboard - only fired while
-- somebody was looking at the app. A follow-through product that can only
-- remind you while you are already reading it has inverted its own promise.
--
-- Two things live here: what each operator asked to receive and when, and a log
-- of what was actually sent. The log is not analytics - it is how the cron
-- knows it has already sent today, and how a "the email never arrived" support
-- question gets an answer instead of a shrug.

alter table public.user_profiles
  add column if not exists daily_digest_enabled boolean not null default false,
  add column if not exists weekly_review_enabled boolean not null default false,
  -- Local hour, 0-23, at which the operator wants the daily digest. Paired with
  -- the offset below rather than a timezone name: the cron needs arithmetic it
  -- can do in SQL, and an offset is what a distributor in UTC+7 actually means.
  add column if not exists digest_send_hour smallint not null default 7,
  add column if not exists digest_utc_offset_minutes smallint not null default 0,
  add column if not exists digest_last_daily_sent_on date,
  add column if not exists digest_last_weekly_sent_on date,
  -- Unsubscribing must work from an email, which means without a session. The
  -- token is the only credential that link carries, so it is random, per user,
  -- and rotatable.
  add column if not exists digest_unsubscribe_token uuid not null default gen_random_uuid();

alter table public.user_profiles
  add constraint user_profiles_digest_send_hour_range
  check (digest_send_hour between 0 and 23) not valid;

alter table public.user_profiles
  add constraint user_profiles_digest_offset_range
  check (digest_utc_offset_minutes between -720 and 840) not valid;

create unique index if not exists user_profiles_digest_unsubscribe_token_idx
  on public.user_profiles (digest_unsubscribe_token);

-- Who was sent what, and whether it left. One row per attempt, successful or
-- not: a delivery that failed silently is the same problem as a digest that was
-- never built.
create table if not exists public.digest_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly')),
  sent_for date not null,
  status text not null check (status in ('sent', 'skipped', 'failed')),
  -- Why it was skipped or how it failed. Never the digest body: this table is
  -- an operational log, and the digest names customers and deal values.
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists digest_deliveries_user_idx
  on public.digest_deliveries (user_id, created_at desc);

create unique index if not exists digest_deliveries_once_per_day_idx
  on public.digest_deliveries (user_id, kind, sent_for)
  where status = 'sent';

alter table public.digest_deliveries enable row level security;

-- Read-only for the operator, written only by the service role that runs the
-- cron. Nobody should be able to fabricate a delivery record about themselves.
drop policy if exists "digest deliveries are readable by their owner" on public.digest_deliveries;
create policy "digest deliveries are readable by their owner"
  on public.digest_deliveries for select
  using (auth.uid() = user_id);
