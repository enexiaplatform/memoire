-- Memoire Master Plan v3.1 core V1 model
-- V1 focus: accounts, contacts, opportunities, interactions, actions.
-- Raw capture stays in public.captures and links forward through source_capture_id.

CREATE TABLE IF NOT EXISTS public.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  summary text,
  industry text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
  pain_points text[] NOT NULL DEFAULT '{}',
  objections text[] NOT NULL DEFAULT '{}',
  source_capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  notes text,
  source_capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id, name)
);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'active' CHECK (stage IN ('new','active','proposal','negotiation','won','lost','paused')),
  estimated_value numeric,
  blocker text,
  next_action_text text,
  last_touch_at timestamptz,
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high')),
  confidence text NOT NULL DEFAULT 'medium' CHECK (confidence IN ('low','medium','high')),
  source_capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  source_capture_id uuid REFERENCES public.captures(id) ON DELETE SET NULL,
  interaction_type text NOT NULL DEFAULT 'note' CHECK (interaction_type IN ('call','email','meeting','note','proposal','other')),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  summary text NOT NULL,
  pain_point text,
  objection text,
  raw_note text NOT NULL,
  structured_data jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  interaction_id uuid REFERENCES public.interactions(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','dismissed')),
  suggested boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'capture' CHECK (source IN ('capture','stale_opportunity','manual','ask_memoire')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_user_idx ON public.accounts(user_id);
CREATE INDEX IF NOT EXISTS contacts_user_account_idx ON public.contacts(user_id, account_id);
CREATE INDEX IF NOT EXISTS opportunities_user_account_idx ON public.opportunities(user_id, account_id);
CREATE INDEX IF NOT EXISTS opportunities_last_touch_idx ON public.opportunities(last_touch_at DESC);
CREATE INDEX IF NOT EXISTS interactions_user_account_idx ON public.interactions(user_id, account_id);
CREATE INDEX IF NOT EXISTS actions_user_due_idx ON public.actions(user_id, due_date, status);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE POLICY "Users can manage own accounts" ON public.accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own contacts" ON public.contacts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own opportunities" ON public.opportunities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own interactions" ON public.interactions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own actions" ON public.actions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS accounts_touch_updated_at ON public.accounts;
CREATE TRIGGER accounts_touch_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS contacts_touch_updated_at ON public.contacts;
CREATE TRIGGER contacts_touch_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS opportunities_touch_updated_at ON public.opportunities;
CREATE TRIGGER opportunities_touch_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS actions_touch_updated_at ON public.actions;
CREATE TRIGGER actions_touch_updated_at
  BEFORE UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
