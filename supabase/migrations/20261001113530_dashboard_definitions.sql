-- Saved questions only. Results are evaluated under current workspace ownership.
CREATE TABLE public.dashboard_definitions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (payload->>'id' IS NOT NULL AND payload->>'id' = id),
  CHECK (payload->>'schemaVersion' IS NOT NULL AND payload->>'schemaVersion' = '1'),
  CHECK (payload->>'source' IS NOT NULL AND payload->>'source' = 'user'),
  CHECK (payload->'isSample' IS NOT NULL AND payload->'isSample' = 'false'::jsonb),
  CHECK (payload->'definition' IS NOT NULL AND jsonb_typeof(payload->'definition') = 'object'),
  CHECK (payload->'archived' IS NOT NULL AND jsonb_typeof(payload->'archived') = 'boolean'),
  CHECK (payload->>'version' IS NOT NULL AND (payload->>'version')::integer >= 1),
  CHECK (payload->'history' IS NOT NULL AND jsonb_typeof(payload->'history') = 'array'),
  CHECK (jsonb_array_length(payload->'history') = (payload->>'version')::integer - 1)
);
ALTER TABLE public.dashboard_definitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dashboard_definitions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.dashboard_definitions TO authenticated;
CREATE POLICY "Users can manage own dashboard definitions" ON public.dashboard_definitions
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX dashboard_definitions_user_updated_idx ON public.dashboard_definitions (user_id, updated_at DESC, id);
CREATE FUNCTION public.guard_dashboard_definition_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE old_version integer; index_no integer; old_state jsonb;
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.id <> OLD.id THEN RAISE EXCEPTION 'Dashboard ownership and identity cannot change'; END IF;
  IF NEW.payload = OLD.payload THEN RETURN NEW; END IF;
  old_version := (OLD.payload->>'version')::integer;
  old_state := OLD.payload - ARRAY['id','schemaVersion','version','createdAt','updatedAt','source','isSample','history'];
  IF (NEW.payload->>'version')::integer <= old_version
    OR NEW.payload->>'createdAt' IS DISTINCT FROM OLD.payload->>'createdAt'
    OR NEW.payload->'history'->(old_version - 1)->>'changedAt' IS DISTINCT FROM OLD.payload->>'updatedAt'
    OR NEW.payload->'history'->(old_version - 1)->'state' IS DISTINCT FROM old_state THEN
    RAISE EXCEPTION 'Dashboard sync conflict: reload and reconcile before saving';
  END IF;
  IF old_version > 1 THEN FOR index_no IN 0..old_version - 2 LOOP
    IF NEW.payload->'history'->index_no IS DISTINCT FROM OLD.payload->'history'->index_no THEN RAISE EXCEPTION 'Dashboard change history diverged'; END IF;
  END LOOP; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_dashboard_definition_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_dashboard_definition_revision BEFORE UPDATE ON public.dashboard_definitions FOR EACH ROW EXECUTE FUNCTION public.guard_dashboard_definition_revision();

-- Format 18 adds independent saved definitions, not a new covered history source.
DO $migration$
DECLARE definition text;
  old_guard text := $guard$!~ '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17)$'$guard$;
  new_guard text := $guard$!~ '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14|15|16|17|18)$'$guard$;
BEGIN
  definition := pg_get_functiondef('public.restore_commercial_history(jsonb)'::regprocedure);
  IF strpos(definition, old_guard) = 0 THEN RAISE EXCEPTION 'Dashboard backup upgrade requires the verified format-17 restore function'; END IF;
  EXECUTE replace(definition, old_guard, new_guard);
END;
$migration$;
