-- Read-only projection. Scope is applied by the existing Data API pre-request hook.
CREATE FUNCTION public.memoire_review_plan_status()
RETURNS TABLE (item_id text, proposal_id text, label text, plan_date text, completion_status text, activity_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id, p.payload->'reviewProposal'->>'proposalId', p.payload->>'label', p.payload->>'date',
    CASE
      WHEN p.payload->>'done' IS DISTINCT FROM 'true' THEN 'planned'
      WHEN confirmed.activity_id IS NOT NULL THEN 'verified_done'
      ELSE 'reported_done'
    END,
    confirmed.activity_id
  FROM public.plan_items AS p
  LEFT JOIN LATERAL (
    SELECT a.id AS activity_id
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
  WHERE p.user_id = auth.uid()
    AND p.payload->>'__deleted' IS DISTINCT FROM 'true'
    AND p.payload->>'dismissed' IS DISTINCT FROM 'true'
    AND p.payload->>'isSample' IS DISTINCT FROM 'true'
    AND p.payload->>'source' IS DISTINCT FROM 'demo'
    AND jsonb_typeof(p.payload->'reviewProposal'->'proposalId') = 'string'
    AND length(p.payload->'reviewProposal'->>'proposalId') BETWEEN 1 AND 300;
$$;
REVOKE ALL ON FUNCTION public.memoire_review_plan_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.memoire_review_plan_status() TO authenticated;
