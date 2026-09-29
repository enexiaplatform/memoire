-- M15: explicit operational clause mapping; no legal interpretation engine.
CREATE TABLE public.commercial_contract_obligations (
 id text NOT NULL CHECK(char_length(id) BETWEEN 1 AND 200), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 opportunity_id uuid NOT NULL, version integer NOT NULL CHECK(version>=1),
 contract_reference text NOT NULL CHECK(char_length(btrim(contract_reference)) BETWEEN 1 AND 500),
 contract_version text NOT NULL CHECK(char_length(btrim(contract_version)) BETWEEN 1 AND 200),
 accepted_on date NOT NULL, acceptance_reference text NOT NULL CHECK(char_length(btrim(acceptance_reference)) BETWEEN 1 AND 1000),
 clause text NOT NULL CHECK(char_length(btrim(clause)) BETWEEN 1 AND 2000),
 requirement_id text NOT NULL, commitment_id text NOT NULL,
 revision_reason text NOT NULL CHECK(char_length(btrim(revision_reason)) BETWEEN 1 AND 2000),
 lifecycle text NOT NULL CHECK(lifecycle IN ('active','retired')), source_type text NOT NULL CHECK(source_type='manual'),
 created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
 CHECK(accepted_on<=(created_at AT TIME ZONE 'UTC')::date),
 PRIMARY KEY(user_id,id), FOREIGN KEY(user_id,opportunity_id) REFERENCES public.opportunities(user_id,id) ON DELETE CASCADE,
 FOREIGN KEY(user_id,requirement_id) REFERENCES public.commercial_outcome_requirements(user_id,id),
 FOREIGN KEY(user_id,commitment_id) REFERENCES public.commercial_commitments(user_id,id)
);
CREATE INDEX contract_obligations_opportunity_idx ON public.commercial_contract_obligations(user_id,opportunity_id,lifecycle,updated_at DESC,id);
CREATE INDEX contract_obligations_requirement_idx ON public.commercial_contract_obligations(user_id,requirement_id);
CREATE INDEX contract_obligations_commitment_idx ON public.commercial_contract_obligations(user_id,commitment_id);
ALTER TABLE public.commercial_contract_obligations ENABLE ROW LEVEL SECURITY;
CREATE POLICY obligations_read ON public.commercial_contract_obligations FOR SELECT TO authenticated USING ((SELECT auth.uid())=user_id);
CREATE POLICY obligations_insert ON public.commercial_contract_obligations FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid())=user_id);
CREATE POLICY obligations_update ON public.commercial_contract_obligations FOR UPDATE TO authenticated USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id);
REVOKE ALL ON public.commercial_contract_obligations FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.commercial_contract_obligations TO authenticated;
CREATE FUNCTION public.validate_contract_obligation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE restoring boolean; newly_linked boolean;
BEGIN
 restoring:=public.is_commercial_history_restore(NEW.user_id);
 IF NOT EXISTS(SELECT 1 FROM public.opportunities o JOIN public.commercial_outcome_requirements r ON r.user_id=o.user_id AND r.opportunity_id=o.id AND r.account_id=o.account_id
  JOIN public.commercial_commitments c ON c.user_id=o.user_id AND c.opportunity_id=o.id::text AND c.account_id=o.account_id::text
  WHERE o.user_id=NEW.user_id AND o.id=NEW.opportunity_id AND r.id=NEW.requirement_id AND c.id=NEW.commitment_id)
  THEN RAISE EXCEPTION 'Contract obligation scope mismatch'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF (NEW.user_id,NEW.id,NEW.opportunity_id,NEW.created_at,NEW.source_type,NEW.contract_reference,NEW.contract_version,NEW.accepted_on,NEW.acceptance_reference)
   IS DISTINCT FROM (OLD.user_id,OLD.id,OLD.opportunity_id,OLD.created_at,OLD.source_type,OLD.contract_reference,OLD.contract_version,OLD.accepted_on,OLD.acceptance_reference)
   OR NOT restoring AND (NEW.version<>OLD.version+1 OR NEW.updated_at<=OLD.updated_at) THEN RAISE EXCEPTION 'Contract obligation identity or version conflict'; END IF;
  newly_linked:=OLD.lifecycle='retired' OR NEW.requirement_id<>OLD.requirement_id OR NEW.commitment_id<>OLD.commitment_id;
 ELSE
  newly_linked:=NOT EXISTS(SELECT 1 FROM public.commercial_contract_obligations x WHERE x.user_id=NEW.user_id AND x.id=NEW.id AND x.requirement_id=NEW.requirement_id AND x.commitment_id=NEW.commitment_id AND x.lifecycle='active');
  IF NOT restoring AND NEW.version<>1 AND NOT EXISTS(SELECT 1 FROM public.commercial_contract_obligations x WHERE x.user_id=NEW.user_id AND x.id=NEW.id)
   THEN RAISE EXCEPTION 'New contract obligation starts at version 1'; END IF;
 END IF;
 IF NOT restoring AND newly_linked AND NEW.lifecycle='active' AND
  (NOT EXISTS(SELECT 1 FROM public.commercial_outcome_requirements r WHERE r.user_id=NEW.user_id AND r.id=NEW.requirement_id AND r.lifecycle='active')
   OR NOT EXISTS(SELECT 1 FROM public.commercial_commitments c WHERE c.user_id=NEW.user_id AND c.id=NEW.commitment_id AND c.status='open'))
  THEN RAISE EXCEPTION 'New contract link requires active Requirement and open Commitment'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_contract_obligation() FROM PUBLIC,anon;
