-- Money-out reaches the account.
--
-- Expenses were the last collection still living only in localStorage. The
-- store said so ("deliberately deferred so this increment ships without a
-- schema migration") and `loadExpensesForUser` took a user id and ignored it.
-- That is fine for one browser and wrong for everything else the records feed:
-- cash position, own obligations, the profit-and-loss statement and the money
-- half of the daily digest all read expenses, so a seller opening Memoire on a
-- second device saw their cash-on-hand change with nothing on screen admitting
-- why. The digest is worse: it is built server-side from cloud rows, so it has
-- been computing "what is stuck" against zero expenses for every user.
--
-- Rides the existing JSON-collection pattern (see supplier_commitments); no new
-- API function, no change to the export or restore flows, and every record
-- already in a browser is pushed up on the next load by the merge.
CREATE TABLE IF NOT EXISTS public.expenses (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own expenses" ON public.expenses;
CREATE POLICY "Users can manage own expenses"
  ON public.expenses
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.expenses FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO authenticated;

CREATE INDEX IF NOT EXISTS expenses_user_updated_idx
  ON public.expenses (user_id, updated_at DESC);
