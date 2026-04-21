-- 1. Onboarding acknowledgment columns on profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_acknowledgment_version smallint DEFAULT 1;

-- 2. Deal Archive entity
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.entities(id) ON DELETE SET NULL, -- References Entites where type=contact
  -- Company/Customer is an attribute on the deal, NOT a separate FK
  -- This enforces Person-primary relationship model
  company_anonymized text,           -- e.g., "[global pharma, APAC]"
  company_label text,                -- private original, optional
  product_categories text[] NOT NULL DEFAULT '{}',  -- e.g., ['endotoxin testing','sterility kit']
  revenue_band text CHECK (revenue_band IN (
    'undisclosed','<$10K','$10-50K','$50-250K','$250K-$1M','>$1M'
  )),
  close_date date,
  outcome text NOT NULL DEFAULT 'in-progress' CHECK (outcome IN (
    'in-progress','won','lost','no-decision','archived'
  )),
  what_won text,                     -- free text
  what_almost_killed text,           -- objections / competitors
  lessons text,                      -- key learnings
  stakeholder_contact_ids uuid[] NOT NULL DEFAULT '{}',  -- additional contact IDs from entities table
  privacy_flag text NOT NULL DEFAULT 'personal' CHECK (privacy_flag IN (
    'personal','shareable'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS deals_user_id_idx ON public.deals(user_id);
CREATE INDEX IF NOT EXISTS deals_contact_id_idx ON public.deals(contact_id);
CREATE INDEX IF NOT EXISTS deals_close_date_idx ON public.deals(close_date DESC);
CREATE INDEX IF NOT EXISTS deals_outcome_idx ON public.deals(outcome);

-- 3. RLS policies
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own deals"
  ON public.deals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deals"
  ON public.deals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deals"
  ON public.deals FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deals"
  ON public.deals FOR DELETE
  USING (auth.uid() = user_id);

-- 4. updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER deals_touch_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
