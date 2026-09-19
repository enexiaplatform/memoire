-- M7: one row is the complete finalized Decision aggregate. Its basis and choice
-- never change; only append-only execution links may be added later.
CREATE TABLE IF NOT EXISTS public.commercial_decisions (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  question text NOT NULL CHECK (char_length(btrim(question)) BETWEEN 1 AND 500),
  context text NOT NULL CHECK (char_length(btrim(context)) BETWEEN 1 AND 2000),
  basis_snapshot jsonb NOT NULL,
  options jsonb NOT NULL,
  selected_option_id text NOT NULL,
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 1 AND 2000),
  expected_consequence text NOT NULL CHECK (char_length(btrim(expected_consequence)) BETWEEN 1 AND 1000),
  intervention jsonb NOT NULL,
  execution_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  supersedes_decision_id text,
  source_type text NOT NULL CHECK (source_type='manual'),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at>=created_at),
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id),
  FOREIGN KEY (user_id,supersedes_decision_id) REFERENCES public.commercial_decisions(user_id,id),
  CHECK (jsonb_typeof(basis_snapshot)='object' AND basis_snapshot->>'version'='1'
    AND jsonb_typeof(options)='array' AND jsonb_array_length(options) BETWEEN 1 AND 10
    AND jsonb_typeof(intervention)='object' AND jsonb_typeof(execution_links)='array'
    AND jsonb_array_length(execution_links)<=100
    AND octet_length(basis_snapshot::text)<=131072
    AND octet_length(options::text)<=32768),
  CHECK (supersedes_decision_id IS DISTINCT FROM id)
);
CREATE INDEX IF NOT EXISTS commercial_decisions_user_opportunity_idx
  ON public.commercial_decisions(user_id,opportunity_id,decided_at DESC,id);
CREATE INDEX IF NOT EXISTS commercial_decisions_user_recent_idx
  ON public.commercial_decisions(user_id,decided_at DESC,id);
