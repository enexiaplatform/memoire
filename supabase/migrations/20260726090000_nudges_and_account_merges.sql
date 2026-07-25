-- The last two JSON collections the app syncs that had no table at all.
--
-- nudges holds the operator's own decisions about proactive nudges - done,
-- dismissed, snoozed until a date - so a nudge silenced on the laptop does not
-- come back on the phone. account_merges holds confirmed "these two names are
-- one account" decisions, which must survive a device change or the same
-- duplicate is proposed again forever.
--
-- Both ride the existing JSON-collection pattern (user_id + text id + jsonb
-- payload), so no new API function is needed - the Vercel Hobby function cap
-- stays untouched.

CREATE TABLE IF NOT EXISTS public.nudges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.nudges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own nudges" ON public.nudges;
CREATE POLICY "Users can manage own nudges"
  ON public.nudges
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.nudges FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nudges TO authenticated;

CREATE INDEX IF NOT EXISTS nudges_user_updated_idx
  ON public.nudges (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.account_merges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.account_merges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own account merges" ON public.account_merges;
CREATE POLICY "Users can manage own account merges"
  ON public.account_merges
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.account_merges FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.account_merges TO authenticated;

CREATE INDEX IF NOT EXISTS account_merges_user_updated_idx
  ON public.account_merges (user_id, updated_at DESC);
