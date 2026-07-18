-- Plan board records: the operator's own weekly plan items, plus the
-- completion marks for items derived from the workspace (a deal's next action,
-- an obligation you owe). Derived items themselves are never stored here -
-- only the fact that you did them - so the board cannot drift from the
-- money spine.
--
-- Rides the existing JSON-collection pattern; no new API function.

CREATE TABLE public.plan_items (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.plan_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own plan items"
  ON public.plan_items
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.plan_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.plan_items TO authenticated;

CREATE INDEX plan_items_user_updated_idx
  ON public.plan_items (user_id, updated_at DESC);
