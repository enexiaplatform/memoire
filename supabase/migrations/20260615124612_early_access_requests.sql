CREATE TABLE public.early_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  work_email text NOT NULL CHECK (char_length(work_email) BETWEEN 3 AND 320),
  role text NOT NULL DEFAULT '',
  current_tool text NOT NULL DEFAULT '',
  biggest_pain text NOT NULL DEFAULT '',
  preferred_use_case text NOT NULL DEFAULT '',
  consent_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'request_access_page',
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'approved', 'declined', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX early_access_requests_created_at_idx
  ON public.early_access_requests (created_at DESC);

CREATE INDEX early_access_requests_status_idx
  ON public.early_access_requests (status, created_at DESC);

ALTER TABLE public.early_access_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.early_access_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.early_access_requests TO service_role;

COMMENT ON TABLE public.early_access_requests IS
  'Private early-access leads submitted through the server-side request-access endpoint.';
