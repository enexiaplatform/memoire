-- Commercial Evidence: what the seller has learned, as distinct from what
-- Memoire watched happen.
--
-- Four questions were answered before this table was written.
--
-- 1. Why no existing structure is correct.
--    `commercial_events` is state-transition history: every row in it is
--    written by a command as a side effect of a change Memoire itself made,
--    and its truth is guaranteed by construction. "The trial passed" is the
--    opposite - nothing in the workspace changed, and the claim rests on the
--    operator's word. Events are also never edited and never superseded, and
--    both are required here. `objections` holds blockers the customer raised;
--    filing a passed trial as a resolved objection would assert an objection
--    that never existed. `sales_activities` holds what the seller did - "met
--    QC" - which is not the finding. And `opportunities.evidence` is one
--    free-text box overwritten on every save: it cannot hold a failed trial on
--    the 1st and a passed retest on the 5th, and it cannot say which is now.
--
-- 2. Why jsonb on an existing record would be worse.
--    A payload column accepts any category anybody ever writes into it. The
--    moment that is true, this is a custom-field system with a suggestive name.
--    The CHECK constraints below are what make the closed category set a
--    property of the data rather than a promise in a code review.
--
-- 3. Why this is not Smart Attributes.
--    There is no user-defined key, no value type, and no way to add a category
--    without changing this file and the exhaustive maps in the domain. The
--    schema is code here; in an attribute system the schema is data.
--
-- 4. Why it deserves relational storage.
--    The one query that matters is supersession: the latest observation per
--    (user, scope, category). That is an index, and a full scan of a blob.
--
-- One table. Additive and idempotent; nothing existing is altered or dropped.

CREATE TABLE IF NOT EXISTS public.commercial_evidence (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Deals link to customers by name in this workspace, so the name is stored
  -- rather than only an id that is never written.
  account_id text NOT NULL DEFAULT '',
  account_name text NOT NULL DEFAULT '',
  opportunity_id text,
  thread_id text,
  -- The closed set. Adding a member is a migration, on purpose.
  category text NOT NULL
    CHECK (category IN ('technical_outcome')),
  -- Three words, never a score. A number here would be a sentiment reading
  -- dressed as a measurement, and something would eventually sort by it.
  direction text NOT NULL DEFAULT 'neutral'
    CHECK (direction IN ('positive', 'negative', 'neutral')),
  summary text NOT NULL DEFAULT '',
  -- Provenance, and the reason a claim can be checked. "Why does Memoire
  -- believe the trial passed" has exactly one honest answer and it is this.
  evidence_text text NOT NULL CHECK (char_length(btrim(evidence_text)) > 0),
  -- observed_at is the business day the thing was seen; recorded_at is when
  -- Memoire learned it. A note written up a week late needs both.
  observed_at date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  source_activity_id text,
  source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'capture', 'csv_import', 'system_rule', 'email', 'calendar', 'crm', 'erp')),
  source_id text,
  source_url text,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.commercial_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own commercial evidence" ON public.commercial_evidence;
CREATE POLICY "Users can manage own commercial evidence"
  ON public.commercial_evidence FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.commercial_evidence FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_evidence TO authenticated;

-- "What do we currently know about this deal?" - supersession reads the latest
-- observation per scope and category, and this is that query.
CREATE INDEX IF NOT EXISTS commercial_evidence_user_scope_idx
  ON public.commercial_evidence (user_id, opportunity_id, category, observed_at DESC);
-- The same question at customer level, for evidence that names no deal.
CREATE INDEX IF NOT EXISTS commercial_evidence_user_account_idx
  ON public.commercial_evidence (user_id, account_name, category, observed_at DESC);
