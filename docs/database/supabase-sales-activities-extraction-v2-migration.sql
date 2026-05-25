-- Phase M.35 additive migration for richer B2B sales activity extraction.
-- Safe to run after docs/database/supabase-sales-activities-schema.sql.
-- This does not drop existing data and keeps existing RLS policies intact.

alter table public.sales_activities
  add column if not exists contact_name text,
  add column if not exists stakeholder_name text,
  add column if not exists stakeholder_role text,
  add column if not exists competitors jsonb not null default '[]'::jsonb,
  add column if not exists buying_signals jsonb not null default '[]'::jsonb,
  add column if not exists risks jsonb not null default '[]'::jsonb,
  add column if not exists timeline_signals jsonb not null default '[]'::jsonb,
  add column if not exists next_actions jsonb not null default '[]'::jsonb;

-- Optional backfill to ensure old nullable JSON values are normalized if the
-- columns were created manually before this migration.
update public.sales_activities
set
  competitors = coalesce(competitors, '[]'::jsonb),
  buying_signals = coalesce(buying_signals, '[]'::jsonb),
  risks = coalesce(risks, '[]'::jsonb),
  timeline_signals = coalesce(timeline_signals, '[]'::jsonb),
  next_actions = coalesce(next_actions, '[]'::jsonb)
where
  competitors is null
  or buying_signals is null
  or risks is null
  or timeline_signals is null
  or next_actions is null;
