-- Subscriptions (Netflix, ChatGPT, gym...) that charge themselves in Moni.
--
-- A subscription is a recurring expense in ARS. When its date arrives a scheduled job registers ONE ordinary
-- expense (kind 'expense', dated on the billing day, in the subscription's category) in the chosen account:
--   * cash / bank / wallet: the balance goes down like any other expense;
--   * credit card: the amount adds to the debt and to the statement the closing date assigns (trigger from
--     20261033), exactly like a manual card purchase.
-- Because the charge is a normal expense, balances, Actividad, month summaries, budgets and everything of
-- Joni's keep working untouched.
--
-- Safety rules
--   * One charge per (subscription, due date): unique constraint + "on conflict do nothing". Running the job
--     twice, in parallel, or after an outage never duplicates anything; missed days are caught up with their own
--     dates.
--   * Never auto-linked to expenses the person typed: if a manual expense looks the same (same account, amount,
--     +-3 days) the overview reports a POSSIBLE duplicate and the person decides ("Ya lo cargo" links it and
--     voids the automatic one; "No es duplicado" dismisses the warning).
--   * "No se cobro" voids the automatic expense and keeps the charge row as the audit trail.
--   * Paused or cancelled subscriptions generate nothing. Reactivating jumps to the next FUTURE date: paused
--     months are never charged retroactively. History is never deleted.
--   * Accounts may go negative because of a charge (nobody can confirm it); the charge row records it so the app
--     warns. An archived account or an unusable category makes the charge 'failed' (kept, visible) instead of
--     wrong.
--   * The notes of the charges carry the month ("Netflix · oct 2026"), so each one is unique for the existing
--     "hormigas" (ants) report, which groups by note: subscriptions never reach its 3-repeats rule and
--     Joni's get_ant_expenses stays untouched.
--
-- The job itself is scheduled outside this migration (supabase/ops/subscriptions_cron.sql) because it needs the
-- pg_cron extension. The app also calls process_my_due_subscriptions() when it opens, as a safety net.
--
-- Additive. Rollback (only valid while no subscription exists):
--   drop function public.get_subscription_overview(date), public.process_my_due_subscriptions(),
--     public.process_due_subscriptions(), public.process_subscriptions_core(uuid, date),
--     public.create_subscription(text, text, text, numeric, text, date, uuid, uuid, boolean, uuid),
--     public.update_subscription(uuid, text, text, numeric, text, date, uuid, uuid, boolean),
--     public.set_subscription_status(uuid, text), public.mark_subscription_charge_not_charged(uuid),
--     public.link_subscription_charge(uuid, uuid), public.dismiss_subscription_duplicate(uuid),
--     public.subscription_due_on(date, text, int), public.subscription_today();
--   drop table public.subscription_charges, public.subscriptions;

begin;

-- Calendar helpers (pure) -------------------------------------------------------------------------------

create or replace function public.subscription_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Date of charge number p_n of a series that started on p_anchor. Computed from the anchor every time (never
-- from the previous date), so a 31st survives short months (31 -> 28 -> 31) and Feb 29 returns every leap year.
create or replace function public.subscription_due_on(p_anchor date, p_period text, p_n int)
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
                    + make_interval(months => p_n * case p_period when 'yearly' then 12 else 1 end))::date;
  v_last := (v_month_start + interval '1 month' - interval '1 day')::date;
  return least(v_month_start + (extract(day from p_anchor)::int - 1), v_last);
end;
$$;

-- Tables ---------------------------------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Catalog id ("netflix") or "custom". The catalog lives in the app.
  service_id text not null check (service_id ~ '^[a-z0-9_-]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  plan text check (plan is null or char_length(plan) <= 40),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  period text not null check (period in ('monthly', 'yearly')),
  anchor_on date not null,
  cycle int not null default 0 check (cycle >= 0),
  next_charge_on date not null,
  account_id uuid not null references public.accounts (id) on delete no action,
  category_id uuid not null references public.categories (id) on delete no action,
  remind boolean not null default true,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  paused_at timestamptz,
  cancelled_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (next_charge_on = public.subscription_due_on(anchor_on, period, cycle))
);

create unique index subscriptions_owner_request_key on public.subscriptions (owner_id, request_key)
  where request_key is not null;
create index subscriptions_due_idx on public.subscriptions (status, next_charge_on);
create index subscriptions_owner_idx on public.subscriptions (owner_id, status);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

