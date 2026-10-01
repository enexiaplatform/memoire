-- Shared assessments are issuer-attributed immutable disclosure facts, not authority over another company's state.
CREATE FUNCTION public.guard_cross_company_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE body jsonb; federation jsonb; item jsonb; refs text[]:=ARRAY[]::text[]; pairs text[]:=ARRAY[]::text[]; pair text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.event_type='cross_company_state_issued' AND current_user IN ('authenticated','anon') THEN RAISE EXCEPTION 'Cross-company assessment cannot be deleted by clients'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.event_type='cross_company_state_issued' OR NEW.event_type='cross_company_state_issued') THEN
  IF OLD.event_type='cross_company_state_issued' AND (to_jsonb(NEW)-ARRAY['occurred_at','recorded_at','created_at'])=(to_jsonb(OLD)-ARRAY['occurred_at','recorded_at','created_at']) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Cross-company assessment content and identity are immutable';
 END IF;
 IF NEW.event_type<>'cross_company_state_issued' THEN RETURN NEW; END IF;
 body:=NEW.structured_payload; federation:=body->'federation';
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>8 OR NOT body ?& ARRAY['format','version','stateId','issuedAt','federation','requirements','dependencies','authority']
  OR body->>'format' IS DISTINCT FROM 'memoire.cross-company-state' OR body->'version' IS DISTINCT FROM '1'::jsonb OR body->>'stateId' IS NULL
  OR body->>'stateId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR NEW.id IS DISTINCT FROM 'cross-company-state:'||(body->>'stateId') OR NEW.idempotency_key IS DISTINCT FROM NEW.id OR NEW.source_id IS DISTINCT FROM body->>'stateId'
  OR NEW.summary IS DISTINCT FROM 'Cross-company assessment issued' OR NEW.source_type IS DISTINCT FROM 'manual' OR NEW.opportunity_id IS NULL OR char_length(NEW.opportunity_id) NOT BETWEEN 1 AND 200
  OR NEW.account_id IS NOT NULL OR NEW.thread_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.source_url IS NOT NULL OR NEW.source_updated_at IS NOT NULL
  OR NEW.occurred_at IS DISTINCT FROM NEW.recorded_at OR NEW.created_at IS DISTINCT FROM NEW.recorded_at
  OR body->'authority' IS DISTINCT FROM '{"kind":"issuer-local-assessment","recipientAccepted":false}'::jsonb OR char_length(body::text)>26000 OR octet_length(body::text)>131072
  OR jsonb_typeof(body->'requirements') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'requirements') NOT BETWEEN 2 AND 20
  OR jsonb_typeof(body->'dependencies') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'dependencies') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid cross-company assessment envelope'; END IF;
 IF jsonb_typeof(body->'issuedAt') IS DISTINCT FROM 'string' OR body->>'issuedAt' !~ '^\d{4}-\d{2}-\d{2}T' THEN RAISE EXCEPTION 'Invalid assessment time'; END IF; PERFORM (body->>'issuedAt')::timestamptz;
 IF jsonb_typeof(federation) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(federation))<>10 OR NOT federation ?& ARRAY['format','version','exchangeId','issuedAt','issuer','recipient','thread','capsules','sample','authority']
  OR federation->>'format' IS DISTINCT FROM 'memoire.federated-thread' OR federation->'version' IS DISTINCT FROM '1'::jsonb OR federation->'sample' IS DISTINCT FROM 'false'::jsonb
  OR federation->'authority' IS DISTINCT FROM '{"kind":"issuer-declaration","recipientAccepted":false}'::jsonb
  OR federation->'issuer'->>'reference' IS NULL OR federation->'recipient'->>'reference' IS NULL OR federation->'issuer'->>'reference'=federation->'recipient'->>'reference' THEN RAISE EXCEPTION 'Invalid assessment federation scope'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(body->'requirements') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>5 OR NOT item ?& ARRAY['reference','partyReference','expectedOutcome','localAssessment','commitmentRef']
   OR jsonb_typeof(item->'reference') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'reference')) NOT BETWEEN 1 AND 200 OR item->>'reference'=ANY(refs)
   OR item->>'partyReference' IS NULL OR item->>'partyReference' NOT IN (federation->'issuer'->>'reference',federation->'recipient'->>'reference')
   OR jsonb_typeof(item->'expectedOutcome') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'expectedOutcome')) NOT BETWEEN 1 AND 1000
   OR item->>'localAssessment' IS NULL OR item->>'localAssessment' NOT IN ('resolved','unresolved','conflicted') OR jsonb_typeof(item->'commitmentRef') NOT IN ('null','string') THEN RAISE EXCEPTION 'Invalid public requirement assessment'; END IF;
  IF item->>'commitmentRef' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(federation->'capsules') capsule WHERE capsule->'statement'->>'commitmentRef'=item->>'commitmentRef' AND capsule->'statement'->'issuer'->>'reference'=item->>'partyReference') THEN RAISE EXCEPTION 'Promise reference is outside selected party claims'; END IF;
  refs:=array_append(refs,item->>'reference');
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(body->'dependencies') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT item ?& ARRAY['dependentReference','prerequisiteReference','basis']
   OR item->>'dependentReference' IS NULL OR item->>'prerequisiteReference' IS NULL OR NOT item->>'dependentReference'=ANY(refs) OR NOT item->>'prerequisiteReference'=ANY(refs)
   OR item->>'dependentReference'=item->>'prerequisiteReference' OR jsonb_typeof(item->'basis') IS DISTINCT FROM 'string' OR char_length(btrim(item->>'basis')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid public dependency references'; END IF;
  pair:=jsonb_build_array(item->>'dependentReference',item->>'prerequisiteReference')::text;IF pair=ANY(pairs) THEN RAISE EXCEPTION 'Duplicate public dependency'; END IF;pairs:=array_append(pairs,pair);
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_cross_company_publication() FROM PUBLIC,anon;
CREATE TRIGGER guard_cross_company_publication BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_events
 FOR EACH ROW EXECUTE FUNCTION public.guard_cross_company_publication();
