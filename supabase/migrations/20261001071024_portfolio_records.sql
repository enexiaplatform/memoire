-- Owner-only master data and primary classifications. BU is a reporting dimension,
-- never an authorization claim. Business facts remain in existing source tables.
CREATE TABLE public.portfolio_records (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (payload->>'id' IS NOT NULL AND payload->>'id' = id),
  CHECK (payload->>'schemaVersion' IS NOT NULL AND payload->>'schemaVersion' = '1'),
  CHECK (payload->>'kind' IS NOT NULL AND payload->>'kind' IN ('unit','brand','group','product','assignment')),
  CHECK (payload->>'source' IS NOT NULL AND payload->>'source' = 'user'),
  CHECK (payload->'isSample' IS NOT NULL AND payload->'isSample' = 'false'::jsonb),
  CHECK (payload->>'version' IS NOT NULL AND (payload->>'version')::integer >= 1),
  CHECK (payload->'history' IS NOT NULL AND jsonb_typeof(payload->'history') = 'array'),
  CHECK (jsonb_array_length(payload->'history') = (payload->>'version')::integer - 1)
);
ALTER TABLE public.portfolio_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.portfolio_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.portfolio_records TO authenticated;
CREATE POLICY "Users can manage own portfolio records" ON public.portfolio_records
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE INDEX portfolio_records_user_updated_idx ON public.portfolio_records (user_id, updated_at DESC, id);

-- Prevent an offline branch from overwriting a different accepted branch.
-- No privileged access; the existing owner policy still controls each write.
CREATE FUNCTION public.guard_portfolio_record_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE old_version integer; index_no integer; old_state jsonb;
BEGIN
  IF NEW.user_id <> OLD.user_id OR NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'Portfolio ownership and identity cannot change';
  END IF;
  IF NEW.payload = OLD.payload THEN RETURN NEW; END IF;
  old_version := (OLD.payload->>'version')::integer;
  old_state := OLD.payload - ARRAY['id','schemaVersion','version','createdAt','updatedAt','source','isSample','history'];
  IF (NEW.payload->>'version')::integer <= old_version
    OR NEW.payload->>'kind' IS DISTINCT FROM OLD.payload->>'kind'
    OR NEW.payload->>'createdAt' IS DISTINCT FROM OLD.payload->>'createdAt'
    OR NEW.payload->'history'->(old_version - 1)->>'changedAt' IS DISTINCT FROM OLD.payload->>'updatedAt'
    OR NEW.payload->'history'->(old_version - 1)->'state' IS DISTINCT FROM old_state THEN
    RAISE EXCEPTION 'Portfolio sync conflict: reload and reconcile before saving';
  END IF;
  IF old_version > 1 THEN
    FOR index_no IN 0..old_version - 2 LOOP
      IF NEW.payload->'history'->index_no IS DISTINCT FROM OLD.payload->'history'->index_no THEN
        RAISE EXCEPTION 'Portfolio change history diverged';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_portfolio_record_revision() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_portfolio_record_revision BEFORE UPDATE ON public.portfolio_records
  FOR EACH ROW EXECUTE FUNCTION public.guard_portfolio_record_revision();
