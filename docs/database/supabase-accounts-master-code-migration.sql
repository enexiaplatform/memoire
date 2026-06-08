-- Memoire Account Master upgrade
-- Adds stable personal account codes such as ACC-0001.
-- Safe and additive: no existing account data is removed.

alter table public.accounts
  add column if not exists account_code text;

with existing_max as (
  select
    user_id,
    coalesce(max(substring(account_code from 5)::integer), 0) as max_account_number
  from public.accounts
  where account_code ~ '^ACC-[0-9]{4}$'
  group by user_id
),
ranked_accounts as (
  select
    account.id,
    account.user_id,
    coalesce(existing.max_account_number, 0) +
    row_number() over (
      partition by account.user_id
      order by account.created_at asc nulls last, account.id asc
    ) as account_number
  from public.accounts as account
  left join existing_max as existing on existing.user_id = account.user_id
  where account.account_code is null
)
update public.accounts as account
set account_code = 'ACC-' || lpad(ranked.account_number::text, 4, '0')
from ranked_accounts as ranked
where account.id = ranked.id
  and ranked.account_number <= 9999;

alter table public.accounts
  drop constraint if exists accounts_account_code_format;

alter table public.accounts
  add constraint accounts_account_code_format check (
    account_code is null or account_code ~ '^ACC-[0-9]{4}$'
  );

create unique index if not exists accounts_user_account_code_unique_idx
on public.accounts (user_id, account_code)
where account_code is not null;
