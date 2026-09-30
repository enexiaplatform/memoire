-- Operational delivery state, never a commercial source or State Revision.
CREATE TABLE public.commercial_webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 endpoint_id text NOT NULL CHECK (endpoint_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
 target_hash text NOT NULL CHECK (target_hash ~ '^[a-f0-9]{64}$'),
 revision_id uuid NOT NULL REFERENCES public.commercial_state_revisions(id) ON DELETE CASCADE,
 notification jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivering','delivered','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, lease_until timestamptz,
 last_status integer CHECK(last_status BETWEEN 0 AND 599),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,endpoint_id,revision_id)
);
ALTER TABLE public.commercial_webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_webhook_owner_read ON public.commercial_webhook_deliveries FOR SELECT TO authenticated USING((SELECT auth.uid())=user_id);
REVOKE ALL ON public.commercial_webhook_deliveries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.commercial_webhook_deliveries TO authenticated;
CREATE INDEX commercial_webhook_pending_idx ON public.commercial_webhook_deliveries(user_id,endpoint_id,next_attempt_at) WHERE status IN ('pending','delivering');

CREATE FUNCTION public.claim_commercial_webhook_batch(p_owner uuid,p_endpoint text,p_target_hash text,p_since timestamptz)
RETURNS SETOF public.commercial_webhook_deliveries LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_owner IS NULL OR p_endpoint IS NULL OR p_endpoint !~ '^[a-zA-Z0-9_-]{1,64}$' OR p_target_hash IS NULL OR p_target_hash !~ '^[a-f0-9]{64}$' OR p_since IS NULL THEN RAISE EXCEPTION 'Invalid webhook configuration'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner::text||':'||p_endpoint,0));
 -- A changed URL needs a new endpoint ID: old queued disclosures must not silently change recipient.
 IF EXISTS(SELECT 1 FROM public.commercial_webhook_deliveries WHERE user_id=p_owner AND endpoint_id=p_endpoint AND target_hash<>p_target_hash) THEN RAISE EXCEPTION 'Webhook target changed'; END IF;
 INSERT INTO public.commercial_webhook_deliveries(user_id,endpoint_id,target_hash,revision_id,notification)
 SELECT r.user_id,p_endpoint,p_target_hash,r.id,jsonb_build_object('version',1,'id','memoire.change.v1:'||r.id,'type','commercial.state.changed',
  'recordedAt',r.recorded_at,'subject',jsonb_build_object('kind',CASE r.entity_type
   WHEN 'opportunities' THEN 'opportunity' WHEN 'commercial_conditions' THEN 'condition' WHEN 'commercial_evidence' THEN 'evidence'
   WHEN 'commercial_outcome_requirements' THEN 'requirement' WHEN 'commercial_dependencies' THEN 'dependency' WHEN 'commercial_timing_assertions' THEN 'timing'
   WHEN 'commercial_commitments' THEN 'commitment' WHEN 'commercial_money_gates' THEN 'money-gate' WHEN 'commercial_policies' THEN 'policy'
   WHEN 'commercial_incidents' THEN 'incident' WHEN 'commercial_contract_obligations' THEN 'contract-obligation' ELSE 'unknown' END,
   'id',r.entity_id,'revision',r.revision_no),'operation',r.operation)
 FROM public.commercial_state_revisions r WHERE r.user_id=p_owner AND r.recorded_at>=p_since AND r.operation<>'baseline'
 AND NOT EXISTS(SELECT 1 FROM public.commercial_webhook_deliveries d WHERE d.user_id=p_owner AND d.endpoint_id=p_endpoint AND d.revision_id=r.id)
 ORDER BY r.recorded_at,r.id LIMIT 100 ON CONFLICT(user_id,endpoint_id,revision_id) DO NOTHING;
 UPDATE public.commercial_webhook_deliveries SET status='failed',lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE user_id=p_owner AND endpoint_id=p_endpoint AND status='delivering' AND attempts>=8 AND lease_until<clock_timestamp();
 RETURN QUERY WITH candidates AS (
  SELECT id FROM public.commercial_webhook_deliveries WHERE user_id=p_owner AND endpoint_id=p_endpoint AND attempts<8
   AND ((status='pending' AND next_attempt_at<=clock_timestamp()) OR (status='delivering' AND lease_until<clock_timestamp()))
  ORDER BY next_attempt_at,id LIMIT 2 FOR UPDATE SKIP LOCKED
 ) UPDATE public.commercial_webhook_deliveries d SET status='delivering',attempts=attempts+1,lease_token=gen_random_uuid(),
  lease_until=clock_timestamp()+interval '2 minutes',updated_at=clock_timestamp() FROM candidates c WHERE d.id=c.id RETURNING d.*;
END;
$$;
CREATE FUNCTION public.finish_commercial_webhook_attempt(p_id uuid,p_lease uuid,p_status integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE affected integer;
BEGIN
 IF p_status IS NULL OR p_status NOT BETWEEN 0 AND 599 THEN RAISE EXCEPTION 'Invalid delivery result'; END IF;
 UPDATE public.commercial_webhook_deliveries SET
  status=CASE WHEN p_status BETWEEN 200 AND 299 THEN 'delivered' WHEN attempts>=8 OR (p_status BETWEEN 300 AND 499 AND p_status NOT IN(408,429)) THEN 'failed' ELSE 'pending' END,
  last_status=p_status,next_attempt_at=clock_timestamp()+least(3600,30*power(2,attempts-1)) * interval '1 second',
  lease_token=NULL,lease_until=NULL,updated_at=clock_timestamp()
 WHERE id=p_id AND lease_token=p_lease AND status='delivering';
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected=1;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_commercial_webhook_batch(uuid,text,text,timestamptz),public.finish_commercial_webhook_attempt(uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_commercial_webhook_batch(uuid,text,text,timestamptz),public.finish_commercial_webhook_attempt(uuid,uuid,integer) TO service_role;
