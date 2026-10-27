-- One-off hotfix for databases where the pre-review version of 20261026000000_personal_finance.sql
-- was applied. Brings them to the reviewed version. Idempotent: safe to run on either version.

begin;

-- FKs toward owner-cascaded tables: NO ACTION so deleting an auth user can cascade.
alter table public.transactions
  drop constraint if exists transactions_account_id_fkey,
  add constraint transactions_account_id_fkey
    foreign key (account_id) references public.accounts (id) on delete no action,
  drop constraint if exists transactions_category_id_fkey,
  add constraint transactions_category_id_fkey
    foreign key (category_id) references public.categories (id) on delete no action;

alter table public.transfers
  drop constraint if exists transfers_from_account_id_fkey,
  add constraint transfers_from_account_id_fkey
    foreign key (from_account_id) references public.accounts (id) on delete no action,
  drop constraint if exists transfers_to_account_id_fkey,
  add constraint transfers_to_account_id_fkey
    foreign key (to_account_id) references public.accounts (id) on delete no action;

-- Default dates follow Argentina local time.
alter table public.transactions
  alter column occurred_on set default (now() at time zone 'America/Argentina/Buenos_Aires')::date;
alter table public.transfers
  alter column occurred_on set default (now() at time zone 'America/Argentina/Buenos_Aires')::date;

-- Archived categories cannot receive new movements.
create or replace function public.validate_transaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_archived timestamptz;
  v_category_kind text;
  v_category_archived timestamptz;
begin
  if tg_op = 'INSERT' or new.account_id is distinct from old.account_id then
    select a.archived_at into v_archived
    from public.accounts a
    where a.id = new.account_id and a.owner_id = new.owner_id;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null
     and (tg_op = 'INSERT' or new.category_id is distinct from old.category_id) then
    select c.kind, c.archived_at into v_category_kind, v_category_archived
    from public.categories c
    where c.id = new.category_id and c.owner_id = new.owner_id;
    if not found then
      raise exception 'category_not_found' using errcode = '23503';
    end if;
    if v_category_archived is not null then
      raise exception 'category_archived' using errcode = '23514';
    end if;
    if new.kind in ('expense', 'income') and v_category_kind <> new.kind then
      raise exception 'category_kind_mismatch' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- Onboarding: serialize concurrent submits and fail clearly without a profile.
create or replace function public.complete_onboarding(p_goals text[], p_template_slugs text[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Serialize concurrent submits for the same user (and fail clearly if the profile is missing).
  perform 1 from public.profiles where id = v_user for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set goals = coalesce(p_goals, '{}'),
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_user;

  -- owner_id is not insertable by clients; it defaults to auth.uid().
  insert into public.categories (kind, name, icon, color)
  select t.kind, t.name, t.icon, t.color
  from public.category_templates t
  where t.slug = any (coalesce(p_template_slugs, '{}'))
  order by t.kind, t.sort_order
  on conflict (owner_id, kind, lower(name)) where archived_at is null do nothing;

  if not exists (select 1 from public.accounts where owner_id = v_user) then
    insert into public.accounts (name, kind, opening_balance)
    values ('Efectivo', 'cash', 0);
  end if;
end;
$$;

-- Month summary: "recent" scoped to the selected month.
create or replace function public.get_month_summary(p_month date)
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
  month_tx as (
    select t.*
    from public.transactions t, bounds b
    where t.owner_id = (select auth.uid())
      and t.status = 'posted'
      and t.kind in ('expense', 'income')
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
  ),
  totals as (
    select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
           coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense
    from month_tx
  ),
  by_cat as (
    select c.id as category_id, c.name, c.color, c.icon, sum(m.amount) as amount
    from month_tx m
    join public.categories c on c.id = m.category_id
    where m.kind = 'expense'
    group by c.id, c.name, c.color, c.icon
  ),
  daily as (
    select occurred_on as day,
           coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
           coalesce(sum(amount) filter (where kind = 'income'), 0) as income
    from month_tx
    group by occurred_on
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
      select sum(ab.balance) from public.account_balances ab
      where ab.owner_id = (select auth.uid()) and ab.archived_at is null and ab.currency = 'ARS'
    ), 0),
    'by_category', coalesce((
      select json_agg(json_build_object(
        'category_id', bc.category_id, 'name', bc.name, 'color', bc.color, 'icon', bc.icon,
        'amount', bc.amount,
        'percent', round(bc.amount * 100 / nullif((select expense from totals), 0), 1)
      ) order by bc.amount desc)
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
$$;

-- Trigger functions are internal: not callable through the API (same convention as handle_new_user).
revoke execute on function public.protect_owned_columns() from public, anon, authenticated;
revoke execute on function public.guard_status_transition() from public, anon, authenticated;
revoke execute on function public.validate_transaction() from public, anon, authenticated;
revoke execute on function public.validate_transfer() from public, anon, authenticated;

commit;
