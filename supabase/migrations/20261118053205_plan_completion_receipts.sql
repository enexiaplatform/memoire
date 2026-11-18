-- Additive: no pre-existing plan or activity rows are rewritten.
CREATE TABLE memoire_private.plan_completion_receipts (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  arguments jsonb NOT NULL,
  receipt_id uuid NOT NULL,
  record jsonb NOT NULL,
  actor_id uuid NOT NULL,
  committed_at timestamptz NOT NULL,
  PRIMARY KEY (user_id, request_id)
);
ALTER TABLE memoire_private.plan_completion_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON memoire_private.plan_completion_receipts FROM PUBLIC, anon, authenticated, service_role;

-- Old cached full-collection writes lack the receipt revision. Leave those
-- rows alone without rejecting the rest of the legacy batch.
CREATE FUNCTION memoire_private.protect_plan_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user <> 'authenticated' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.payload ? 'completionRevision' THEN RETURN NULL; END IF;
    RETURN OLD;
  END IF;
  IF NEW.payload->>'completionRevision' IS DISTINCT FROM OLD.payload->>'completionRevision' THEN
    RETURN NULL;
  END IF;
  IF OLD.payload ? 'completionRevision' AND (
    (NEW.user_id, NEW.id) IS DISTINCT FROM (OLD.user_id, OLD.id)
    OR NEW.updated_at <= OLD.updated_at
    OR NEW.payload->>'completionActivityId' IS DISTINCT FROM OLD.payload->>'completionActivityId'
  ) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.protect_plan_completion() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_plan_completion_update BEFORE UPDATE OR DELETE ON public.plan_items
  FOR EACH ROW EXECUTE FUNCTION memoire_private.protect_plan_completion();

CREATE FUNCTION memoire_private.plan_completion_source(p_owner uuid, p_key text) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  parts text[] := string_to_array(p_key, ':');
  source_id text := parts[2];
  due text := parts[3];
  slot text := parts[4];
