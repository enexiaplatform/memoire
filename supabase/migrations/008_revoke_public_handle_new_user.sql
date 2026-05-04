-- Prevent public RPC execution of auth trigger helper.
-- The function remains available to the auth.users trigger and service role.

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
