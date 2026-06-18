CREATE TABLE public.review_packs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.sales_assets (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE TABLE public.action_outcomes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.review_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own review packs"
  ON public.review_packs
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can manage own sales assets"
  ON public.sales_assets
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can manage own action outcomes"
  ON public.action_outcomes
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.review_packs, public.sales_assets, public.action_outcomes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.review_packs, public.sales_assets, public.action_outcomes TO authenticated;

CREATE INDEX review_packs_user_updated_idx ON public.review_packs (user_id, updated_at DESC);
CREATE INDEX sales_assets_user_updated_idx ON public.sales_assets (user_id, updated_at DESC);
CREATE INDEX action_outcomes_user_updated_idx ON public.action_outcomes (user_id, updated_at DESC);
