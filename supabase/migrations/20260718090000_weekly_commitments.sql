-- Weekly Commitment Snapshot: the frozen record of what the operator
-- deliberately chose for a week. Rides the existing JSON-collection pattern
-- (user_id + text id + jsonb payload) so no new API function is needed.
-- One row per week per user; re-confirming replaces that week's row.

CREATE TABLE public.weekly_commitments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.weekly_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own weekly commitments"
  ON public.weekly_commitments
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.weekly_commitments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_commitments TO authenticated;

CREATE INDEX weekly_commitments_user_updated_idx
  ON public.weekly_commitments (user_id, updated_at DESC);
