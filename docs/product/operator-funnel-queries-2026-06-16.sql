-- Memoire operator funnel queries
-- Date: 2026-06-16
--
-- Run these with a trusted operator/service-role context only.
-- Funnel event rows are privacy-minimized and contain no sales content, email,
-- account names, opportunity names, or deal data.

-- 1. Daily funnel scoreboard.
SELECT *
FROM public.operator_funnel_daily
WHERE funnel_date >= current_date - interval '30 days'
ORDER BY funnel_date DESC;

-- 2. Last 7 days activation snapshot.
WITH window_events AS (
  SELECT *
  FROM public.product_funnel_events
  WHERE created_at >= now() - interval '7 days'
)
SELECT
  count(DISTINCT anonymous_id) AS unique_anonymous_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'demo_started') AS demo_started_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'demo_completed') AS demo_completed_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'request_access_submitted') AS request_access_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'signup_completed') AS signup_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'csv_import_completed') AS csv_import_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'pipeline_defense_brief_created') AS pipeline_brief_visitors,
  count(DISTINCT anonymous_id) FILTER (WHERE event_name = 'review_pack_saved') AS review_pack_visitors
FROM window_events;

-- 3. Anonymous journey progress for the latest active visitors.
SELECT
  anonymous_id,
  first_demo_started_at,
  first_demo_completed_at,
  first_request_access_submitted_at,
  first_signup_completed_at,
  first_csv_import_completed_at,
  first_pipeline_brief_created_at,
  first_review_pack_saved_at,
  last_event_at,
  total_events
FROM public.operator_funnel_anonymous_progress
ORDER BY last_event_at DESC
LIMIT 100;

-- 4. New early-access lead follow-up queue.
-- This query includes lead contact details and must stay operator-only.
SELECT
  id,
  created_at,
  follow_up_due_at,
  operator_owner,
  name,
  work_email,
  role,
  current_tool,
  biggest_pain,
  preferred_use_case,
  status
FROM public.operator_early_access_queue
ORDER BY follow_up_due_at ASC NULLS LAST, created_at ASC
LIMIT 50;

-- 5. Early-access request status trend.
SELECT *
FROM public.operator_early_access_daily
WHERE request_date >= current_date - interval '30 days'
ORDER BY request_date DESC;

-- 6. Claim a new lead for follow-up.
-- Replace REQUEST_ID and OPERATOR_NAME before running.
UPDATE public.early_access_requests
SET
  operator_owner = 'OPERATOR_NAME',
  follow_up_due_at = now() + interval '2 days',
  status_updated_at = now(),
  operator_note = trim(concat(operator_note, E'\n', to_char(now(), 'YYYY-MM-DD HH24:MI'), ' claimed by OPERATOR_NAME'))
WHERE id = 'REQUEST_ID'::uuid
  AND status = 'new'
RETURNING id, status, operator_owner, follow_up_due_at, work_email;

-- 7. Mark a lead as contacted.
-- Replace REQUEST_ID and OPERATOR_NOTE before running.
UPDATE public.early_access_requests
SET
  status = 'contacted',
  contacted_at = coalesce(contacted_at, now()),
  status_updated_at = now(),
  operator_note = trim(concat(operator_note, E'\n', to_char(now(), 'YYYY-MM-DD HH24:MI'), ' contacted: OPERATOR_NOTE'))
WHERE id = 'REQUEST_ID'::uuid
RETURNING id, status, contacted_at, operator_owner, work_email;

-- 8. Approve a lead for cohort invite.
-- Replace REQUEST_ID and OPERATOR_NOTE before running.
UPDATE public.early_access_requests
SET
  status = 'approved',
  decided_at = now(),
  follow_up_due_at = now() + interval '1 day',
  status_updated_at = now(),
  operator_note = trim(concat(operator_note, E'\n', to_char(now(), 'YYYY-MM-DD HH24:MI'), ' approved: OPERATOR_NOTE'))
WHERE id = 'REQUEST_ID'::uuid
RETURNING id, status, decided_at, follow_up_due_at, work_email;

-- 9. Decline or archive a lead.
-- Replace REQUEST_ID, TARGET_STATUS, and OPERATOR_NOTE before running.
-- TARGET_STATUS must be 'declined' or 'archived'.
UPDATE public.early_access_requests
SET
  status = 'TARGET_STATUS',
  decided_at = now(),
  follow_up_due_at = null,
  status_updated_at = now(),
  operator_note = trim(concat(operator_note, E'\n', to_char(now(), 'YYYY-MM-DD HH24:MI'), ' TARGET_STATUS: OPERATOR_NOTE'))
WHERE id = 'REQUEST_ID'::uuid
  AND 'TARGET_STATUS' IN ('declined', 'archived')
RETURNING id, status, decided_at, work_email;

-- 10. Retention review queue.
-- Review archived or declined requests older than 90 days.
SELECT
  id,
  created_at,
  status,
  decided_at,
  work_email,
  operator_owner,
  operator_note
FROM public.early_access_requests
WHERE status IN ('declined', 'archived')
  AND coalesce(decided_at, created_at) < now() - interval '90 days'
ORDER BY coalesce(decided_at, created_at) ASC
LIMIT 50;