CREATE INDEX IF NOT EXISTS commercial_decisions_user_supersedes_idx
  ON public.commercial_decisions(user_id,supersedes_decision_id) WHERE supersedes_decision_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_commercial_decision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE option_record jsonb; link_record jsonb; previous_count integer; link_position integer := 0; selected_count integer := 0; option_position integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.opportunities o WHERE o.user_id=NEW.user_id AND o.id=NEW.opportunity_id
    AND o.account_id=NEW.account_id) THEN RAISE EXCEPTION 'Decision Opportunity/Account scope mismatch'; END IF;
  IF NEW.supersedes_decision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_decisions d WHERE d.user_id=NEW.user_id AND d.id=NEW.supersedes_decision_id
      AND d.opportunity_id=NEW.opportunity_id AND d.account_id=NEW.account_id)
    THEN RAISE EXCEPTION 'Superseded Decision scope mismatch'; END IF;
  IF NEW.basis_snapshot->>'capturedAt' IS NULL OR jsonb_typeof(NEW.basis_snapshot->'forecast')<>'object'
    OR jsonb_typeof(NEW.basis_snapshot->'premises')<>'array'
    OR jsonb_typeof(NEW.basis_snapshot->'blockers')<>'array'
    OR jsonb_typeof(NEW.basis_snapshot->'openQuestions')<>'array'
    OR jsonb_typeof(NEW.basis_snapshot->'sourceRecordIds')<>'array'
    OR jsonb_array_length(NEW.basis_snapshot->'premises')>100
    OR jsonb_array_length(NEW.basis_snapshot->'blockers')>100
    OR jsonb_array_length(NEW.basis_snapshot->'openQuestions')>100
    OR jsonb_array_length(NEW.basis_snapshot->'sourceRecordIds')>250
    THEN RAISE EXCEPTION 'Decision basis is incomplete or unbounded'; END IF;
  FOR option_record IN SELECT value FROM jsonb_array_elements(NEW.options) LOOP
    option_position:=option_position+1;
    IF coalesce(btrim(option_record->>'id'),'')='' OR coalesce(btrim(option_record->>'label'),'')=''
      OR coalesce(btrim(option_record->>'interventionIntent'),'')=''
      OR coalesce(btrim(option_record->>'expectedConsequence'),'')=''
      OR option_record->>'order' IS DISTINCT FROM option_position::text
      THEN RAISE EXCEPTION 'Decision Option incomplete'; END IF;
    IF option_record->>'id'=NEW.selected_option_id THEN
      selected_count:=selected_count+1;
      IF NEW.intervention->>'intent' IS DISTINCT FROM option_record->>'interventionIntent'
        OR NEW.intervention->>'expectedChange' IS DISTINCT FROM option_record->>'expectedConsequence'
        OR NEW.expected_consequence IS DISTINCT FROM option_record->>'expectedConsequence'
        THEN RAISE EXCEPTION 'Selected Option and Intervention disagree'; END IF;
    END IF;
  END LOOP;
  IF selected_count<>1 OR (SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(NEW.options))<>jsonb_array_length(NEW.options)
    THEN RAISE EXCEPTION 'Exactly one unique Option must be selected'; END IF;
  IF coalesce(NEW.intervention->>'targetKind','') NOT IN ('requirement','forecast_claim','opportunity')
    OR btrim(coalesce(NEW.intervention->>'id',''))=''
    THEN RAISE EXCEPTION 'Invalid Intervention'; END IF;
  IF NEW.intervention->>'targetKind'='requirement' AND NOT EXISTS (
    SELECT 1 FROM public.commercial_outcome_requirements r WHERE r.user_id=NEW.user_id
      AND r.id=NEW.intervention->>'targetRequirementId' AND r.opportunity_id=NEW.opportunity_id)
    THEN RAISE EXCEPTION 'Intervention Requirement scope mismatch'; END IF;
  IF NEW.intervention->>'targetKind'<>'requirement' AND NEW.intervention->>'targetRequirementId' IS NOT NULL
    THEN RAISE EXCEPTION 'Unexpected Intervention Requirement'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(NEW.execution_links)) IS DISTINCT FROM
    (SELECT count(DISTINCT (value->>'kind')||':'||(value->>'recordId')) FROM jsonb_array_elements(NEW.execution_links))
    THEN RAISE EXCEPTION 'Execution links must be unique'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (NEW.user_id,NEW.id,NEW.account_id,NEW.opportunity_id,NEW.question,NEW.context,NEW.basis_snapshot,
      NEW.options,NEW.selected_option_id,NEW.rationale,NEW.expected_consequence,NEW.intervention,
      NEW.supersedes_decision_id,NEW.source_type,NEW.decided_at,NEW.created_at)
      IS DISTINCT FROM
      (OLD.user_id,OLD.id,OLD.account_id,OLD.opportunity_id,OLD.question,OLD.context,OLD.basis_snapshot,
      OLD.options,OLD.selected_option_id,OLD.rationale,OLD.expected_consequence,OLD.intervention,
      OLD.supersedes_decision_id,OLD.source_type,OLD.decided_at,OLD.created_at)
      OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Finalized Decision cannot be rewritten'; END IF;
    previous_count:=jsonb_array_length(OLD.execution_links);
    IF jsonb_array_length(NEW.execution_links)<previous_count THEN RAISE EXCEPTION 'Execution links are append-only'; END IF;
    FOR option_record IN SELECT value FROM jsonb_array_elements(OLD.execution_links) LOOP
      IF NEW.execution_links->link_position IS DISTINCT FROM option_record THEN RAISE EXCEPTION 'Execution links are append-only'; END IF;
      link_position:=link_position+1;
    END LOOP;
  END IF;
  FOR link_record IN SELECT value FROM jsonb_array_elements(NEW.execution_links) LOOP
    IF link_record->>'kind'='commitment' THEN
      IF NOT EXISTS (SELECT 1 FROM public.commercial_commitments c WHERE c.user_id=NEW.user_id AND c.id=link_record->>'recordId'
        AND c.opportunity_id=NEW.opportunity_id::text AND c.account_id=NEW.account_id::text)
        THEN RAISE EXCEPTION 'Execution Commitment scope mismatch'; END IF;
    ELSIF link_record->>'kind'='action' THEN
      IF NOT EXISTS (SELECT 1 FROM public.plan_items p WHERE p.user_id=NEW.user_id AND p.id=link_record->>'recordId'
        AND p.payload->>'linkedOpportunityId'=NEW.opportunity_id::text)
        THEN RAISE EXCEPTION 'Execution Plan action scope mismatch'; END IF;
    ELSE RAISE EXCEPTION 'Unknown execution link'; END IF;
    IF link_record->>'linkedAt' IS NULL THEN RAISE EXCEPTION 'Execution link timestamp missing'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_commercial_decision() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS validate_commercial_decision ON public.commercial_decisions;
CREATE TRIGGER validate_commercial_decision BEFORE INSERT OR UPDATE ON public.commercial_decisions
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_decision();
ALTER TABLE public.commercial_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY decisions_read ON public.commercial_decisions FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY decisions_insert ON public.commercial_decisions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY decisions_update ON public.commercial_decisions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON TABLE public.commercial_decisions FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_decisions TO authenticated;
