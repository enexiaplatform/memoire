-- Quarterly targets: the number the seller is measured against.
--
-- Small table, few rows - four to eight a year - but it is not a preference.
-- A quota is a commitment somebody made to somebody, it gets raised mid-year,
-- and "I was raised in Q3" has to stay answerable after the number changes.
-- So the current value lives here and every change writes a `target_changed`
-- row into commercial_events, which is what the event stream is for. No
-- separate history table, no versioned rows.
--
-- Fiscal year start lives on the row rather than in settings, because a
-- workspace that changes its fiscal calendar must not silently re-bucket
-- targets that were set under the old one.

CREATE TABLE IF NOT EXISTS public.commercial_targets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'Q1'..'Q4'. Deliberately not a date range: a target is set against the
  -- period the business talks in, and the fiscal offset resolves it to dates.
  period text NOT NULL CHECK (period IN ('Q1', 'Q2', 'Q3', 'Q4')),
  fiscal_year integer NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'VND',
  fiscal_year_start_month integer NOT NULL DEFAULT 1
    CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, fiscal_year, period)
);

ALTER TABLE public.commercial_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own commercial targets" ON public.commercial_targets;
CREATE POLICY "Users can manage own commercial targets"
  ON public.commercial_targets FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.commercial_targets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.commercial_targets TO authenticated;

CREATE INDEX IF NOT EXISTS commercial_targets_user_year_idx
  ON public.commercial_targets (user_id, fiscal_year, period);
