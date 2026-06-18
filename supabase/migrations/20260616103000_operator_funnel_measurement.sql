ALTER TABLE public.product_funnel_events
  DROP CONSTRAINT IF EXISTS product_funnel_events_event_name_check;

ALTER TABLE public.product_funnel_events
  ADD CONSTRAINT product_funnel_events_event_name_check
  CHECK (event_name IN (
    'demo_started',
    'demo_completed',
    'request_access_submitted',
    'signup_completed',
    'csv_import_completed',
    'pipeline_defense_brief_created',
    'review_pack_saved'
  ));

CREATE OR REPLACE VIEW public.operator_funnel_daily AS
SELECT
  date_trunc('day', created_at)::date AS funnel_date,
  count(*) AS total_events,
  count(DISTINCT anonymous_id) AS unique_anonymous_visitors,
  count(*) FILTER (WHERE event_name = 'demo_started') AS demo_started_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'demo_started') AS demo_started_visitors,
  count(*) FILTER (WHERE event_name = 'demo_completed') AS demo_completed_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'demo_completed') AS demo_completed_visitors,
  count(*) FILTER (WHERE event_name = 'request_access_submitted') AS request_access_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'request_access_submitted') AS request_access_visitors,
  count(*) FILTER (WHERE event_name = 'signup_completed') AS signup_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'signup_completed') AS signup_visitors,
  count(*) FILTER (WHERE event_name = 'csv_import_completed') AS csv_import_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'csv_import_completed') AS csv_import_visitors,
  count(*) FILTER (WHERE event_name = 'pipeline_defense_brief_created') AS pipeline_brief_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'pipeline_defense_brief_created') AS pipeline_brief_visitors,
  count(*) FILTER (WHERE event_name = 'review_pack_saved') AS review_pack_events,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'review_pack_saved') AS review_pack_visitors
FROM public.product_funnel_events
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.operator_funnel_anonymous_progress AS
SELECT
  anonymous_id,
  min(created_at) FILTER (WHERE event_name = 'demo_started') AS first_demo_started_at,
  min(created_at) FILTER (WHERE event_name = 'demo_completed') AS first_demo_completed_at,
  min(created_at) FILTER (WHERE event_name = 'request_access_submitted') AS first_request_access_submitted_at,
  min(created_at) FILTER (WHERE event_name = 'signup_completed') AS first_signup_completed_at,
  min(created_at) FILTER (WHERE event_name = 'csv_import_completed') AS first_csv_import_completed_at,
  min(created_at) FILTER (WHERE event_name = 'pipeline_defense_brief_created') AS first_pipeline_brief_created_at,
  min(created_at) FILTER (WHERE event_name = 'review_pack_saved') AS first_review_pack_saved_at,
  max(created_at) AS last_event_at,
  count(*) AS total_events
FROM public.product_funnel_events
GROUP BY anonymous_id;

CREATE OR REPLACE VIEW public.operator_early_access_daily AS
SELECT
  date_trunc('day', created_at)::date AS request_date,
  count(*) AS total_requests,
  count(*) FILTER (WHERE status = 'new') AS new_requests,
  count(*) FILTER (WHERE status = 'contacted') AS contacted_requests,
  count(*) FILTER (WHERE status = 'approved') AS approved_requests,
  count(*) FILTER (WHERE status = 'declined') AS declined_requests,
  count(*) FILTER (WHERE status = 'archived') AS archived_requests
FROM public.early_access_requests
GROUP BY 1
ORDER BY 1 DESC;

REVOKE ALL ON TABLE public.operator_funnel_daily FROM anon, authenticated;
REVOKE ALL ON TABLE public.operator_funnel_anonymous_progress FROM anon, authenticated;
REVOKE ALL ON TABLE public.operator_early_access_daily FROM anon, authenticated;

GRANT SELECT ON TABLE public.operator_funnel_daily TO service_role;
GRANT SELECT ON TABLE public.operator_funnel_anonymous_progress TO service_role;
GRANT SELECT ON TABLE public.operator_early_access_daily TO service_role;

COMMENT ON VIEW public.operator_funnel_daily IS
  'Daily privacy-minimized activation funnel counts for Memoire operators. No email, sales content, account names, or deal data.';

COMMENT ON VIEW public.operator_funnel_anonymous_progress IS
  'Anonymous visitor-level first timestamps for funnel milestones. Uses only anonymous analytics ids.';

COMMENT ON VIEW public.operator_early_access_daily IS
  'Daily early-access request status counts for operator follow-up planning.';
