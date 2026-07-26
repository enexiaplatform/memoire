-- Commercial Kernel: the four record types the product's promise depends on.
--
-- These are relational tables, not another opaque JSON collection. The existing
-- JSON pattern (user_id, id, payload jsonb) is fine for cached recommendations,
-- generated snapshots and UI preferences - things with no lifecycle. A
-- commitment has a lifecycle, a due date that gets renegotiated, and a party
-- who owes it; a thread has a status other surfaces must agree on; an event is
-- history that must never be silently rewritten. Those need columns, types,
-- foreign keys and indexes, because the queries that matter - "what is overdue",
-- "which threads are silent", "what did the customer promise" - are filters and
-- sorts, and a jsonb blob would make every one of them a full scan of the
-- workspace.
--
-- Additive and idempotent: nothing here alters or drops an existing table, and
-- re-running the file is a no-op. Existing accounts, opportunities, quotes and
-- activities are untouched. Threads are *derived* from them at read time by the
-- application rather than migrated, so a workspace that never writes a thread
-- row still sees its commercial threads.

-- ---------------------------------------------------------------- threads

CREATE TABLE IF NOT EXISTS public.commercial_threads (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  opportunity_id text,
  title text NOT NULL DEFAULT '',
  objective text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'waiting', 'won', 'lost', 'completed', 'archived')),
  current_money_state text NOT NULL DEFAULT 'none'
    CHECK (current_money_state IN (
      'none', 'quoted', 'awaiting_customer_decision', 'awaiting_po',
      'awaiting_delivery', 'awaiting_payment', 'paid'
    )),
  current_waiting_party text NOT NULL DEFAULT 'none'
    CHECK (current_waiting_party IN ('none', 'self', 'customer', 'internal')),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'capture', 'csv_import', 'system_rule', 'email', 'calendar', 'crm', 'erp')),
  source_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- ------------------------------------------------------------ commitments

CREATE TABLE IF NOT EXISTS public.commercial_commitments (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id text NOT NULL DEFAULT '',
  account_id text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  opportunity_id text,
  commitment_party text NOT NULL DEFAULT 'self'
    CHECK (commitment_party IN ('self', 'customer', 'internal')),
  owner_label text NOT NULL DEFAULT '',
  commitment_text text NOT NULL DEFAULT '',
  -- The promise as first made, kept forever. A reschedule moves
  -- current_due_date and appends to due_date_history; it never overwrites this,
  -- because "did the customer keep their word" is a different question from
  -- "when is it due now".
  original_due_date date,
  current_due_date date,
  silence_threshold_days integer NOT NULL DEFAULT 3 CHECK (silence_threshold_days BETWEEN 0 AND 365),
  -- There is no 'rescheduled' status on purpose: a moved promise is still open.
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled')),
  impact_type text NOT NULL DEFAULT 'none'
    CHECK (impact_type IN ('revenue', 'payment', 'delivery', 'relationship', 'none')),
  impact_amount numeric,
  impact_currency text,
  source_event_id text,
  completion_evidence text,
  completion_event_id text,
  due_date_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_renegotiated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'capture', 'csv_import', 'system_rule', 'email', 'calendar', 'crm', 'erp')),
  source_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- ----------------------------------------------------------------- events

CREATE TABLE IF NOT EXISTS public.commercial_events (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  -- occurred_at is when it happened in the business; recorded_at is when
  -- Memoire learned about it. They differ for imports and back-dated notes, and
  -- collapsing them would make "what changed this week" wrong for both.
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  account_id text,
  opportunity_id text,
  thread_id text,
  commitment_id text,
  summary text NOT NULL DEFAULT '',
  -- Payload holds what is specific to the event type. It is deliberately NOT a
  -- snapshot of the whole entity: the event stream records what changed, not a
  -- second copy of the workspace.
  structured_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'capture', 'csv_import', 'system_rule', 'email', 'calendar', 'crm', 'erp')),
  source_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- Stops a re-import or a re-run rule from writing the same event twice. Partial
