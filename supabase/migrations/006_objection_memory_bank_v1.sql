-- Memoire Feature 05: Objection Memory Bank V1
-- Lightweight account/opportunity blocker memory with user-owned RLS.

CREATE TABLE IF NOT EXISTS public.objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  source_interaction_id uuid REFERENCES public.interactions(id) ON DELETE SET NULL,
  title text NOT NULL,
  detail text,
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('price','timeline','support','product_fit','compliance','competitor','authority','budget','other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','addressed','resolved','dismissed')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  response_angle text,
  linked_action_id uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  first_mentioned_at timestamptz,
  last_mentioned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS objections_user_account_idx ON public.objections(user_id, account_id);
CREATE INDEX IF NOT EXISTS objections_user_status_idx ON public.objections(user_id, status);
CREATE INDEX IF NOT EXISTS objections_opportunity_idx ON public.objections(opportunity_id);

ALTER TABLE public.objections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own objections" ON public.objections;
CREATE POLICY "Users can manage own objections" ON public.objections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS objections_touch_updated_at ON public.objections;
CREATE TRIGGER objections_touch_updated_at
  BEFORE UPDATE ON public.objections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
