-- What you and your principals owe each other: forecasts and purchase orders
-- you owe the brand, pricing, samples, documents and ship dates the brand owes
-- you. Kept separate from the commercial commitment ledger because a ledger
-- commitment hangs off a customer thread and these have no customer at all.
--
-- Rides the existing JSON-collection pattern; no new API function.

CREATE TABLE public.supplier_commitments (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.supplier_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own supplier commitments"
  ON public.supplier_commitments
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.supplier_commitments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.supplier_commitments TO authenticated;

CREATE INDEX supplier_commitments_user_updated_idx
  ON public.supplier_commitments (user_id, updated_at DESC);