-- so that manually recorded events - which a person may legitimately repeat -
-- are not constrained.
CREATE UNIQUE INDEX IF NOT EXISTS commercial_events_idempotency_idx
  ON public.commercial_events (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- --------------------------------------------------------- value outcomes

CREATE TABLE IF NOT EXISTS public.commercial_value_outcomes (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id text,
  account_id text,
  opportunity_id text,
  recommendation_id text,
  outcome_type text NOT NULL
    CHECK (outcome_type IN (
      'follow_up_recovered', 'commitment_caught', 'quote_advanced',
      'delivery_delay_avoided', 'payment_recovered', 'revenue_protected',
      'no_material_impact'
    )),
  -- "would have done it anyway" is a first-class answer. A value ledger that
  -- can only record wins measures nothing.
  user_assessment text NOT NULL
    CHECK (user_assessment IN (
      'would_have_done_anyway', 'helped_me_do_it_sooner',
      'might_have_missed_it', 'protected_revenue_or_payment'
    )),
  impact_amount numeric,
  impact_currency text,
  confidence numeric CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

-- ------------------------------------------------------------------- RLS

ALTER TABLE public.commercial_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_value_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own commercial threads" ON public.commercial_threads;
CREATE POLICY "Users can manage own commercial threads"
  ON public.commercial_threads FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own commercial commitments" ON public.commercial_commitments;
CREATE POLICY "Users can manage own commercial commitments"
  ON public.commercial_commitments FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own commercial events" ON public.commercial_events;
CREATE POLICY "Users can manage own commercial events"
  ON public.commercial_events FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can manage own commercial value outcomes" ON public.commercial_value_outcomes;
CREATE POLICY "Users can manage own commercial value outcomes"
  ON public.commercial_value_outcomes FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.commercial_threads FROM anon;
REVOKE ALL ON TABLE public.commercial_commitments FROM anon;
REVOKE ALL ON TABLE public.commercial_events FROM anon;
REVOKE ALL ON TABLE public.commercial_value_outcomes FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_commitments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_value_outcomes TO authenticated;

-- --------------------------------------------------------------- indexes
--
-- Indexed for the questions the product actually asks, not for completeness.

-- "Which threads are going silent?" - active threads by staleness.
CREATE INDEX IF NOT EXISTS commercial_threads_user_activity_idx
  ON public.commercial_threads (user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS commercial_threads_user_status_idx
  ON public.commercial_threads (user_id, status);
CREATE INDEX IF NOT EXISTS commercial_threads_user_account_idx
  ON public.commercial_threads (user_id, account_id);

-- "What is due or overdue?" - the single most-run query in the product.
CREATE INDEX IF NOT EXISTS commercial_commitments_user_due_idx
  ON public.commercial_commitments (user_id, status, current_due_date);
-- "What do I owe / what is the customer owing me?"
CREATE INDEX IF NOT EXISTS commercial_commitments_user_party_idx
  ON public.commercial_commitments (user_id, commitment_party, status);
CREATE INDEX IF NOT EXISTS commercial_commitments_user_thread_idx
  ON public.commercial_commitments (user_id, thread_id);

-- "What happened, most recent first?" - Timeline > History and Review.
CREATE INDEX IF NOT EXISTS commercial_events_user_occurred_idx
  ON public.commercial_events (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS commercial_events_user_thread_idx
  ON public.commercial_events (user_id, thread_id);
CREATE INDEX IF NOT EXISTS commercial_events_user_account_idx
  ON public.commercial_events (user_id, account_id);
CREATE INDEX IF NOT EXISTS commercial_events_user_type_idx
  ON public.commercial_events (user_id, event_type);

-- "Was Memoire worth it?" - the value ledger, newest first.
CREATE INDEX IF NOT EXISTS commercial_value_outcomes_user_occurred_idx
  ON public.commercial_value_outcomes (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS commercial_value_outcomes_user_type_idx
  ON public.commercial_value_outcomes (user_id, outcome_type);
