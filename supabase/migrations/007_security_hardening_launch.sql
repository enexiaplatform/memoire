-- Launch hardening for existing Supabase functions.
-- Keep behavior unchanged while making function search_path explicit.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'display_name');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.match_captures(
  query_embedding vector,
  match_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 10,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE(
  id uuid,
  raw_text text,
  structured_data jsonb,
  entity_ids uuid[],
  captured_at timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.raw_text,
    c.structured_data,
    c.entity_ids,
    c.captured_at,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.captures c
  WHERE
    c.user_id = p_user_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> query_embedding) > match_threshold
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
