-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to captures table
ALTER TABLE public.captures
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add embedding column to entities table
ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS captures_embedding_idx
  ON public.captures
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS entities_embedding_idx
  ON public.entities
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Function: search captures by vector similarity (user-scoped)
CREATE OR REPLACE FUNCTION match_captures(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS TABLE (
  id uuid,
  raw_text text,
  structured_data jsonb,
  entity_ids uuid[],
  captured_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
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
