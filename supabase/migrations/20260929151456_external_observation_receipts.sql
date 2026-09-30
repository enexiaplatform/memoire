-- M17 receipts describe ingestion, not accepted business events or State Revisions.
CREATE FUNCTION public.guard_external_observation_receipt() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE body jsonb;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.event_type='external_observation_received' AND current_user IN ('authenticated','anon') THEN RAISE EXCEPTION 'Source receipts cannot be deleted by clients'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.event_type='external_observation_received' OR NEW.event_type='external_observation_received') THEN
  IF OLD.event_type='external_observation_received' AND (to_jsonb(NEW)-ARRAY['occurred_at','recorded_at','created_at'])=(to_jsonb(OLD)-ARRAY['occurred_at','recorded_at','created_at']) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Source receipt content and identity are immutable';
 END IF;
 IF NEW.event_type<>'external_observation_received' THEN RETURN NEW; END IF;
 body:=NEW.structured_payload;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->'schemaVersion' IS DISTINCT FROM '1'::jsonb
  OR body->>'sourceKind' IS NULL OR body->>'sourceKind' NOT IN ('email','calendar','crm','erp','csv_import')
  OR NEW.id !~ '^observation:[a-f0-9]{64}$' OR NEW.idempotency_key IS DISTINCT FROM NEW.id
  OR NEW.source_type IS DISTINCT FROM body->>'sourceKind' OR NEW.source_id IS DISTINCT FROM body->>'sourceEventId'
  OR NEW.summary IS DISTINCT FROM 'Source observation received: '||(body->>'summary')
  OR NEW.account_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.thread_id IS NOT NULL OR NEW.commitment_id IS NOT NULL
  OR NEW.source_url IS NOT NULL OR NEW.source_updated_at IS NOT NULL
  OR NEW.occurred_at IS DISTINCT FROM NEW.recorded_at OR NEW.created_at IS DISTINCT FROM NEW.recorded_at
  OR octet_length(body::text)>131072 THEN RAISE EXCEPTION 'Invalid unaccepted source observation receipt'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(body))<>8 OR NOT body ?& ARRAY['schemaVersion','sourceKind','sourceNamespace','sourceEventId','sourceVersion','observedAt','summary','rawText']
  OR jsonb_typeof(body->'sourceNamespace') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'sourceNamespace')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(body->'sourceEventId') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'sourceEventId')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(body->'sourceVersion') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'sourceVersion')) NOT BETWEEN 1 AND 100
  OR jsonb_typeof(body->'summary') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'summary')) NOT BETWEEN 1 AND 500
  OR jsonb_typeof(body->'rawText') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'rawText')) NOT BETWEEN 1 AND 20000
  OR jsonb_typeof(body->'observedAt') NOT IN ('null','string') THEN RAISE EXCEPTION 'Invalid source observation fields'; END IF;
 IF body->>'observedAt' IS NOT NULL THEN PERFORM (body->>'observedAt')::timestamptz; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_external_observation_receipt() FROM PUBLIC,anon;
CREATE TRIGGER guard_external_observation_receipt BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_events
 FOR EACH ROW EXECUTE FUNCTION public.guard_external_observation_receipt();
CREATE UNIQUE INDEX external_observation_source_identity_idx ON public.commercial_events(user_id,
 (structured_payload->>'sourceKind'),(structured_payload->>'sourceNamespace'),(structured_payload->>'sourceEventId'),(structured_payload->>'sourceVersion'))
 WHERE event_type='external_observation_received';