create table public.subscription_charges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete no action,
  due_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  -- posted: the expense exists | not_charged: the person said it was not charged (expense voided)
  -- linked: replaced by an expense the person had already typed | failed: could not be registered
  status text not null check (status in ('posted', 'not_charged', 'linked', 'failed')),
  transaction_id uuid references public.transactions (id) on delete no action,
  linked_transaction_id uuid references public.transactions (id) on delete no action,
  failure_reason text,
  -- Balance of a non-card account right after the charge; negative_balance tells the app to warn.
  balance_after numeric(14,2),
  negative_balance boolean not null default false,
  -- A card charge that took the debt above the card's credit limit (nothing blocks it; the app warns).
  over_limit boolean not null default false,
  duplicate_dismissed boolean not null default false,
  reverted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subscription_id, due_on)
);

create unique index subscription_charges_transaction_key on public.subscription_charges (transaction_id)
  where transaction_id is not null;
create unique index subscription_charges_linked_key on public.subscription_charges (linked_transaction_id)
  where linked_transaction_id is not null;
create index subscription_charges_owner_idx on public.subscription_charges (owner_id, due_on desc);

create trigger subscription_charges_set_updated_at
before update on public.subscription_charges
for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;
alter table public.subscription_charges enable row level security;

revoke all on table public.subscriptions, public.subscription_charges from anon, authenticated;
grant select on table public.subscriptions, public.subscription_charges to authenticated;

create policy "subscriptions_select_own" on public.subscriptions
for select to authenticated using (owner_id = (select auth.uid()));
create policy "subscription_charges_select_own" on public.subscription_charges
for select to authenticated using (owner_id = (select auth.uid()));

-- The job: register every charge that is due ------------------------------------------------------------
-- p_owner null = everybody (the scheduled job); otherwise one person (the app opening). Returns how many
-- charges were registered. Each subscription runs in its own sub-transaction, so one broken row never blocks
-- the others, and "for update skip locked" lets two runs share the work without touching the same row.

create or replace function public.subscription_month_label(p_on date, p_period text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_period = 'yearly' then 'anual ' || extract(year from p_on)::int
              else (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p_on)::int]
                   || ' ' || extract(year from p_on)::int end
$$;

create or replace function public.process_subscriptions_core(p_owner uuid, p_today date)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.subscriptions%rowtype;
  v_account public.accounts%rowtype;
  v_account_ok boolean;
  v_category_ok boolean;
  v_charge uuid;
  v_tx uuid;
  v_balance numeric;
  v_due date;
  v_count int := 0;
  v_guard int;
begin
  for s in
    select * from public.subscriptions
    where status = 'active' and next_charge_on <= p_today and (p_owner is null or owner_id = p_owner)
    order by owner_id, next_charge_on
    for update skip locked
  loop
    begin
      v_guard := 0;
      -- Catch up every missed date, oldest first (bounded: three years of monthly charges).
      while s.next_charge_on <= p_today and v_guard < 36 loop
        v_guard := v_guard + 1;
        v_due := s.next_charge_on;

        insert into public.subscription_charges (owner_id, subscription_id, due_on, amount, status)
        values (s.owner_id, s.id, v_due, s.amount, 'failed')
        on conflict (subscription_id, due_on) do nothing
        returning id into v_charge;

        if v_charge is not null then
          select * into v_account from public.accounts a where a.id = s.account_id and a.owner_id = s.owner_id;
          v_account_ok := found and v_account.archived_at is null;
          select exists (select 1 from public.categories c
                         where c.id = s.category_id and c.owner_id = s.owner_id
                           and c.kind = 'expense' and c.archived_at is null) into v_category_ok;

          if not v_account_ok then
            update public.subscription_charges set failure_reason = 'account_unavailable' where id = v_charge;
          elsif not v_category_ok then
            update public.subscription_charges set failure_reason = 'category_unavailable' where id = v_charge;
          else
            insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note)
            values (s.owner_id, s.account_id, s.category_id, 'expense', s.amount, v_due,
                    s.name || ' · ' || public.subscription_month_label(v_due, s.period))
            returning id into v_tx;

            select ab.balance into v_balance from public.account_balances ab where ab.account_id = s.account_id;
            update public.subscription_charges
            set status = 'posted',
                transaction_id = v_tx,
                balance_after = case when v_account.kind = 'credit_card' then null else v_balance end,
                negative_balance = (v_account.kind <> 'credit_card' and v_balance < 0),
                over_limit = (v_account.kind = 'credit_card' and v_account.credit_limit is not null
                              and -v_balance > v_account.credit_limit)
            where id = v_charge;
            v_count := v_count + 1;
          end if;
        end if;

        s.cycle := s.cycle + 1;
        s.next_charge_on := public.subscription_due_on(s.anchor_on, s.period, s.cycle);
        update public.subscriptions set cycle = s.cycle, next_charge_on = s.next_charge_on where id = s.id;
      end loop;
    exception when others then
      -- Roll back only this subscription's work and leave it due, so the next run retries it.
      raise warning 'subscription % skipped: %', s.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.process_subscriptions_core(uuid, date) from public, anon, authenticated;
