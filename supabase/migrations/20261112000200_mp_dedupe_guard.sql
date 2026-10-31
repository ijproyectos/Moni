-- Mercado Pago expense auto-import (Plus), work unit 2b: cross-claim guard and import duplicates.
--
--   * An MP import is a third owner of an expense (next to subscription charges and fixed-expense payments).
--     link_subscription_charge and link_fixed_expense_payment now reject an expense referenced by
--     mp_imported_payments (invalid_link, 23514). Only that check is new; the rest is the previous definition
--     (20261104000000_cross_claim_guard.sql and 20261102000000_fixed_expenses.sql).
--   * get_mp_import_duplicates(): computed at read time, so a manual expense typed AFTER the import is caught too.
--     Pairs each posted import with the closest posted manual expense on the same account with an equal amount and
--     occurred_on within +-3 days that no charge, fixed payment or import owns. Dismissed imports are excluded.
--
-- Apply AFTER 20261112000100_mp_import_rpc.sql.
-- Rollback: drop function public.get_mp_import_duplicates(); re-run the original definitions of
-- link_subscription_charge (20261104000000_cross_claim_guard.sql) and link_fixed_expense_payment
-- (20261102000000_fixed_expenses.sql).

begin;

create or replace function public.link_subscription_charge(p_charge uuid, p_transaction uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  c public.subscription_charges%rowtype;
  t public.transactions%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into c from public.subscription_charges where id = p_charge and owner_id = v_owner for update;
  if not found then
    raise exception 'charge_not_found' using errcode = '23503';
  end if;
  if c.status <> 'posted' then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;
  select * into t from public.transactions where id = p_transaction and owner_id = v_owner;
  if not found or t.status <> 'posted' or t.kind <> 'expense' or t.id = c.transaction_id then
    raise exception 'invalid_link' using errcode = '23514';
  end if;
  if exists (select 1 from public.subscription_charges x
             where x.transaction_id = t.id or x.linked_transaction_id = t.id) then
    raise exception 'invalid_link' using errcode = '23514';
  end if;
  -- An expense that a fixed-expense payment already owns cannot also back a subscription charge.
  if exists (select 1 from public.fixed_expense_payments p
             where p.transaction_id = t.id and p.status = 'posted') then
    raise exception 'invalid_link' using errcode = '23514';
  end if;
  -- Nor can an expense imported from Mercado Pago.
  if exists (select 1 from public.mp_imported_payments m where m.transaction_id = t.id) then
    raise exception 'invalid_link' using errcode = '23514';
  end if;

  update public.transactions set status = 'voided' where id = c.transaction_id and status = 'posted';
  update public.subscription_charges
  set status = 'linked', linked_transaction_id = t.id, reverted_at = now()
  where id = p_charge;
end;
$$;

create or replace function public.link_fixed_expense_payment(p_occurrence uuid, p_transaction uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  o public.fixed_expense_occurrences%rowtype;
  t public.transactions%rowtype;
  v_payment uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into o from public.fixed_expense_occurrences where id = p_occurrence and owner_id = v_owner for update;
  if not found then
    raise exception 'occurrence_not_found' using errcode = '23503';
  end if;
  if o.status <> 'pending' then
    raise exception 'already_resolved' using errcode = '23514';
  end if;
  select * into t from public.transactions where id = p_transaction and owner_id = v_owner;
  if not found or t.status <> 'posted' or t.kind <> 'expense' then
    raise exception 'invalid_link' using errcode = '23514';
  end if;
  if exists (select 1 from public.fixed_expense_payments p where p.transaction_id = t.id and p.status = 'posted')
     or exists (select 1 from public.subscription_charges c where c.transaction_id = t.id or c.linked_transaction_id = t.id)
     or exists (select 1 from public.mp_imported_payments m where m.transaction_id = t.id) then
    raise exception 'invalid_link' using errcode = '23514';
  end if;

  insert into public.fixed_expense_payments (owner_id, occurrence_id, fixed_expense_id, amount, paid_on, account_id,
                                             transaction_id, source)
  values (v_owner, o.id, o.fixed_expense_id, t.amount, t.occurred_on, t.account_id, t.id, 'linked')
  returning id into v_payment;
  update public.fixed_expense_occurrences set status = 'paid' where id = o.id;
  return v_payment;
end;
$$;

-- Security invoker: RLS limits every table to the caller's own rows; the owner filter keeps it explicit.
create or replace function public.get_mp_import_duplicates()
returns table (
  payment_id text,
  transaction_id uuid,
  duplicate_transaction_id uuid,
  occurred_on date,
  duplicate_occurred_on date,
  amount numeric
)
language sql
stable
set search_path = ''
as $$
  select m.payment_id, t.id, d.id, t.occurred_on, d.occurred_on, t.amount
  from public.mp_imported_payments m
  join public.transactions t on t.id = m.transaction_id and t.status = 'posted' and t.kind = 'expense'
  cross join lateral (
    select x.id, x.occurred_on
    from public.transactions x
    where x.owner_id = t.owner_id and x.kind = 'expense' and x.status = 'posted'
      and x.account_id = t.account_id and x.amount = t.amount
      and x.occurred_on between t.occurred_on - 3 and t.occurred_on + 3
      and x.id <> t.id
      and not exists (select 1 from public.mp_imported_payments o where o.transaction_id = x.id)
      and not exists (select 1 from public.subscription_charges c
                      where c.transaction_id = x.id or c.linked_transaction_id = x.id)
      and not exists (select 1 from public.fixed_expense_payments f
                      where f.transaction_id = x.id and f.status = 'posted')
    order by abs(x.occurred_on - t.occurred_on), x.created_at
    limit 1
  ) d
  where m.owner_id = (select auth.uid()) and m.outcome = 'posted' and not m.duplicate_dismissed
  order by t.occurred_on desc, m.payment_id;
$$;

revoke execute on function public.link_subscription_charge(uuid, uuid) from public, anon;
grant execute on function public.link_subscription_charge(uuid, uuid) to authenticated;
revoke execute on function public.link_fixed_expense_payment(uuid, uuid) from public, anon;
grant execute on function public.link_fixed_expense_payment(uuid, uuid) to authenticated;
revoke execute on function public.get_mp_import_duplicates() from public, anon;
grant execute on function public.get_mp_import_duplicates() to authenticated;

commit;
