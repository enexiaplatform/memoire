-- Migration for Prompt 12 (plus missing schema bits from Prompt 11)

-- 1. Add fields to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS acknowledged_hiring_boundary_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS anonymize_default BOOLEAN NOT NULL DEFAULT true;

-- 2. Add fields to captures
ALTER TABLE public.captures
ADD COLUMN IF NOT EXISTS anonymization_state TEXT NOT NULL DEFAULT 'original'
  CHECK (anonymization_state IN ('original', 'anonymized', 'mixed')),
ADD COLUMN IF NOT EXISTS original_text TEXT,
ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
