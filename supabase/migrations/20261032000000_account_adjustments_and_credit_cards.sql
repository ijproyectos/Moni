-- Balance adjustments and credit cards.
--
-- 1. Adjustments: a way to correct an account balance that is neither income nor expense. They are
--    stored as transactions of kind adjustment_in / adjustment_out, move the balance and stay out of
--    every income/expense statistic (get_month_summary and the Activity totals only read
--    'expense' / 'income').
-- 2. Credit cards: accounts.kind = 'credit_card'. Same math as any account (the balance is what is
--    owed, so it is zero or negative), but the debt is not "available money": it is excluded from
--    available_balance. Paying the card is a transfer to it, never an expense.
--
-- Additive: no data is changed and no row is rewritten. Existing accounts and movements keep working.
--
-- Rollback (only valid while no adjustment or card exists; otherwise archive/void those rows first):
--   drop function public.adjust_account_balance(uuid, numeric, text);
--   alter table public.transactions drop constraint transactions_kind_check,
--     add constraint transactions_kind_check check (kind in ('expense','income','shared_payment','settlement_out','settlement_in'));
--   alter table public.accounts drop constraint accounts_kind_check,
--     add constraint accounts_kind_check check (kind in ('cash','bank','wallet'));
--   alter table public.accounts drop constraint accounts_opening_balance_check,
--     add constraint accounts_opening_balance_check check (opening_balance >= 0);
--   (then restore the previous account_balances view, transactions policies and get_month_summary)

begin;

-- Movement kinds ------------------------------------------------------------------------------

alter table public.transactions drop constraint transactions_kind_check;
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense', 'income', 'shared_payment', 'settlement_out', 'settlement_in',
                  'adjustment_in', 'adjustment_out'));

-- Balance: adjustment_in raises it like income does; adjustment_out lowers it like an expense.
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
        select sum(case when t.kind in ('income', 'settlement_in', 'adjustment_in') then t.amount else -t.amount end)
        from public.transactions t
        where t.account_id = a.id and t.status = 'posted'
      ), 0)
    + coalesce((select sum(tr.amount) from public.transfers tr
                where tr.to_account_id = a.id and tr.status = 'posted'), 0)
    - coalesce((select sum(tr.amount) from public.transfers tr
                where tr.from_account_id = a.id and tr.status = 'posted'), 0)
    as balance
from public.accounts a;

-- Clients may create and void adjustments next to expenses and incomes.
drop policy "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
for insert to authenticated
with check (owner_id = (select auth.uid())
            and kind in ('expense', 'income', 'adjustment_in', 'adjustment_out'));

drop policy "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid())
            and kind in ('expense', 'income', 'adjustment_in', 'adjustment_out'));

-- Account kinds -------------------------------------------------------------------------------

alter table public.accounts drop constraint accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check
  check (kind in ('cash', 'bank', 'wallet', 'credit_card'));

-- A card can start with a debt (negative opening balance); every other account starts at zero or more.
alter table public.accounts drop constraint accounts_opening_balance_check;
alter table public.accounts add constraint accounts_opening_balance_check
  check ((kind = 'credit_card' and opening_balance <= 0) or (kind <> 'credit_card' and opening_balance >= 0));

-- RPC: set an account to a real balance --------------------------------------------------------
-- "My balance is X": records the difference as one adjustment, so history stays intact. A card's
-- target is negative when money is owed. Nothing is written when the balance already matches.

