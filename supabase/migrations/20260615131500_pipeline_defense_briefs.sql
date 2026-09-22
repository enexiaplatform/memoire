-- Bring the previously dashboard-managed Pipeline Defense table into the
-- reproducible migration chain. The IF NOT EXISTS form is intentional: older
-- targets may already have this table from the original SQL-editor setup.
CREATE TABLE IF NOT EXISTS public.pipeline_defense_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  week_label text,
  sales_owner text,
  scope text,
  deals jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pipeline_defense_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select their own pipeline defense briefs" ON public.pipeline_defense_briefs;
CREATE POLICY "Users can select their own pipeline defense briefs" ON public.pipeline_defense_briefs
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own pipeline defense briefs" ON public.pipeline_defense_briefs;
CREATE POLICY "Users can insert their own pipeline defense briefs" ON public.pipeline_defense_briefs
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own pipeline defense briefs" ON public.pipeline_defense_briefs;
CREATE POLICY "Users can update their own pipeline defense briefs" ON public.pipeline_defense_briefs
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own pipeline defense briefs" ON public.pipeline_defense_briefs;
CREATE POLICY "Users can delete their own pipeline defense briefs" ON public.pipeline_defense_briefs
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS pipeline_defense_briefs_user_updated_idx
  ON public.pipeline_defense_briefs (user_id, updated_at DESC);
