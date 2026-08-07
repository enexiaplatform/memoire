-- Công nợ: the collection side of a committed order.
--
-- The order book already followed an order to a milestone called Collected, and
-- that milestone was a tick. It could record that an order had been paid; it
-- could not record that 30% arrived in June, that the balance fell due on the
-- 14th, and that the money has been sitting eleven days late since. For a
-- distributor that gap is the job - the whole point is getting the cash back -
-- and a tick cannot tell anyone who to ring this morning.
--
-- Most of the answer is derived rather than stored. Due dates come off the
-- payment terms already written on the quote, so a workspace gets a receivables
-- ledger the moment this ships, with nothing re-entered. What has to be stored
-- is the part no document here could prove: money actually landing in the bank,
-- and any correction the operator makes to a schedule that was read from a
-- sentence.
--
-- One row per order, keyed by the opportunity, exactly like its cost. Rides the
-- existing JSON-collection pattern, so it costs no API function - api/ is at
-- the Vercel Hobby ceiling of twelve.

CREATE TABLE IF NOT EXISTS public.order_receivables (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id text NOT NULL CHECK (char_length(id) BETWEEN 1 AND 200),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.order_receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own order receivables"
  ON public.order_receivables
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.order_receivables FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_receivables TO authenticated;

CREATE INDEX IF NOT EXISTS order_receivables_user_updated_idx
  ON public.order_receivables (user_id, updated_at DESC);

-- The two numbers that turn cost analysis into a pricing tool, kept on the
-- account rather than in one browser.
--
-- The target margin has lived in localStorage since cost analysis shipped, on
-- the reasoning that it graded a single page and was not worth a migration.
-- That reasoning does not survive the move to quoting. These two now decide the
-- price a seller puts in front of a customer, and a figure that says one thing
-- on the laptop and another on the phone is worse than no figure - it is two
-- different quotes for the same order. They join reporting_currency and
-- opening_cash_balance on the profile for the same reason those did.
--
-- The financing rate is the operator's own cost of capital: the overdraft or
-- facility rate they pay while a customer takes sixty days. Nothing infers it,
-- because nothing here can see their bank.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS target_margin_pct numeric,
  ADD COLUMN IF NOT EXISTS financing_annual_rate_pct numeric;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_target_margin_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_target_margin_range
  CHECK (target_margin_pct IS NULL OR (target_margin_pct >= 0 AND target_margin_pct <= 99)) NOT VALID;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_financing_rate_range;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_financing_rate_range
  CHECK (financing_annual_rate_pct IS NULL OR (financing_annual_rate_pct >= 0 AND financing_annual_rate_pct <= 100)) NOT VALID;

-- Column-level grants, matching how display_name, reporting_currency and
-- opening_cash_balance are handled: the client may write the preferences it
-- owns and nothing else on this row. A blanket UPDATE grant here would let a
-- browser set its own subscription_tier - the hole
-- 20260726120000_user_profiles_client_writes_display_name_only.sql closed.
--
-- The whole list is restated rather than the two new columns added on their
-- own. Every migration that has touched these grants revokes and re-grants the
-- full set, so a partial grant here would be silently dropped by the next one
-- that follows the same pattern - and the symptom would be a preference that
-- reports "Saved" and is not.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.user_profiles FROM authenticated;

GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (
  display_name,
  reporting_currency,
  opening_cash_balance,
  daily_digest_enabled,
  weekly_review_enabled,
  digest_send_hour,
  digest_utc_offset_minutes,
  target_margin_pct,
  financing_annual_rate_pct
) ON TABLE public.user_profiles TO authenticated;
