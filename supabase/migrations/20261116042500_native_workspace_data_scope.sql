-- Resolve a named workspace to an internal data owner. The login subject stays
-- in Auth and remains the owner of the workspace directory and account settings.
CREATE SCHEMA IF NOT EXISTS memoire_private;
REVOKE ALL ON SCHEMA memoire_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA memoire_private TO anon, authenticated, service_role;

CREATE TABLE memoire_private.workspace_data_owners (
  owner_id uuid NOT NULL,
  workspace_id uuid PRIMARY KEY,
  data_owner_id uuid UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  FOREIGN KEY (owner_id, workspace_id)
    REFERENCES public.memoire_personal_workspaces(user_id, id) ON DELETE CASCADE,
  CHECK (data_owner_id <> owner_id)
);
ALTER TABLE memoire_private.workspace_data_owners ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE memoire_private.workspace_data_owners FROM PUBLIC, anon, authenticated;

-- An activated workspace is provisioned before the full app is mounted. A
-- nonempty selection that cannot be resolved fails closed instead of using
-- Personal workspace. All changes to claims are transaction-local.
CREATE FUNCTION memoire_private.apply_workspace_data_scope() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  selected text := headers->>'x-memoire-data-workspace';
  login_id uuid := auth.uid();
  scoped_id uuid;
BEGIN
  IF selected IS NULL THEN RETURN; END IF;
  IF claims->>'role' IS DISTINCT FROM 'authenticated' OR login_id IS NULL
    OR selected !~ '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR headers ? 'x-memoire-workspace'
    OR coalesce(current_setting('request.path', true), '') IN (
      '/memoire_personal_workspaces', '/memoire_personal_workspace_records',
      '/rpc/memoire_create_personal_workspace', '/rpc/memoire_get_native_workspace_scope',
      '/rpc/memoire_prepare_native_workspace', '/rpc/memoire_create_native_workspace'
    ) THEN
    RAISE EXCEPTION 'Workspace access unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT data_owner_id INTO scoped_id FROM memoire_private.workspace_data_owners
    WHERE workspace_id = selected::uuid AND owner_id = login_id AND activated_at IS NOT NULL;
  IF scoped_id IS NULL THEN
    RAISE EXCEPTION 'Workspace access unavailable' USING ERRCODE = '42501';
  END IF;
  -- A second explicit apply cannot switch to a different scope.
  PERFORM set_config('request.jwt.claims', jsonb_set(claims, '{sub}', to_jsonb(scoped_id::text))::text, true);
  PERFORM set_config('request.jwt.claim.sub', scoped_id::text, true);
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.apply_workspace_data_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION memoire_private.apply_workspace_data_scope() TO anon, authenticated, service_role;

