-- Lemon Squeezy owns the trial once the card is captured, so the app has to be
-- told when it ends rather than working it out. `trial_ends_at` arrives on
-- every subscription webhook; this is where it lands so the workspace can count
-- down without calling the Lemon Squeezy API on every page load.
alter table public.user_profiles
  add column if not exists subscription_trial_ends_at timestamptz;

-- user_profiles grants are column-scoped, so a new column is invisible to the
-- client until it is named here. Only the webhook (service role) ever writes it,
-- which is why there is no matching UPDATE grant: a browser that could move its
-- own trial end date could give itself a free year.
grant select (subscription_trial_ends_at) on public.user_profiles to authenticated;

comment on column public.user_profiles.subscription_trial_ends_at is
  'When the Lemon Squeezy free trial ends. Set from the subscription webhook; null when there is no trial.';
