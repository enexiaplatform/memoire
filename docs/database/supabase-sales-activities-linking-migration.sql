-- Memoire Phase M.25: Link sales activities to CRM-lite opportunities
-- Additive migration only. Do not drop or rewrite existing sales_activities data.

alter table public.sales_activities
  add column if not exists linked_opportunity_id uuid null,
  add column if not exists linked_opportunity_name text,
  add column if not exists linked_account_name text,
  add column if not exists link_status text default 'Unlinked';

alter table public.sales_activities
  drop constraint if exists sales_activities_link_status_allowed;

alter table public.sales_activities
  add constraint sales_activities_link_status_allowed check (
    link_status in ('Unlinked', 'Suggested', 'Linked', 'Ignored')
  );

update public.sales_activities
set link_status = 'Unlinked'
where link_status is null;

create index if not exists sales_activities_user_linked_opportunity_idx
on public.sales_activities (user_id, linked_opportunity_id);
