-- Fixed expenses (luz, agua, gas, internet, alquiler, expensas...): recurring bills whose amount changes and
-- that Moni NEVER pays or charges by itself.
--
-- Model
--   fixed_expenses             the bill the person follows: name, kind, estimated amount (editable every month),
--                              frequency (monthly / bimonthly / yearly), next due date, account or card.
--   fixed_expense_occurrences  one row per due date. It appears when the date arrives (created when the app opens;
--                              no scheduled job) as 'pending' and stays pending, overdue if need be, until the
--                              person registers the payment, skips it or moves its date. Moving the date keeps the
--                              original due date: due_on and rescheduled_to are separate.
--   fixed_expense_payments     what was actually paid: real amount, payment date (separate from the due date) and
--                              the expense (movement) it created or the one the person had already typed.
--
-- Only registering a payment creates a movement, and it is an ordinary expense (kind 'expense', dated on the
-- payment date), so balances, credit-card debt and statements, Actividad, month summaries, budgets and everything
-- of Joni's keep working untouched. A card payment follows the card's closing-date rules like any card purchase.
--
-- Safety rules
--   * One posted payment per occurrence (partial unique index + row lock) and a request key for retries: a double
--     tap or a retry never creates two expenses.
--   * Nothing is linked automatically. get_fixed_expense_duplicates lists expenses that look like the payment
--     (same account and amount, +-3 days) so the person can say "Ya lo cargue": the payment then points to that
--     expense and NO new movement is created.
--   * Undoing a payment (void_fixed_expense_payment) voids the movement it created (balance and card debt come
--     back) or, if it was linked, only detaches the person's own expense (never voids it). The occurrence returns
--     to pending and the payment stays in the history as voided.
--   * Pausing stops new due dates; removing the follow-up hides the bill and skips what was pending, keeping every
--     payment and movement.
--   * The notes of the movements carry the period ("Luz · oct 2026"), so each is unique for the "hormigas" report
--     that groups by note: fixed expenses never become ants and Joni's functions are untouched.
--
-- Reuses (does not modify) public.subscription_today(), subscription_month_label() and check_subscription_refs()
-- from 20261101000000_subscriptions.sql. Additive.
--
-- Rollback (only valid while no fixed expense exists):
--   drop function public.get_fixed_expense_overview(date), public.get_fixed_expense_duplicates(uuid, numeric, date, uuid),
--     public.process_my_fixed_expenses(), public.process_fixed_expenses_core(uuid, date),
--     public.create_fixed_expense(text, text, numeric, text, date, uuid, uuid, boolean, uuid),
--     public.update_fixed_expense(uuid, text, numeric, text, date, uuid, uuid, boolean),
--     public.set_fixed_expense_status(uuid, text),
--     public.register_fixed_expense_payment(uuid, numeric, date, uuid, boolean, uuid),
--     public.link_fixed_expense_payment(uuid, uuid), public.skip_fixed_expense_occurrence(uuid),
--     public.reschedule_fixed_expense_occurrence(uuid, date), public.void_fixed_expense_payment(uuid),
--     public.correct_fixed_expense_payment(uuid, numeric, date), public.fixed_expense_due_on(date, text, int);
--   drop table public.fixed_expense_payments, public.fixed_expense_occurrences, public.fixed_expenses;

begin;

-- Calendar (pure) -----------------------------------------------------------------------------------------
-- Same idea as subscription_due_on, with the bimonthly step. Always computed from the anchor (no drift).
create or replace function public.fixed_expense_due_on(p_anchor date, p_period text, p_n int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month_start date;
  v_last date;
begin
  v_month_start := ((p_anchor - (extract(day from p_anchor)::int - 1))
                    + make_interval(months => p_n * case p_period when 'yearly' then 12 when 'bimonthly' then 2 else 1 end))::date;
  v_last := (v_month_start + interval '1 month' - interval '1 day')::date;
  return least(v_month_start + (extract(day from p_anchor)::int - 1), v_last);
end;
$$;

-- Tables ---------------------------------------------------------------------------------------------------

create table public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Catalog id ("luz") or "custom". The catalog lives in the app.
  kind_id text not null check (kind_id ~ '^[a-z0-9_-]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- Estimated amount: editable every month, never charged by itself.
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  period text not null check (period in ('monthly', 'bimonthly', 'yearly')),
  anchor_on date not null,
  cycle int not null default 0 check (cycle >= 0),
  -- Next due date that has not become an occurrence yet.
  next_due_on date not null,
  account_id uuid not null references public.accounts (id) on delete no action,
  category_id uuid not null references public.categories (id) on delete no action,
  remind boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  paused_at timestamptz,
  removed_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_due_on = public.fixed_expense_due_on(anchor_on, period, cycle))
);

