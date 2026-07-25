-- user_profiles carries the billing state (subscription_tier,
-- subscription_status, stripe_customer_id) on the same row as the display name.
-- Its RLS policy is FOR ALL over the whole row and authenticated held a blanket
-- UPDATE grant, so a signed-in user could have written their own
-- subscription_tier and handed themselves a paid plan.
--
-- Nothing was being bypassed yet: PaywallBanner is not mounted anywhere,
-- BillingPage is not routed, and checkout is additionally gated behind
-- BILLING_CHECKOUT_ENABLED. But the hole would have opened the moment billing
-- was switched on, and nothing in the application code would have shown it -
-- the grant was the whole vulnerability.
--
-- Client writes are now limited to the one column a person should own. Every
-- real write today already runs server-side under service_role (api/billing.ts
-- and api/stripe-webhook.ts), which bypasses RLS and column grants, so no
-- working path changes.

REVOKE ALL ON TABLE public.user_profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_profiles FROM authenticated;

GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (display_name) ON TABLE public.user_profiles TO authenticated;

-- updated_at is deliberately not client-writable, so the database keeps it
-- honest rather than trusting whatever the browser sends.
CREATE OR REPLACE FUNCTION public.touch_user_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_profiles_touch_updated_at ON public.user_profiles;
CREATE TRIGGER user_profiles_touch_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_profiles_updated_at();
