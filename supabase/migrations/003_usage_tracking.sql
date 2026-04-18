-- Monthly usage tracking (for free tier enforcement)
CREATE TABLE public.usage_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,                    -- format: 'YYYY-MM'
  capture_count INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.usage_monthly ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see own usage" ON public.usage_monthly
  FOR ALL USING (auth.uid() = user_id);

-- Index for fast lookup
CREATE INDEX idx_usage_user_month ON public.usage_monthly(user_id, month);

-- Function: increment capture count for current month
CREATE OR REPLACE FUNCTION increment_capture_count(p_user_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.usage_monthly (user_id, month, capture_count)
  VALUES (p_user_id, TO_CHAR(NOW(), 'YYYY-MM'), 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    capture_count = usage_monthly.capture_count + 1,
    last_updated = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
