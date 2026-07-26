-- Product analytics gets its own table and its own endpoint.
--
-- Two problems this fixes.
--
-- First, product events were being POSTed to /api/request-access - the
-- lead-capture endpoint. A product measurement and a sales lead have different
-- retention, different privacy weight and different rate limits, and sharing a
-- route meant one could not be changed without risking the other.
--
-- Second, product_funnel_events carries a CHECK constraint listing six event
-- names, while the client had grown to send twenty. The other fourteen were
-- rejected by Postgres, the error was caught and logged, and the endpoint
-- returned 202 - so the events looked delivered and were not. The taxonomy is
-- now behaviour-centric rather than page-centric, and the constraint lists
-- every name the client can send, in one place that fails loudly in CI if the
-- two drift apart again.
--
-- Additive: product_funnel_events is left exactly as it is, so historical rows
-- and any query against them keep working.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL CHECK (event_name IN (
    -- Activation: the first time each step of the loop happens at all.
    'first_capture_saved',
    'first_thread_linked',
    'first_commitment_created',
    'first_commitment_completed',
    'first_review_completed',

    -- Core usage: is the loop actually being run?
    'capture_saved',
    'thread_viewed',
    'commitment_created',
    'commitment_completed',
    'commitment_rescheduled',
    'commercial_risk_viewed',
    'commercial_risk_acted_on',
    'review_completed',

    -- Value: did Memoire do commercial good? These mirror the value ledger.
    'follow_up_recovered',
    'commitment_caught',
    'quote_advanced',
    'delivery_delay_avoided',
    'payment_recovered',
    'revenue_protected',

    -- Trust: does the product keep the data it was given?
    'sync_failed',
    'sync_recovered',
    'backup_exported',
    'restore_completed',
    'duplicate_prevented',

    -- Funnel, carried over from product_funnel_events so the acquisition
    -- picture does not split across two tables.
    'demo_started',
    'demo_completed',
    'request_access_submitted',
    'signup_completed',
    'csv_import_completed'
  )),
  anonymous_id text NOT NULL CHECK (char_length(anonymous_id) BETWEEN 8 AND 100),
  -- Path only, never a query string: a route like /app/accounts?accountId=...
  -- would carry a customer identifier into analytics.
  route text NOT NULL DEFAULT '',
  data_mode text NOT NULL DEFAULT 'unknown'
    CHECK (data_mode IN ('demo-local', 'cloud-synced', 'browser-only', 'sync-pending', 'sync-failed', 'unknown')),
  -- Demo traffic must be separable from real usage, or every activation number
  -- is inflated by people looking around the showcase.
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_events_name_created_idx
  ON public.product_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS product_events_anonymous_idx
  ON public.product_events (anonymous_id, created_at DESC);
-- Retention sweeps and "real usage only" queries both filter on these.
CREATE INDEX IF NOT EXISTS product_events_demo_created_idx
  ON public.product_events (is_demo, created_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

-- Server-only, exactly like product_funnel_events: the browser posts through
-- /api/product-events, which uses the service role. No client may read or write
-- this table directly, so one user's analytics can never be read by another.
REVOKE ALL ON TABLE public.product_events FROM anon, authenticated;
GRANT ALL ON TABLE public.product_events TO service_role;

COMMENT ON TABLE public.product_events IS
  'Privacy-minimized product analytics. Behaviour names, an anonymous id, a route path and a data mode - never customer notes, account names, deal values, email or any commercial content. Retention: rows older than 400 days may be deleted; nothing here is needed to operate a workspace.';
