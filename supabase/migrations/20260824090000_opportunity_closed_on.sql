-- The day a deal actually closed.
--
-- The order book follows money from contract to the bank, and to do that it has
-- to know when the contract happened. For a deal closed inside the app that
-- lives on the outcome record; for a book that arrived by CSV - which is every
-- new operator's first day - there was nowhere to put it at all, so the order
-- date chain fell through to `updated_at` and stamped a whole year's business
-- with the moment of the import. Five deals signed between March and August
-- read "ordered today, 0d waiting", and a March order nobody had invoiced
-- reported nothing overdue.
--
-- Additive and nullable. Nothing reads it unless it is set, so an existing
-- workspace behaves exactly as it did.
alter table public.opportunities
  add column if not exists closed_on date;

-- Grants on this table are table-wide rather than column-scoped, so the new
-- column inherits them; this is here so that stays true if they are ever
-- tightened.
grant select (closed_on), insert (closed_on), update (closed_on)
  on public.opportunities to authenticated;

comment on column public.opportunities.closed_on is
  'The date the deal was won or lost, when that is known from outside the app (a CSV import). Deals closed in the app carry it on their outcome record instead.';