CREATE FUNCTION public.memoire_get_native_workspace_scope(p_workspace uuid)
RETURNS TABLE (data_owner_id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT link.data_owner_id, space.name
  FROM memoire_private.workspace_data_owners AS link
  JOIN public.memoire_personal_workspaces AS space ON (space.user_id, space.id) = (link.owner_id, link.workspace_id)
  WHERE link.owner_id = auth.uid() AND link.workspace_id = p_workspace AND link.activated_at IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.memoire_get_native_workspace_scope(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memoire_get_native_workspace_scope(uuid) TO authenticated;

-- The browser and API verify that the requested scope really reached PostgreSQL
-- before mounting or serving native features. This also detects missing hook configuration.
CREATE FUNCTION public.memoire_active_data_owner() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION public.memoire_active_data_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memoire_active_data_owner() TO authenticated;

-- The Data API hook is installed separately when every app route and server
-- command has been migrated and the hosted compatibility checks have passed.

-- Upgrade the existing selective-copy records in one transaction. The original
-- copy serves as a recovery source. A failed import does not activate the space.
CREATE FUNCTION public.memoire_prepare_native_workspace(p_workspace uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  login_id uuid := auth.uid();
  original public.memoire_personal_workspaces%ROWTYPE;
  data_id uuid;
BEGIN
  IF login_id IS NULL THEN RAISE EXCEPTION 'Workspace access unavailable' USING ERRCODE = '42501'; END IF;
  SELECT * INTO original FROM public.memoire_personal_workspaces
    WHERE user_id = login_id AND id = p_workspace FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workspace access unavailable' USING ERRCODE = '42501'; END IF;

  SELECT data_owner_id INTO data_id FROM memoire_private.workspace_data_owners
    WHERE owner_id = login_id AND workspace_id = p_workspace AND activated_at IS NOT NULL;
  IF data_id IS NOT NULL THEN RETURN data_id; END IF;

  IF EXISTS (SELECT 1 FROM public.memoire_personal_workspace_records
    WHERE user_id = login_id AND workspace_id = p_workspace AND category NOT IN ('accounts','contacts','catalog','templates'))
  THEN RAISE EXCEPTION 'Workspace contains commercial records pending native conversion' USING ERRCODE = '22023'; END IF;

  data_id := gen_random_uuid();
  INSERT INTO auth.users (id, email, aud, role, banned_until, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (data_id, 'workspace-' || data_id || '@memoire.invalid', 'authenticated', 'authenticated',
      'infinity', '{"memoire_internal_workspace":true}'::jsonb,
      jsonb_build_object('display_name', original.name), now(), now());

  INSERT INTO public.accounts (id,user_id,name,account_name,industry,location,created_at,updated_at)
    SELECT r.id,data_id,r.name,r.name,r.details->>'industry',r.details->>'location',r.created_at,r.created_at
    FROM public.memoire_personal_workspace_records AS r
    WHERE r.user_id = login_id AND r.workspace_id = p_workspace AND r.category = 'accounts';

  INSERT INTO public.stakeholders (id,user_id,account_id,account_name,name,role_title,email,phone,created_at,updated_at)
    SELECT r.id,data_id,r.account_id,a.name,r.name,r.details->>'role',r.details->>'email',r.details->>'phone',r.created_at,r.created_at
    FROM public.memoire_personal_workspace_records AS r
    JOIN public.accounts AS a ON a.user_id = data_id AND a.id = r.account_id
    WHERE r.user_id = login_id AND r.workspace_id = p_workspace AND r.category = 'contacts';

  INSERT INTO public.portfolio_records (id,user_id,payload,created_at,updated_at)
    SELECT r.id::text,data_id,jsonb_build_object(
      'id',r.id,'schemaVersion',1,'version',1,'source','user','isSample',false,'history','[]'::jsonb,
      'createdAt',r.created_at,'updatedAt',r.created_at,'kind',r.details->>'kind','name',r.name,
      'code',left(coalesce(r.details->>'code',''),100),'description',left(coalesce(r.details->>'description',''),2000),
      'status','active','parentId',NULL,'brandId',NULL,'groupId',NULL,'aliases','[]'::jsonb
    ),r.created_at,r.created_at
    FROM public.memoire_personal_workspace_records AS r
    WHERE r.user_id = login_id AND r.workspace_id = p_workspace AND r.category = 'catalog';

  INSERT INTO public.report_definitions (id,user_id,payload,created_at,updated_at)
    SELECT r.id::text,data_id,jsonb_build_object(
      'id',r.id,'schemaVersion',1,'version',1,'source','user','isSample',false,'history','[]'::jsonb,
      'archived',false,'createdAt',r.created_at,'updatedAt',r.created_at,'definition',r.details->'layout'
    ),r.created_at,r.created_at
    FROM public.memoire_personal_workspace_records AS r
    WHERE r.user_id = login_id AND r.workspace_id = p_workspace AND r.category = 'templates' AND r.details->>'kind' = 'report';

  INSERT INTO public.dashboard_definitions (id,user_id,payload,created_at,updated_at)
    SELECT r.id::text,data_id,jsonb_build_object(
      'id',r.id,'schemaVersion',1,'version',1,'source','user','isSample',false,'history','[]'::jsonb,
      'archived',false,'createdAt',r.created_at,'updatedAt',r.created_at,'definition',r.details->'layout'
    ),r.created_at,r.created_at
    FROM public.memoire_personal_workspace_records AS r
    WHERE r.user_id = login_id AND r.workspace_id = p_workspace AND r.category = 'templates' AND r.details->>'kind' = 'dashboard';

  INSERT INTO memoire_private.workspace_data_owners (owner_id, workspace_id, data_owner_id, activated_at)
    VALUES (login_id,p_workspace,data_id,clock_timestamp());
  RETURN data_id;
END;
$$;
REVOKE ALL ON FUNCTION public.memoire_prepare_native_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memoire_prepare_native_workspace(uuid) TO authenticated;

-- Older schemas used a single-column FK for some business links. Existing
-- rows are preserved; new or changed references must have the same data owner.
CREATE FUNCTION memoire_private.guard_workspace_reference() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  destination jsonb := to_jsonb(NEW);
  previous jsonb;
  reference text := destination->>TG_ARGV[0];
  parent_owner uuid;
BEGIN
  IF reference IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    previous := to_jsonb(OLD);
    IF reference IS NOT DISTINCT FROM previous->>TG_ARGV[0] AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
      THEN RETURN NEW; END IF;
  END IF;
  EXECUTE format('SELECT user_id FROM public.%I WHERE %I = $1::%s', TG_ARGV[1], TG_ARGV[2], TG_ARGV[3])
    INTO parent_owner USING reference;
  IF parent_owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'A record link must stay within its workspace' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.guard_workspace_reference() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE link record;
BEGIN
  FOR link IN
    SELECT child.relname child_table, cc.attname child_key, parent.relname parent_table, pc.attname parent_key,
      format_type(pc.atttypid, NULL) parent_type, f.oid
    FROM pg_constraint f JOIN pg_class child ON child.oid=f.conrelid JOIN pg_class parent ON parent.oid=f.confrelid
    JOIN pg_attribute cc ON cc.attrelid=child.oid AND cc.attnum=f.conkey[1]
    JOIN pg_attribute pc ON pc.attrelid=parent.oid AND pc.attnum=f.confkey[1]
    WHERE f.contype='f' AND child.relnamespace='public'::regnamespace AND parent.relnamespace='public'::regnamespace
      AND cardinality(f.conkey)=1 AND pc.atttypid IN ('uuid'::regtype, 'text'::regtype, 'bigint'::regtype)
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=child.oid AND a.attname='user_id' AND a.atttypid='uuid'::regtype)
      AND EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=parent.oid AND a.attname='user_id' AND a.atttypid='uuid'::regtype)
  LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF user_id,%I ON public.%I
      FOR EACH ROW EXECUTE FUNCTION memoire_private.guard_workspace_reference(%L,%L,%L,%L)',
      'guard_workspace_reference_' || link.oid, link.child_key, link.child_table, link.child_key,
      link.parent_table, link.parent_key, link.parent_type);
  END LOOP;
END;
$$;

-- New native workspaces select data from the live canonical source. The source
-- actor is resolved only after the caller's workspace ownership is checked.
CREATE FUNCTION public.memoire_create_native_workspace(
  p_id uuid, p_name text, p_source_id uuid, p_options text[]
) RETURNS public.memoire_personal_workspaces
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  owner uuid := auth.uid();
  workspace public.memoire_personal_workspaces;
  options text[];
  source_data_owner uuid;
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

  SELECT data_owner_id INTO source_data_owner FROM memoire_private.workspace_data_owners
    WHERE workspace_id = p_source_id AND owner_id = owner AND activated_at IS NOT NULL;
  IF p_source_id IS NULL THEN source_data_owner := owner; END IF;

  INSERT INTO public.memoire_personal_workspaces (id, user_id, name, copy_source_id, copy_options)
  VALUES (p_id, owner, btrim(p_name), p_source_id, options)
  ON CONFLICT (id) DO NOTHING RETURNING * INTO workspace;
  IF NOT FOUND THEN
    SELECT * INTO workspace FROM public.memoire_personal_workspaces WHERE id = p_id AND user_id = owner;
    IF NOT FOUND OR (workspace.name, workspace.copy_source_id, workspace.copy_options)
      IS DISTINCT FROM (btrim(p_name), p_source_id, options) THEN RAISE EXCEPTION 'Workspace identity is already in use'; END IF;
    PERFORM public.memoire_prepare_native_workspace(p_id);
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
      IF source_data_owner IS NOT NULL THEN
        WITH source_accounts AS MATERIALIZED (
          SELECT id, btrim(coalesce(nullif(account_name, ''), name)) AS name,
            lower(btrim(account_name)) AS match_name, industry, location
          FROM public.accounts WHERE user_id = source_data_owner AND 'accounts' = ANY(options)
        ), accounts_by_name AS (
          SELECT match_name, min(id::text)::uuid AS id
          FROM source_accounts WHERE match_name IS NOT NULL AND 'contacts' = ANY(options)
          GROUP BY match_name HAVING count(*) = 1
        ), source_contacts AS (
          SELECT c.id, coalesce(c.account_id, matched.id) AS account_id, btrim(c.name) AS name,
            jsonb_strip_nulls(jsonb_build_object('role', c.role_title, 'email', c.email, 'phone', c.phone)) AS details
          FROM public.stakeholders c
          LEFT JOIN accounts_by_name matched ON c.account_id IS NULL AND matched.match_name = lower(btrim(c.account_name))
          WHERE c.user_id = source_data_owner AND 'contacts' = ANY(options)
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
            FROM public.portfolio_records WHERE user_id = source_data_owner AND payload->>'kind' IN ('unit','brand','group','product')
            AND payload->>'isSample' = 'false' AND payload->>'source' = 'user' AND nullif(btrim(payload->>'name'), '') IS NOT NULL);
        END IF;
        IF 'templates' = ANY(options) THEN
          snapshot := snapshot || (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category','templates','name',btrim(payload->'definition'->>'name'),
            'details', jsonb_build_object('kind','report','layout', ((payload->'definition') - ARRAY['filters','description']) || '{"filters":[],"description":""}'::jsonb))), '[]')
            FROM public.report_definitions WHERE user_id = source_data_owner AND payload->>'archived' = 'false' AND payload->>'isSample' = 'false'
            AND nullif(btrim(payload->'definition'->>'name'), '') IS NOT NULL);
          snapshot := snapshot || (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'category','templates','name',btrim(payload->'definition'->>'name'),
            'details', jsonb_build_object('kind','dashboard','layout', ((payload->'definition') - ARRAY['filters','description']) || '{"filters":[],"description":""}'::jsonb))), '[]')
            FROM public.dashboard_definitions WHERE user_id = source_data_owner AND payload->>'archived' = 'false' AND payload->>'isSample' = 'false'
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
  PERFORM public.memoire_prepare_native_workspace(p_id);
  RETURN workspace;