BEGIN
  IF due IS NULL OR due !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN false; END IF;
  IF parts[1] = 'deal' AND cardinality(parts) = 3 THEN
    RETURN EXISTS (SELECT 1 FROM public.opportunities
      WHERE user_id=p_owner AND id::text=source_id AND next_action_date::text=due
        AND status='Active' FOR SHARE);
  ELSIF parts[1] = 'capture' AND cardinality(parts) = 4 THEN
    RETURN EXISTS (SELECT 1 FROM public.sales_activities
      WHERE user_id=p_owner AND id::text=source_id AND (
        (slot='main' AND due_date::text=due AND nullif(btrim(next_action),'') IS NOT NULL)
        OR (slot ~ '^n[0-9]{1,4}$' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(coalesce(next_actions,'[]'::jsonb)) WITH ORDINALITY AS a(item, position)
          WHERE 'n' || (a.position-1)::text=slot AND a.item->>'dueDate'=due
            AND nullif(btrim(a.item->>'title'),'') IS NOT NULL
        ))
      ) FOR SHARE);
  ELSIF parts[1] = 'obligation' AND cardinality(parts) = 3 THEN
    IF starts_with(source_id, 'obligation-pay-') THEN
      RETURN EXISTS (SELECT 1 FROM public.expenses WHERE user_id=p_owner
        AND id=substr(source_id,length('obligation-pay-')+1) AND payload->>'dueDate'=due
        AND payload->>'status'='Upcoming' AND payload->>'__deleted' IS DISTINCT FROM 'true' FOR SHARE);
    ELSIF starts_with(source_id, 'obligation-deliver-') THEN
      RETURN EXISTS (SELECT 1 FROM public.quotes WHERE user_id=p_owner
        AND id=substr(source_id,length('obligation-deliver-')+1) AND payload->>'expectedDeliveryDate'=due
        AND payload->>'poStatus'='Received' AND payload->>'deliveryStatus' IS DISTINCT FROM 'Delivered'
        AND payload->>'__deleted' IS DISTINCT FROM 'true' FOR SHARE);
    ELSIF starts_with(source_id, 'obligation-supplier-') THEN
      RETURN EXISTS (SELECT 1 FROM public.supplier_commitments WHERE user_id=p_owner
        AND id=substr(source_id,length('obligation-supplier-')+1) AND payload->>'dueDate'=due
        AND payload->>'status'='open' AND payload->>'party'='self'
        AND payload->>'__deleted' IS DISTINCT FROM 'true' FOR SHARE);
    END IF;
  END IF;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.plan_completion_source(uuid,text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.memoire_confirm_plan_completion(
  p_actor uuid, p_session uuid, p_workspace uuid, p_request uuid, p_activity uuid,
  p_plan_id text, p_derived_key text, p_expected text, p_label text, p_tag text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner_id uuid := p_actor;
  args jsonb := jsonb_build_array(p_activity,p_plan_id,p_derived_key,p_expected,p_label,p_tag);
  old_receipt memoire_private.plan_completion_receipts%ROWTYPE;
  plan public.plan_items%ROWTYPE;
  record jsonb;
  revision uuid;
  committed timestamptz;
  stamp text;
  version_at timestamptz;
  transitioned boolean := false;
  existing boolean;
BEGIN
  PERFORM 1 FROM auth.sessions WHERE id=p_session AND user_id=p_actor
    AND (not_after IS NULL OR not_after > clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unauthorized'); END IF;
  IF p_workspace IS NOT NULL THEN
    SELECT w.data_owner_id INTO owner_id FROM memoire_private.workspace_data_owners w
      WHERE w.owner_id=p_actor AND w.workspace_id=p_workspace AND w.activated_at IS NOT NULL FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','unavailable'); END IF;
  END IF;
  IF p_request IS NULL OR p_activity IS NULL OR p_plan_id IS NULL
    OR length(p_plan_id) NOT BETWEEN 1 AND 200 OR length(p_derived_key)>185
    OR length(p_expected)>80 OR length(p_label)>500 OR length(p_tag)>240 THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('plan-completion/request/'||owner_id||'/'||p_request,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('plan-completion/record/'||owner_id||'/'||p_plan_id,0));
  SELECT * INTO plan FROM public.plan_items WHERE user_id=owner_id AND id=p_plan_id FOR UPDATE;
  existing := FOUND;
  SELECT * INTO old_receipt FROM memoire_private.plan_completion_receipts WHERE user_id=owner_id AND request_id=p_request;
  IF FOUND THEN
    IF old_receipt.arguments IS DISTINCT FROM args OR old_receipt.actor_id <> p_actor THEN
      RETURN jsonb_build_object('status','conflict');
    END IF;
    RETURN jsonb_build_object('status','confirmed','receiptId',old_receipt.receipt_id,
      'committedAt',old_receipt.committed_at,'transitioned',false,
      'record',CASE WHEN (plan.payload->>'completionRevision')=old_receipt.receipt_id::text
        AND plan.payload->>'done'='true' AND plan.payload->>'__deleted' IS DISTINCT FROM 'true' THEN plan.payload END);
  END IF;

  PERFORM 1 FROM public.sales_activities WHERE user_id=owner_id AND id=p_activity FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','activity_unavailable'); END IF;
  IF (existing AND plan.payload->>'__deleted'='true')
    OR (NOT existing AND (p_expected IS NOT NULL OR p_derived_key IS NULL OR p_plan_id <> 'plan-done-'||p_derived_key))
    OR (existing AND p_derived_key IS NULL AND plan.payload->>'derivedKey' IS NOT NULL)
    OR (existing AND p_derived_key IS NOT NULL AND p_derived_key IS DISTINCT FROM plan.payload->>'derivedKey'
         AND NOT coalesce((plan.payload->'linkedDerivedKeys') ? p_derived_key,false)) THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;
  IF p_derived_key IS NOT NULL AND NOT memoire_private.plan_completion_source(owner_id,p_derived_key) THEN
    RETURN jsonb_build_object('status','conflict');
  END IF;

  IF plan.payload->>'done'='true' AND plan.payload->>'completionActivityId'=p_activity::text
     AND (plan.payload->>'completionRevision') ~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' THEN
    revision := (plan.payload->>'completionRevision')::uuid;
    SELECT r.committed_at INTO committed FROM memoire_private.plan_completion_receipts r
      WHERE r.user_id=owner_id AND r.receipt_id=revision LIMIT 1;
    IF FOUND THEN record := plan.payload; END IF;
  END IF;
  IF record IS NULL THEN
    IF (existing AND (plan.payload->>'updatedAt' IS DISTINCT FROM p_expected))
      OR (plan.payload->>'done'='true' AND plan.payload->>'completionActivityId' IS NOT NULL
        AND plan.payload->>'completionActivityId'<>p_activity::text) THEN
      RETURN jsonb_build_object('status','conflict');
    END IF;
    IF NOT existing AND (nullif(btrim(p_label),'') IS NULL OR p_tag IS NULL) THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    revision := gen_random_uuid();
    committed := date_trunc('milliseconds',clock_timestamp());
    version_at := greatest(committed, date_trunc('milliseconds',plan.updated_at) + interval '1 millisecond');
    stamp := to_char(version_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
    record := coalesce(plan.payload,jsonb_build_object(
      'id',p_plan_id,'label',p_label,'tag',p_tag,'date',split_part(p_derived_key,':',3),
      'derivedKey',p_derived_key,'createdAt',stamp,'source','user','isSample',false))
      || jsonb_build_object('id',p_plan_id,'updatedAt',stamp,'done',true,'completionActivityId',p_activity,
        'completionRevision',revision,'doneAt',CASE WHEN plan.payload->>'done'='true' THEN coalesce(plan.payload->>'doneAt',stamp) ELSE stamp END);
    IF existing THEN
      UPDATE public.plan_items SET payload=record,updated_at=version_at WHERE user_id=owner_id AND id=p_plan_id;
    ELSE
      INSERT INTO public.plan_items(user_id,id,payload,created_at,updated_at)
        VALUES(owner_id,p_plan_id,record,committed,version_at) ON CONFLICT (user_id,id) DO NOTHING;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
    END IF;
    transitioned := plan.payload->>'done' IS DISTINCT FROM 'true'
      OR plan.payload->>'completionActivityId' IS DISTINCT FROM p_activity::text;
  END IF;

  INSERT INTO memoire_private.plan_completion_receipts VALUES(owner_id,p_request,args,revision,record,p_actor,committed);
  RETURN jsonb_build_object('status','confirmed','receiptId',revision,'committedAt',committed,
    'transitioned',transitioned,'record',record);
END;
$$;
REVOKE ALL ON FUNCTION public.memoire_confirm_plan_completion(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memoire_confirm_plan_completion(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text)
  TO service_role;
CREATE INDEX plan_completion_receipts_transition_idx ON memoire_private.plan_completion_receipts(user_id, receipt_id);
