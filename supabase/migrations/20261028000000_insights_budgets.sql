-- Insights and budgets: period summaries, "gastos hormiga", per-category budgets and suggestions.
-- Requires 20261025 (profiles, set_updated_at), 20261026 (personal finance) and 20261027 (shared expenses).
-- Money is numeric(14,2) in ARS. Nothing is deleted: budgets are archived. Wrapped in one transaction so a
-- mid-script failure (e.g. in the SQL Editor) rolls back completely. get_month_summary is NOT modified.

begin;

-- Budgets -------------------------------------------------------------------------------------------
-- One monthly limit per expense category. Month-agnostic: the same limit applies every month.

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active budget per (owner, category); archived ones are history.
create unique index budgets_owner_category_active_key
on public.budgets (owner_id, category_id)
where archived_at is null;

create index budgets_owner_idx on public.budgets (owner_id);
create index budgets_category_idx on public.budgets (category_id);

create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

create trigger budgets_protect_columns
before update on public.budgets
for each row execute function public.protect_owned_columns();

-- The category must be the owner's own, non-archived, expense category. Checked when a budget is created
-- and when an archived budget is restored (category_id itself is not updatable by clients).
create or replace function public.validate_budget()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_kind text;
  v_archived timestamptz;
begin
  if tg_op = 'INSERT' or (old.archived_at is not null and new.archived_at is null) then
    select c.kind, c.archived_at into v_kind, v_archived
    from public.categories c
    where c.id = new.category_id and c.owner_id = new.owner_id;
    if not found then
      raise exception 'category_not_found' using errcode = '23503';
    end if;
    if v_archived is not null then
      raise exception 'category_archived' using errcode = '23514';
    end if;
    if v_kind <> 'expense' then
      raise exception 'category_kind_mismatch' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger budgets_validate
before insert or update on public.budgets
for each row execute function public.validate_budget();

alter table public.budgets enable row level security;

revoke all on table public.budgets from anon, authenticated;

-- No DELETE grant: budgets are archived. owner_id, id and created_at are never client-writable.
grant select on table public.budgets to authenticated;
grant insert (category_id, amount) on table public.budgets to authenticated;
grant update (amount, archived_at) on table public.budgets to authenticated;

