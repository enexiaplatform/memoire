CREATE SCHEMA IF NOT EXISTS extensions;

ALTER EXTENSION vector SET SCHEMA extensions;

ALTER FUNCTION public.match_captures(extensions.vector, double precision, integer, uuid)
  SET search_path = public, extensions;
