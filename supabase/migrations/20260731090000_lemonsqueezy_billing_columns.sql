-- Billing moves from Stripe to Lemon Squeezy.
--
-- Lemon Squeezy is a merchant of record: it owns the payment relationship, the
-- tax handling and the invoice, and it identifies the payer with its own
-- customer id plus a subscription id. Stripe's single customer id is not enough
-- to address either resource, so the column is replaced rather than renamed.
--
-- No paid subscription has ever existed - checkout has been gated behind
-- BILLING_CHECKOUT_ENABLED=false since the column was created - so there is no
-- Stripe customer data to preserve.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS lemonsqueezy_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS lemonsqueezy_subscription_id TEXT;

ALTER TABLE public.user_profiles
  DROP COLUMN IF EXISTS stripe_customer_id;

-- The client write grant is column-scoped to display_name
-- (20260726120000_user_profiles_client_writes_display_name_only.sql), so the
-- new columns are unwritable from the browser by default. Restated here so the
-- guarantee is visible next to the columns it protects: billing state is
-- written only by the Lemon Squeezy webhook, under service_role.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_profiles FROM authenticated;

GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (display_name) ON TABLE public.user_profiles TO authenticated;

-- Support looks a user up from a Lemon Squeezy dashboard row, so the reverse
-- direction needs to be cheap too.
CREATE INDEX IF NOT EXISTS idx_user_profiles_lemonsqueezy_customer
  ON public.user_profiles (lemonsqueezy_customer_id)
  WHERE lemonsqueezy_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_lemonsqueezy_subscription
  ON public.user_profiles (lemonsqueezy_subscription_id)
  WHERE lemonsqueezy_subscription_id IS NOT NULL;
