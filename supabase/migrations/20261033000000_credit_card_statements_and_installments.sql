-- Credit cards, complete: limit, closing and due dates, installment purchases, monthly statements.
--
-- Model (all amounts ARS; money is never stored twice):
--  * accounts (credit_card only): credit_limit, closing_day, due_day. Days 29-31 fall on the last day of
--    shorter months. A purchase made up to and including the closing day belongs to the statement that
--    closes that day; later ones to the next. The due date is the first due_day after the closing date.
--  * transactions.statement_closing_on: the statement a card charge belongs to. Set once, when the
--    movement is created (trigger), so changing the closing day later never reshuffles history.
--  * An installment purchase is one installment_plans row plus one ordinary expense per remaining
--    installment, each dated on the closing day of its statement (so every monthly report counts the
--    installment in its own month and the plan itself is never an expense). The whole commitment is in
--    the card debt from day one because account_balances sums every posted movement. Future installments
--    are "scheduled": dated after today. Clients cannot create, edit or void plan rows directly.
--  * Payments are transfers into the card (never expenses). get_card_overview applies all credits to the
--    oldest statements first, so billed / to-be-billed / future installments / total debt / available are
--    always computed from the same rows: nothing derived is stored.
--
-- Additive. Nothing existing is rewritten, except: the transactions update policy (plan rows are not
-- client-editable) and get_month_summary (its "recent" list leaves out scheduled installments).
--
-- Rollback (valid while no installment plan exists; void/delete plans first):
--   drop function public.get_card_overview(uuid, date), public.create_installment_purchase(uuid, text, uuid, numeric, int, int, date, date, text),
--     public.void_installment_plan(uuid), public.card_statement_closing_for(date, int), public.card_due_for(date, int),
--     public.card_closing_after(date, int, int), public.card_day_in_month(date, int) cascade;
--   drop trigger transactions_assign_statement on public.transactions; drop trigger accounts_backfill_statements on public.accounts;
--   drop function public.assign_card_statement(), public.backfill_card_statements();
--   alter table public.transactions drop column installment_plan_id, drop column installment_number,
--     drop column installments_total, drop column statement_closing_on;
--   drop table public.installment_plans;
--   alter table public.accounts drop column credit_limit, drop column closing_day, drop column due_day;
--   (then restore the previous transactions_update_own policy and get_month_summary from 20261029000000)

begin;

-- Card configuration --------------------------------------------------------------------------

alter table public.accounts
  add column credit_limit numeric(14,2) check (credit_limit is null or credit_limit > 0),
  add column closing_day smallint check (closing_day between 1 and 31),
  add column due_day smallint check (due_day between 1 and 31),
  add constraint accounts_card_config_check
    check (kind = 'credit_card' or (credit_limit is null and closing_day is null and due_day is null));

grant insert (credit_limit, closing_day, due_day) on table public.accounts to authenticated;
grant update (credit_limit, closing_day, due_day) on table public.accounts to authenticated;

-- Calendar helpers (pure) -------------------------------------------------------------------------