create or replace function public.adjust_account_balance(
  p_account uuid,
  p_target numeric,
  p_note text default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current numeric;
  v_delta numeric;
begin
  if p_target is null or abs(p_target) >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  -- Serializes concurrent adjustments of the same account.
  perform 1 from public.accounts a
  where a.id = p_account and a.archived_at is null
  for update;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;

  select ab.balance into v_current from public.account_balances ab where ab.account_id = p_account;
  v_delta := round(p_target, 2) - v_current;
  if v_delta = 0 then
    return 0;
  end if;

  insert into public.transactions (account_id, kind, amount, note)
  values (
    p_account,
    case when v_delta > 0 then 'adjustment_in' else 'adjustment_out' end,
    abs(v_delta),
    coalesce(nullif(btrim(p_note), ''), 'Ajuste de saldo')
  );
  return v_delta;
end;
$$;

revoke execute on function public.adjust_account_balance(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_account_balance(uuid, numeric, text) to authenticated;

-- Month summary: card debt is not available money -----------------------------------------------
-- Same signature, same output shape; the only change is the available_balance subquery.

CREATE OR REPLACE FUNCTION public.get_month_summary(p_month date)
 RETURNS json
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with bounds as (
    select date_trunc('month', p_month)::date as from_day,
           (date_trunc('month', p_month) + interval '1 month')::date as to_day
  ),
  month_tx as (
    select t.*
    from public.transactions t, bounds b
    where t.owner_id = (select auth.uid())
      and t.status = 'posted'
      and t.kind in ('expense', 'income')
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
  ),
  share_cat as (
    select coalesce(c.id::text, 'template:' || coalesce(ms.template_slug, 'none')) as category_id,
           coalesce(c.name, t.name, 'Gastos compartidos') as name,
           coalesce(c.color, t.color, '#6B7280') as color,
           coalesce(c.icon, t.icon, 'Sparkles') as icon,
           ms.amount,
           ms.occurred_on
    from bounds b
    cross join lateral public.my_shared_shares(b.from_day, b.to_day) ms
    left join public.category_templates t on t.slug = ms.template_slug
    left join public.categories c
      on c.owner_id = (select auth.uid())
     and c.kind = 'expense'
     and c.archived_at is null
     and lower(c.name) = lower(t.name)
  ),
  totals as (
    select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
           coalesce(sum(amount) filter (where kind = 'expense'), 0)
             + (select coalesce(sum(sc.amount), 0) from share_cat sc) as expense
    from month_tx
  ),
  by_cat as (
    select x.category_id, x.name, x.color, x.icon, sum(x.amount) as amount
    from (
      select c.id::text as category_id, c.name, c.color, c.icon, m.amount
      from month_tx m
      join public.categories c on c.id = m.category_id
      where m.kind = 'expense'
      union all
      select sc.category_id, sc.name, sc.color, sc.icon, sc.amount
      from share_cat sc
    ) x
    group by x.category_id, x.name, x.color, x.icon
  ),
  daily as (
    select d.day, sum(d.expense) as expense, sum(d.income) as income
    from (
      select m.occurred_on as day,
             case when m.kind = 'expense' then m.amount else 0 end as expense,
             case when m.kind = 'income' then m.amount else 0 end as income
      from month_tx m
      union all
      select sc.occurred_on, sc.amount, 0
      from share_cat sc
    ) d
    group by d.day
  ),
  recent as (
    select t.id, t.kind, t.amount, t.occurred_on, t.note, t.account_id, t.created_at,
           c.name as category_name, c.color as category_color, c.icon as category_icon,
           a.name as account_name
    from public.transactions t
    cross join bounds b
    join public.accounts a on a.id = t.account_id
    left join public.categories c on c.id = t.category_id
    where t.owner_id = (select auth.uid()) and t.status = 'posted'
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
    order by t.occurred_on desc, t.created_at desc
    limit 5
  )
  select json_build_object(
    'income', (select income from totals),
    'expense', (select expense from totals),
    'balance', (select income - expense from totals),
    'available_balance', coalesce((
      select sum(ab.balance)
      from public.account_balances ab
      join public.accounts a on a.id = ab.account_id
      where ab.owner_id = (select auth.uid()) and ab.archived_at is null and ab.currency = 'ARS'
        and a.kind <> 'credit_card'
    ), 0),
    'by_category', coalesce((
      select json_agg(json_build_object(
        'category_id', bc.category_id, 'name', bc.name, 'color', bc.color, 'icon', bc.icon,
        'amount', bc.amount,
        'percent', round(bc.amount * 100 / nullif((select expense from totals), 0), 1)
      ) order by bc.amount desc, bc.name)
      from by_cat bc
    ), '[]'::json),
    'daily', coalesce((
      select json_agg(json_build_object('day', d.day, 'expense', d.expense, 'income', d.income) order by d.day)
      from daily d
    ), '[]'::json),
    'recent', coalesce((
      select json_agg(to_json(r) order by r.occurred_on desc, r.created_at desc)
      from recent r
    ), '[]'::json)
  );
$function$;

commit;