create unique index fixed_expenses_owner_request_key on public.fixed_expenses (owner_id, request_key)
  where request_key is not null;
create index fixed_expenses_due_idx on public.fixed_expenses (status, next_due_on);
create index fixed_expenses_owner_idx on public.fixed_expenses (owner_id, status);

create trigger fixed_expenses_set_updated_at
before update on public.fixed_expenses
for each row execute function public.set_updated_at();

create table public.fixed_expense_occurrences (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  fixed_expense_id uuid not null references public.fixed_expenses (id) on delete no action,
  -- Original due date (never changes) and, when the person moved it, the date it now counts for.
  due_on date not null,
  rescheduled_to date,
  expected_amount numeric(14,2) not null check (expected_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'skipped')),
  note text check (note is null or char_length(note) <= 200),
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixed_expense_id, due_on)
);

create index fixed_expense_occurrences_owner_idx on public.fixed_expense_occurrences (owner_id, status, due_on);

create trigger fixed_expense_occurrences_set_updated_at
before update on public.fixed_expense_occurrences
for each row execute function public.set_updated_at();

create table public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  occurrence_id uuid not null references public.fixed_expense_occurrences (id) on delete no action,
  fixed_expense_id uuid not null references public.fixed_expenses (id) on delete no action,
  -- Snapshots at the time of the payment; the movement is the source of truth while it exists.
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  account_id uuid not null references public.accounts (id) on delete no action,
  transaction_id uuid not null references public.transactions (id) on delete no action,
  -- registered: Moni created the movement | linked: the person had already typed it ("Ya lo cargue")
  source text not null check (source in ('registered', 'linked')),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null))
);

-- One payment per occurrence, and one occurrence per movement, while they stand.
create unique index fixed_expense_payments_one_posted on public.fixed_expense_payments (occurrence_id)
  where status = 'posted';
create unique index fixed_expense_payments_tx_posted on public.fixed_expense_payments (transaction_id)
  where status = 'posted';
create unique index fixed_expense_payments_request_key on public.fixed_expense_payments (owner_id, request_key)
  where request_key is not null;
create index fixed_expense_payments_owner_idx on public.fixed_expense_payments (owner_id, paid_on desc);

create trigger fixed_expense_payments_set_updated_at
before update on public.fixed_expense_payments
for each row execute function public.set_updated_at();

alter table public.fixed_expenses enable row level security;
alter table public.fixed_expense_occurrences enable row level security;
alter table public.fixed_expense_payments enable row level security;

revoke all on table public.fixed_expenses, public.fixed_expense_occurrences, public.fixed_expense_payments
  from anon, authenticated;
grant select on table public.fixed_expenses, public.fixed_expense_occurrences, public.fixed_expense_payments
  to authenticated;

create policy "fixed_expenses_select_own" on public.fixed_expenses
for select to authenticated using (owner_id = (select auth.uid()));
create policy "fixed_expense_occurrences_select_own" on public.fixed_expense_occurrences
for select to authenticated using (owner_id = (select auth.uid()));
create policy "fixed_expense_payments_select_own" on public.fixed_expense_payments
for select to authenticated using (owner_id = (select auth.uid()));

-- Due dates that have arrived become pending occurrences (no money moves) -------------------------------------
-- p_owner null = everybody; otherwise one person (the app opening). Idempotent: (expense, due date) is unique.
-- Catches up every missed date with its own date, oldest first (bounded to three years of monthly bills).