END;
$$;

REVOKE ALL ON FUNCTION public.memoire_create_native_workspace(uuid,text,uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.memoire_create_native_workspace(uuid,text,uuid,text[]) TO authenticated;

-- Prevent stale clients from editing the reduced copy after activation.
CREATE FUNCTION memoire_private.keep_workspace_copy_as_archive() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  row_owner uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  space uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.workspace_id ELSE NEW.workspace_id END;
BEGIN
  PERFORM 1 FROM public.memoire_personal_workspaces
    WHERE user_id = row_owner AND id = space FOR SHARE;
  IF FOUND AND EXISTS (SELECT 1 FROM memoire_private.workspace_data_owners
    WHERE owner_id = row_owner AND workspace_id = space AND activated_at IS NOT NULL)
  THEN RAISE EXCEPTION 'Open the full workspace to edit its records' USING ERRCODE = '55000'; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.keep_workspace_copy_as_archive() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER keep_workspace_copy_as_archive
  BEFORE INSERT OR UPDATE OR DELETE ON public.memoire_personal_workspace_records
  FOR EACH ROW EXECUTE FUNCTION memoire_private.keep_workspace_copy_as_archive();

CREATE FUNCTION memoire_private.remove_workspace_data_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.data_owner_id
    AND raw_app_meta_data->'memoire_internal_workspace' = 'true'::jsonb;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION memoire_private.remove_workspace_data_owner() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER remove_workspace_data_owner AFTER DELETE ON memoire_private.workspace_data_owners
  FOR EACH ROW EXECUTE FUNCTION memoire_private.remove_workspace_data_owner();

CREATE FUNCTION public.memoire_native_digest_recipient(p_data_owner uuid)
RETURNS TABLE (workspace_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT link.workspace_id, login.email
  FROM memoire_private.workspace_data_owners AS link
  JOIN auth.users AS login ON login.id = link.owner_id
  WHERE link.data_owner_id = p_data_owner AND link.activated_at IS NOT NULL
    AND login.email_confirmed_at IS NOT NULL AND nullif(login.email, '') IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.memoire_native_digest_recipient(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.memoire_native_digest_recipient(uuid) TO service_role;