create policy "budgets_select_own" on public.budgets
for select to authenticated using (owner_id = (select auth.uid()));
create policy "budgets_insert_own" on public.budgets
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "budgets_update_own" on public.budgets
for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Shared inclusion rules ----------------------------------------------------------------------------
-- The caller's income/expense movements in [p_from, p_to): the exact rules of get_month_summary
-- (posted expense/income transactions, plus the caller's own posted shares of shared expenses as expenses,
-- grouped under their own non-archived category named like the template, else a virtual 'template:<slug>').
-- Invoker rights: RLS applies; my_shared_shares is the only definer piece and is filtered by auth.uid().
create or replace function public.personal_movements(p_from date, p_to date)
returns table (
  kind text,
  category_id text,
  name text,
  color text,
  icon text,
  amount numeric,
  occurred_on date,
  is_share boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.kind, c.id::text, c.name, c.color, c.icon, t.amount, t.occurred_on, false
  from public.transactions t
  join public.categories c on c.id = t.category_id
  where t.owner_id = (select auth.uid())
    and t.status = 'posted'
    and t.kind in ('expense', 'income')
    and t.occurred_on >= p_from
    and t.occurred_on < p_to
  union all
  select 'expense',
         coalesce(c.id::text, 'template:' || coalesce(ms.template_slug, 'none')),
         coalesce(c.name, tpl.name, 'Gastos compartidos'),
         coalesce(c.color, tpl.color, '#6B7280'),
         coalesce(c.icon, tpl.icon, 'Sparkles'),
         ms.amount,
         ms.occurred_on,
         true
  from public.my_shared_shares(p_from, p_to) ms
  left join public.category_templates tpl on tpl.slug = ms.template_slug
  left join public.categories c
    on c.owner_id = (select auth.uid())
   and c.kind = 'expense'
   and c.archived_at is null
   and lower(c.name) = lower(tpl.name);
$$;

-- RPC: period summary -------------------------------------------------------------------------------
-- Same totals/by_category/daily shape as get_month_summary for an arbitrary range
-- (p_from inclusive, p_to exclusive, at most 400 days).
create or replace function public.get_period_summary(p_from date, p_to date)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_result json;
begin
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > 400 then
    raise exception 'invalid_period' using errcode = '22023';
  end if;

  with mv as (
    select * from public.personal_movements(p_from, p_to)
  ),
  totals as (
    select coalesce(sum(m.amount) filter (where m.kind = 'income'), 0) as income,
           coalesce(sum(m.amount) filter (where m.kind = 'expense'), 0) as expense
    from mv m
  ),
  by_cat as (
    select m.category_id, m.name, m.color, m.icon, sum(m.amount) as amount
    from mv m
    where m.kind = 'expense'
    group by m.category_id, m.name, m.color, m.icon
  ),
  daily as (
    select m.occurred_on as day,
           coalesce(sum(m.amount) filter (where m.kind = 'expense'), 0) as expense,
           coalesce(sum(m.amount) filter (where m.kind = 'income'), 0) as income
    from mv m
    group by m.occurred_on
  )
  select json_build_object(
    'income', (select income from totals),
    'expense', (select expense from totals),
    'balance', (select income - expense from totals),
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
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

-- RPC: gastos hormiga -------------------------------------------------------------------------------
-- Ant = one of the caller's own posted expense transactions of the month with amount <= threshold.
-- Default threshold: the lesser of $10.000 and the caller's median expense transaction of that month
-- (no expenses: $10.000). Ants are grouped by category and normalized note (lower + trim; empty note falls
-- back to the category name). A group qualifies with at least 3 occurrences. Shares of shared expenses are
-- not ants (they are not the caller's own purchases), but share_of_expenses divides by the same expense
-- total the dashboard shows (get_month_summary.expense, shares included) so the numbers reconcile.
create or replace function public.get_ant_expenses(p_month date, p_max_amount numeric default null)
returns json
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_from date;
  v_to date;
  v_median numeric;
  v_threshold numeric;
  v_total_expense numeric;
  v_result json;
begin
  if p_month is null then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_max_amount is not null and p_max_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;

  v_from := date_trunc('month', p_month)::date;
  v_to := (date_trunc('month', p_month) + interval '1 month')::date;

  if p_max_amount is not null then
    v_threshold := round(p_max_amount, 2);
  else
    select round((percentile_cont(0.5) within group (order by t.amount))::numeric, 2)
    into v_median
    from public.transactions t
    where t.owner_id = (select auth.uid())
      and t.status = 'posted'
      and t.kind = 'expense'
      and t.occurred_on >= v_from and t.occurred_on < v_to;
    v_threshold := least(10000, coalesce(v_median, 10000));
  end if;

  select coalesce(sum(m.amount), 0) into v_total_expense
  from public.personal_movements(v_from, v_to) m
  where m.kind = 'expense';

  with tx as (
    select c.id as category_id, c.name, c.color, c.icon, t.amount,
           lower(btrim(coalesce(nullif(btrim(t.note), ''), c.name))) as norm_key
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.owner_id = (select auth.uid())
      and t.status = 'posted'
      and t.kind = 'expense'
      and t.occurred_on >= v_from and t.occurred_on < v_to
      and t.amount <= v_threshold
  ),
  grp as (
    select x.category_id, x.name, x.color, x.icon, x.norm_key,
           upper(left(x.norm_key, 1)) || substr(x.norm_key, 2) as label,
           count(*) as occurrences,
           sum(x.amount) as total
    from tx x
    group by x.category_id, x.name, x.color, x.icon, x.norm_key
    having count(*) >= 3
  )
  select json_build_object(
    'month', v_from,
    'threshold', v_threshold,
    'month_total', coalesce((select sum(g.total) from grp g), 0),
    'share_of_expenses', round((select sum(g.total) from grp g) * 100 / nullif(v_total_expense, 0), 1),
    'groups', coalesce((
      select json_agg(json_build_object(
        'category_id', g.category_id, 'category_name', g.name, 'color', g.color, 'icon', g.icon,
        'label', g.label, 'count', g.occurrences, 'total', g.total,
        'average', round(g.total / g.occurrences, 2),
        'yearly_projection', g.total * 12
      ) order by g.total desc, g.label, g.category_id)
      from grp g
    ), '[]'::json)
  ) into v_result;

  return v_result;
end;
$$;

-- RPC: budget status --------------------------------------------------------------------------------
-- Per active budget (of a non-archived category): spent in the month with the get_month_summary expense
-- rules (shares included). state: 'over' above 100%, 'warning' from 80% up to and including 100%, else 'ok'.
create or replace function public.get_budget_status(p_month date)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as from_day,
           (date_trunc('month', p_month) + interval '1 month')::date as to_day
  ),
  spent as (
    select m.category_id, sum(m.amount) as amount
    from bounds b
    cross join lateral public.personal_movements(b.from_day, b.to_day) m
    where m.kind = 'expense'
    group by m.category_id
  ),
  budget_rows as (
    select bg.id as budget_id, c.id as category_id, c.name, c.color, c.icon, bg.amount,
           coalesce(s.amount, 0) as spent
    from public.budgets bg
    join public.categories c on c.id = bg.category_id
    left join spent s on s.category_id = c.id::text
    where bg.owner_id = (select auth.uid())
      and bg.archived_at is null
      and c.archived_at is null
  )
  select coalesce(json_agg(json_build_object(
    'budget_id', r.budget_id,
    'category_id', r.category_id,
    'name', r.name,
    'color', r.color,
    'icon', r.icon,
    'amount', r.amount,
    'spent', r.spent,
    'remaining', r.amount - r.spent,
    'percent', round(r.spent * 100 / r.amount, 1),
    'state', case
      when r.spent > r.amount then 'over'
      when r.spent * 100 >= r.amount * 80 then 'warning'
      else 'ok'
    end
  ) order by r.spent / r.amount desc, r.name), '[]'::json)
  from budget_rows r;
$$;

-- RPC: budget suggestions ---------------------------------------------------------------------------
-- For expense categories without an active budget: average monthly spend over the last 3 complete months
-- (Argentina calendar; the current month is excluded; the sum is divided by 3 so months without spend count
-- as zero), rounded up to the next $1.000. Only when there is spend in at least 2 of those 3 months.
create or replace function public.suggest_budgets()
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with this_month as (
    select date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')::date as first_day
  ),
  window_bounds as (
    select (first_day - interval '3 months')::date as from_day, first_day as to_day
    from this_month
  ),
  monthly as (
    select m.category_id,
           date_trunc('month', m.occurred_on)::date as month_start,
           sum(m.amount) as amount
    from window_bounds w
    cross join lateral public.personal_movements(w.from_day, w.to_day) m
    where m.kind = 'expense'
    group by m.category_id, date_trunc('month', m.occurred_on)::date
  ),
  agg as (
    select mo.category_id, sum(mo.amount) as total, count(*) as months_with_data
    from monthly mo
    group by mo.category_id
    having count(*) >= 2
  )
  select coalesce(json_agg(json_build_object(
    'category_id', c.id,
    'name', c.name,
    'color', c.color,
    'icon', c.icon,
    'suggested_amount', ceil(a.total / 3 / 1000) * 1000,
    'months_with_data', a.months_with_data
  ) order by a.total desc, c.name), '[]'::json)
  from agg a
  join public.categories c on c.id::text = a.category_id
  where c.owner_id = (select auth.uid())
    and c.kind = 'expense'
    and c.archived_at is null
    and not exists (
      select 1 from public.budgets bg
      where bg.owner_id = (select auth.uid())
        and bg.category_id = c.id
        and bg.archived_at is null
    );
$$;

-- Function privileges -------------------------------------------------------------------------------
-- RPCs (and the invoker helper they call): authenticated only. Trigger functions: nobody through the API.

revoke execute on function
  public.personal_movements(date, date),
  public.get_period_summary(date, date),
  public.get_ant_expenses(date, numeric),
  public.get_budget_status(date),
  public.suggest_budgets()
from public, anon;

grant execute on function
  public.personal_movements(date, date),
  public.get_period_summary(date, date),
  public.get_ant_expenses(date, numeric),
  public.get_budget_status(date),
  public.suggest_budgets()
to authenticated;

revoke execute on function public.validate_budget() from public, anon, authenticated;

commit;
