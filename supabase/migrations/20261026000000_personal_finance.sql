-- Personal finance core: categories, accounts, transactions, transfers, derived balances and RPCs.
-- Money is numeric(14,2) in ARS. Financial rows are never deleted: they are voided. Balances are derived, never stored.
-- Wrapped in one transaction so a mid-script failure (e.g. in the SQL Editor) rolls back completely.

begin;

-- Shared guards -------------------------------------------------------------------------------

-- Identity columns are immutable from the client.
create or replace function public.protect_owned_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

-- Posted -> voided is the only status transition. Voided rows are frozen.
create or replace function public.guard_status_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'voided' then
    raise exception 'voided_row_is_immutable' using errcode = '23514';
  end if;
  if new.status = 'voided' then
    new.voided_at := now();
  end if;
  return new;
end;
$$;

-- Category templates (global, read-only) ------------------------------------------------------

create table public.category_templates (
  slug text primary key check (slug ~ '^[a-z0-9_]+$'),
  kind text not null check (kind in ('expense', 'income')),
  name text not null,
  icon text not null,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order int not null
);

comment on table public.category_templates is 'Onboarding category set. Users get their own copies in public.categories.';

insert into public.category_templates (slug, kind, name, icon, color, sort_order) values
  ('comida',         'expense', 'Comida',         'Utensils',     '#E5533D', 10),
  ('transporte',     'expense', 'Transporte',     'BusFront',     '#2F9E8F', 20),
  ('super',          'expense', 'Súper',          'ShoppingCart', '#064735', 30),
  ('salidas',        'expense', 'Salidas',        'Martini',      '#F0AA2A', 40),
  ('suscripciones',  'expense', 'Suscripciones',  'RefreshCw',    '#8A6BD1', 50),
  ('salud',          'expense', 'Salud',          'Heart',        '#E0627A', 60),
  ('ocio',           'expense', 'Ocio',           'Tv',           '#4F86D9', 70),
  ('hogar',          'expense', 'Hogar',          'House',        '#6DBE3A', 80),
  ('viajes',         'expense', 'Viajes',         'Send',         '#1F9FC4', 90),
  ('mascotas',       'expense', 'Mascotas',       'PawPrint',     '#B8864B', 100),
  ('belleza',        'expense', 'Belleza',        'Sparkles',     '#D96BA8', 110),
  ('sueldo',         'income',  'Sueldo',         'Wallet',       '#0E8A6D', 10),
  ('freelance',      'income',  'Freelance',      'Laptop',       '#3E7CB1', 20),
  ('inversiones',    'income',  'Inversiones',    'TrendingUp',   '#7A6AD8', 30),
  ('regalos',        'income',  'Regalos',        'Gift',         '#E8743B', 40);

alter table public.category_templates enable row level security;
revoke all on table public.category_templates from anon, authenticated;
grant select on table public.category_templates to authenticated;

create policy "category_templates_select_authenticated"
on public.category_templates
for select
to authenticated
using (true);

-- Categories ----------------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  icon text not null check (char_length(icon) between 1 and 40),
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_owner_kind_name_key
on public.categories (owner_id, kind, lower(name))
where archived_at is null;

create index categories_owner_idx on public.categories (owner_id);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger categories_protect_columns
before update on public.categories
for each row execute function public.protect_owned_columns();

-- Accounts ------------------------------------------------------------------------------------

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  kind text not null check (kind in ('cash', 'bank', 'wallet')),
  currency char(3) not null default 'ARS' check (currency = 'ARS'),
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_owner_idx on public.accounts (owner_id);

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger accounts_protect_columns
before update on public.accounts
for each row execute function public.protect_owned_columns();

-- Transactions --------------------------------------------------------------------------------

-- Only expense/income are user-creatable now. The other kinds are reserved for shared expenses
-- and must stay out of income/expense statistics. shared_expense_id gets its FK in that phase.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account_id uuid not null references public.accounts (id) on delete no action,
  category_id uuid references public.categories (id) on delete no action,
  kind text not null check (kind in ('expense', 'income', 'shared_payment', 'settlement_out', 'settlement_in')),
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  note text check (char_length(note) <= 200),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  shared_expense_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null)),
  check (kind not in ('expense', 'income') or category_id is not null)
);

create index transactions_owner_date_idx on public.transactions (owner_id, occurred_on desc);
create index transactions_account_idx on public.transactions (account_id);
create index transactions_category_idx on public.transactions (category_id);

-- Referenced rows must belong to the same owner; categories must match the movement kind.
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

create trigger transactions_validate
before insert or update on public.transactions
for each row execute function public.validate_transaction();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger transactions_protect_columns
before update on public.transactions
for each row execute function public.protect_owned_columns();

create trigger transactions_guard_status
before update on public.transactions
for each row execute function public.guard_status_transition();

-- Transfers (never income/expense) ------------------------------------------------------------

