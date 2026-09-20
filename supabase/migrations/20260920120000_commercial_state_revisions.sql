-- M7.1: current tables remain canonical; these rows record accepted source state.
CREATE TABLE IF NOT EXISTS public.commercial_history_coverage (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  history_guaranteed_from timestamptz NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version=1)
);
CREATE TABLE IF NOT EXISTS public.commercial_state_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments')),
  entity_id text NOT NULL,
  revision_no integer NOT NULL CHECK (revision_no>0),
  mutation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  operation text NOT NULL CHECK (operation IN ('baseline','create','update','delete')),
  recorded_at timestamptz NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version=1),
  state jsonb,
  UNIQUE (user_id,entity_type,entity_id,revision_no),
  UNIQUE (user_id,mutation_id),
  CHECK ((operation='delete' AND state IS NULL) OR (operation<>'delete' AND state IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS commercial_state_revisions_user_cutoff_idx
  ON public.commercial_state_revisions(user_id,entity_type,entity_id,recorded_at DESC,revision_no DESC);
CREATE INDEX IF NOT EXISTS commercial_state_revisions_user_time_idx
  ON public.commercial_state_revisions(user_id,recorded_at DESC);
ALTER TABLE public.commercial_history_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_state_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_history_coverage_read ON public.commercial_history_coverage FOR SELECT TO authenticated
  USING ((SELECT auth.uid())=user_id);
CREATE POLICY commercial_state_revisions_read ON public.commercial_state_revisions FOR SELECT TO authenticated
  USING ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.commercial_history_coverage, public.commercial_state_revisions FROM anon, authenticated;
GRANT SELECT ON public.commercial_history_coverage, public.commercial_state_revisions TO authenticated;

CREATE OR REPLACE FUNCTION public.commercial_history_state(entity_type text, source_row jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  RETURN source_row-'updated_at';
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_history_state(text,jsonb) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.ensure_commercial_history_baseline(owner_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker timestamptz; at_time timestamptz; source_table text; source_row jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':commercial-history',0));
  SELECT history_guaranteed_from INTO marker FROM public.commercial_history_coverage WHERE user_id=owner_id;
  IF marker IS NOT NULL THEN RETURN marker; END IF;
  at_time:=pg_catalog.clock_timestamp();
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
    FOR source_row IN EXECUTE pg_catalog.format('SELECT to_jsonb(t) FROM public.%I t WHERE user_id=$1',source_table) USING owner_id LOOP
      INSERT INTO public.commercial_state_revisions(user_id,entity_type,entity_id,revision_no,operation,recorded_at,schema_version,state)
        VALUES(owner_id,source_table,source_row->>'id',1,'baseline',at_time,1,
          public.commercial_history_state(source_table,source_row));
    END LOOP;
  END LOOP;
  INSERT INTO public.commercial_history_coverage(user_id,history_guaranteed_from,schema_version) VALUES(owner_id,at_time,1);
  RETURN at_time;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_commercial_history_baseline(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_commercial_history() RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid;
BEGIN
  owner_id:=auth.uid();
  IF owner_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN public.ensure_commercial_history_baseline(owner_id);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_commercial_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_commercial_history() TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_commercial_state_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; record_id text; before_state jsonb; after_state jsonb; prior_no integer;
  prior_recorded timestamptz; at_time timestamptz;
BEGIN
  owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  record_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  IF auth.uid() IS DISTINCT FROM owner_id
    AND pg_catalog.current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
    THEN RAISE EXCEPTION 'Historical mutation owner mismatch'; END IF;
  PERFORM public.ensure_commercial_history_baseline(owner_id);
  before_state:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE public.commercial_history_state(TG_TABLE_NAME,to_jsonb(OLD)) END;
  after_state:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE public.commercial_history_state(TG_TABLE_NAME,to_jsonb(NEW)) END;
  IF before_state IS NOT DISTINCT FROM after_state THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
  SELECT revision_no,recorded_at INTO prior_no,prior_recorded FROM public.commercial_state_revisions
    WHERE user_id=owner_id AND entity_type=TG_TABLE_NAME AND entity_id=record_id
    ORDER BY revision_no DESC LIMIT 1;
  at_time:=greatest(pg_catalog.clock_timestamp(),prior_recorded+interval '1 microsecond');
  INSERT INTO public.commercial_state_revisions(user_id,entity_type,entity_id,revision_no,operation,recorded_at,schema_version,state)
    VALUES(owner_id,TG_TABLE_NAME,record_id,coalesce(prior_no,0)+1,
      CASE WHEN TG_OP='INSERT' THEN 'create' WHEN TG_OP='DELETE' THEN 'delete' ELSE 'update' END,
      at_time,1,after_state);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_commercial_state_revision() FROM PUBLIC, anon;
DO $$ DECLARE source_table text; BEGIN
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
    EXECUTE pg_catalog.format('DROP TRIGGER IF EXISTS capture_commercial_state_revision ON public.%I',source_table);
    EXECUTE pg_catalog.format('CREATE TRIGGER capture_commercial_state_revision BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.capture_commercial_state_revision()',source_table);
  END LOOP;
END $$;
