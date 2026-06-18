CREATE TABLE public.product_funnel_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN (
    'demo_started',
    'demo_completed',
    'request_access_submitted',
    'signup_completed',
    'csv_import_completed',
    'review_pack_saved'
  )),
  anonymous_id text NOT NULL CHECK (char_length(anonymous_id) BETWEEN 8 AND 100),
  route text NOT NULL DEFAULT '',
  data_mode text NOT NULL DEFAULT 'unknown'
    CHECK (data_mode IN ('demo-local', 'cloud-browser', 'browser-only', 'sync-issue', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_funnel_events_name_created_idx
  ON public.product_funnel_events (event_name, created_at DESC);

ALTER TABLE public.product_funnel_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_funnel_events FROM anon, authenticated;
GRANT ALL ON TABLE public.product_funnel_events TO service_role;

COMMENT ON TABLE public.product_funnel_events IS
  'Privacy-minimized product funnel events. No sales content, email, account name, or deal data.';
