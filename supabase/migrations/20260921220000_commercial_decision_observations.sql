-- M11: immutable, cutoff-safe reviews of what was observed after a Decision.
-- These rows are learning artifacts and are deliberately outside State Revision
-- and Commercial Event derivations.
CREATE TABLE IF NOT EXISTS public.commercial_decision_observations (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL,
  opportunity_id uuid NOT NULL,
  decision_id text NOT NULL,
  observation_cutoff timestamptz NOT NULL,
  elapsed_days integer NOT NULL CHECK (elapsed_days>=0),
  snapshot jsonb NOT NULL,
  operator_note text NOT NULL DEFAULT '' CHECK (char_length(operator_note)<=2000),
  source_type text NOT NULL CHECK (source_type='manual'),
  finalized_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,decision_id) REFERENCES public.commercial_decisions(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,account_id) REFERENCES public.accounts(user_id,id),
  CHECK (observation_cutoff<=finalized_at AND created_at=finalized_at),
  CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'version'='1'
    AND snapshot->>'derivedWithCurrentRules'='true'
    AND jsonb_typeof(snapshot->'blockers')='array' AND jsonb_array_length(snapshot->'blockers')<=100
    AND jsonb_typeof(snapshot->'money')='array' AND jsonb_array_length(snapshot->'money')<=100
    AND jsonb_typeof(snapshot->'execution')='array' AND jsonb_array_length(snapshot->'execution')<=100
    AND jsonb_typeof(snapshot->'sourceRecordIds')='array' AND jsonb_array_length(snapshot->'sourceRecordIds')<=500
    AND octet_length(snapshot::text)<=262144)
);
CREATE INDEX IF NOT EXISTS commercial_decision_observations_user_decision_idx
  ON public.commercial_decision_observations(user_id,decision_id,elapsed_days,observation_cutoff,id);
CREATE INDEX IF NOT EXISTS commercial_decision_observations_user_recent_idx
  ON public.commercial_decision_observations(user_id,finalized_at DESC,id);

CREATE OR REPLACE FUNCTION public.validate_commercial_decision_observation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.commercial_decisions%ROWTYPE; item jsonb;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Finalized Decision Observation cannot be rewritten'; END IF;
    RETURN OLD;
  END IF;
  SELECT * INTO d FROM public.commercial_decisions WHERE user_id=NEW.user_id AND id=NEW.decision_id;
  IF NOT FOUND OR d.account_id<>NEW.account_id OR d.opportunity_id<>NEW.opportunity_id
    THEN RAISE EXCEPTION 'Decision Observation scope mismatch'; END IF;
  IF NEW.observation_cutoff<d.decided_at THEN RAISE EXCEPTION 'Observation cutoff precedes Decision'; END IF;
  IF NEW.elapsed_days<>floor(extract(epoch FROM (NEW.observation_cutoff-d.decided_at))/86400)::integer
    THEN RAISE EXCEPTION 'Observation horizon does not match cutoff'; END IF;
  IF NEW.snapshot->'opportunity'->>'id' IS DISTINCT FROM NEW.opportunity_id::text
    OR coalesce(NEW.snapshot->'target'->>'kind','') NOT IN ('requirement','forecast_claim','opportunity')
    OR coalesce(NEW.snapshot->'target'->>'state','') NOT IN ('resolved','unresolved','conflicted','retired','unavailable')
    THEN RAISE EXCEPTION 'Invalid observed target'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'execution') LOOP
    IF coalesce(item->>'kind','') NOT IN ('action','commitment') OR coalesce(item->>'state','') NOT IN ('linked','completed','open','cancelled','unavailable')
      THEN RAISE EXCEPTION 'Invalid observed execution'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(d.execution_links) link
      WHERE link->>'kind'=item->>'kind' AND link->>'recordId'=item->>'recordId' AND (link->>'linkedAt')::timestamptz<=NEW.observation_cutoff)
      THEN RAISE EXCEPTION 'Observed execution is not linked to Decision by cutoff'; END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_commercial_decision_observation() FROM PUBLIC,anon;
DROP TRIGGER IF EXISTS validate_commercial_decision_observation ON public.commercial_decision_observations;
CREATE TRIGGER validate_commercial_decision_observation BEFORE INSERT OR UPDATE ON public.commercial_decision_observations
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_decision_observation();
ALTER TABLE public.commercial_decision_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY decision_observations_read ON public.commercial_decision_observations FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY decision_observations_insert ON public.commercial_decision_observations FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY decision_observations_idempotent_update ON public.commercial_decision_observations FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON TABLE public.commercial_decision_observations FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_decision_observations TO authenticated;
