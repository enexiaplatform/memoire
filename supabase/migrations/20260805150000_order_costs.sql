-- The buy side of a committed order: what the goods cost, who they came from.
--
-- Every other figure on the order book is derived from a record the workspace
-- already holds - the quote states the value, the documents state the status.
-- Purchase cost has no such source: no customer-facing document proves it, so
-- it is the one thing on that page the operator has to tell us. Without it the
-- order book can say what an order is worth and not whether it was worth doing.
--
-- One row per order by construction (the id is derived from the opportunity),
-- because a multi-line cost book is an accounting product and this exists so
-- that a distributor who wants one number does not have to acquire one.
--
-- Rides the existing JSON-collection pattern; no new API function. api/ is at
-- the Vercel Hobby ceiling of twelve.

CREATE TABLE public.order_costs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.order_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own order costs"
  ON public.order_costs
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.order_costs FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_costs TO authenticated;

CREATE INDEX order_costs_user_updated_idx
  ON public.order_costs (user_id, updated_at DESC);