create or replace function public.process_fixed_expenses_core(p_owner uuid, p_today date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.fixed_expenses%rowtype;
  v_id uuid;
  v_count int := 0;
  v_guard int;
begin
  for f in
    select * from public.fixed_expenses
    where status = 'active' and next_due_on <= p_today and (p_owner is null or owner_id = p_owner)
    order by owner_id, next_due_on
    for update skip locked
  loop
    v_guard := 0;
    while f.next_due_on <= p_today and v_guard < 36 loop
      v_guard := v_guard + 1;
      insert into public.fixed_expense_occurrences (owner_id, fixed_expense_id, due_on, expected_amount)
      values (f.owner_id, f.id, f.next_due_on, f.amount)
      on conflict (fixed_expense_id, due_on) do nothing
      returning id into v_id;
      if v_id is not null then
        v_count := v_count + 1;
      end if;
      f.cycle := f.cycle + 1;
      f.next_due_on := public.fixed_expense_due_on(f.anchor_on, f.period, f.cycle);
    end loop;
    update public.fixed_expenses set cycle = f.cycle, next_due_on = f.next_due_on where id = f.id;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.process_fixed_expenses_core(uuid, date) from public, anon, authenticated;

create or replace function public.process_my_fixed_expenses()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return public.process_fixed_expenses_core(v_owner, public.subscription_today());
end;
$$;

revoke execute on function public.process_my_fixed_expenses() from public, anon;
grant execute on function public.process_my_fixed_expenses() to authenticated;

-- Writes: create / edit / status ---------------------------------------------------------------------------

create or replace function public.create_fixed_expense(
  p_kind text,
  p_name text,
  p_amount numeric,
  p_period text,
  p_next_on date,
  p_account uuid,
  p_category uuid,
  p_remind boolean default true,
  p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_id uuid;
  v_today date := public.subscription_today();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_id from public.fixed_expenses where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'bimonthly', 'yearly') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  -- A bill that is already due (up to 45 days ago) is welcome: it starts pending and overdue.
  if p_next_on is null or p_next_on < v_today - 45 or p_next_on > v_today + 800 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  perform public.check_subscription_refs(v_owner, p_account, p_category);

  insert into public.fixed_expenses (owner_id, kind_id, name, amount, period, anchor_on, cycle, next_due_on,
                                     account_id, category_id, remind, request_key)
  values (v_owner, p_kind, btrim(p_name), round(p_amount, 2), p_period, p_next_on, 0, p_next_on,
          p_account, p_category, coalesce(p_remind, true), p_request_key)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_fixed_expense(text, text, numeric, text, date, uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.create_fixed_expense(text, text, numeric, text, date, uuid, uuid, boolean, uuid) to authenticated;

-- The estimate can change every month. It also updates the expected amount of what is still pending. A new date
-- or frequency restarts the series on that date; occurrences that already exist are untouched.
create or replace function public.update_fixed_expense(
  p_id uuid,
  p_name text,
  p_amount numeric,
  p_period text,
  p_next_on date,
  p_account uuid,
  p_category uuid,
  p_remind boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  f public.fixed_expenses%rowtype;
  v_today date := public.subscription_today();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into f from public.fixed_expenses where id = p_id and owner_id = v_owner for update;
  if not found then
    raise exception 'fixed_expense_not_found' using errcode = '23503';
  end if;
  if f.status = 'removed' then
    raise exception 'fixed_expense_removed' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'bimonthly', 'yearly') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  perform public.check_subscription_refs(v_owner, p_account, p_category);

  if p_next_on is distinct from f.next_due_on or p_period <> f.period then
    if p_next_on is null or p_next_on < v_today - 45 or p_next_on > v_today + 800 then
      raise exception 'invalid_date' using errcode = '22023';
    end if;
    update public.fixed_expenses
    set anchor_on = p_next_on, cycle = 0, next_due_on = p_next_on, period = p_period
    where id = p_id;
  end if;

  update public.fixed_expenses
  set name = btrim(p_name), amount = round(p_amount, 2), account_id = p_account, category_id = p_category,
      remind = coalesce(p_remind, true)
  where id = p_id;
  update public.fixed_expense_occurrences set expected_amount = round(p_amount, 2)
  where fixed_expense_id = p_id and status = 'pending';
end;
$$;

revoke execute on function public.update_fixed_expense(uuid, text, numeric, text, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.update_fixed_expense(uuid, text, numeric, text, date, uuid, uuid, boolean) to authenticated;

-- active <-> paused <-> removed. Reactivating moves to the next date that is not in the past: nothing is created for
-- the time it was paused. Removing skips what was pending (the payments and movements stay).
create or replace function public.set_fixed_expense_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  f public.fixed_expenses%rowtype;
  v_today date := public.subscription_today();
  v_cycle int;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'removed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into f from public.fixed_expenses where id = p_id and owner_id = v_owner for update;
  if not found then
    raise exception 'fixed_expense_not_found' using errcode = '23503';
  end if;
  if f.status = p_status then
    return;
  end if;

  if p_status = 'active' then
    perform public.check_subscription_refs(v_owner, f.account_id, f.category_id);
    v_cycle := f.cycle;
    while public.fixed_expense_due_on(f.anchor_on, f.period, v_cycle) < v_today loop
      v_cycle := v_cycle + 1;
    end loop;
    update public.fixed_expenses
    set status = 'active', paused_at = null, removed_at = null, cycle = v_cycle,
        next_due_on = public.fixed_expense_due_on(f.anchor_on, f.period, v_cycle)
    where id = p_id;
  elsif p_status = 'paused' then
    if f.status = 'removed' then
      raise exception 'invalid_transition' using errcode = '23514';
    end if;
    update public.fixed_expenses set status = 'paused', paused_at = now() where id = p_id;
  else
    update public.fixed_expenses set status = 'removed', removed_at = now() where id = p_id;
    update public.fixed_expense_occurrences
    set status = 'skipped', skipped_at = now(), note = 'Seguimiento eliminado'
    where fixed_expense_id = p_id and status = 'pending';
  end if;
end;
$$;

revoke execute on function public.set_fixed_expense_status(uuid, text) from public, anon;
grant execute on function public.set_fixed_expense_status(uuid, text) to authenticated;

-- Registering a payment ------------------------------------------------------------------------------------

-- Expenses that look like this payment and that nothing else owns (same account and amount, +-3 days).
create or replace function public.get_fixed_expense_duplicates(
  p_occurrence uuid,
  p_amount numeric,
  p_paid_on date,
  p_account uuid default null
)
returns json
language sql
stable
set search_path = ''
as $$
  select coalesce(json_agg(json_build_object('id', d.id, 'occurred_on', d.occurred_on, 'note', d.note, 'amount', d.amount)
                           order by abs(d.occurred_on - p_paid_on), d.created_at), '[]'::json)
  from public.fixed_expense_occurrences o
  join public.fixed_expenses f on f.id = o.fixed_expense_id
  join public.transactions d
    on d.owner_id = o.owner_id and d.kind = 'expense' and d.status = 'posted'
   and d.account_id = coalesce(p_account, f.account_id) and d.amount = round(p_amount, 2)
   and d.occurred_on between p_paid_on - 3 and p_paid_on + 3
  where o.id = p_occurrence
    and not exists (select 1 from public.fixed_expense_payments p where p.transaction_id = d.id and p.status = 'posted')
    and not exists (select 1 from public.subscription_charges c where c.transaction_id = d.id or c.linked_transaction_id = d.id)
$$;

revoke execute on function public.get_fixed_expense_duplicates(uuid, numeric, date, uuid) from public, anon;
grant execute on function public.get_fixed_expense_duplicates(uuid, numeric, date, uuid) to authenticated;

create or replace function public.register_fixed_expense_payment(
  p_occurrence uuid,
  p_amount numeric,
  p_paid_on date,
  p_account uuid default null,
  p_update_estimate boolean default false,
  p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  o public.fixed_expense_occurrences%rowtype;
  f public.fixed_expenses%rowtype;
  v_today date := public.subscription_today();
  v_account uuid;
  v_tx uuid;
  v_payment uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_payment from public.fixed_expense_payments where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_payment;
    end if;
  end if;

  select * into o from public.fixed_expense_occurrences where id = p_occurrence and owner_id = v_owner for update;
  if not found then
    raise exception 'occurrence_not_found' using errcode = '23503';
  end if;
  if o.status <> 'pending' then
    raise exception 'already_resolved' using errcode = '23514';
  end if;
  select * into f from public.fixed_expenses where id = o.fixed_expense_id for update;

  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < o.due_on - 90 or p_paid_on < date '2000-01-01' then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  v_account := coalesce(p_account, f.account_id);
  perform public.check_subscription_refs(v_owner, v_account, f.category_id);

  insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note)
  values (v_owner, v_account, f.category_id, 'expense', round(p_amount, 2), p_paid_on,
          f.name || ' · ' || public.subscription_month_label(o.due_on, case when f.period = 'yearly' then 'yearly' else 'monthly' end))
  returning id into v_tx;

  insert into public.fixed_expense_payments (owner_id, occurrence_id, fixed_expense_id, amount, paid_on, account_id,
                                             transaction_id, source, request_key)
  values (v_owner, o.id, f.id, round(p_amount, 2), p_paid_on, v_account, v_tx, 'registered', p_request_key)
  returning id into v_payment;

  update public.fixed_expense_occurrences set status = 'paid' where id = o.id;
  if coalesce(p_update_estimate, false) then
    update public.fixed_expenses set amount = round(p_amount, 2) where id = f.id;
    update public.fixed_expense_occurrences set expected_amount = round(p_amount, 2)
    where fixed_expense_id = f.id and status = 'pending';
  end if;
  return v_payment;
end;
$$;

revoke execute on function public.register_fixed_expense_payment(uuid, numeric, date, uuid, boolean, uuid) from public, anon;
grant execute on function public.register_fixed_expense_payment(uuid, numeric, date, uuid, boolean, uuid) to authenticated;

-- "Ya lo cargue": the person typed this expense already. No movement is created; the payment points to theirs.
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
     or exists (select 1 from public.subscription_charges c where c.transaction_id = t.id or c.linked_transaction_id = t.id) then
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

revoke execute on function public.link_fixed_expense_payment(uuid, uuid) from public, anon;
grant execute on function public.link_fixed_expense_payment(uuid, uuid) to authenticated;

create or replace function public.skip_fixed_expense_occurrence(p_occurrence uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  o public.fixed_expense_occurrences%rowtype;
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
  update public.fixed_expense_occurrences set status = 'skipped', skipped_at = now(), note = 'Omitido' where id = o.id;
end;
$$;

revoke execute on function public.skip_fixed_expense_occurrence(uuid) from public, anon;
grant execute on function public.skip_fixed_expense_occurrence(uuid) to authenticated;

-- Moves the date a pending bill counts for; the original due date is kept.
create or replace function public.reschedule_fixed_expense_occurrence(p_occurrence uuid, p_new_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  o public.fixed_expense_occurrences%rowtype;
  v_today date := public.subscription_today();
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
  if p_new_date is null or p_new_date < v_today - 45 or p_new_date > v_today + 400 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  update public.fixed_expense_occurrences
  set rescheduled_to = case when p_new_date = o.due_on then null else p_new_date end
  where id = o.id;
end;
$$;

revoke execute on function public.reschedule_fixed_expense_occurrence(uuid, date) from public, anon;
grant execute on function public.reschedule_fixed_expense_occurrence(uuid, date) to authenticated;

-- Undo a payment: a registered one voids its movement (balance / card debt come back); a linked one only detaches
-- the person's own expense, which stays as it is. The occurrence goes back to pending; the payment stays voided.
create or replace function public.void_fixed_expense_payment(p_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  p public.fixed_expense_payments%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into p from public.fixed_expense_payments where id = p_payment and owner_id = v_owner for update;
  if not found then
    raise exception 'payment_not_found' using errcode = '23503';
  end if;
  if p.status <> 'posted' then
    raise exception 'already_resolved' using errcode = '23514';
  end if;
  if p.source = 'registered' then
    update public.transactions set status = 'voided' where id = p.transaction_id and status = 'posted';
  end if;
  update public.fixed_expense_payments set status = 'voided', voided_at = now() where id = p.id;
  update public.fixed_expense_occurrences set status = 'pending' where id = p.occurrence_id and status = 'paid';
end;
$$;

revoke execute on function public.void_fixed_expense_payment(uuid) from public, anon;
grant execute on function public.void_fixed_expense_payment(uuid) to authenticated;

-- Fix a typo in a payment Moni registered (amount and/or payment date): the movement changes, no second one appears.
create or replace function public.correct_fixed_expense_payment(p_payment uuid, p_amount numeric, p_paid_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  p public.fixed_expense_payments%rowtype;
  o public.fixed_expense_occurrences%rowtype;
  v_today date := public.subscription_today();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into p from public.fixed_expense_payments where id = p_payment and owner_id = v_owner for update;
  if not found then
    raise exception 'payment_not_found' using errcode = '23503';
  end if;
  if p.status <> 'posted' or p.source <> 'registered' then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;
  select * into o from public.fixed_expense_occurrences where id = p.occurrence_id;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_paid_on is null or p_paid_on > v_today or p_paid_on < o.due_on - 90 or p_paid_on < date '2000-01-01' then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  update public.transactions set amount = round(p_amount, 2), occurred_on = p_paid_on
  where id = p.transaction_id and status = 'posted';
  update public.fixed_expense_payments set amount = round(p_amount, 2), paid_on = p_paid_on where id = p.id;
end;
$$;

revoke execute on function public.correct_fixed_expense_payment(uuid, numeric, date) from public, anon;
grant execute on function public.correct_fixed_expense_payment(uuid, numeric, date) to authenticated;

-- Read: everything the screens need ---------------------------------------------------------------------------
-- Security invoker: RLS limits it to the caller. A payment shows the movement's current amount and date (so an
-- edit made in Actividad is never out of sync) and flags a movement that was voided elsewhere.

create or replace function public.get_fixed_expense_overview(p_today date default null)
returns json
language sql
stable
set search_path = ''
as $$
  with params as (select coalesce(p_today, public.subscription_today()) as today)
  select json_build_object(
    'today', (select today from params),
    'expenses', coalesce((
      select json_agg(json_build_object(
        'id', f.id, 'kind_id', f.kind_id, 'name', f.name, 'amount', f.amount, 'period', f.period,
        'next_due_on', f.next_due_on, 'account_id', f.account_id, 'account_name', a.name, 'account_kind', a.kind,
        'category_id', f.category_id, 'remind', f.remind, 'status', f.status, 'created_at', f.created_at
      ) order by f.created_at)
      from public.fixed_expenses f
      join public.accounts a on a.id = f.account_id
    ), '[]'::json),
    'occurrences', coalesce((
      select json_agg(x order by x.due_on desc, x.created_at desc) from (
        select o.id, o.fixed_expense_id, o.due_on, o.rescheduled_to, o.expected_amount, o.status, o.note,
               o.skipped_at, o.created_at
        from public.fixed_expense_occurrences o
        order by o.due_on desc, o.created_at desc
        limit 200
      ) x
    ), '[]'::json),
    'payments', coalesce((
      select json_agg(y order by y.paid_on desc, y.created_at desc) from (
        select p.id, p.occurrence_id, p.fixed_expense_id, p.source, p.status, p.created_at, p.voided_at,
               coalesce(t.amount, p.amount) as amount, coalesce(t.occurred_on, p.paid_on) as paid_on,
               p.account_id, a.name as account_name, p.transaction_id,
               (p.status = 'posted' and t.status = 'voided') as voided_elsewhere
        from public.fixed_expense_payments p
        join public.accounts a on a.id = p.account_id
        left join public.transactions t on t.id = p.transaction_id
        order by p.created_at desc
        limit 200
      ) y
    ), '[]'::json)
  );
$$;

revoke execute on function public.get_fixed_expense_overview(date) from public, anon;
grant execute on function public.get_fixed_expense_overview(date) to authenticated;

commit;
