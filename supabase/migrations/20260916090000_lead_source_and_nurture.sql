-- Leads become a destination, and two things a lead needs get a place to live.
--
-- A lead in Memoire is an opportunity at the Lead stage - there is no second
-- table here and there must not be one, because the whole argument for making
-- Leads its own surface is that qualifying a lead changes its stage and nothing
-- else. Its touches, its people, its evidence and its dates are the same rows
-- the moment it becomes a deal, because they were never anywhere else.
--
-- What the record genuinely could not say:
--
--   1. Where the lead came from. `channel`, `opportunity_type` and
--      `source_system` already carry acquisition context on every imported
--      book, spelled however the source system spelled it. Those are not
--      rewritten: `lead_source` is a new, controlled field and the client falls
--      back to the legacy three when it is empty, so an imported lead reports a
--      source on day one with nothing re-entered and nothing migrated.
--   2. That a good lead is parked until a date. "Right customer, wrong year"
--      had to be recorded as a lie (disqualified) or as nothing at all, and
--      "nothing at all" is how a lead worth having rots in a queue.
--
-- All four columns are additive and nullable. Nothing reads them unless they
-- are set, so an existing workspace behaves exactly as it did.

alter table public.opportunities
  add column if not exists lead_source text,
  add column if not exists lead_source_detail text,
  add column if not exists nurtured_until date,
  add column if not exists nurture_reason text;

-- Grants on this table are table-wide rather than column-scoped, so the new
-- columns inherit them; this is here so that stays true if they are ever
-- tightened.
grant select (lead_source, lead_source_detail, nurtured_until, nurture_reason),
      insert (lead_source, lead_source_detail, nurtured_until, nurture_reason),
      update (lead_source, lead_source_detail, nurtured_until, nurture_reason)
  on public.opportunities to authenticated;

comment on column public.opportunities.lead_source is
  'How the lead arrived (Referral, Trade show, Tender / RFQ, ...). NULL = not stated; the client then falls back to channel/opportunity_type/source_system. Vocabulary in src/utils/leadQueue.ts and deliberately not a CHECK constraint, so adding a value does not need a migration to reach a live database.';

comment on column public.opportunities.lead_source_detail is
  'The free-text qualifier for lead_source: "Pharmedi 2026", "Samil / Mr Kim".';

comment on column public.opportunities.nurtured_until is
  'The day a parked lead comes back into the queue. NULL = not parked. The queue surfaces it a few days early - see NURTURE_DUE_LEAD_DAYS in src/utils/leadQueue.ts.';

comment on column public.opportunities.nurture_reason is
  'Why the lead is parked. Optional.';

-- The lead queue reads one workspace's Lead-stage rows and orders them by what
-- needs doing. Partial, because the rows worth indexing are the small minority
-- of the book that is at the Lead stage.
create index if not exists opportunities_user_lead_stage_idx
  on public.opportunities (user_id, updated_at desc)
  where stage = 'Lead';