create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null references public.accounts (id) on delete no action,
  to_account_id uuid not null references public.accounts (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  note text check (char_length(note) <= 200),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  check ((status = 'voided') = (voided_at is not null))
);

create index transfers_owner_date_idx on public.transfers (owner_id, occurred_on desc);
create index transfers_from_idx on public.transfers (from_account_id);
create index transfers_to_idx on public.transfers (to_account_id);

create or replace function public.validate_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_archived timestamptz;
begin
  foreach v_account_id in array array[new.from_account_id, new.to_account_id] loop
    if tg_op = 'INSERT'
       or (v_account_id is distinct from old.from_account_id and v_account_id is distinct from old.to_account_id) then
      select a.archived_at into v_archived
      from public.accounts a
      where a.id = v_account_id and a.owner_id = new.owner_id;
      if not found then
        raise exception 'account_not_found' using errcode = '23503';
      end if;
      if v_archived is not null then
        raise exception 'account_archived' using errcode = '23514';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

create trigger transfers_validate
before insert or update on public.transfers
for each row execute function public.validate_transfer();

create trigger transfers_set_updated_at
before update on public.transfers
for each row execute function public.set_updated_at();

create trigger transfers_protect_columns
before update on public.transfers
for each row execute function public.protect_owned_columns();

create trigger transfers_guard_status
before update on public.transfers
for each row execute function public.guard_status_transition();

-- Derived balances ----------------------------------------------------------------------------

create view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.owner_id,
  a.currency,
  a.archived_at,
  a.opening_balance
    + coalesce((
        select sum(case when t.kind in ('income', 'settlement_in') then t.amount else -t.amount end)
        from public.transactions t
        where t.account_id = a.id and t.status = 'posted'
      ), 0)
    + coalesce((select sum(tr.amount) from public.transfers tr
                where tr.to_account_id = a.id and tr.status = 'posted'), 0)
    - coalesce((select sum(tr.amount) from public.transfers tr
                where tr.from_account_id = a.id and tr.status = 'posted'), 0)
    as balance
from public.accounts a;

-- Row level security --------------------------------------------------------------------------

alter table public.categories enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;

revoke all on table public.categories, public.accounts, public.transactions, public.transfers, public.account_balances
  from anon, authenticated;

-- No DELETE grants: financial rows are voided, categories and accounts are archived.
grant select on table public.categories, public.accounts, public.transactions, public.transfers, public.account_balances
  to authenticated;

grant insert (kind, name, icon, color) on table public.categories to authenticated;
grant update (name, icon, color, archived_at) on table public.categories to authenticated;

grant insert (name, kind, opening_balance) on table public.accounts to authenticated;
grant update (name, kind, opening_balance, archived_at) on table public.accounts to authenticated;

grant insert (account_id, category_id, kind, amount, occurred_on, note) on table public.transactions to authenticated;
grant update (account_id, category_id, amount, occurred_on, note, status) on table public.transactions to authenticated;

grant insert (from_account_id, to_account_id, amount, occurred_on, note) on table public.transfers to authenticated;
grant update (from_account_id, to_account_id, amount, occurred_on, note, status) on table public.transfers to authenticated;

create policy "categories_select_own" on public.categories
for select to authenticated using (owner_id = (select auth.uid()));
create policy "categories_insert_own" on public.categories
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "categories_update_own" on public.categories
for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "accounts_select_own" on public.accounts
for select to authenticated using (owner_id = (select auth.uid()));
create policy "accounts_insert_own" on public.accounts
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "accounts_update_own" on public.accounts
for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "transactions_select_own" on public.transactions
for select to authenticated using (owner_id = (select auth.uid()));
create policy "transactions_insert_own" on public.transactions
for insert to authenticated
with check (owner_id = (select auth.uid()) and kind in ('expense', 'income'));
create policy "transactions_update_own" on public.transactions
for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "transfers_select_own" on public.transfers
for select to authenticated using (owner_id = (select auth.uid()));
create policy "transfers_insert_own" on public.transfers
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "transfers_update_own" on public.transfers
for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- RPC: complete onboarding --------------------------------------------------------------------

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

revoke execute on function public.complete_onboarding(text[], text[]) from public, anon;
grant execute on function public.complete_onboarding(text[], text[]) to authenticated;

-- RPC: month summary --------------------------------------------------------------------------

-- Only posted expense/income count. Transfers and reserved kinds never appear in income/expense.
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

revoke execute on function public.get_month_summary(date) from public, anon;
grant execute on function public.get_month_summary(date) to authenticated;

-- Trigger functions are internal: not callable through the API (same convention as handle_new_user).
revoke execute on function public.protect_owned_columns() from public, anon, authenticated;
revoke execute on function public.guard_status_transition() from public, anon, authenticated;
revoke execute on function public.validate_transaction() from public, anon, authenticated;
revoke execute on function public.validate_transfer() from public, anon, authenticated;

commit;
