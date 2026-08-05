-- The settings a person owns must survive the browser they set them in.
--
-- Reporting currency and opening cash balance lived only in localStorage. That
-- looks like it works until one of three things happens, and on a real
-- workspace all three do: the operator opens Memoire on a second device and
-- gets VND back; the installed PWA and the browser tab turn out to be separate
-- origins' worth of storage; or - the one measured here - a workspace of a few
-- hundred records fills the ~5MB localStorage ceiling, the setItem throws
-- QuotaExceededError, and `setReportingCurrency` swallows it in a bare catch.
-- In every case the select showed SGD, the next load showed VND, and nothing in
-- the interface ever admitted the write had failed.
--
-- These are per-person preferences about how their own numbers are read, so
-- they belong on user_profiles beside the other things a person owns, and the
-- browser copy becomes a cache rather than the record.
ALTER TABLE public.user_profiles
  -- Not a foreign key to a currency table and deliberately not constrained to a
  -- list: SUPPORTED_CURRENCIES is a product decision that changes with the
  -- markets Memoire is sold into, and a CHECK here would turn adding a currency
  -- into a migration. The client normalizes and validates before writing.
  ADD COLUMN IF NOT EXISTS reporting_currency TEXT,
  -- In the reporting currency above, as the operator entered it. Nullable
  -- because "I have not told you" and "I have zero cash" are different answers.
  ADD COLUMN IF NOT EXISTS opening_cash_balance NUMERIC;

-- Client writes stay column-scoped (see
-- 20260726120000_user_profiles_client_writes_display_name_only.sql): billing
-- state is still writable only by the webhook under service_role. What is added
-- here is the set of columns that are the person's own answer about themselves.
--
-- The four digest columns are in this list for a reason worth recording:
-- 20260802090000_digest_delivery.sql created them but never granted UPDATE on
-- them, so NotificationsPanel's save has been failing silently on the grant
-- since the day it shipped - the same class of bug as the currency one, one
-- layer down.
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
  digest_utc_offset_minutes
) ON TABLE public.user_profiles TO authenticated;