-- The given day of the month that contains p_month_start, clamped to the month's last day.
create or replace function public.card_day_in_month(p_month_start date, p_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select (date_trunc('month', p_month_start::timestamp)::date
          + (least(p_day, extract(day from (date_trunc('month', p_month_start::timestamp) + interval '1 month - 1 day'))::int) - 1))
$$;

-- Closing date of the statement a purchase made on p_on belongs to (closing day inclusive).
create or replace function public.card_statement_closing_for(p_on date, p_closing_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_on <= public.card_day_in_month(p_on, p_closing_day)
      then public.card_day_in_month(p_on, p_closing_day)
    else public.card_day_in_month((date_trunc('month', p_on::timestamp) + interval '1 month')::date, p_closing_day)
  end
$$;

-- Due date of a statement: the first due day strictly after its closing date.
create or replace function public.card_due_for(p_closing date, p_due_day int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when public.card_day_in_month(p_closing, p_due_day) > p_closing
      then public.card_day_in_month(p_closing, p_due_day)
    else public.card_day_in_month((date_trunc('month', p_closing::timestamp) + interval '1 month')::date, p_due_day)
  end
$$;

-- The closing date p_months after the closing date p_closing.
create or replace function public.card_closing_after(p_closing date, p_closing_day int, p_months int)
returns date
language sql
immutable
set search_path = ''
as $$
  select public.card_day_in_month((date_trunc('month', p_closing::timestamp) + make_interval(months => p_months))::date, p_closing_day)
$$;

-- Installment plans ---------------------------------------------------------------------------

create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete no action,
  category_id uuid not null references public.categories (id) on delete no action,
  description text not null check (char_length(btrim(description)) between 1 and 80),
  total_amount numeric(14,2) not null check (total_amount > 0),
  installments_count smallint not null check (installments_count between 2 and 60),
  -- "Voy en la N": the installment the person was on when loading a purchase already in progress.
  first_number smallint not null check (first_number >= 1),
  purchase_on date not null,
  first_statement_closing_on date not null,
  request_key text check (char_length(request_key) between 1 and 80),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (first_number <= installments_count),
  check ((status = 'voided') = (voided_at is not null))
);

create index installment_plans_owner_idx on public.installment_plans (owner_id, created_at desc);
create index installment_plans_account_idx on public.installment_plans (account_id);
-- A repeated submit (double tap, retry) carries the same key and finds the plan that already exists.
create unique index installment_plans_request_key on public.installment_plans (owner_id, request_key)
  where request_key is not null;

create trigger installment_plans_set_updated_at
before update on public.installment_plans
for each row execute function public.set_updated_at();

alter table public.installment_plans enable row level security;
revoke all on table public.installment_plans from anon, authenticated;
grant select on table public.installment_plans to authenticated;
create policy "installment_plans_select_own" on public.installment_plans
for select to authenticated using (owner_id = (select auth.uid()));

-- Transactions: statement and installment columns -----------------------------------------------------

alter table public.transactions
  add column statement_closing_on date,
  add column installment_plan_id uuid references public.installment_plans (id) on delete no action,
  add column installment_number smallint check (installment_number >= 1),
  add column installments_total smallint check (installments_total between 2 and 60),
  add constraint transactions_installment_check check (
    (installment_plan_id is null and installment_number is null and installments_total is null)
    or (installment_plan_id is not null and installment_number is not null and installments_total is not null
        and installment_number <= installments_total and kind = 'expense')
  );

create unique index transactions_installment_key on public.transactions (installment_plan_id, installment_number)
  where installment_plan_id is not null;
create index transactions_statement_idx on public.transactions (account_id, statement_closing_on)
  where statement_closing_on is not null;

-- The columns above are only written by the triggers and RPCs below: no client INSERT/UPDATE grants exist
-- for them. Plan rows are also out of reach of the client UPDATE policy (voiding goes through the RPC).
drop policy "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
for update to authenticated
using (owner_id = (select auth.uid()) and installment_plan_id is null)
with check (owner_id = (select auth.uid()) and installment_plan_id is null
            and kind in ('expense', 'income', 'adjustment_in', 'adjustment_out'));

-- Statement assignment --------------------------------------------------------------------------------

-- Charges on a configured card get the statement they belong to when they are created (or re-dated).
create or replace function public.assign_card_statement()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_closing smallint;
begin
  if new.installment_plan_id is not null then
    return new; -- chosen by create_installment_purchase and never moved
  end if;
  new.statement_closing_on := null;
  if new.kind in ('expense', 'shared_payment', 'settlement_out', 'adjustment_out') then
    select a.kind, a.closing_day into v_kind, v_closing from public.accounts a where a.id = new.account_id;
    if v_kind = 'credit_card' and v_closing is not null then
      new.statement_closing_on := public.card_statement_closing_for(new.occurred_on, v_closing);
    end if;
  end if;
  return new;
end;
$$;

create trigger transactions_assign_statement
before insert or update of account_id, occurred_on, kind on public.transactions
for each row execute function public.assign_card_statement();

-- A card that gets its closing day for the first time files its existing charges in their statements.
-- Changing the closing day later only affects purchases made afterwards.
create or replace function public.backfill_card_statements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'credit_card' and new.closing_day is not null and old.closing_day is null then
    update public.transactions t
    set statement_closing_on = public.card_statement_closing_for(t.occurred_on, new.closing_day)
    where t.account_id = new.id and t.status = 'posted' and t.installment_plan_id is null
      and t.statement_closing_on is null
      and t.kind in ('expense', 'shared_payment', 'settlement_out', 'adjustment_out');
  end if;
  return null;
end;
$$;

create trigger accounts_backfill_statements
after update of closing_day, kind on public.accounts
for each row execute function public.backfill_card_statements();

-- RPC: installment purchase -------------------------------------------------------------------------
-- One call creates the plan and every remaining installment, or nothing. The total is split in exact
-- cents (the first installments carry the leftover cents), so the installments always add up to the total.
-- p_current_number: "voy en la N" (installments before N are already behind you and are not recorded).
-- p_first_closing: statement of the first recorded installment; defaults to the one the purchase date
-- falls in and may be moved one statement back or two forward because banks differ.
-- p_request_key makes a retry return the plan that already exists.

create or replace function public.create_installment_purchase(
  p_account uuid,
  p_description text,
  p_category uuid,
  p_total numeric,
  p_count int,
  p_current_number int default 1,
  p_purchase_on date default null,
  p_first_closing date default null,
  p_request_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_card record;
  v_cat record;
  v_plan uuid;
  v_purchase date;
  v_default_first date;
  v_first date;
  v_total_cents bigint;
  v_base bigint;
  v_extra bigint;
  v_cents bigint;
  v_closing date;
  k int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_description is null or char_length(btrim(p_description)) not between 1 and 80 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_total is null or p_total <= 0 or p_total >= 1000000000000 or round(p_total, 2) <> p_total then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_count is null or p_count not between 2 and 60 then
    raise exception 'invalid_installments' using errcode = '22023';
  end if;
  if p_current_number is null or p_current_number not between 1 and p_count then
    raise exception 'invalid_installment_number' using errcode = '22023';
  end if;

  select a.id, a.kind, a.closing_day, a.due_day, a.archived_at into v_card
  from public.accounts a where a.id = p_account and a.owner_id = v_uid;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if v_card.archived_at is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;
  if v_card.kind <> 'credit_card' then
    raise exception 'not_a_credit_card' using errcode = '23514';
  end if;
  if v_card.closing_day is null or v_card.due_day is null then
    raise exception 'card_not_configured' using errcode = '23514';
  end if;

  select c.kind, c.archived_at into v_cat
  from public.categories c where c.id = p_category and c.owner_id = v_uid;
  if not found then
    raise exception 'category_not_found' using errcode = '23503';
  end if;
  if v_cat.archived_at is not null then
    raise exception 'category_archived' using errcode = '23514';
  end if;
  if v_cat.kind <> 'expense' then
    raise exception 'category_kind_mismatch' using errcode = '23514';
  end if;

  v_purchase := coalesce(p_purchase_on, v_today);
  if v_purchase > v_today or v_purchase < v_today - 1830 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  v_default_first := public.card_statement_closing_for(v_purchase, v_card.closing_day);
  v_first := coalesce(p_first_closing, v_default_first);
  if v_first <> public.card_day_in_month(v_first, v_card.closing_day)
     or v_first < public.card_closing_after(v_default_first, v_card.closing_day, -1)
     or v_first > public.card_closing_after(v_default_first, v_card.closing_day, 2) then
    raise exception 'invalid_statement' using errcode = '22023';
  end if;

  insert into public.installment_plans
    (owner_id, account_id, category_id, description, total_amount, installments_count, first_number,
     purchase_on, first_statement_closing_on, request_key)
  values
    (v_uid, p_account, p_category, btrim(p_description), p_total, p_count, p_current_number,
     v_purchase, v_first, nullif(btrim(p_request_key), ''))
  on conflict (owner_id, request_key) where request_key is not null do nothing
  returning id into v_plan;

  if v_plan is null then
    select ip.id into v_plan from public.installment_plans ip
    where ip.owner_id = v_uid and ip.request_key = nullif(btrim(p_request_key), '');
    return v_plan; -- already created by an earlier identical request
  end if;

  v_total_cents := round(p_total * 100)::bigint;
  v_base := v_total_cents / p_count;
  v_extra := v_total_cents - v_base * p_count;

  for k in p_current_number..p_count loop
    v_closing := public.card_closing_after(v_first, v_card.closing_day, k - p_current_number);
    v_cents := v_base + case when k <= v_extra then 1 else 0 end;
    insert into public.transactions
      (owner_id, account_id, category_id, kind, amount, occurred_on, note, statement_closing_on,
       installment_plan_id, installment_number, installments_total)
    values
      (v_uid, p_account, p_category, 'expense', v_cents / 100.0, v_closing, btrim(p_description), v_closing,
       v_plan, k, p_count);
  end loop;

  return v_plan;
end;
$$;

-- RPC: cancel a whole plan ---------------------------------------------------------------------------
-- Voids the plan and all its installments (history is kept). Returns how many installments were voided.

create or replace function public.void_installment_plan(p_plan uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.installment_plans
  set status = 'voided', voided_at = now()
  where id = p_plan and owner_id = v_uid and status = 'posted';
  if not found then
    raise exception 'plan_not_found' using errcode = '23503';
  end if;
  update public.transactions
  set status = 'voided'
  where installment_plan_id = p_plan and owner_id = v_uid and status = 'posted';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- RPC: card overview ------------------------------------------------------------------------------------
-- Debt split by statement phase, applying every credit (payments, refunds, adjustments in) to the oldest
-- charges first. Phases, relative to p_today (default: today in Argentina):
--   billed  = statements already closed, still unpaid ("deuda facturada")
--   open    = the statement in progress ("por facturar")
--   future  = statements after it, i.e. installments still to come ("cuotas futuras")
--   debt_total = billed + open + future = what the account balance says is owed
--   available = credit_limit - debt_total (null without a limit; negative when over the limit)
--   in_favor  = credit beyond the whole debt
-- A statement with no closing date (opening debt, adjustments, a card without closing day) is billed
-- once its date has passed. Returns null for accounts that are not the caller's credit cards.

create or replace function public.get_card_overview(p_account uuid, p_today date default null)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with
  today as (
    select coalesce(p_today, (now() at time zone 'America/Argentina/Buenos_Aires')::date) as d
  ),
  card as (
    select a.id, a.name, a.credit_limit, a.closing_day, a.due_day, a.opening_balance
    from public.accounts a
    where a.id = p_account and a.kind = 'credit_card' and a.owner_id = (select auth.uid())
  ),
  charges as (
    select date '1900-01-01' as closing_on, (-c.opening_balance) as amount, false as is_statement
    from card c where c.opening_balance < 0
    union all
    select coalesce(t.statement_closing_on, t.occurred_on), t.amount, t.statement_closing_on is not null
    from public.transactions t join card c on c.id = t.account_id
    where t.status = 'posted' and t.kind in ('expense', 'shared_payment', 'settlement_out', 'adjustment_out')
    union all
    select tr.occurred_on, tr.amount, false
    from public.transfers tr join card c on c.id = tr.from_account_id
    where tr.status = 'posted'
  ),
  credits as (
    select coalesce(sum(x.amount), 0) as total
    from (
      select t.amount
      from public.transactions t join card c on c.id = t.account_id
      where t.status = 'posted' and t.kind in ('income', 'settlement_in', 'adjustment_in')
      union all
      select tr.amount
      from public.transfers tr join card c on c.id = tr.to_account_id
      where tr.status = 'posted'
    ) x
  ),
  buckets as (
    select closing_on, sum(amount) as charged, bool_or(is_statement) as is_statement
    from charges group by closing_on
  ),
  cumulative as (
    select b.*, sum(b.charged) over (order by b.closing_on) as cum from buckets b
  ),
  applied as (
    select cu.closing_on, cu.charged, cu.is_statement,
           greatest(0, least(cu.charged, (select total from credits) - (cu.cum - cu.charged))) as paid
    from cumulative cu
  ),
  cfg as (
    select c.*,
           case when c.closing_day is not null
                then public.card_statement_closing_for((select d from today), c.closing_day) end as open_closing
    from card c
  ),
  phased as (
    select ap.closing_on, ap.charged, ap.paid, ap.charged - ap.paid as remaining, ap.is_statement,
           case
             when ap.closing_on < (select d from today) then 'closed'
             when (select open_closing from cfg) is not null and ap.closing_on > (select open_closing from cfg) then 'future'
             else 'open'
           end as phase
    from applied ap
  ),
  totals as (
    select coalesce(sum(remaining) filter (where phase = 'closed'), 0) as billed,
           coalesce(sum(remaining) filter (where phase = 'open'), 0) as open,
           coalesce(sum(remaining) filter (where phase = 'future'), 0) as future,
           coalesce(sum(charged), 0) as charged
    from phased
  )
  select json_build_object(
    'account_id', cfg.id,
    'configured', cfg.closing_day is not null and cfg.due_day is not null,
    'credit_limit', cfg.credit_limit,
    'closing_day', cfg.closing_day,
    'due_day', cfg.due_day,
    'billed', (select billed from totals),
    'open', (select open from totals),
    'future', (select future from totals),
    'debt_total', (select billed + open + future from totals),
    'in_favor', greatest(0, (select total from credits) - (select charged from totals)),
    'available', case when cfg.credit_limit is null then null
                      else cfg.credit_limit - (select billed + open + future from totals) end,
    'next_closing_on', cfg.open_closing,
    'next_due_on', case when cfg.open_closing is not null and cfg.due_day is not null
                        then public.card_due_for(cfg.open_closing, cfg.due_day) end,
    'statements', coalesce((
      select json_agg(json_build_object(
        'closing_on', case when ph.closing_on = date '1900-01-01' then null else ph.closing_on end,
        'due_on', case when ph.is_statement and cfg.due_day is not null
                       then public.card_due_for(ph.closing_on, cfg.due_day) end,
        'charged', ph.charged, 'paid', ph.paid, 'remaining', ph.remaining,
        'phase', ph.phase,
        'status', case when ph.phase = 'closed' and ph.remaining = 0 then 'paid'
                       when ph.phase = 'closed' then 'billed'
                       else ph.phase end
      ) order by ph.closing_on)
      from phased ph
    ), '[]'::json)
  )
  from cfg;
$$;

-- Month summary: scheduled installments stay out of "recent" ------------------------------------------
-- Same signature and output shape (recent rows gain installment_number / installments_total).

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
           a.name as account_name, t.installment_number, t.installments_total
    from public.transactions t
    cross join bounds b
    join public.accounts a on a.id = t.account_id
    left join public.categories c on c.id = t.category_id
    where t.owner_id = (select auth.uid()) and t.status = 'posted'
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
      -- Scheduled installments are not executed yet: they stay out of "Últimos movimientos".
      and not (t.installment_plan_id is not null
               and t.occurred_on > (now() at time zone 'America/Argentina/Buenos_Aires')::date)
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

-- Privileges ------------------------------------------------------------------------------------------

revoke execute on function public.card_day_in_month(date, int) from public, anon;
revoke execute on function public.card_statement_closing_for(date, int) from public, anon;
revoke execute on function public.card_due_for(date, int) from public, anon;
revoke execute on function public.card_closing_after(date, int, int) from public, anon;
revoke execute on function public.create_installment_purchase(uuid, text, uuid, numeric, int, int, date, date, text) from public, anon;
revoke execute on function public.void_installment_plan(uuid) from public, anon;
revoke execute on function public.get_card_overview(uuid, date) from public, anon;
revoke execute on function public.assign_card_statement() from public, anon, authenticated;
revoke execute on function public.backfill_card_statements() from public, anon, authenticated;
grant execute on function public.card_day_in_month(date, int) to authenticated;
grant execute on function public.card_statement_closing_for(date, int) to authenticated;
grant execute on function public.card_due_for(date, int) to authenticated;
grant execute on function public.card_closing_after(date, int, int) to authenticated;
grant execute on function public.create_installment_purchase(uuid, text, uuid, numeric, int, int, date, date, text) to authenticated;
grant execute on function public.void_installment_plan(uuid) to authenticated;
grant execute on function public.get_card_overview(uuid, date) to authenticated;

commit;
