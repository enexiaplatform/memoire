-- Scope authenticated Data API requests only when a workspace was requested.
-- Keep a pre-existing Data API hook intact if platform configuration changed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_db_role_setting settings
    CROSS JOIN LATERAL unnest(settings.setconfig) config
    WHERE settings.setrole = 'authenticator'::regrole
      AND config LIKE 'pgrst.db_pre_request=%'
      AND config <> 'pgrst.db_pre_request=memoire_private.apply_workspace_data_scope'
      AND config <> 'pgrst.db_pre_request='
  ) THEN RAISE EXCEPTION 'Another Data API pre-request hook is configured'; END IF;
END;
$$;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'memoire_private.apply_workspace_data_scope';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';
