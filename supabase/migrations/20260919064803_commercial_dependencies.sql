-- M4: explicitly justified same-Opportunity hard prerequisites only.
-- Direction: dependent_requirement_id requires prerequisite_requirement_id.
CREATE TABLE IF NOT EXISTS public.commercial_dependencies (
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL,
  dependent_requirement_id text NOT NULL,
  prerequisite_requirement_id text NOT NULL,
  basis text NOT NULL CHECK (char_length(btrim(basis)) BETWEEN 1 AND 1000),
  lifecycle text NOT NULL CHECK (lifecycle IN ('active','retired')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK (updated_at >= created_at),
  source_type text NOT NULL CHECK (source_type = 'manual'),
  source_id text, source_url text, source_updated_at timestamptz,
  PRIMARY KEY (user_id,id),
  CHECK (dependent_requirement_id <> prerequisite_requirement_id),
  FOREIGN KEY (user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,dependent_requirement_id) REFERENCES public.commercial_outcome_requirements(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY (user_id,prerequisite_requirement_id) REFERENCES public.commercial_outcome_requirements(user_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS commercial_dependencies_active_pair_idx
  ON public.commercial_dependencies(user_id,opportunity_id,dependent_requirement_id,prerequisite_requirement_id)
  WHERE lifecycle='active';
CREATE INDEX IF NOT EXISTS commercial_dependencies_user_opportunity_idx
  ON public.commercial_dependencies(user_id,opportunity_id,lifecycle,updated_at DESC);
CREATE INDEX IF NOT EXISTS commercial_dependencies_user_prerequisite_idx
  ON public.commercial_dependencies(user_id,prerequisite_requirement_id) WHERE lifecycle='active';

CREATE OR REPLACE FUNCTION public.validate_commercial_dependency() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE dependent_active boolean; prerequisite_active boolean;
BEGIN
  -- Serialize graph writes per owner/opportunity so two concurrent inserts
  -- cannot each accept one half of a cycle under separate snapshots.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(NEW.user_id::text || ':' || NEW.opportunity_id::text,0));
  SELECT r.lifecycle='active' INTO dependent_active FROM public.commercial_outcome_requirements r
    WHERE r.user_id=NEW.user_id AND r.id=NEW.dependent_requirement_id AND r.opportunity_id=NEW.opportunity_id;
  SELECT r.lifecycle='active' INTO prerequisite_active FROM public.commercial_outcome_requirements r
    WHERE r.user_id=NEW.user_id AND r.id=NEW.prerequisite_requirement_id AND r.opportunity_id=NEW.opportunity_id;
  IF dependent_active IS NULL OR prerequisite_active IS NULL THEN
    RAISE EXCEPTION 'Dependency endpoints must belong to the same opportunity and owner';
  END IF;
  IF TG_OP='INSERT' AND NEW.lifecycle='active' AND (NOT dependent_active OR NOT prerequisite_active) THEN
    RAISE EXCEPTION 'Only active requirements can receive new prerequisites';
  END IF;
  IF TG_OP='UPDATE' AND ((NEW.user_id,NEW.id,NEW.opportunity_id,NEW.dependent_requirement_id,
    NEW.prerequisite_requirement_id,NEW.basis,NEW.created_at,NEW.source_type,NEW.source_id,NEW.source_url,NEW.source_updated_at)
    IS DISTINCT FROM (OLD.user_id,OLD.id,OLD.opportunity_id,OLD.dependent_requirement_id,
    OLD.prerequisite_requirement_id,OLD.basis,OLD.created_at,OLD.source_type,OLD.source_id,OLD.source_url,OLD.source_updated_at)
    OR NEW.updated_at < OLD.updated_at OR (OLD.lifecycle='retired' AND NEW IS DISTINCT FROM OLD)) THEN
    RAISE EXCEPTION 'Dependency identity, provenance and retired history cannot be rewritten';
  END IF;
  IF NEW.lifecycle='active' AND dependent_active AND prerequisite_active AND EXISTS (
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.prerequisite_requirement_id
      UNION
      SELECT d.prerequisite_requirement_id FROM public.commercial_dependencies d
        JOIN ancestors a ON d.dependent_requirement_id=a.id
        JOIN public.commercial_outcome_requirements dr ON dr.user_id=d.user_id AND dr.id=d.dependent_requirement_id AND dr.lifecycle='active'
        JOIN public.commercial_outcome_requirements pr ON pr.user_id=d.user_id AND pr.id=d.prerequisite_requirement_id AND pr.lifecycle='active'
        WHERE d.user_id=NEW.user_id AND d.opportunity_id=NEW.opportunity_id AND d.lifecycle='active' AND d.id<>NEW.id
    ) SELECT 1 FROM ancestors WHERE id=NEW.dependent_requirement_id
  ) THEN RAISE EXCEPTION 'Hard prerequisite cycle is not allowed'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_commercial_dependency() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS validate_commercial_dependency ON public.commercial_dependencies;
CREATE TRIGGER validate_commercial_dependency BEFORE INSERT OR UPDATE ON public.commercial_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.validate_commercial_dependency();

ALTER TABLE public.commercial_dependencies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dependencies_read ON public.commercial_dependencies;
CREATE POLICY dependencies_read ON public.commercial_dependencies FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS dependencies_insert ON public.commercial_dependencies;
CREATE POLICY dependencies_insert ON public.commercial_dependencies FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
DROP POLICY IF EXISTS dependencies_update ON public.commercial_dependencies;
CREATE POLICY dependencies_update ON public.commercial_dependencies FOR UPDATE TO authenticated
  USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON TABLE public.commercial_dependencies FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.commercial_dependencies TO authenticated;

-- Legacy Evidence has no reliable party attribution. NULL means unknown;
-- only explicit future declarations can qualify as buyer-provided Evidence.
ALTER TABLE public.commercial_evidence ADD COLUMN IF NOT EXISTS provided_by text
  CHECK (provided_by IN ('customer','self','internal'));
