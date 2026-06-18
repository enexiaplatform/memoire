ALTER TABLE public.early_access_requests
  ADD COLUMN IF NOT EXISTS operator_owner text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS follow_up_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS operator_note text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS early_access_requests_follow_up_due_idx
  ON public.early_access_requests (follow_up_due_at ASC NULLS LAST, created_at ASC)
  WHERE status IN ('new', 'contacted', 'approved');

CREATE OR REPLACE VIEW public.operator_early_access_queue AS
SELECT
  id,
  created_at,
  follow_up_due_at,
  status,
  status_updated_at,
  operator_owner,
  name,
  work_email,
  role,
  current_tool,
  biggest_pain,
  preferred_use_case,
  contacted_at,
  decided_at,
  operator_note
FROM public.early_access_requests
WHERE status IN ('new', 'contacted', 'approved')
ORDER BY
  follow_up_due_at ASC NULLS LAST,
  created_at ASC;

CREATE OR REPLACE VIEW public.operator_early_access_daily AS
SELECT
  date_trunc('day', created_at)::date AS request_date,
  count(*) AS total_requests,
  count(*) FILTER (WHERE status = 'new') AS new_requests,
  count(*) FILTER (WHERE status = 'contacted') AS contacted_requests,
  count(*) FILTER (WHERE status = 'approved') AS approved_requests,
  count(*) FILTER (WHERE status = 'declined') AS declined_requests,
  count(*) FILTER (WHERE status = 'archived') AS archived_requests,
  count(*) FILTER (WHERE status = 'new' AND operator_owner = '') AS unclaimed_new_requests,
  count(*) FILTER (
    WHERE status IN ('new', 'contacted', 'approved')
      AND follow_up_due_at IS NOT NULL
      AND follow_up_due_at < now()
  ) AS overdue_follow_ups
FROM public.early_access_requests
GROUP BY 1
ORDER BY 1 DESC;

REVOKE ALL ON TABLE public.operator_early_access_queue FROM anon, authenticated;
REVOKE ALL ON TABLE public.operator_early_access_daily FROM anon, authenticated;
GRANT SELECT ON TABLE public.operator_early_access_queue TO service_role;
GRANT SELECT ON TABLE public.operator_early_access_daily TO service_role;

COMMENT ON COLUMN public.early_access_requests.operator_owner IS
  'Internal operator responsible for early-access follow-up. Do not store secrets.';

COMMENT ON COLUMN public.early_access_requests.follow_up_due_at IS
  'Next operator follow-up deadline for the request.';

COMMENT ON COLUMN public.early_access_requests.contacted_at IS
  'Timestamp when the lead was first contacted.';

COMMENT ON COLUMN public.early_access_requests.decided_at IS
  'Timestamp when the lead was approved, declined, or archived.';

COMMENT ON COLUMN public.early_access_requests.operator_note IS
  'Internal operational note for qualification and follow-up. Avoid sensitive customer content.';

COMMENT ON VIEW public.operator_early_access_queue IS
  'Operator-only early-access follow-up queue with contact details and workflow timestamps.';

COMMENT ON VIEW public.operator_early_access_daily IS
  'Daily early-access request status and follow-up SLA counts for operator planning.';
