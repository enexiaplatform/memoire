-- M7.2: the coverage row is the identity of one verified history lineage.
ALTER TABLE public.commercial_history_coverage ADD COLUMN IF NOT EXISTS lineage_id uuid;
UPDATE public.commercial_history_coverage SET lineage_id=gen_random_uuid() WHERE lineage_id IS NULL;
ALTER TABLE public.commercial_history_coverage ALTER COLUMN lineage_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commercial_history_coverage_lineage_idx
  ON public.commercial_history_coverage(user_id,lineage_id);

-- Historical derivations validate source metadata, including updated_at. Keep
-- the full accepted row in a snapshot while still deduping cosmetic-only saves.
CREATE OR REPLACE FUNCTION public.commercial_history_state(entity_type text, source_row jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
  RETURN source_row;
END;
$$;
REVOKE ALL ON FUNCTION public.commercial_history_state(text,jsonb) FROM PUBLIC, anon;

-- An unforgeable, transaction-scoped restore privilege. Clients cannot write it;
-- another transaction cannot see its uncommitted row.
CREATE TABLE IF NOT EXISTS public.commercial_history_restore_context (
  transaction_id bigint PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
);
REVOKE ALL ON public.commercial_history_restore_context FROM PUBLIC, anon, authenticated;
ALTER TABLE public.commercial_history_restore_context ENABLE ROW LEVEL SECURITY;

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
  INSERT INTO public.commercial_history_coverage(user_id,history_guaranteed_from,schema_version,lineage_id)
    VALUES(owner_id,at_time,1,gen_random_uuid());
  RETURN at_time;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_commercial_history_baseline(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.capture_commercial_state_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; record_id text; before_state jsonb; after_state jsonb; prior_no integer;
  prior_recorded timestamptz; at_time timestamptz;
BEGIN
  owner_id:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  record_id:=CASE WHEN TG_OP='DELETE' THEN OLD.id::text ELSE NEW.id::text END;
  IF EXISTS (SELECT 1 FROM public.commercial_history_restore_context
      WHERE transaction_id=pg_catalog.txid_current() AND user_id=owner_id) THEN
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF auth.uid() IS DISTINCT FROM owner_id
    AND pg_catalog.current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
    THEN RAISE EXCEPTION 'Historical mutation owner mismatch'; END IF;
  PERFORM public.ensure_commercial_history_baseline(owner_id);
  before_state:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE public.commercial_history_state(TG_TABLE_NAME,to_jsonb(OLD)) END;
  after_state:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE public.commercial_history_state(TG_TABLE_NAME,to_jsonb(NEW)) END;
  IF (before_state-'updated_at') IS NOT DISTINCT FROM (after_state-'updated_at')
    THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
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

-- payload: {user_id,format_version,exported_at,coverage,revisions,sources}.
-- sources contains complete arrays for exactly the covered canonical tables.
CREATE OR REPLACE FUNCTION public.restore_commercial_history(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE owner_id uuid; source_table text; source_row jsonb; source_id text; target_state jsonb; normal_state jsonb;
  existing_marker public.commercial_history_coverage%ROWTYPE; incoming_lineage uuid;
  incoming_boundary timestamptz; legacy boolean; existing_count bigint; incoming_count bigint;
  columns_sql text; set_sql text; row_count bigint; at_time timestamptz;
BEGIN
  owner_id:=auth.uid();
  IF owner_id IS NULL OR payload->>'user_id' IS DISTINCT FROM owner_id::text THEN
    RAISE EXCEPTION 'Historical restore requires the original authenticated workspace';
  END IF;
  IF (payload->>'format_version')::integer NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Unsupported historical backup format'; END IF;
  IF jsonb_typeof(payload->'sources') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing complete historical source set'; END IF;
  legacy:=payload->'coverage' IS NULL;
  IF NOT legacy AND (payload->'coverage'->>'user_id' IS DISTINCT FROM owner_id::text
      OR (payload->'coverage'->>'schema_version')::integer<>1
      OR jsonb_typeof(payload->'revisions') IS DISTINCT FROM 'array') THEN
    RAISE EXCEPTION 'Invalid historical coverage';
  END IF;
  IF NOT legacy THEN
    incoming_boundary:=(payload->'coverage'->>'history_guaranteed_from')::timestamptz;
    IF incoming_boundary IS NULL THEN RAISE EXCEPTION 'Missing history boundary'; END IF;
  END IF;
  incoming_lineage:=coalesce((payload->'coverage'->>'lineage_id')::uuid,
    pg_catalog.md5(owner_id::text||coalesce(payload->>'exported_at','')||
      coalesce((payload->'coverage')::text,'')||coalesce((payload->'revisions')::text,'')||
      (payload->'sources')::text)::uuid);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':commercial-history',0));

  CREATE TEMP TABLE restore_incoming_revisions (
    id uuid NOT NULL, user_id uuid NOT NULL, entity_type text NOT NULL, entity_id text NOT NULL,
    revision_no integer NOT NULL, mutation_id uuid NOT NULL, operation text NOT NULL,
    recorded_at timestamptz NOT NULL, schema_version integer NOT NULL, state jsonb
  ) ON COMMIT DROP;
  IF NOT legacy THEN
    INSERT INTO pg_temp.restore_incoming_revisions
      SELECT id,user_id,entity_type,entity_id,revision_no,mutation_id,operation,recorded_at,schema_version,state
      FROM pg_catalog.jsonb_to_recordset(payload->'revisions') AS r(
        id uuid,user_id uuid,entity_type text,entity_id text,revision_no integer,mutation_id uuid,
        operation text,recorded_at timestamptz,schema_version integer,state jsonb);
    IF EXISTS (SELECT 1 FROM pg_temp.restore_incoming_revisions WHERE user_id<>owner_id OR schema_version<>1
      OR entity_type NOT IN ('opportunities','commercial_conditions','commercial_evidence',
        'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments')
      OR revision_no<1 OR operation NOT IN ('baseline','create','update','delete')
      OR (operation='delete') IS DISTINCT FROM (state IS NULL) OR recorded_at<incoming_boundary
      OR (state IS NOT NULL AND (state->>'user_id' IS DISTINCT FROM owner_id::text
        OR state->>'id' IS DISTINCT FROM entity_id))
      OR (operation='baseline' AND revision_no<>1))
      OR EXISTS (SELECT 1 FROM pg_temp.restore_incoming_revisions GROUP BY id HAVING count(*)>1)
      OR EXISTS (SELECT 1 FROM pg_temp.restore_incoming_revisions GROUP BY mutation_id HAVING count(*)>1)
      OR EXISTS (SELECT 1 FROM (SELECT revision_no,operation,recorded_at,
        row_number() OVER (PARTITION BY entity_type,entity_id ORDER BY revision_no) AS expected,
        first_value(operation) OVER (PARTITION BY entity_type,entity_id ORDER BY revision_no) AS first_operation,
        lag(recorded_at) OVER (PARTITION BY entity_type,entity_id ORDER BY revision_no) AS prior_time
        FROM pg_temp.restore_incoming_revisions) x WHERE revision_no<>expected
          OR first_operation NOT IN ('baseline','create') OR recorded_at<prior_time)
      THEN RAISE EXCEPTION 'Invalid or incomplete historical revision sequence';
    END IF;
    IF EXISTS (SELECT 1 FROM public.commercial_state_revisions existing
      JOIN pg_temp.restore_incoming_revisions incoming ON incoming.id=existing.id
      WHERE existing.user_id<>owner_id)
      THEN RAISE EXCEPTION 'Historical revision identity belongs to another owner'; END IF;
  END IF;

  CREATE TEMP TABLE restore_incoming_sources (entity_type text NOT NULL,entity_id text NOT NULL,row_data jsonb NOT NULL)
    ON COMMIT DROP;
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
    IF jsonb_typeof(payload->'sources'->source_table) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Missing historical source %',source_table;
    END IF;
    FOR source_row IN SELECT value FROM pg_catalog.jsonb_array_elements(payload->'sources'->source_table) LOOP
      source_id:=source_row->>'id';
      IF source_id IS NULL OR source_row->>'user_id' IS DISTINCT FROM owner_id::text THEN
        RAISE EXCEPTION 'Historical source ownership or identity mismatch';
      END IF;
      INSERT INTO pg_temp.restore_incoming_sources VALUES(source_table,source_id,source_row);
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_temp.restore_incoming_sources GROUP BY entity_type,entity_id HAVING count(*)>1)
    THEN RAISE EXCEPTION 'Duplicate historical source identity'; END IF;
  -- SECURITY DEFINER must never turn a cross-owner primary-key collision into
  -- an update of someone else's row, even when the payload claims this owner.
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
    EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I t JOIN pg_temp.restore_incoming_sources s ON s.entity_type=$1 AND s.entity_id=t.id::text WHERE t.user_id<>$2',source_table)
      INTO row_count USING source_table,owner_id;
    IF row_count>0 THEN RAISE EXCEPTION 'Historical source identity belongs to another owner'; END IF;
  END LOOP;
  IF payload ? 'parents' THEN
    IF jsonb_typeof(payload->'parents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid restore parents'; END IF;
    IF EXISTS (SELECT 1 FROM public.accounts a JOIN pg_catalog.jsonb_array_elements(payload->'parents') p
      ON a.id::text=p->>'id' WHERE a.user_id<>owner_id)
      THEN RAISE EXCEPTION 'Restore parent identity belongs to another owner'; END IF;
  END IF;
  IF NOT legacy THEN
    IF EXISTS (SELECT 1 FROM pg_temp.restore_incoming_revisions r WHERE r.revision_no=(SELECT max(x.revision_no)
          FROM pg_temp.restore_incoming_revisions x WHERE x.entity_type=r.entity_type AND x.entity_id=r.entity_id)
        AND (r.state IS NULL) IS DISTINCT FROM (NOT EXISTS (SELECT 1 FROM pg_temp.restore_incoming_sources s
          WHERE s.entity_type=r.entity_type AND s.entity_id=r.entity_id)))
      THEN RAISE EXCEPTION 'Historical source state does not match last revision';
    END IF;
    FOR source_table,source_id,source_row IN SELECT entity_type,entity_id,row_data FROM pg_temp.restore_incoming_sources LOOP
      SELECT state INTO target_state FROM pg_temp.restore_incoming_revisions r
        WHERE r.entity_type=source_table AND r.entity_id=source_id ORDER BY revision_no DESC LIMIT 1;
      EXECUTE pg_catalog.format('SELECT to_jsonb(pg_catalog.jsonb_populate_record(null::public.%I,$1))',source_table)
        INTO normal_state USING source_row;
      EXECUTE pg_catalog.format('SELECT to_jsonb(pg_catalog.jsonb_populate_record(null::public.%I,$1))',source_table)
        INTO target_state USING target_state;
      IF target_state IS NULL OR (target_state-'updated_at') IS DISTINCT FROM (normal_state-'updated_at')
        THEN RAISE EXCEPTION 'Historical source state does not match last revision'; END IF;
    END LOOP;
  END IF;

  SELECT * INTO existing_marker FROM public.commercial_history_coverage WHERE user_id=owner_id;
  IF FOUND THEN
    IF existing_marker.lineage_id<>incoming_lineage THEN RETURN pg_catalog.jsonb_build_object('status','different_lineage'); END IF;
    IF legacy THEN
      -- A retry of a legacy restore is safe only if every covered row is identical.
      FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
        'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
        EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I WHERE user_id=$1',source_table) INTO existing_count USING owner_id;
        SELECT count(*) INTO incoming_count FROM pg_temp.restore_incoming_sources WHERE entity_type=source_table;
        IF existing_count<>incoming_count THEN RETURN pg_catalog.jsonb_build_object('status','diverged'); END IF;
        FOR source_row IN SELECT row_data FROM pg_temp.restore_incoming_sources WHERE entity_type=source_table LOOP
          EXECUTE pg_catalog.format('SELECT public.commercial_history_state($1,to_jsonb(t)) FROM public.%I t WHERE user_id=$2 AND id::text=$3',source_table)
            INTO target_state USING source_table,owner_id,source_row->>'id';
          EXECUTE pg_catalog.format('SELECT to_jsonb(pg_catalog.jsonb_populate_record(null::public.%I,$1))',source_table)
            INTO source_row USING source_row;
          IF (target_state-'updated_at') IS DISTINCT FROM (source_row-'updated_at')
            THEN RETURN pg_catalog.jsonb_build_object('status','diverged'); END IF;
        END LOOP;
      END LOOP;
      RETURN pg_catalog.jsonb_build_object('status','no_op','lineage_id',incoming_lineage);
    END IF;
    IF existing_marker.history_guaranteed_from<>incoming_boundary THEN
      RETURN pg_catalog.jsonb_build_object('status','diverged'); END IF;
    IF EXISTS (SELECT 1 FROM public.commercial_state_revisions current_revision WHERE user_id=owner_id AND NOT EXISTS (
      SELECT 1 FROM pg_temp.restore_incoming_revisions r WHERE r.id=current_revision.id
        AND r.mutation_id=current_revision.mutation_id AND r.entity_type=current_revision.entity_type
        AND r.entity_id=current_revision.entity_id AND r.revision_no=current_revision.revision_no
        AND r.operation=current_revision.operation AND r.recorded_at=current_revision.recorded_at
        AND r.schema_version=current_revision.schema_version AND r.state IS NOT DISTINCT FROM current_revision.state))
      THEN RETURN pg_catalog.jsonb_build_object('status','diverged'); END IF;
    -- The live cloud state must itself agree with its last accepted revision.
    FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
      'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
      FOR source_row IN EXECUTE pg_catalog.format('SELECT to_jsonb(t) FROM public.%I t WHERE user_id=$1',source_table) USING owner_id LOOP
        SELECT state INTO target_state FROM public.commercial_state_revisions r
          WHERE r.user_id=owner_id AND r.entity_type=source_table AND r.entity_id=source_row->>'id'
          ORDER BY revision_no DESC LIMIT 1;
        EXECUTE pg_catalog.format('SELECT to_jsonb(pg_catalog.jsonb_populate_record(null::public.%I,$1))',source_table)
          INTO target_state USING target_state;
        IF (target_state-'updated_at') IS DISTINCT FROM (source_row-'updated_at')
          THEN RETURN pg_catalog.jsonb_build_object('status','diverged'); END IF;
      END LOOP;
    END LOOP;
    SELECT count(*) INTO existing_count FROM public.commercial_state_revisions WHERE user_id=owner_id;
    SELECT count(*) INTO incoming_count FROM pg_temp.restore_incoming_revisions;
    IF existing_count=incoming_count THEN
      RETURN pg_catalog.jsonb_build_object('status','no_op','lineage_id',incoming_lineage);
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM public.commercial_state_revisions WHERE user_id=owner_id)
      THEN RETURN pg_catalog.jsonb_build_object('status','different_lineage'); END IF;
    FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
      'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments'] LOOP
      EXECUTE pg_catalog.format('SELECT count(*) FROM public.%I WHERE user_id=$1',source_table) INTO row_count USING owner_id;
      IF row_count>0 THEN RETURN pg_catalog.jsonb_build_object('status','different_lineage'); END IF;
    END LOOP;
  END IF;

  INSERT INTO public.commercial_history_restore_context(transaction_id,user_id)
    VALUES(pg_catalog.txid_current(),owner_id);
  -- Accounts are parent anchors. Insert only missing backup parents; existing
  -- account edits and unrelated records are never overwritten by history restore.
  IF payload ? 'parents' THEN
    IF jsonb_typeof(payload->'parents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid restore parents'; END IF;
    FOR source_row IN SELECT value FROM pg_catalog.jsonb_array_elements(payload->'parents') LOOP
      IF source_row->>'id' IS NULL OR source_row->>'user_id' IS DISTINCT FROM owner_id::text
        THEN RAISE EXCEPTION 'Restore parent ownership mismatch'; END IF;
      EXECUTE 'INSERT INTO public.accounts SELECT (pg_catalog.jsonb_populate_record(null::public.accounts,$1)).* ON CONFLICT (id) DO NOTHING'
        USING source_row;
    END LOOP;
  END IF;
  -- Upserts preserve parent IDs; deletion is child-first for records absent from the backup.
  FOREACH source_table IN ARRAY ARRAY['commercial_timing_assertions','commercial_dependencies',
    'commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_commitments','opportunities'] LOOP
    EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE user_id=$1 AND id::text NOT IN (SELECT entity_id FROM pg_temp.restore_incoming_sources WHERE entity_type=$2)',source_table)
      USING owner_id,source_table;
  END LOOP;
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_evidence','commercial_commitments',
    'commercial_conditions','commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions'] LOOP
    SELECT pg_catalog.string_agg(pg_catalog.format('%I=excluded.%I',attname,attname),',') INTO set_sql
      FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('public.'||source_table)
        AND attnum>0 AND NOT attisdropped AND attgenerated='';
    FOR source_row IN SELECT row_data FROM pg_temp.restore_incoming_sources WHERE entity_type=source_table LOOP
      EXECUTE pg_catalog.format('INSERT INTO public.%I SELECT (pg_catalog.jsonb_populate_record(null::public.%I,$1)).* ON CONFLICT (id) DO UPDATE SET %s',
        source_table,source_table,set_sql) USING source_row;
    END LOOP;
  END LOOP;
  IF legacy THEN
    at_time:=public.ensure_commercial_history_baseline(owner_id);
    UPDATE public.commercial_history_coverage SET lineage_id=incoming_lineage WHERE user_id=owner_id;
  ELSE
    INSERT INTO public.commercial_history_coverage(user_id,history_guaranteed_from,schema_version,lineage_id)
      VALUES(owner_id,incoming_boundary,1,incoming_lineage) ON CONFLICT (user_id) DO NOTHING;
    INSERT INTO public.commercial_state_revisions(id,user_id,entity_type,entity_id,revision_no,mutation_id,
      operation,recorded_at,schema_version,state)
      SELECT r.id,r.user_id,r.entity_type,r.entity_id,r.revision_no,r.mutation_id,r.operation,r.recorded_at,r.schema_version,r.state
      FROM pg_temp.restore_incoming_revisions r
      WHERE NOT EXISTS (SELECT 1 FROM public.commercial_state_revisions c WHERE c.id=r.id);
  END IF;
  DELETE FROM public.commercial_history_restore_context WHERE transaction_id=pg_catalog.txid_current();
  RETURN pg_catalog.jsonb_build_object('status','restored','lineage_id',incoming_lineage);
END;
$$;
REVOKE ALL ON FUNCTION public.restore_commercial_history(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_commercial_history(jsonb) TO authenticated;
