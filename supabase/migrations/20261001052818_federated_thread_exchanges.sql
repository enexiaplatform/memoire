-- Immutable exchange issuance over an owner's existing thread. Received packets remain unaccepted M17 observations.
CREATE FUNCTION public.guard_federated_thread_publication() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE body jsonb; party jsonb; capsule jsonb; statement jsonb; key text; seen text[]:=ARRAY[]::text[];
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.event_type='federated_thread_issued' AND current_user IN ('authenticated','anon') THEN RAISE EXCEPTION 'Federated exchange cannot be deleted by clients'; END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' AND (OLD.event_type='federated_thread_issued' OR NEW.event_type='federated_thread_issued') THEN
  IF OLD.event_type='federated_thread_issued' AND (to_jsonb(NEW)-ARRAY['occurred_at','recorded_at','created_at'])=(to_jsonb(OLD)-ARRAY['occurred_at','recorded_at','created_at']) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Federated exchange content and identity are immutable';
 END IF;
 IF NEW.event_type<>'federated_thread_issued' THEN RETURN NEW; END IF;
 body:=NEW.structured_payload;
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(body))<>10 OR NOT body ?& ARRAY['format','version','exchangeId','issuedAt','issuer','recipient','thread','capsules','sample','authority']
  OR body->>'format' IS DISTINCT FROM 'memoire.federated-thread' OR body->'version' IS DISTINCT FROM '1'::jsonb OR body->>'exchangeId' IS NULL
  OR body->>'exchangeId' !~* '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR NEW.id IS DISTINCT FROM 'federated-thread:'||(body->>'exchangeId') OR NEW.idempotency_key IS DISTINCT FROM NEW.id OR NEW.source_id IS DISTINCT FROM body->>'exchangeId'
  OR NEW.source_type IS DISTINCT FROM 'manual' OR NEW.summary IS DISTINCT FROM 'Federated thread exchange issued' OR NEW.thread_id IS NULL OR char_length(NEW.thread_id) NOT BETWEEN 1 AND 200
  OR NEW.account_id IS NOT NULL OR NEW.opportunity_id IS NOT NULL OR NEW.commitment_id IS NOT NULL OR NEW.source_url IS NOT NULL OR NEW.source_updated_at IS NOT NULL
  OR NEW.occurred_at IS DISTINCT FROM NEW.recorded_at OR NEW.created_at IS DISTINCT FROM NEW.recorded_at OR body->'sample' IS DISTINCT FROM 'false'::jsonb
  OR body->'authority' IS DISTINCT FROM '{"kind":"issuer-declaration","recipientAccepted":false}'::jsonb OR char_length(body::text)>24000 OR octet_length(body::text)>131072
  OR jsonb_typeof(body->'capsules') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'capsules') NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'Invalid federated exchange envelope'; END IF;
 IF jsonb_typeof(body->'issuedAt') IS DISTINCT FROM 'string' OR body->>'issuedAt' !~ '^\d{4}-\d{2}-\d{2}T' THEN RAISE EXCEPTION 'Invalid exchange time'; END IF; PERFORM (body->>'issuedAt')::timestamptz;
 FOREACH key IN ARRAY ARRAY['issuer','recipient'] LOOP
  party:=body->key;
  IF jsonb_typeof(party) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(party))<>2 OR NOT party ?& ARRAY['reference','label']
   OR jsonb_typeof(party->'reference') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'reference')) NOT BETWEEN 1 AND 200
   OR jsonb_typeof(party->'label') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'label')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid exchange party'; END IF;
 END LOOP;
 IF body->'issuer'->>'reference'=body->'recipient'->>'reference' OR jsonb_typeof(body->'thread') IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(body->'thread'))<>2 OR NOT (body->'thread') ?& ARRAY['reference','objective']
  OR jsonb_typeof(body->'thread'->'reference') IS DISTINCT FROM 'string' OR char_length(btrim(body->'thread'->>'reference')) NOT BETWEEN 1 AND 200
  OR jsonb_typeof(body->'thread'->'objective') IS DISTINCT FROM 'string' OR char_length(btrim(body->'thread'->>'objective')) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid public thread reference or objective'; END IF;
 FOR capsule IN SELECT value FROM jsonb_array_elements(body->'capsules') LOOP
  statement:=capsule->'statement';
  IF jsonb_typeof(capsule) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(capsule))<>5 OR NOT capsule ?& ARRAY['format','version','statement','integrity','signature']
   OR capsule->>'format' IS DISTINCT FROM 'memoire.trust-capsule' OR capsule->'version' IS DISTINCT FROM '1'::jsonb OR capsule->'integrity'->>'algorithm' IS DISTINCT FROM 'SHA-256'
   OR capsule->'integrity'->>'digest' IS NULL OR capsule->'integrity'->>'digest' !~ '^[a-f0-9]{64}$'
   OR jsonb_typeof(statement) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(statement))<>11 OR NOT statement ?& ARRAY['format','version','statementId','issuedAt','issuer','recipient','commitmentRef','promise','sourceUpdatedAt','sample','authority']
   OR statement->>'format' IS DISTINCT FROM 'memoire.shared-commitment' OR statement->'version' IS DISTINCT FROM '1'::jsonb
   OR statement->'sample' IS DISTINCT FROM 'false'::jsonb OR statement->'authority' IS DISTINCT FROM '{"kind":"issuer-declaration","recipientAccepted":false}'::jsonb
   OR statement->>'statementId' IS NULL OR statement->>'statementId'=ANY(seen)
   OR NOT ((statement->'issuer'->>'reference'=body->'issuer'->>'reference' AND statement->'recipient'->>'reference'=body->'recipient'->>'reference')
     OR (statement->'issuer'->>'reference'=body->'recipient'->>'reference' AND statement->'recipient'->>'reference'=body->'issuer'->>'reference')) THEN RAISE EXCEPTION 'Invalid scoped capsule in federated exchange'; END IF;
  -- These remain issuer claims. Cryptographic checks happen in the shared domain before use, never confer RLS authority.
  seen:=array_append(seen,statement->>'statementId');
  IF jsonb_typeof(capsule->'integrity') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(capsule->'integrity'))<>2 OR NOT (capsule->'integrity') ?& ARRAY['algorithm','digest'] THEN RAISE EXCEPTION 'Invalid capsule integrity fields'; END IF;
  IF capsule->'signature'<>'null'::jsonb AND (jsonb_typeof(capsule->'signature') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(capsule->'signature'))<>3 OR NOT (capsule->'signature') ?& ARRAY['algorithm','publicKey','value']
   OR capsule->'signature'->>'algorithm' IS DISTINCT FROM 'ECDSA-P256-SHA256' OR jsonb_typeof(capsule->'signature'->'publicKey') IS DISTINCT FROM 'string' OR char_length(capsule->'signature'->>'publicKey') NOT BETWEEN 1 AND 300
   OR jsonb_typeof(capsule->'signature'->'value') IS DISTINCT FROM 'string' OR char_length(capsule->'signature'->>'value') NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Invalid capsule signature fields'; END IF;
  FOREACH key IN ARRAY ARRAY['issuer','recipient'] LOOP
   party:=statement->key;
   IF jsonb_typeof(party) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(party))<>2 OR NOT party ?& ARRAY['reference','label']
    OR jsonb_typeof(party->'reference') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'reference')) NOT BETWEEN 1 AND 200
    OR jsonb_typeof(party->'label') IS DISTINCT FROM 'string' OR char_length(btrim(party->>'label')) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid capsule party fields'; END IF;
  END LOOP;
  IF jsonb_typeof(statement->'promise') IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(statement->'promise'))<>5 OR NOT (statement->'promise') ?& ARRAY['responsiblePerson','text','dueDate','status','completionEvidence'] THEN RAISE EXCEPTION 'Invalid capsule promise fields'; END IF;
 END LOOP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_federated_thread_publication() FROM PUBLIC,anon;
CREATE TRIGGER guard_federated_thread_publication BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_events
 FOR EACH ROW EXECUTE FUNCTION public.guard_federated_thread_publication();
