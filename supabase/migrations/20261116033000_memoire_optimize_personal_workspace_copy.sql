-- Resolve legacy contact links in one pass over the source accounts.
CREATE OR REPLACE FUNCTION public.memoire_create_personal_workspace(
  p_id uuid, p_name text, p_source_id uuid, p_options text[]
) RETURNS public.memoire_personal_workspaces
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  owner uuid := auth.uid();
  workspace public.memoire_personal_workspaces;
  options text[];
  previous_headers text := pg_catalog.current_setting('request.headers', true);
BEGIN
  IF owner IS NULL THEN RAISE EXCEPTION 'Sign in to create a workspace'; END IF;
  IF p_id IS NULL OR p_id = p_source_id OR p_name IS NULL OR lower(btrim(p_name)) = 'personal workspace' THEN
    RAISE EXCEPTION 'Choose a valid workspace name and identity';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_options, '{}')) AS selected(option)
      WHERE option IS NULL OR option NOT IN ('accounts','contacts','catalog','templates')) THEN
    RAISE EXCEPTION 'Unknown workspace copy option';
  END IF;
  SELECT coalesce(array_agg(DISTINCT option ORDER BY option), '{}') INTO options
  FROM unnest(coalesce(p_options, '{}') || CASE WHEN 'contacts' = ANY(p_options) THEN ARRAY['accounts'] ELSE '{}' END) AS selected(option);
  IF p_source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.memoire_personal_workspaces WHERE id = p_source_id AND user_id = owner
  ) THEN RAISE EXCEPTION 'Source workspace is unavailable'; END IF;

  INSERT INTO public.memoire_personal_workspaces (id, user_id, name, copy_source_id, copy_options)
  VALUES (p_id, owner, btrim(p_name), p_source_id, options)
  ON CONFLICT (id) DO NOTHING RETURNING * INTO workspace;
  IF NOT FOUND THEN
    SELECT * INTO workspace FROM public.memoire_personal_workspaces WHERE id = p_id AND user_id = owner;
    IF NOT FOUND OR (workspace.name, workspace.copy_source_id, workspace.copy_options)
      IS DISTINCT FROM (btrim(p_name), p_source_id, options) THEN RAISE EXCEPTION 'Workspace identity is already in use'; END IF;
    RETURN workspace;
  END IF;

  IF cardinality(options) > 0 THEN
    -- Read the selected source and insert into the destination within one SQL
    -- transaction. RLS checks the authenticated owner for both scopes.
    PERFORM pg_catalog.set_config('request.headers',
      jsonb_build_object('x-memoire-workspace', coalesce(p_source_id, p_id)::text)::text, true);
    DECLARE
      snapshot jsonb;
    BEGIN
      IF p_source_id IS NULL THEN
        WITH source_accounts AS MATERIALIZED (
          SELECT id, btrim(coalesce(nullif(account_name, ''), name)) AS name,
            lower(btrim(account_name)) AS match_name, industry, location
          FROM public.accounts WHERE user_id = owner AND 'accounts' = ANY(options)
        ), accounts_by_name AS (
          SELECT match_name, min(id::text)::uuid AS id
          FROM source_accounts WHERE match_name IS NOT NULL AND 'contacts' = ANY(options)
          GROUP BY match_name HAVING count(*) = 1
        ), source_contacts AS (
          SELECT c.id, coalesce(c.account_id, matched.id) AS account_id, btrim(c.name) AS name,
            jsonb_strip_nulls(jsonb_build_object('role', c.role_title, 'email', c.email, 'phone', c.phone)) AS details
          FROM public.stakeholders c
          LEFT JOIN accounts_by_name matched ON c.account_id IS NULL AND matched.match_name = lower(btrim(c.account_name))
          WHERE c.user_id = owner AND 'contacts' = ANY(options)
        )
        SELECT coalesce(jsonb_agg(item), '[]') INTO snapshot FROM (
          SELECT a.id, 'accounts' AS category, NULL::uuid AS account_id, a.name,
            jsonb_strip_nulls(jsonb_build_object('industry', a.industry, 'location', a.location)) AS details
          FROM source_accounts a
          UNION ALL
          SELECT c.id, 'contacts', a.id, c.name, c.details
          FROM source_contacts c JOIN source_accounts a ON a.id = c.account_id
          WHERE nullif(a.name, '') IS NOT NULL
        ) item WHERE nullif(item.name, '') IS NOT NULL;
        IF 'catalog' = ANY(options) THEN
          snapshot := snapshot || (SELECT coalesce(jsonb_agg(jsonb_build_object('category','catalog','name',btrim(payload->>'name'),
            'details',jsonb_build_object('kind',payload->>'kind','code',payload->>'code','description',payload->>'description'))), '[]')
            FROM public.portfolio_records WHERE user_id = owner AND payload->>'kind' IN ('unit','brand','group','product')
            AND payload->>'isSample' = 'false' AND payload->>'source' = 'user' AND nullif(btrim(payload->>'name'), '') IS NOT NULL);
        END IF;
        IF 'templates' = ANY(options) THEN
          snapshot := snapshot || (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category','templates','name',btrim(payload->'definition'->>'name'),
            'details', jsonb_build_object('kind','report','layout', ((payload->'definition') - ARRAY['filters','description']) || '{"filters":[],"description":""}'::jsonb))), '[]')
            FROM public.report_definitions WHERE user_id = owner AND payload->>'archived' = 'false' AND payload->>'isSample' = 'false'
            AND nullif(btrim(payload->'definition'->>'name'), '') IS NOT NULL);
          snapshot := snapshot || (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category','templates','name',btrim(payload->'definition'->>'name'),
            'details', jsonb_build_object('kind','dashboard','layout', ((payload->'definition') - ARRAY['filters','description']) || '{"filters":[],"description":""}'::jsonb))), '[]')
            FROM public.dashboard_definitions WHERE user_id = owner AND payload->>'archived' = 'false' AND payload->>'isSample' = 'false'
            AND nullif(btrim(payload->'definition'->>'name'), '') IS NOT NULL);
        END IF;
      ELSE
        SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'category',category, 'account_id',account_id, 'name',name, 'details',details)), '[]')
          INTO snapshot FROM public.memoire_personal_workspace_records
          WHERE user_id = owner AND workspace_id = p_source_id AND category = ANY(options);
      END IF;

      PERFORM pg_catalog.set_config('request.headers', jsonb_build_object('x-memoire-workspace', p_id::text)::text, true);
      WITH copied_rows AS MATERIALIZED (
        SELECT *, gen_random_uuid() AS destination_id
        FROM jsonb_to_recordset(snapshot) AS row(id text, category text, account_id text, name text, details jsonb)
      )
      INSERT INTO public.memoire_personal_workspace_records (id, user_id, workspace_id, category, account_id, name, details)
      SELECT row.destination_id, owner, p_id, row.category, account.destination_id, left(row.name, 200),
        CASE WHEN row.category = 'templates' AND row.details->>'kind' = 'dashboard' THEN
          jsonb_set(row.details, '{layout,widgets}', (
            SELECT coalesce(jsonb_agg(widget.value || jsonb_build_object('reportId', report.destination_id) ORDER BY widget.position), '[]')
            FROM jsonb_array_elements(row.details->'layout'->'widgets') WITH ORDINALITY AS widget(value, position)
            JOIN copied_rows report ON report.id = widget.value->>'reportId' AND report.category = 'templates' AND report.details->>'kind' = 'report'
          ))
        ELSE coalesce(row.details, '{}') END
      FROM copied_rows row LEFT JOIN copied_rows account ON account.category = 'accounts' AND account.id = row.account_id
      WHERE row.category <> 'contacts' OR account.destination_id IS NOT NULL;
    END;
  END IF;
  PERFORM pg_catalog.set_config('request.headers', coalesce(previous_headers, ''), true);
  RETURN workspace;
END;
$$;
