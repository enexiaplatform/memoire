-- M2: one canonical condition aggregate. Relationships are bounded, append-only
-- reference assessments in evidence_links; no duplicated evidence text.
-- No backfill: stage, MEDDIC and timestamps cannot manufacture commercial truth.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_owner_identity ON public.accounts(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS opportunities_owner_identity ON public.opportunities(user_id, id);

CREATE OR REPLACE FUNCTION public.valid_condition_evidence(links jsonb, owner_id uuid, account text, opportunity text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE link jsonb; seen text[] := '{}'; replaced text[] := '{}'; evidence_id text; old_id text;
BEGIN
  IF jsonb_typeof(links) <> 'array' OR jsonb_array_length(links) > 200 THEN RETURN false; END IF;
  FOR link IN SELECT value FROM jsonb_array_elements(links) LOOP
    evidence_id := link->>'evidenceId'; old_id := link->>'supersedesEvidenceId';
    IF jsonb_typeof(link) <> 'object' OR evidence_id IS NULL OR evidence_id = '' OR evidence_id = ANY(seen)
      OR coalesce(link->>'assessment', '') NOT IN ('supports','contradicts')
      OR coalesce(link->>'recordedAt','') !~ '^\d{4}-\d{2}-\d{2}T'
      OR (old_id IS NOT NULL AND (NOT old_id = ANY(seen) OR old_id = ANY(replaced))) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(link) AS field WHERE field NOT IN ('evidenceId','assessment','recordedAt','supersedesEvidenceId')) THEN RETURN false; END IF;
    PERFORM (link->>'recordedAt')::timestamptz;
    IF NOT EXISTS (SELECT 1 FROM public.commercial_evidence e WHERE e.user_id = owner_id AND e.id = evidence_id
      AND (e.account_id = account OR (e.account_id = '' AND opportunity IS NOT NULL AND e.opportunity_id = opportunity)) AND (e.opportunity_id IS NULL OR e.opportunity_id = opportunity)) THEN RETURN false; END IF;
    seen := array_append(seen, evidence_id);
    IF old_id IS NOT NULL THEN replaced := array_append(replaced, old_id); END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.valid_condition_evidence(jsonb, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.valid_condition_evidence(jsonb, uuid, text, text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.commercial_conditions (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  opportunity_id uuid,
  statement text NOT NULL CHECK (char_length(btrim(statement)) BETWEEN 1 AND 1000),
  condition_category text NOT NULL CHECK (condition_category IN ('commercial','technical','financial','decision','delivery','other')),
  intent text NOT NULL CHECK (intent IN ('assumed','hypothesis')),
  lifecycle text NOT NULL CHECK (lifecycle IN ('active','retired')),
  valid_from date,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
  source_type text NOT NULL CHECK (source_type IN ('manual','capture','csv_import','system_rule','email','calendar','crm','erp')),
  source_id text, source_url text, source_updated_at timestamptz,
  evidence_links jsonb NOT NULL DEFAULT '[]',
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  CHECK (public.valid_condition_evidence(evidence_links,user_id,account_id::text,opportunity_id::text))
);
ALTER TABLE public.commercial_conditions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conditions_read ON public.commercial_conditions;
CREATE POLICY conditions_read ON public.commercial_conditions FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS conditions_insert ON public.commercial_conditions;
CREATE POLICY conditions_insert ON public.commercial_conditions FOR INSERT TO authenticated WITH CHECK (
  (SELECT auth.uid()) = user_id AND (opportunity_id IS NULL OR EXISTS (
    SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id AND o.user_id = commercial_conditions.user_id
      AND (o.account_id IS NULL OR o.account_id = commercial_conditions.account_id))));
DROP POLICY IF EXISTS conditions_update ON public.commercial_conditions;
CREATE POLICY conditions_update ON public.commercial_conditions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
REVOKE ALL ON TABLE public.commercial_conditions FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_conditions TO authenticated;

-- Scope and proposition identity cannot be rewritten by bypassing the UI.
CREATE OR REPLACE FUNCTION public.protect_condition_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE i integer;
BEGIN
  IF (NEW.user_id, NEW.id, NEW.account_id, NEW.opportunity_id, NEW.statement, NEW.condition_category, NEW.created_at,
      NEW.source_type, NEW.source_id, NEW.source_url, NEW.source_updated_at, NEW.valid_from)
    IS DISTINCT FROM (OLD.user_id, OLD.id, OLD.account_id, OLD.opportunity_id, OLD.statement, OLD.condition_category, OLD.created_at,
      OLD.source_type, OLD.source_id, OLD.source_url, OLD.source_updated_at, OLD.valid_from)
    OR NEW.updated_at < OLD.updated_at OR jsonb_array_length(NEW.evidence_links) < jsonb_array_length(OLD.evidence_links)
    OR (OLD.lifecycle = 'retired' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Condition identity and retained history cannot be rewritten';
  END IF;
  FOR i IN 0..jsonb_array_length(OLD.evidence_links)-1 LOOP
    IF NEW.evidence_links->i IS DISTINCT FROM OLD.evidence_links->i THEN RAISE EXCEPTION 'Evidence assessments are append-only'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_condition_identity() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS protect_condition_identity ON public.commercial_conditions;
CREATE TRIGGER protect_condition_identity BEFORE UPDATE ON public.commercial_conditions FOR EACH ROW EXECUTE FUNCTION public.protect_condition_identity();
CREATE INDEX IF NOT EXISTS commercial_conditions_user_account_idx ON public.commercial_conditions(user_id,account_id,lifecycle);
CREATE INDEX IF NOT EXISTS commercial_conditions_user_opportunity_idx ON public.commercial_conditions(user_id,opportunity_id,lifecycle,updated_at DESC);
