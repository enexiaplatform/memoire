-- M5: operator-confirmed temporal links and durations. Dates already owned by
-- Opportunity and Commitment are referenced, never copied into this table.
CREATE TABLE IF NOT EXISTS public.commercial_timing_assertions (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  requirement_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('target_anchor','duration','commitment_link')),
  basis text NOT NULL CHECK (char_length(btrim(basis)) BETWEEN 1 AND 1000),
  lifecycle text NOT NULL CHECK (lifecycle IN ('active','retired')),
  duration_days integer,
  duration_unit text,
  epistemic text,
  source_kind text,
  source_reference text,
  evidence_id text,
  commitment_id text,
  source_type text NOT NULL CHECK (source_type='manual'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at>=created_at),
  PRIMARY KEY (user_id,id),
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,requirement_id) REFERENCES public.commercial_outcome_requirements(user_id,id),
  FOREIGN KEY (user_id,evidence_id) REFERENCES public.commercial_evidence(user_id,id),
  FOREIGN KEY (user_id,commitment_id) REFERENCES public.commercial_commitments(user_id,id),
  CHECK (
    (kind='target_anchor' AND duration_days IS NULL AND duration_unit IS NULL AND epistemic IS NULL
      AND source_kind IS NULL AND source_reference IS NULL AND evidence_id IS NULL AND commitment_id IS NULL)
    OR (kind='commitment_link' AND commitment_id IS NOT NULL AND duration_days IS NULL AND duration_unit IS NULL
      AND epistemic IS NULL AND source_kind IS NULL AND source_reference IS NULL AND evidence_id IS NULL)
    OR (kind='duration' AND duration_days IS NOT NULL AND duration_days BETWEEN 0 AND 3650
      AND duration_unit IS NOT NULL AND duration_unit IN ('calendar_days','business_days')
      AND epistemic IS NOT NULL AND source_kind IS NOT NULL
      AND commitment_id IS NULL AND (
        (epistemic='assumed' AND source_kind='planning_assumption' AND source_reference IS NULL AND evidence_id IS NULL)
        OR (epistemic='supported' AND source_kind IN ('contract','customer_or_supplier','internal_sla')
          AND source_reference IS NOT NULL AND char_length(btrim(source_reference))>0)
      ))
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_timing_one_active_target_idx
  ON public.commercial_timing_assertions(user_id,opportunity_id) WHERE kind='target_anchor' AND lifecycle='active';
CREATE UNIQUE INDEX IF NOT EXISTS commercial_timing_active_commitment_link_idx
  ON public.commercial_timing_assertions(user_id,requirement_id,commitment_id)
  WHERE kind='commitment_link' AND lifecycle='active';
CREATE INDEX IF NOT EXISTS commercial_timing_assertions_user_opportunity_idx
  ON public.commercial_timing_assertions(user_id,opportunity_id,lifecycle,updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_timing_assertions_user_requirement_idx
  ON public.commercial_timing_assertions(user_id,requirement_id,kind,lifecycle);

CREATE OR REPLACE FUNCTION public.validate_commercial_timing_assertion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE requirement_record public.commercial_outcome_requirements%ROWTYPE;
BEGIN
  SELECT * INTO requirement_record FROM public.commercial_outcome_requirements r
    WHERE r.user_id=NEW.user_id AND r.id=NEW.requirement_id AND r.opportunity_id=NEW.opportunity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Timing Requirement must belong to this Opportunity and owner'; END IF;
  IF TG_OP='INSERT' AND requirement_record.lifecycle<>'active' THEN
    RAISE EXCEPTION 'Only active Requirements can receive new timing';
  END IF;
  IF TG_OP='INSERT' AND NEW.kind='target_anchor' AND requirement_record.role<>'required_now' THEN
    RAISE EXCEPTION 'Close target must anchor a required-now Requirement';
  END IF;
  IF NEW.commitment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_commitments c WHERE c.user_id=NEW.user_id AND c.id=NEW.commitment_id
      AND c.opportunity_id=NEW.opportunity_id::text AND c.account_id=requirement_record.account_id::text
  ) THEN RAISE EXCEPTION 'Timing Commitment scope mismatch'; END IF;
  IF NEW.evidence_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.commercial_evidence e WHERE e.user_id=NEW.user_id AND e.id=NEW.evidence_id
      AND e.account_id=requirement_record.account_id::text
      AND (e.opportunity_id IS NULL OR e.opportunity_id=NEW.opportunity_id::text)
  ) THEN RAISE EXCEPTION 'Timing Evidence scope mismatch'; END IF;
  IF TG_OP='UPDATE' AND ((NEW.user_id,NEW.id,NEW.opportunity_id,NEW.requirement_id,NEW.kind,NEW.basis,
    NEW.duration_days,NEW.duration_unit,NEW.epistemic,NEW.source_kind,NEW.source_reference,NEW.evidence_id,
    NEW.commitment_id,NEW.source_type,NEW.created_at)
    IS DISTINCT FROM (OLD.user_id,OLD.id,OLD.opportunity_id,OLD.requirement_id,OLD.kind,OLD.basis,
    OLD.duration_days,OLD.duration_unit,OLD.epistemic,OLD.source_kind,OLD.source_reference,OLD.evidence_id,
    OLD.commitment_id,OLD.source_type,OLD.created_at)
    OR NEW.updated_at<OLD.updated_at OR (OLD.lifecycle='retired' AND NEW IS DISTINCT FROM OLD)) THEN
    RAISE EXCEPTION 'Timing identity, basis and retired history cannot be rewritten';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_commercial_timing_assertion() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS validate_commercial_timing_assertion ON public.commercial_timing_assertions;
CREATE TRIGGER validate_commercial_timing_assertion BEFORE INSERT OR UPDATE ON public.commercial_timing_assertions
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_timing_assertion();

ALTER TABLE public.commercial_timing_assertions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS timing_read ON public.commercial_timing_assertions;
CREATE POLICY timing_read ON public.commercial_timing_assertions FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS timing_insert ON public.commercial_timing_assertions;
CREATE POLICY timing_insert ON public.commercial_timing_assertions FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS timing_update ON public.commercial_timing_assertions;
CREATE POLICY timing_update ON public.commercial_timing_assertions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON TABLE public.commercial_timing_assertions FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_timing_assertions TO authenticated;
