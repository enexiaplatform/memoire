-- Memoire Objection Ledger additive migration.
-- Use this when public.objections already exists with the legacy V31 shape.
-- No existing columns or rows are removed. Existing RLS remains enabled.

alter table public.objections
  add column if not exists account_name text,
  add column if not exists opportunity_name text,
  add column if not exists stakeholder_id uuid,
  add column if not exists stakeholder_name text,
  add column if not exists source_activity_id uuid,
  add column if not exists objection_type text default 'Other',
  add column if not exists objection_text text,
  add column if not exists impact text default 'Unknown',
  add column if not exists required_proof text,
  add column if not exists response_plan text,
  add column if not exists resolution_note text,
  add column if not exists due_date date,
  add column if not exists resolved_at timestamptz,
  add column if not exists tags jsonb default '[]'::jsonb;

update public.objections
set
  objection_text = coalesce(objection_text, detail, title, 'Legacy objection'),
  objection_type = case
    when objection_type is null or objection_type = '' or objection_type = 'Other'
      then coalesce(nullif(category, ''), 'Other')
    else objection_type
  end,
  impact = case
    when impact is null or impact = '' or impact = 'Unknown' then
      case lower(coalesce(severity, ''))
      when 'high' then 'High'
      when 'medium' then 'Medium'
      when 'low' then 'Low'
      else 'Unknown'
      end
    else impact
  end,
  response_plan = coalesce(response_plan, response_angle),
  tags = coalesce(tags, '[]'::jsonb)
where
  objection_text is null
  or objection_type is null
  or objection_type = 'Other'
  or impact is null
  or impact = 'Unknown'
  or response_plan is null
  or tags is null;

alter table public.objections
  alter column objection_text set not null;

create index if not exists objections_user_status_idx
  on public.objections(user_id, status);

create index if not exists objections_user_account_name_idx
  on public.objections(user_id, account_name);

create index if not exists objections_user_opportunity_name_idx
  on public.objections(user_id, opportunity_name);
