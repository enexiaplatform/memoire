CREATE POLICY "Public clients cannot access early access requests"
  ON public.early_access_requests
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

CREATE POLICY "Public clients cannot access funnel events"
  ON public.product_funnel_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
