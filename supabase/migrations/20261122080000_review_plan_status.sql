-- Read-only projection. Scope is applied by the existing Data API pre-request hook.
CREATE FUNCTION public.memoire_review_plan_status()
RETURNS TABLE (item_id text, proposal_id text, label text, plan_date text, completion_status text,
  activity_id uuid, activity_evidence jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  effective_owner uuid := auth.uid();
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  selector text := nullif(current_setting('request.headers', true), '')::jsonb->>'x-memoire-data-workspace';
BEGIN
  -- The pre-request hook rewrites sub for a named workspace. Session ownership
  -- stays with the original login, and the selector must match the resolved owner.
  IF effective_owner IS NULL OR claims->>'role' IS DISTINCT FROM 'authenticated' OR NOT EXISTS (
    SELECT 1
    FROM auth.sessions AS s
    LEFT JOIN memoire_private.workspace_data_owners AS w ON w.data_owner_id = effective_owner
    WHERE s.id = CASE WHEN claims->>'session_id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        THEN (claims->>'session_id')::uuid END
      AND s.user_id = coalesce(w.owner_id, effective_owner)
      AND (s.not_after IS NULL OR s.not_after > statement_timestamp())
      AND ((selector IS NULL AND w.data_owner_id IS NULL)
        OR (selector = w.workspace_id::text AND w.activated_at IS NOT NULL))
  ) THEN
    RAISE EXCEPTION 'Review Plan status unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.payload->'reviewProposal'->>'proposalId', p.payload->>'label', p.payload->>'date',
    CASE
      WHEN p.payload->>'done' IS DISTINCT FROM 'true' THEN 'planned'
      WHEN confirmed.activity_id IS NOT NULL THEN 'verified_done'
      ELSE 'reported_done'
    END,
    confirmed.activity_id,
    CASE WHEN confirmed.activity_id IS NOT NULL THEN jsonb_build_object(
      'date', confirmed.activity_date, 'type', confirmed.activity_type, 'summary', confirmed.summary,
      'opportunity_id', o.id, 'opportunity_name', o.opportunity_name, 'outcome', outcome.evidence
    ) END
  FROM public.plan_items AS p
  LEFT JOIN LATERAL (
    SELECT a.id AS activity_id, a.activity_date, a.activity_type, a.summary, a.linked_opportunity_id
    FROM public.sales_activities AS a
    WHERE p.payload->>'done' = 'true'
      AND a.user_id = p.user_id
      AND a.id = CASE WHEN p.payload->>'completionActivityId' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
        THEN (p.payload->>'completionActivityId')::uuid END
      AND EXISTS (
        SELECT 1 FROM memoire_private.plan_completion_receipts AS r
        WHERE r.user_id = p.user_id
          AND r.receipt_id = CASE WHEN p.payload->>'completionRevision' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
            THEN (p.payload->>'completionRevision')::uuid END
          AND r.arguments->>0 = a.id::text
          AND r.arguments->>1 = p.id
      )
  ) AS confirmed ON true
  LEFT JOIN public.opportunities AS o ON o.user_id = p.user_id AND o.id = confirmed.linked_opportunity_id
  LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 AND max(r.payload->>'outcome') = o.status
        AND o.status IN ('Won', 'Lost') AND nullif(btrim(max(r.payload->>'reasonText')), '') IS NOT NULL
      THEN jsonb_build_object('result', max(r.payload->>'outcome'), 'date', max(r.payload->>'outcomeDate'),
        'reason', max(r.payload->>'reasonText'))
      END AS evidence
    FROM public.opportunity_outcomes AS r
    WHERE r.user_id = p.user_id
      AND r.payload->>'opportunityId' = o.id::text
      AND r.payload->>'__deleted' IS DISTINCT FROM 'true'
      AND r.payload->>'isSample' IS DISTINCT FROM 'true'
      AND r.payload->>'source' IS DISTINCT FROM 'demo'
      AND (p.payload->>'linkedOpportunityId' IS NULL OR p.payload->>'linkedOpportunityId' = o.id::text)
  ) AS outcome ON true
  WHERE p.user_id = effective_owner
    AND p.payload->>'__deleted' IS DISTINCT FROM 'true'
    AND p.payload->>'dismissed' IS DISTINCT FROM 'true'
    AND p.payload->>'isSample' IS DISTINCT FROM 'true'
    AND p.payload->>'source' IS DISTINCT FROM 'demo'
    AND jsonb_typeof(p.payload->'reviewProposal'->'proposalId') = 'string'
    AND length(p.payload->'reviewProposal'->>'proposalId') BETWEEN 1 AND 300;
END;
$$;
REVOKE ALL ON FUNCTION public.memoire_review_plan_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.memoire_review_plan_status() TO authenticated;
