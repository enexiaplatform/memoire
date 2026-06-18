-- Explicit server-side grants for the founder core import pipeline.
-- The service-role key must stay server/local-only and is never used by clients.

grant select, insert, update, delete
  on table public.accounts,
           public.opportunities,
           public.stakeholders,
           public.sales_activities
  to service_role;
