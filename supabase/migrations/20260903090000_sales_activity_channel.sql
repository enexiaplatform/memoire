-- How a touch happened, alongside what it was about.
--
-- `activity_type` already says the subject ("Quote / proposal", "Objection
-- handling"). It has never said where the operator was, so an on-site day at a
-- plant three hours away and a twenty-minute screen share were the same row.
-- The two are orthogonal - a demo can be either - so this is a second column
-- rather than more values on the first.
--
-- Nullable with no default and no backfill on purpose. Every row written before
-- this column existed has an unknown channel, and NULL is the only honest way
-- to say so; giving them all 'Desk work' would invent months of desk days.
--
-- The vocabulary is owned by src/utils/activityChannel.ts and deliberately not
-- enforced here as a CHECK constraint: the client normalizes an unrecognised
-- value to '' on read, so a value added to the list in code does not need a
-- migration to reach a live database before the feature can ship.
alter table public.sales_activities
  add column if not exists activity_channel text;

comment on column public.sales_activities.activity_channel is
  'How the touch happened (On-site visit, Online meeting, Cold outreach, Out of office, ...). NULL = not stated. Vocabulary in src/utils/activityChannel.ts.';

-- Every read of this column is scoped to one workspace and to a date window,
-- and the two questions it answers - "what kind of week was this" and "which
-- days was the operator out" - both filter on it. Partial, because the rows
-- worth indexing are the ones that state a channel.
create index if not exists sales_activities_user_channel_date_idx
  on public.sales_activities (user_id, activity_channel, activity_date)
  where activity_channel is not null;
