-- product_events was the one table in the schema with RLS enabled and no policy
-- behind it, and it is the only security advisory the database reports.
--
-- It was never actually open. The table's protection is the GRANT: the migration
-- that created it revoked everything from anon and authenticated, so a client
-- holding the anon key cannot reach it whatever RLS says, and the only writer is
-- /api/product-events using the service role. The lint is real all the same,
-- because "no policy" and "denied on purpose" are indistinguishable to anyone
-- reading the schema later - and the two sibling tables with the identical
-- server-only shape, early_access_requests and product_funnel_events, both carry
-- an explicit deny. This one was simply missed.
--
-- Nothing changes for the writer: the service role bypasses row level security
-- entirely, which is why the same policy on product_funnel_events has never
-- interfered with the funnel endpoint.
DROP POLICY IF EXISTS "Public clients cannot access product events" ON public.product_events;
CREATE POLICY "Public clients cannot access product events"
  ON public.product_events
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
