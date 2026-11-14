-- Add separate spaces without rewriting any legacy commercial records or policies.
CREATE TABLE public.memoire_personal_workspaces (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 80),
  copy_source_id uuid,
  copy_options text[] NOT NULL DEFAULT '{}' CHECK (copy_options <@ ARRAY['accounts','contacts','catalog','templates']::text[]),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, id),
  FOREIGN KEY (user_id, copy_source_id) REFERENCES public.memoire_personal_workspaces(user_id, id),
  CHECK (copy_source_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX memoire_personal_workspace_name ON public.memoire_personal_workspaces (user_id, lower(name));
ALTER TABLE public.memoire_personal_workspaces ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memoire_personal_workspaces FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.memoire_personal_workspaces TO authenticated;
CREATE POLICY memoire_personal_workspace_owner ON public.memoire_personal_workspaces
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE public.memoire_personal_workspace_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  workspace_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('accounts','contacts','catalog','templates')),
  account_id uuid,
  account_category text GENERATED ALWAYS AS ('accounts') STORED,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 200),
  details jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(details) = 'object' AND octet_length(details::text) <= 12000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, category, id),
  FOREIGN KEY (user_id, workspace_id) REFERENCES public.memoire_personal_workspaces(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, workspace_id, account_category, account_id)
    REFERENCES public.memoire_personal_workspace_records(user_id, workspace_id, category, id) ON DELETE CASCADE,
  CHECK ((category = 'contacts') = (account_id IS NOT NULL))
);
CREATE INDEX memoire_personal_record_account ON public.memoire_personal_workspace_records (user_id, workspace_id, account_id);
ALTER TABLE public.memoire_personal_workspace_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.memoire_personal_workspace_records FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.memoire_personal_workspace_records TO authenticated;
GRANT UPDATE (name, details, account_id) ON public.memoire_personal_workspace_records TO authenticated;
CREATE POLICY memoire_personal_record_owner ON public.memoire_personal_workspace_records
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id AND workspace_id::text = NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-memoire-workspace')
  WITH CHECK ((SELECT auth.uid()) = user_id AND workspace_id::text = NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-memoire-workspace');

CREATE FUNCTION public.memoire_create_personal_workspace(
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
        SELECT coalesce(jsonb_agg(item), '[]') INTO snapshot FROM (
          SELECT a.id, 'accounts' AS category, NULL::uuid AS account_id, btrim(coalesce(nullif(a.account_name, ''), a.name)) AS name,
            jsonb_strip_nulls(jsonb_build_object('industry', a.industry, 'location', a.location)) AS details
          FROM public.accounts a WHERE a.user_id = owner AND 'accounts' = ANY(options)
          UNION ALL
          SELECT c.id, 'contacts', a.id, btrim(c.name),
            jsonb_strip_nulls(jsonb_build_object('role', c.role_title, 'email', c.email, 'phone', c.phone))
          FROM public.stakeholders c JOIN public.accounts a ON a.user_id = c.user_id AND (
            a.id = c.account_id OR (c.account_id IS NULL AND lower(btrim(a.account_name)) = lower(btrim(c.account_name)) AND NOT EXISTS (
              SELECT 1 FROM public.accounts duplicate WHERE duplicate.user_id = a.user_id AND duplicate.id <> a.id
                AND lower(btrim(duplicate.account_name)) = lower(btrim(a.account_name)))))
          WHERE c.user_id = owner AND 'contacts' = ANY(options)
            AND nullif(btrim(coalesce(nullif(a.account_name, ''), a.name)), '') IS NOT NULL
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
REVOKE ALL ON FUNCTION public.memoire_create_personal_workspace(uuid,text,uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memoire_create_personal_workspace(uuid,text,uuid,text[]) TO authenticated;
