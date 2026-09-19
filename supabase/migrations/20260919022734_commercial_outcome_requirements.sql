-- M3: opportunity-local relevance gate. No answer is represented by NULL
-- condition_id; epistemic state remains owned by the linked Condition.
CREATE TABLE IF NOT EXISTS public.commercial_outcome_requirements (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  expected_outcome text NOT NULL CHECK (char_length(btrim(expected_outcome)) BETWEEN 1 AND 1000),
  question text CHECK (question IS NULL OR char_length(btrim(question)) BETWEEN 1 AND 1000),
  condition_id text,
  role text NOT NULL CHECK (role IN ('required_now','required_later','context')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('active','retired')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
  source_type text NOT NULL CHECK (source_type IN ('manual','capture','csv_import','system_rule','email','calendar','crm','erp')),
  source_id text, source_url text, source_updated_at timestamptz,
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,condition_id) REFERENCES public.commercial_conditions(user_id,id) ON DELETE SET NULL (condition_id)
);
CREATE OR REPLACE FUNCTION public.validate_requirement_scope() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.user_id=NEW.user_id AND o.id=NEW.opportunity_id
    AND (o.account_id IS NULL OR o.account_id=NEW.account_id)) THEN
    RAISE EXCEPTION 'Requirement opportunity/account mismatch';
  END IF;
  IF NEW.condition_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.commercial_conditions c
    WHERE c.user_id=NEW.user_id AND c.id=NEW.condition_id AND c.account_id=NEW.account_id
      AND (c.opportunity_id IS NULL OR c.opportunity_id=NEW.opportunity_id)) THEN
    RAISE EXCEPTION 'Requirement condition scope mismatch';
  END IF;
  IF TG_OP = 'UPDATE' AND ((NEW.user_id,NEW.id,NEW.account_id,NEW.opportunity_id,NEW.expected_outcome,
    NEW.question,NEW.created_at,NEW.source_type,NEW.source_id,NEW.source_url,NEW.source_updated_at)
    IS DISTINCT FROM (OLD.user_id,OLD.id,OLD.account_id,OLD.opportunity_id,OLD.expected_outcome,
    OLD.question,OLD.created_at,OLD.source_type,OLD.source_id,OLD.source_url,OLD.source_updated_at)
    OR NEW.updated_at < OLD.updated_at OR (OLD.lifecycle='retired' AND NEW IS DISTINCT FROM OLD)) THEN
    RAISE EXCEPTION 'Requirement identity and history cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_requirement_scope() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS validate_requirement_scope ON public.commercial_outcome_requirements;
CREATE TRIGGER validate_requirement_scope BEFORE INSERT OR UPDATE ON public.commercial_outcome_requirements
  FOR EACH ROW EXECUTE FUNCTION public.validate_requirement_scope();
ALTER TABLE public.commercial_outcome_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS requirements_read ON public.commercial_outcome_requirements;
CREATE POLICY requirements_read ON public.commercial_outcome_requirements FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS requirements_insert ON public.commercial_outcome_requirements;
CREATE POLICY requirements_insert ON public.commercial_outcome_requirements FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS requirements_update ON public.commercial_outcome_requirements;
CREATE POLICY requirements_update ON public.commercial_outcome_requirements FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON TABLE public.commercial_outcome_requirements FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_outcome_requirements TO authenticated;
CREATE INDEX IF NOT EXISTS commercial_outcome_requirements_user_opportunity_idx
  ON public.commercial_outcome_requirements(user_id,opportunity_id,lifecycle,role,updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_outcome_requirements_user_condition_idx
  ON public.commercial_outcome_requirements(user_id,condition_id) WHERE condition_id IS NOT NULL;