revoke execute on function public.subscription_month_label(date, text) from public, anon;

-- The scheduled job calls this one (not reachable by clients). A transaction-level advisory lock makes two
-- overlapping runs of the job (or two equivalent jobs, if someone ever schedules a second one) take turns: the
-- later one returns 0 immediately instead of competing. The per-row locks and the unique key already make a
-- duplicate impossible; the lock only avoids the wasted work.
create or replace function public.process_due_subscriptions()
returns int
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not pg_try_advisory_xact_lock(hashtext('moni-process-subscriptions')) then
    return 0;
  end if;
  return public.process_subscriptions_core(null, public.subscription_today());
end;
$$;

revoke execute on function public.process_due_subscriptions() from public, anon, authenticated;

-- The app calls this one on opening; it only ever touches the caller's own subscriptions.
create or replace function public.process_my_due_subscriptions()
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
  return public.process_subscriptions_core(v_owner, public.subscription_today());
end;
$$;

revoke execute on function public.process_my_due_subscriptions() from public, anon;
grant execute on function public.process_my_due_subscriptions() to authenticated;

-- Writes: create / edit / status --------------------------------------------------------------------------

create or replace function public.check_subscription_refs(p_owner uuid, p_account uuid, p_category uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_archived timestamptz;
  v_kind text;
  v_cat_archived timestamptz;
begin
  select a.archived_at into v_archived from public.accounts a where a.id = p_account and a.owner_id = p_owner;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if v_archived is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;
  select c.kind, c.archived_at into v_kind, v_cat_archived
  from public.categories c where c.id = p_category and c.owner_id = p_owner;
  if not found then
    raise exception 'category_not_found' using errcode = '23503';
  end if;
  if v_cat_archived is not null then
    raise exception 'category_archived' using errcode = '23514';
  end if;
  if v_kind <> 'expense' then
    raise exception 'category_kind_mismatch' using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public.check_subscription_refs(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.create_subscription(
  p_service text,
  p_name text,
  p_plan text,
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

  -- A retry of the same request returns the subscription that was already created.
  if p_request_key is not null then
    select id into v_id from public.subscriptions where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'yearly') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_next_on is null or p_next_on < v_today or p_next_on > v_today + 800 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  perform public.check_subscription_refs(v_owner, p_account, p_category);

  insert into public.subscriptions (owner_id, service_id, name, plan, amount, period, anchor_on, cycle,
                                    next_charge_on, account_id, category_id, remind, request_key)
  values (v_owner, p_service, btrim(p_name), nullif(btrim(p_plan), ''), round(p_amount, 2), p_period, p_next_on, 0,
          p_next_on, p_account, p_category, coalesce(p_remind, true), p_request_key)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.create_subscription(text, text, text, numeric, text, date, uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.create_subscription(text, text, text, numeric, text, date, uuid, uuid, boolean, uuid) to authenticated;

-- Edits apply to future charges only. A new date or frequency restarts the series on that date; the charges
-- already registered are untouched.
create or replace function public.update_subscription(
  p_id uuid,
  p_name text,
  p_plan text,
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
  s public.subscriptions%rowtype;
  v_today date := public.subscription_today();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into s from public.subscriptions where id = p_id and owner_id = v_owner for update;
  if not found then
    raise exception 'subscription_not_found' using errcode = '23503';
  end if;
  if s.status = 'cancelled' then
    raise exception 'subscription_cancelled' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'yearly') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  perform public.check_subscription_refs(v_owner, p_account, p_category);

  if p_next_on is distinct from s.next_charge_on or p_period <> s.period then
    if p_next_on is null or p_next_on < v_today or p_next_on > v_today + 800 then
      raise exception 'invalid_date' using errcode = '22023';
    end if;
    -- A charge already registered for that date stays registered once: the unique key protects it.
    update public.subscriptions
    set anchor_on = p_next_on, cycle = 0, next_charge_on = p_next_on, period = p_period
    where id = p_id;
  end if;

  update public.subscriptions
  set name = btrim(p_name), plan = nullif(btrim(p_plan), ''), amount = round(p_amount, 2),
      account_id = p_account, category_id = p_category, remind = coalesce(p_remind, true)
  where id = p_id;
end;
$$;

revoke execute on function public.update_subscription(uuid, text, text, numeric, text, date, uuid, uuid, boolean) from public, anon;
grant execute on function public.update_subscription(uuid, text, text, numeric, text, date, uuid, uuid, boolean) to authenticated;

-- active <-> paused, any -> cancelled, cancelled -> active. Reactivating moves to the next date that is not in
-- the past: nothing is charged for the time it was paused or cancelled.
create or replace function public.set_subscription_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  s public.subscriptions%rowtype;
  v_today date := public.subscription_today();
  v_cycle int;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'cancelled') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into s from public.subscriptions where id = p_id and owner_id = v_owner for update;
  if not found then
    raise exception 'subscription_not_found' using errcode = '23503';
  end if;
  if s.status = p_status then
    return;
  end if;

  if p_status = 'active' then
    perform public.check_subscription_refs(v_owner, s.account_id, s.category_id);
    v_cycle := s.cycle;
    while public.subscription_due_on(s.anchor_on, s.period, v_cycle) < v_today loop
      v_cycle := v_cycle + 1;
    end loop;
    update public.subscriptions
    set status = 'active', paused_at = null, cancelled_at = null, cycle = v_cycle,
        next_charge_on = public.subscription_due_on(s.anchor_on, s.period, v_cycle)
    where id = p_id;
  elsif p_status = 'paused' then
    if s.status = 'cancelled' then
      raise exception 'invalid_transition' using errcode = '23514';
    end if;
    update public.subscriptions set status = 'paused', paused_at = now() where id = p_id;
  else
    update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = p_id;
  end if;
end;
$$;

revoke execute on function public.set_subscription_status(uuid, text) from public, anon;
grant execute on function public.set_subscription_status(uuid, text) to authenticated;

-- "No se cobro": void the automatic expense, keep the charge as the record --------------------------------

create or replace function public.mark_subscription_charge_not_charged(p_charge uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  c public.subscription_charges%rowtype;
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
  -- Already voided from Actividad: nothing to void, only the record to settle.
  update public.transactions set status = 'voided' where id = c.transaction_id and status = 'posted';
  update public.subscription_charges set status = 'not_charged', reverted_at = now() where id = p_charge;
end;
$$;

revoke execute on function public.mark_subscription_charge_not_charged(uuid) from public, anon;
grant execute on function public.mark_subscription_charge_not_charged(uuid) to authenticated;

-- "Ya lo cargue": the person had typed this expense. The automatic one is voided and the charge points to the
-- person's expense. Never done automatically.
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

  update public.transactions set status = 'voided' where id = c.transaction_id and status = 'posted';
  update public.subscription_charges
  set status = 'linked', linked_transaction_id = t.id, reverted_at = now()
  where id = p_charge;
end;
$$;

revoke execute on function public.link_subscription_charge(uuid, uuid) from public, anon;
grant execute on function public.link_subscription_charge(uuid, uuid) to authenticated;

create or replace function public.dismiss_subscription_duplicate(p_charge uuid)
returns void
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
  update public.subscription_charges set duplicate_dismissed = true where id = p_charge and owner_id = v_owner;
  if not found then
    raise exception 'charge_not_found' using errcode = '23503';
  end if;
end;
$$;

revoke execute on function public.dismiss_subscription_duplicate(uuid) from public, anon;
grant execute on function public.dismiss_subscription_duplicate(uuid) to authenticated;

-- Read: everything the screens need in one call -----------------------------------------------------------
-- Security invoker: RLS limits it to the caller. The possible duplicate of a posted charge is any expense of the
-- same account and amount within +-3 days that is not itself part of a charge (typed by the person, before or
-- after the automatic one).

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

revoke execute on function public.get_subscription_overview(date) from public, anon;
grant execute on function public.get_subscription_overview(date) to authenticated;

commit;
