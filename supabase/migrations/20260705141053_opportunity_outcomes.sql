-- Backfilled to match the live database.
--
-- public.opportunity_outcomes was created directly against the project on
-- 2026-07-05 without a migration file, so the repo could no longer rebuild the
-- schema it runs on: anyone restoring from migrations would have come up one
-- table short, and the app would have failed to sync won/lost outcomes with no
-- obvious cause. Written here from the live definition, idempotent so applying
-- it over the existing table is a no-op.
--
-- The anon revoke and the authenticated-scoped policy are part of the same
-- backfill: this table was the last JSON collection still carrying an anon
-- SELECT grant and a policy scoped to the public role. RLS already denied every
-- row to an anonymous caller (auth.uid() is NULL, so auth.uid() = user_id never
-- matched), so nothing leaked - but it was the one place a later policy mistake
-- would not have needed a session to reach.

CREATE TABLE IF NOT EXISTS public.opportunity_outcomes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own opportunity outcomes" ON public.opportunity_outcomes;
CREATE POLICY "Users can manage own opportunity outcomes"
  ON public.opportunity_outcomes
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.opportunity_outcomes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.opportunity_outcomes TO authenticated;

CREATE INDEX IF NOT EXISTS opportunity_outcomes_user_updated_idx
  ON public.opportunity_outcomes (user_id, updated_at DESC);
