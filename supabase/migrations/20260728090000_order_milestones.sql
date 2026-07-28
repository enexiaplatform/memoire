-- Order milestone ticks: the operator's hand-made marks on the order book
-- (deposit received, contract signed) for steps no quote record proves.
-- Milestones a quote already proves are derived live and never stored here,
-- so the order book cannot drift from the money spine.
--
-- Rides the existing JSON-collection pattern; no new API function.

CREATE TABLE public.order_milestones (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.order_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own order milestones"
  ON public.order_milestones
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.order_milestones FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_milestones TO authenticated;

CREATE INDEX order_milestones_user_updated_idx
  ON public.order_milestones (user_id, updated_at DESC);
