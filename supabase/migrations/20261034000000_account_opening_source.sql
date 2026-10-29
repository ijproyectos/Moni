-- Where does an account's starting money come from?
--
-- Until now a starting balance was only a number on the account (accounts.opening_balance): it raised the
-- balance but left no trace in Actividad or in the reports. Now the person says what it is:
--   previous ("Dinero que ya tenía") -> one 'opening_in' movement, listed as "Saldo inicial". It moves the
--                                       balance but is neither income nor expense, so no report changes.
--   income   ("Mi sueldo" / "Otro ingreso") -> one real 'income' movement with a category and a date: listed
--                                       in Actividad and counted in the income of its month.
-- Either way the account is created with opening_balance = 0 and the movement carries the amount, so the
-- balance rises by exactly the amount typed (never twice). Account and movement are created in one
-- transaction.
--
-- Existing accounts are NOT touched. classify_opening_balance lets the owner convert the opening_balance of
-- one existing account into a movement on demand: opening_balance goes to 0 and the movement carries the same
-- amount, so the balance does not change. Credit cards keep their opening debt exactly as before (neither
-- function accepts a card).
--
-- opening_in rows are written only by these functions (the client policies still list only expense, income and
-- adjustments), so they cannot be edited or voided by the client; a wrong balance is fixed with "Ajustar saldo".
--
-- Additive. Rollback (only valid while no opening_in row exists; otherwise convert/void those first):
--   drop function public.create_account_with_opening(text, text, numeric, text, uuid, date);
--   drop function public.classify_opening_balance(uuid, text, uuid, date);
--   alter table public.transactions drop constraint transactions_kind_check,
--     add constraint transactions_kind_check check (kind in ('expense','income','shared_payment','settlement_out','settlement_in','adjustment_in','adjustment_out'));
--   (then restore account_balances from 20261032000000)

begin;

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'shared_payment', 'settlement_out', 'settlement_in',
                  'adjustment_in', 'adjustment_out', 'opening_in'));

-- Balance: opening_in raises it like income does.
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.owner_id,
  a.currency,
  a.archived_at,
  a.opening_balance
    + coalesce((
        select sum(case when t.kind in ('income', 'settlement_in', 'adjustment_in', 'opening_in') then t.amount else -t.amount end)
        from public.transactions t
        where t.account_id = a.id and t.status = 'posted'
      ), 0)
    + coalesce((select sum(tr.amount) from public.transfers tr
                where tr.to_account_id = a.id and tr.status = 'posted'), 0)
    - coalesce((select sum(tr.amount) from public.transfers tr
                where tr.from_account_id = a.id and tr.status = 'posted'), 0)
    as balance
from public.accounts a;

-- Shared by both functions: writes the movement for an opening amount. The caller has already locked and
-- validated the account.
create or replace function public.write_opening_movement(
  p_account uuid,
  p_amount numeric,
  p_source text,
  p_category uuid,
  p_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source = 'previous' then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note)
    values ((select auth.uid()), p_account, 'opening_in', p_amount, p_on, 'Saldo inicial');
  else
    -- validate_transaction checks that the category is the owner's, active and an income category.
    insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on)
    values ((select auth.uid()), p_account, p_category, 'income', p_amount, p_on);
  end if;
end;
$$;

revoke execute on function public.write_opening_movement(uuid, numeric, text, uuid, date) from public, anon, authenticated;

-- Checks shared by both functions (amount, source, category, date). Raises the same codes the app maps.
create or replace function public.check_opening_input(p_amount numeric, p_source text, p_category uuid, p_on date)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('previous', 'income') then
    raise exception 'invalid_opening_source' using errcode = '22023';
  end if;
  if p_source = 'income' and p_category is null then
    raise exception 'category_required' using errcode = '22023';
  end if;
  if p_on is not null and (p_on > ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)
                           or p_on < date '2000-01-01') then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.check_opening_input(numeric, text, uuid, date) from public, anon, authenticated;

-- RPC: create an account that starts with money -----------------------------------------------------------

create or replace function public.create_account_with_opening(
  p_name text,
  p_kind text,
  p_amount numeric,
  p_source text,
  p_category uuid default null,
  p_on date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_account uuid;
  v_on date := coalesce(p_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('cash', 'bank', 'wallet') then
    raise exception 'invalid_opening_kind' using errcode = '22023';
  end if;
  perform public.check_opening_input(p_amount, p_source, p_category, p_on);

  -- The table's own checks validate the name and the kind; the new account starts at zero.
  insert into public.accounts (owner_id, name, kind, opening_balance)
  values (v_owner, p_name, p_kind, 0)
  returning id into v_account;

  perform public.write_opening_movement(v_account, round(p_amount, 2), p_source, p_category, v_on);
  return v_account;
end;
$$;

revoke execute on function public.create_account_with_opening(text, text, numeric, text, uuid, date) from public, anon;
grant execute on function public.create_account_with_opening(text, text, numeric, text, uuid, date) to authenticated;

-- RPC: classify the starting balance of an account that already exists ------------------------------------
-- opening_balance moves into one movement of the same amount: the balance is exactly the same afterwards.
-- 'previous' is dated on the day the account was created (history stays where it was); an income is dated on
-- p_on (today by default). Only a non-card, active account whose opening_balance is above zero qualifies.

create or replace function public.classify_opening_balance(
  p_account uuid,
  p_source text,
  p_category uuid default null,
  p_on date default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_account public.accounts%rowtype;
  v_on date;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- Serializes with any other change of the same account.
  select * into v_account
  from public.accounts a
  where a.id = p_account and a.owner_id = v_owner
  for update;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if v_account.archived_at is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;
  if v_account.kind = 'credit_card' then
    raise exception 'invalid_opening_kind' using errcode = '22023';
  end if;
  if v_account.opening_balance <= 0 then
    raise exception 'nothing_to_classify' using errcode = '22023';
  end if;
  perform public.check_opening_input(v_account.opening_balance, p_source, p_category, p_on);

  v_on := case
    when p_source = 'previous' then (v_account.created_at at time zone 'America/Argentina/Buenos_Aires')::date
    else coalesce(p_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date)
  end;

  update public.accounts set opening_balance = 0 where id = p_account;
  perform public.write_opening_movement(p_account, v_account.opening_balance, p_source, p_category, v_on);
  return v_account.opening_balance;
end;
$$;

revoke execute on function public.classify_opening_balance(uuid, text, uuid, date) from public, anon;
grant execute on function public.classify_opening_balance(uuid, text, uuid, date) to authenticated;

commit;