CREATE TRIGGER validate_contract_obligation BEFORE INSERT OR UPDATE ON public.commercial_contract_obligations FOR EACH ROW EXECUTE FUNCTION public.validate_contract_obligation();
ALTER TABLE public.commercial_state_revisions DROP CONSTRAINT commercial_state_revisions_entity_type_check;
ALTER TABLE public.commercial_state_revisions ADD CONSTRAINT commercial_state_revisions_entity_type_check CHECK(entity_type IN (
 'opportunities','commercial_conditions','commercial_evidence','commercial_outcome_requirements','commercial_dependencies',
 'commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'));
CREATE TRIGGER capture_commercial_state_revision BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_contract_obligations
 FOR EACH ROW EXECUTE FUNCTION public.capture_commercial_state_revision();

CREATE OR REPLACE FUNCTION public.ensure_commercial_history_baseline(owner_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE marker timestamptz; at_time timestamptz; source_table text; source_row jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':commercial-history',0));
  SELECT history_guaranteed_from INTO marker FROM public.commercial_history_coverage WHERE user_id=owner_id;
  IF marker IS NOT NULL THEN RETURN marker; END IF;
  at_time:=pg_catalog.clock_timestamp();
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_conditions','commercial_evidence',
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
    FOR source_row IN EXECUTE pg_catalog.format('SELECT to_jsonb(t) FROM public.%I t WHERE user_id=$1',source_table) USING owner_id LOOP
      INSERT INTO public.commercial_state_revisions(user_id,entity_type,entity_id,revision_no,operation,recorded_at,schema_version,state)
        VALUES(owner_id,source_table,source_row->>'id',1,'baseline',at_time,1,public.commercial_history_state(source_table,source_row));
    END LOOP;
  END LOOP;
  INSERT INTO public.commercial_history_coverage(user_id,history_guaranteed_from,schema_version,lineage_id)
    VALUES(owner_id,at_time,1,gen_random_uuid());
  RETURN at_time;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_commercial_history_baseline(uuid) FROM PUBLIC, anon, authenticated;


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
  IF jsonb_typeof(payload->'format_version') IS DISTINCT FROM 'number' OR coalesce(payload->>'format_version','') !~ '^(1|2|3|4|5|6|7|8|9|10|11|12|13|14)$' THEN
    RAISE EXCEPTION 'Unsupported historical backup format'; END IF;
  IF jsonb_typeof(payload->'sources') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing complete historical source set'; END IF;
  legacy:=payload->'coverage' IS NULL OR payload->'coverage' = 'null'::jsonb;
  IF legacy AND (jsonb_typeof(payload->'revisions') IS DISTINCT FROM 'array' OR payload->'revisions' <> '[]'::jsonb) THEN
    RAISE EXCEPTION 'Cannot restore revisions without history coverage';
  END IF;
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
      (CASE WHEN (payload->>'format_version')::integer<12 THEN (payload->'sources')-ARRAY['commercial_policies','commercial_incidents','commercial_contract_obligations'] WHEN (payload->>'format_version')::integer<13 THEN (payload->'sources')-ARRAY['commercial_incidents','commercial_contract_obligations'] WHEN (payload->>'format_version')::integer<14 THEN (payload->'sources')-'commercial_contract_obligations' ELSE payload->'sources' END)::text)::uuid);
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
        'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations')
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
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
    IF source_table='commercial_contract_obligations' AND (payload->>'format_version')::integer<14 AND NOT (payload->'sources' ? source_table) THEN CONTINUE; END IF;
    IF source_table='commercial_incidents' AND (payload->>'format_version')::integer<13 AND NOT (payload->'sources' ? source_table) THEN CONTINUE; END IF;
    IF source_table='commercial_policies' AND (payload->>'format_version')::integer<12 AND NOT (payload->'sources' ? source_table) THEN CONTINUE; END IF;
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
    'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
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
  -- Quote parents are current-state anchors, never historical Quote assertions.
  IF payload ? 'quote_parents' THEN
    IF jsonb_typeof(restore_commercial_history.payload->'quote_parents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid Quote restore parents'; END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(restore_commercial_history.payload->'quote_parents') p
      WHERE p->>'id' IS NULL OR p->>'user_id' IS DISTINCT FROM owner_id::text
        OR jsonb_typeof(p->'payload') IS DISTINCT FROM 'object'
        OR p->'payload'->>'id' IS DISTINCT FROM p->>'id'
        OR NOT EXISTS (SELECT 1 FROM pg_temp.restore_incoming_sources s WHERE s.entity_type='commercial_money_gates'
          AND s.row_data->>'money_source_type'='quote_value' AND s.row_data->>'money_source_id'=p->>'id'
          AND s.row_data->>'opportunity_id'=p->'payload'->>'opportunityId'))
      OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(restore_commercial_history.payload->'quote_parents') p GROUP BY p->>'id' HAVING count(*)>1)
      THEN RAISE EXCEPTION 'Quote restore parent scope or identity mismatch'; END IF;
    IF EXISTS (SELECT 1 FROM public.quotes q JOIN pg_catalog.jsonb_array_elements(restore_commercial_history.payload->'quote_parents') p
      ON q.user_id=owner_id AND q.id=p->>'id' WHERE q.payload IS DISTINCT FROM p->'payload')
      THEN RAISE EXCEPTION 'Quote restore parent has diverged; current Quote was preserved'; END IF;
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
        'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
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
      'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
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
      'commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_commitments','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
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
  IF payload ? 'quote_parents' THEN
    FOR source_row IN SELECT value FROM pg_catalog.jsonb_array_elements(restore_commercial_history.payload->'quote_parents') LOOP
      INSERT INTO public.quotes SELECT (pg_catalog.jsonb_populate_record(null::public.quotes,source_row)).*
        ON CONFLICT (user_id,id) DO NOTHING;
    END LOOP;
  END IF;
  -- Upserts preserve parent IDs; deletion is child-first for records absent from the backup.
  FOREACH source_table IN ARRAY ARRAY['commercial_contract_obligations','commercial_incidents','commercial_money_gates','commercial_policies','commercial_timing_assertions','commercial_dependencies',
    'commercial_outcome_requirements','commercial_conditions','commercial_evidence','commercial_commitments','opportunities'] LOOP
    EXECUTE pg_catalog.format('DELETE FROM public.%I WHERE user_id=$1 AND id::text NOT IN (SELECT entity_id FROM pg_temp.restore_incoming_sources WHERE entity_type=$2)',source_table)
      USING owner_id,source_table;
  END LOOP;
  FOREACH source_table IN ARRAY ARRAY['opportunities','commercial_evidence','commercial_commitments',
    'commercial_conditions','commercial_outcome_requirements','commercial_dependencies','commercial_timing_assertions','commercial_money_gates','commercial_policies','commercial_incidents','commercial_contract_obligations'] LOOP
    SELECT pg_catalog.string_agg(pg_catalog.format('%I=excluded.%I',attname,attname),',') INTO set_sql
      FROM pg_catalog.pg_attribute WHERE attrelid=pg_catalog.to_regclass('public.'||source_table)
        AND attnum>0 AND NOT attisdropped AND attgenerated='';
    FOR source_row IN SELECT row_data FROM pg_temp.restore_incoming_sources WHERE entity_type=source_table LOOP
      EXECUTE pg_catalog.format('INSERT INTO public.%I SELECT (pg_catalog.jsonb_populate_record(null::public.%I,$1)).* ON CONFLICT (user_id,id) DO UPDATE SET %s',
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

