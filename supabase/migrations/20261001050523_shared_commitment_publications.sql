-- Issuance is an immutable disclosure Event over an existing promise, not a second mutable promise.
CREATE FUNCTION public.guard_shared_commitment_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE body jsonb; promise jsonb; party jsonb; key text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.event_type='shared_commitment_issued' AND current_user IN ('authenticated','anon') THEN RAISE EXCEPTION 'Shared statement cannot be deleted by clients'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.event_type='shared_commitment_issued' OR NEW.event_type='shared_commitment_issued') THEN
  IF OLD.event_type='shared_commitment_issued' AND (to_jsonb(NEW)-ARRAY['occurred_at','recorded_at','created_at'])=(to_jsonb(OLD)-ARRAY['occurred_at','recorded_at','created_at']) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Shared statement content and identity are immutable';
 END IF;
 IF NEW.event_type<>'shared_commitment_issued' THEN RETURN NEW; END IF;
 body:=NEW.structured_payload; promise:=body->'promise';
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR body->>'format' IS DISTINCT FROM 'memoire.shared-commitment' OR body->'version' IS DISTINCT FROM '1'::jsonb
  OR (SELECT count(*) FROM jsonb_object_keys(body))<>11 OR NOT body ?& ARRAY['format','version','statementId','issuedAt','issuer','recipient','commitmentRef','promise','sourceUpdatedAt','sample','authority']
  OR body->>'statementId' IS NULL OR body->>'statementId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR NEW.id IS DISTINCT FROM 'shared-commitment:'||(body->>'statementId') OR NEW.idempotency_key IS DISTINCT FROM NEW.id
  OR NEW.source_type IS DISTINCT FROM 'manual' OR NEW.source_id IS DISTINCT FROM body->>'statementId' OR NEW.summary IS DISTINCT FROM 'Shared promise statement issued'
  OR NEW.account_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.thread_id IS NOT NULL OR NEW.commitment_id IS NULL
  OR NEW.source_url IS NOT NULL OR NEW.source_updated_at IS NOT NULL OR NEW.occurred_at IS DISTINCT FROM NEW.recorded_at OR NEW.created_at IS DISTINCT FROM NEW.recorded_at
  OR body->'sample' IS DISTINCT FROM 'false'::jsonb OR body->'authority' IS DISTINCT FROM '{"kind":"issuer-declaration","recipientAccepted":false}'::jsonb
  OR octet_length(body::text)>32768 THEN RAISE EXCEPTION 'Invalid shared statement envelope'; END IF;
 FOREACH key IN ARRAY ARRAY['issuedAt','sourceUpdatedAt'] LOOP
  IF jsonb_typeof(body->key) IS DISTINCT FROM 'string' OR body->>key !~ '^\d{4}-\d{2}-\d{2}T' THEN RAISE EXCEPTION 'Invalid shared statement time'; END IF;
  PERFORM (body->>key)::timestamptz;
 END LOOP;
 FOREACH key IN ARRAY ARRAY['issuer','recipient'] LOOP
  party:=body->key;
  IF jsonb_typeof(party) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(party))<>2 OR NOT party ?& ARRAY['reference','label']
   OR jsonb_typeof(party->'reference') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'reference')) NOT BETWEEN 1 AND 200
   OR jsonb_typeof(party->'label') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'label')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid shared statement party'; END IF;
 END LOOP;
 IF body->'issuer'->>'reference'=body->'recipient'->>'reference' OR jsonb_typeof(body->'commitmentRef') IS DISTINCT FROM 'string' OR char_length(btrim(body->>'commitmentRef')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(promise) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(promise))<>5 OR NOT promise ?& ARRAY['responsiblePerson','text','dueDate','status','completionEvidence']
  OR jsonb_typeof(promise->'responsiblePerson') IS DISTINCT FROM 'string' OR char_length(btrim(promise->>'responsiblePerson')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(promise->'text') IS DISTINCT FROM 'string' OR char_length(btrim(promise->>'text')) NOT BETWEEN 1 AND 2000
  OR promise->>'status' IS NULL OR promise->>'status' NOT IN ('open','completed','cancelled')
  OR jsonb_typeof(promise->'dueDate') NOT IN ('null','string') OR jsonb_typeof(promise->'completionEvidence') NOT IN ('null','string') THEN RAISE EXCEPTION 'Invalid shared promise fields'; END IF;
 IF promise->>'dueDate' IS NOT NULL THEN
  IF promise->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid shared due date'; END IF;
  PERFORM (promise->>'dueDate')::date;
 END IF;
 IF promise->>'completionEvidence' IS NOT NULL AND (promise->>'status'<>'completed' OR char_length(btrim(promise->>'completionEvidence')) NOT BETWEEN 1 AND 2000) THEN RAISE EXCEPTION 'Invalid completion evidence disclosure'; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_shared_commitment_publication() FROM PUBLIC,anon;
CREATE TRIGGER guard_shared_commitment_publication BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_events
 FOR EACH ROW EXECUTE FUNCTION public.guard_shared_commitment_publication();
