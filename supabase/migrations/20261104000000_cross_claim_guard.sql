-- Follow-up to 20261101 / 20261102 / 20261103, from the Judgment Day review of those migrations.
--
-- 1. One expense can no longer back both a subscription charge and a fixed-expense payment. The subscriptions
--    migration could not check fixed_expense_payments (that table is created in the next migration), so
--    link_subscription_charge and the "possible duplicate" suggestion only looked at subscription charges.
--    Undoing the fixed payment later would then void an expense a subscription charge pointed to. Now both
--    functions also exclude expenses owned by a posted fixed-expense payment (the reverse check already existed).
-- 2. The pure date helpers follow the project convention: no execute for public/anon. authenticated keeps it
--    because the CHECK constraints and the security-invoker overview functions call them.
--
-- Apply AFTER 20261103000000_savings_goals.sql. Idempotent (create or replace + grants).
-- Rollback: re-run the original definitions of link_subscription_charge and get_subscription_overview from
-- 20261101000000_subscriptions.sql.

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

  update public.transactions set status = 'voided' where id = c.transaction_id and status = 'posted';
  update public.subscription_charges
  set status = 'linked', linked_transaction_id = t.id, reverted_at = now()
  where id = p_charge;
end;
$$;

create or replace function public.get_subscription_overview(p_today date default null)
returns json
language sql
stable
set search_path = ''
as $$
  with params as (select coalesce(p_today, public.subscription_today()) as today)
  select json_build_object(
    'today', (select today from params),
    'subscriptions', coalesce((
      select json_agg(json_build_object(
        'id', s.id, 'service_id', s.service_id, 'name', s.name, 'plan', s.plan, 'amount', s.amount,
        'period', s.period, 'next_charge_on', s.next_charge_on, 'account_id', s.account_id,
        'account_name', a.name, 'account_kind', a.kind, 'category_id', s.category_id, 'remind', s.remind,
        'status', s.status, 'paused_at', s.paused_at, 'cancelled_at', s.cancelled_at, 'created_at', s.created_at
      ) order by s.created_at)
      from public.subscriptions s
      join public.accounts a on a.id = s.account_id
    ), '[]'::json),
    'charges', coalesce((
      select json_agg(x order by x.due_on desc, x.created_at desc) from (
        select c.id, c.subscription_id, c.due_on, c.amount, c.status, c.transaction_id, c.linked_transaction_id,
               c.failure_reason, c.balance_after, c.negative_balance, c.over_limit, c.reverted_at, c.created_at,
               (c.status = 'posted' and tx.status = 'voided') as voided_elsewhere,
               case when c.status = 'posted' and not c.duplicate_dismissed and tx.status = 'posted' then (
                 select json_build_object('id', d.id, 'occurred_on', d.occurred_on, 'note', d.note, 'amount', d.amount)
                 from public.transactions d
                 where d.owner_id = c.owner_id and d.kind = 'expense' and d.status = 'posted'
                   and d.account_id = tx.account_id and d.amount = c.amount
                   and d.occurred_on between c.due_on - 3 and c.due_on + 3
                   and d.id <> c.transaction_id
                   and not exists (select 1 from public.subscription_charges o
                                   where o.transaction_id = d.id or o.linked_transaction_id = d.id)
                   and not exists (select 1 from public.fixed_expense_payments fp
                                   where fp.transaction_id = d.id and fp.status = 'posted')
                 order by abs(d.occurred_on - c.due_on), d.created_at
                 limit 1
               ) end as possible_duplicate
        from public.subscription_charges c
        left join public.transactions tx on tx.id = c.transaction_id
        order by c.due_on desc, c.created_at desc
        limit 100
      ) x
    ), '[]'::json)
  );
$$;

revoke execute on function public.link_subscription_charge(uuid, uuid) from public, anon;
grant execute on function public.link_subscription_charge(uuid, uuid) to authenticated;

revoke execute on function public.get_subscription_overview(date) from public, anon;
grant execute on function public.get_subscription_overview(date) to authenticated;

revoke execute on function public.subscription_today() from public, anon;
grant execute on function public.subscription_today() to authenticated;
revoke execute on function public.subscription_due_on(date, text, int) from public, anon;
grant execute on function public.subscription_due_on(date, text, int) to authenticated;
revoke execute on function public.fixed_expense_due_on(date, text, int) from public, anon;
grant execute on function public.fixed_expense_due_on(date, text, int) to authenticated;
revoke execute on function public.savings_reminder_due_on(date, text, int) from public, anon;
grant execute on function public.savings_reminder_due_on(date, text, int) to authenticated;

commit;
