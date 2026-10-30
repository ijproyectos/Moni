-- Savings goals (Metas de ahorro): VIRTUAL reservations of money that already sits in a real account.
--
-- Reserving money for a goal is only bookkeeping about an account: it never creates an expense, an income or a
-- transfer, never touches a transaction and never changes account_balances. "Dinero disponible" keeps showing the
-- real balance of the accounts. What a goal adds is a per-account split of that balance:
--     reserved = sum of the reserves of the goals linked to the account (once, however many goals there are)
--     free     = real balance - reserved
-- Nothing reduces a reserve by itself: if spending leaves the balance below the reserved amount the app only warns
-- (the alert is derived when reading, so it also fires for transfers, card payments, fixed expenses and automatic
-- subscription charges). The person decides whether to lower the reserve.
--
-- Rules
--   * A goal is linked to an ACTIVE account of cash / bank / wallet (never a credit card).
--   * A deposit (and the initial amount) must fit in the account's free money. The account row is locked while it is
--     checked, so two goals can never reserve the same money, not even with simultaneous requests.
--   * Withdrawing from a goal only lowers the reserve (the money never moved). Movements are voided, never deleted.
--   * Active and paused goals keep their reserve; a completed goal keeps it until the person releases it; an
--     ARCHIVED goal always has an empty reserve (archiving releases it), so no money stays blocked out of sight.
--   * Moving a goal to another account needs enough free money there for its whole reserve.
--   * Reminders (weekly / every 15 days / monthly, on the day the person chooses) are derived: one per goal, due when
--     its date arrives, in Argentina time. Contributing, skipping or snoozing moves the date, so the same reminder is
--     never repeated; paused / completed / archived goals do not remind. Nothing is contributed automatically.
--
-- Reuses (does not modify) public.subscription_today() and public.subscription_month_label() from
-- 20261101000000_subscriptions.sql. Additive.
--
-- Rollback (only valid while no goal exists):
--   drop function public.get_savings_overview(date), public.create_savings_goal(text, text, numeric, uuid, date, numeric,
--     text, numeric, boolean, date, uuid), public.update_savings_goal(uuid, text, text, numeric, uuid, date, text, numeric,
--     boolean, date), public.set_savings_goal_status(uuid, text, boolean), public.add_goal_deposit(uuid, numeric, date, text, uuid),
--     public.withdraw_goal_reserve(uuid, numeric, date, text, uuid), public.void_goal_movement(uuid),
--     public.snooze_goal_reminder(uuid, date), public.skip_goal_reminder(uuid), public.savings_account_reserved(uuid),
--     public.savings_goal_reserved(uuid), public.savings_reminder_due_on(date, text, int), public.check_savings_account(uuid, uuid);
--   drop table public.savings_movements, public.savings_goals;

begin;

-- Calendar (pure) -----------------------------------------------------------------------------------------
-- Date of reminder number n of a series that starts on p_anchor: every 7 days, every 14 days, or monthly on the
-- anchor's day (clamped to short months, computed from the anchor so the 31st survives February).
create or replace function public.savings_reminder_due_on(p_anchor date, p_frequency text, p_n int)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_month_start date;
  v_last date;
begin
  if p_frequency = 'weekly' then
    return p_anchor + 7 * p_n;
  elsif p_frequency = 'biweekly' then
    return p_anchor + 14 * p_n;
  elsif p_frequency = 'monthly' then
    v_month_start := ((p_anchor - (extract(day from p_anchor)::int - 1)) + make_interval(months => p_n))::date;
    v_last := (v_month_start + interval '1 month' - interval '1 day')::date;
    return least(v_month_start + (extract(day from p_anchor)::int - 1), v_last);
  end if;
  return null;
end;
$$;

-- Tables ---------------------------------------------------------------------------------------------------

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- Icon key from the app's catalog (viaje, auto, casa, computadora, emergencia, estudios, otra).
  icon text not null check (icon ~ '^[a-z0-9_-]{1,20}$'),
  target_amount numeric(14,2) not null check (target_amount > 0 and target_amount < 1000000000000),
  account_id uuid not null references public.accounts (id) on delete no action,
  target_date date,
  frequency text not null default 'free' check (frequency in ('weekly', 'biweekly', 'monthly', 'free')),
  -- Orientative amount per contribution. Completely optional: reminders work without it.
  suggested_amount numeric(14,2) check (suggested_amount is null or (suggested_amount > 0 and suggested_amount < 1000000000000)),
  remind boolean not null default false,
  anchor_on date,
  cycle int not null default 0 check (cycle >= 0),
  next_reminder_on date,
  snoozed_until date,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  paused_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A reminder needs a frequency and a schedule; a free goal never reminds.
  check ((remind and frequency <> 'free' and anchor_on is not null and next_reminder_on is not null)
         or (not remind and next_reminder_on is null and snoozed_until is null)),
  check (next_reminder_on is null or next_reminder_on = public.savings_reminder_due_on(anchor_on, frequency, cycle))
);

create unique index savings_goals_owner_request_key on public.savings_goals (owner_id, request_key)
  where request_key is not null;
create index savings_goals_owner_idx on public.savings_goals (owner_id, status);
create index savings_goals_account_idx on public.savings_goals (account_id);

create trigger savings_goals_set_updated_at
before update on public.savings_goals
for each row execute function public.set_updated_at();

create table public.savings_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete no action,
  -- deposit raises the reserve; withdrawal lowers it. Neither moves real money.
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  occurred_on date not null,
  note text check (note is null or char_length(note) <= 200),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null))
);

create unique index savings_movements_request_key on public.savings_movements (owner_id, request_key)
  where request_key is not null;
create index savings_movements_goal_idx on public.savings_movements (goal_id, status);
create index savings_movements_owner_idx on public.savings_movements (owner_id, created_at desc);

create trigger savings_movements_set_updated_at
before update on public.savings_movements
for each row execute function public.set_updated_at();

alter table public.savings_goals enable row level security;
alter table public.savings_movements enable row level security;

revoke all on table public.savings_goals, public.savings_movements from anon, authenticated;
grant select on table public.savings_goals, public.savings_movements to authenticated;

create policy "savings_goals_select_own" on public.savings_goals
for select to authenticated using (owner_id = (select auth.uid()));
create policy "savings_movements_select_own" on public.savings_movements
for select to authenticated using (owner_id = (select auth.uid()));

-- Reserves -------------------------------------------------------------------------------------------------

create or replace function public.savings_goal_reserved(p_goal uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case m.kind when 'deposit' then m.amount else -m.amount end), 0)
  from public.savings_movements m
  where m.goal_id = p_goal and m.status = 'posted'
$$;

-- What the goals reserve in one account, counted once: active, paused and completed goals (an archived goal's reserve
-- is always released, so it never counts).
create or replace function public.savings_account_reserved(p_account uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(public.savings_goal_reserved(g.id)), 0)
  from public.savings_goals g
  where g.account_id = p_account and g.status in ('active', 'paused', 'completed')
$$;

revoke execute on function public.savings_goal_reserved(uuid) from public, anon;
revoke execute on function public.savings_account_reserved(uuid) from public, anon;
grant execute on function public.savings_goal_reserved(uuid) to authenticated;
grant execute on function public.savings_account_reserved(uuid) to authenticated;

-- An account a goal can live in: the caller's own, active, and not a credit card (ARS is the only currency).
create or replace function public.check_savings_account(p_owner uuid, p_account uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  a public.accounts%rowtype;
begin
  select * into a from public.accounts where id = p_account and owner_id = p_owner;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if a.archived_at is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;
  if a.kind = 'credit_card' then
    raise exception 'invalid_savings_account' using errcode = '23514';
  end if;
end;
$$;

revoke execute on function public.check_savings_account(uuid, uuid) from public, anon, authenticated;

-- Money of an account that no goal has reserved: real balance - reserved. Locks the account row first so that two
-- reservations (of the same or of different goals) cannot both take the same money.
create or replace function public.lock_savings_account_free(p_account uuid)
returns numeric
language plpgsql
set search_path = ''
as $$
declare
  v_balance numeric;
begin
  perform 1 from public.accounts where id = p_account for update;
  select ab.balance into v_balance from public.account_balances ab where ab.account_id = p_account;
  return coalesce(v_balance, 0) - public.savings_account_reserved(p_account);
end;
$$;

revoke execute on function public.lock_savings_account_free(uuid) from public, anon, authenticated;

-- Reminder date helpers --------------------------------------------------------------------------------------

-- First reminder date of the series that is not in the past: moves the cycle forward until it reaches today or later.
create or replace function public.savings_next_reminder_cycle(p_anchor date, p_frequency text, p_from_cycle int, p_after date)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cycle int := p_from_cycle;
begin
  while public.savings_reminder_due_on(p_anchor, p_frequency, v_cycle) <= p_after loop
    v_cycle := v_cycle + 1;
  end loop;
  return v_cycle;
end;
$$;

revoke execute on function public.savings_next_reminder_cycle(date, text, int, date) from public, anon, authenticated;

-- Writes ----------------------------------------------------------------------------------------------------

create or replace function public.create_savings_goal(
  p_name text,
  p_icon text,
  p_target numeric,
  p_account uuid,
  p_target_date date default null,
  p_initial numeric default null,
  p_frequency text default 'free',
  p_suggested numeric default null,
  p_remind boolean default false,
  p_first_reminder_on date default null,
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
  v_remind boolean := coalesce(p_remind, false) and coalesce(p_frequency, 'free') <> 'free';
  v_free numeric;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_id from public.savings_goals where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  if p_target is null or p_target <= 0 or p_target >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_frequency is null or p_frequency not in ('weekly', 'biweekly', 'monthly', 'free') then
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;
  if p_suggested is not null and (p_suggested <= 0 or p_suggested >= 1000000000000) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_initial is not null and (p_initial < 0 or p_initial >= 1000000000000) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_target_date is not null and (p_target_date < v_today or p_target_date > v_today + 3650) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if v_remind and (p_first_reminder_on is null or p_first_reminder_on < v_today or p_first_reminder_on > v_today + 400) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  perform public.check_savings_account(v_owner, p_account);

  insert into public.savings_goals (owner_id, name, icon, target_amount, account_id, target_date, frequency,
                                    suggested_amount, remind, anchor_on, cycle, next_reminder_on, request_key)
  values (v_owner, btrim(p_name), p_icon, round(p_target, 2), p_account, p_target_date, p_frequency,
          round(p_suggested, 2), v_remind, case when v_remind then p_first_reminder_on end, 0,
          case when v_remind then p_first_reminder_on end, p_request_key)
  returning id into v_id;

  if coalesce(p_initial, 0) > 0 then
    v_free := public.lock_savings_account_free(p_account);
    if round(p_initial, 2) > v_free then
      raise exception 'not_enough_free_money' using errcode = '23514', detail = v_free::text;
    end if;
    insert into public.savings_movements (owner_id, goal_id, kind, amount, occurred_on, note)
    values (v_owner, v_id, 'deposit', round(p_initial, 2), v_today, 'Monto inicial');
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_savings_goal(text, text, numeric, uuid, date, numeric, text, numeric, boolean, date, uuid) from public, anon;
grant execute on function public.create_savings_goal(text, text, numeric, uuid, date, numeric, text, numeric, boolean, date, uuid) to authenticated;

-- Edit the goal. A new account needs enough free money for the whole reserve; a new schedule restarts the reminders.
create or replace function public.update_savings_goal(
  p_goal uuid,
  p_name text,
  p_icon text,
  p_target numeric,
  p_account uuid,
  p_target_date date,
  p_frequency text,
  p_suggested numeric,
  p_remind boolean,
  p_first_reminder_on date
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
  v_today date := public.subscription_today();
  v_remind boolean := coalesce(p_remind, false) and coalesce(p_frequency, 'free') <> 'free';
  v_reserved numeric;
  v_free numeric;
  v_schedule_changed boolean;
  v_new_cycle int;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  if g.status = 'archived' then
    raise exception 'goal_archived' using errcode = '23514';
  end if;
  if p_target is null or p_target <= 0 or p_target >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_frequency is null or p_frequency not in ('weekly', 'biweekly', 'monthly', 'free') then
    raise exception 'invalid_frequency' using errcode = '22023';
  end if;
  if p_suggested is not null and (p_suggested <= 0 or p_suggested >= 1000000000000) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_target_date is not null and p_target_date < v_today - 3650 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  -- Lock the accounts involved in a stable order (no deadlock between two moves), then the goal.
  perform 1 from public.accounts where id in (g.account_id, p_account) order by id for update;
  select * into g from public.savings_goals where id = p_goal for update;

  if p_account <> g.account_id then
    perform public.check_savings_account(v_owner, p_account);
    v_reserved := public.savings_goal_reserved(g.id);
    if g.status in ('active', 'paused', 'completed') and v_reserved > 0 then
      v_free := public.lock_savings_account_free(p_account);
      if v_reserved > v_free then
        raise exception 'not_enough_free_money' using errcode = '23514', detail = v_free::text;
      end if;
    end if;
  end if;

  -- A new first date (or turning reminders on, or a new frequency) restarts the schedule; saving the form with the
  -- same date keeps the one in progress (and its snooze).
  v_schedule_changed := (v_remind <> g.remind) or (p_frequency <> g.frequency)
                        or (v_remind and p_first_reminder_on is not null
                            and p_first_reminder_on is distinct from g.next_reminder_on);
  if v_remind and v_schedule_changed and (p_first_reminder_on is null or p_first_reminder_on < v_today or p_first_reminder_on > v_today + 400) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  update public.savings_goals
  set name = btrim(p_name), icon = p_icon, target_amount = round(p_target, 2), account_id = p_account,
      target_date = p_target_date, frequency = p_frequency, suggested_amount = round(p_suggested, 2),
      remind = v_remind,
      anchor_on = case when not v_remind then null when v_schedule_changed then p_first_reminder_on else anchor_on end,
      cycle = case when not v_remind or v_schedule_changed then 0 else cycle end,
      next_reminder_on = case when not v_remind then null
                              when v_schedule_changed then p_first_reminder_on
                              else next_reminder_on end,
      snoozed_until = case when not v_remind or v_schedule_changed then null else snoozed_until end
  where id = g.id;
end;
$$;

revoke execute on function public.update_savings_goal(uuid, text, text, numeric, uuid, date, text, numeric, boolean, date) from public, anon;
grant execute on function public.update_savings_goal(uuid, text, text, numeric, uuid, date, text, numeric, boolean, date) to authenticated;

-- Moves the reminder to its next date after today (after a contribution or a skip) and forgets any snooze.
create or replace function public.advance_goal_reminder(p_goal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.savings_goals%rowtype;
  v_cycle int;
begin
  select * into g from public.savings_goals where id = p_goal for update;
  if not found or not g.remind then
    return;
  end if;
  v_cycle := public.savings_next_reminder_cycle(g.anchor_on, g.frequency, g.cycle, public.subscription_today());
  update public.savings_goals
  set cycle = v_cycle, next_reminder_on = public.savings_reminder_due_on(g.anchor_on, g.frequency, v_cycle),
      snoozed_until = null
  where id = g.id;
end;
$$;

revoke execute on function public.advance_goal_reminder(uuid) from public, anon, authenticated;

create or replace function public.add_goal_deposit(
  p_goal uuid,
  p_amount numeric,
  p_on date default null,
  p_note text default null,
  p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
  v_today date := public.subscription_today();
  v_free numeric;
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_id from public.savings_movements where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_on is not null and (p_on > v_today or p_on < v_today - 400) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;

  -- Account first (it serializes every reservation on it), then the goal.
  v_free := public.lock_savings_account_free(g.account_id);
  select * into g from public.savings_goals where id = p_goal for update;
  if g.status <> 'active' then
    raise exception 'goal_not_active' using errcode = '23514';
  end if;
  perform public.check_savings_account(v_owner, g.account_id);
  if round(p_amount, 2) > v_free then
    raise exception 'not_enough_free_money' using errcode = '23514', detail = v_free::text;
  end if;

  insert into public.savings_movements (owner_id, goal_id, kind, amount, occurred_on, note, request_key)
  values (v_owner, g.id, 'deposit', round(p_amount, 2), coalesce(p_on, v_today),
          nullif(btrim(p_note), ''), p_request_key)
  returning id into v_id;

  -- A contribution answers a reminder that is due: it moves on to the next date.
  if g.remind and coalesce(g.snoozed_until, g.next_reminder_on) <= v_today then
    perform public.advance_goal_reminder(g.id);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.add_goal_deposit(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.add_goal_deposit(uuid, numeric, date, text, uuid) to authenticated;

-- Lowers the reserve. The money never moved, so nothing else changes.
create or replace function public.withdraw_goal_reserve(
  p_goal uuid,
  p_amount numeric,
  p_on date default null,
  p_note text default null,
  p_request_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
  v_today date := public.subscription_today();
  v_id uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_request_key is not null then
    select id into v_id from public.savings_movements where owner_id = v_owner and request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner for update;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  if g.status = 'archived' then
    raise exception 'goal_archived' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_on is not null and (p_on > v_today or p_on < v_today - 400) then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  if round(p_amount, 2) > public.savings_goal_reserved(g.id) then
    raise exception 'withdraw_exceeds_reserve' using errcode = '23514', detail = public.savings_goal_reserved(g.id)::text;
  end if;
  insert into public.savings_movements (owner_id, goal_id, kind, amount, occurred_on, note, request_key)
  values (v_owner, g.id, 'withdrawal', round(p_amount, 2), coalesce(p_on, v_today),
          nullif(btrim(p_note), ''), p_request_key)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.withdraw_goal_reserve(uuid, numeric, date, text, uuid) from public, anon;
grant execute on function public.withdraw_goal_reserve(uuid, numeric, date, text, uuid) to authenticated;

-- Undo a movement (typo, wrong goal). Voiding a deposit must not leave the reserve negative; voiding a withdrawal
-- raises the reserve again, so it needs free money.
create or replace function public.void_goal_movement(p_movement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  m public.savings_movements%rowtype;
  g public.savings_goals%rowtype;
  v_free numeric;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into m from public.savings_movements where id = p_movement and owner_id = v_owner;
  if not found then
    raise exception 'movement_not_found' using errcode = '23503';
  end if;
  select * into g from public.savings_goals where id = m.goal_id;
  v_free := public.lock_savings_account_free(g.account_id);
  select * into g from public.savings_goals where id = m.goal_id for update;
  select * into m from public.savings_movements where id = p_movement for update;
  if m.status <> 'posted' then
    raise exception 'already_resolved' using errcode = '23514';
  end if;
  if g.status = 'archived' then
    raise exception 'goal_archived' using errcode = '23514';
  end if;
  if m.kind = 'deposit' and m.amount > public.savings_goal_reserved(g.id) then
    raise exception 'reserve_would_be_negative' using errcode = '23514';
  end if;
  if m.kind = 'withdrawal' and m.amount > v_free then
    raise exception 'not_enough_free_money' using errcode = '23514', detail = v_free::text;
  end if;
  update public.savings_movements set status = 'voided', voided_at = now() where id = m.id;
end;
$$;

revoke execute on function public.void_goal_movement(uuid) from public, anon;
grant execute on function public.void_goal_movement(uuid) to authenticated;

-- active <-> paused, any open goal -> completed, -> archived, completed / archived -> active again.
--   * completed keeps the reserve unless p_release; archiving ALWAYS releases it (p_release must be true when there
--     is something reserved), so an archived goal never blocks money out of sight.
--   * paused keeps its reserve and stops reminding.
create or replace function public.set_savings_goal_status(p_goal uuid, p_status text, p_release boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
  v_reserved numeric;
  v_free numeric;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('active', 'paused', 'completed', 'archived') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  v_free := public.lock_savings_account_free(g.account_id);
  select * into g from public.savings_goals where id = p_goal for update;
  if g.status = p_status then
    return;
  end if;
  v_reserved := public.savings_goal_reserved(g.id);

  if p_status = 'active' then
    -- Coming back from completed / archived: the account must still be usable.
    perform public.check_savings_account(v_owner, g.account_id);
    update public.savings_goals
    set status = 'active', paused_at = null, completed_at = null, archived_at = null,
        cycle = case when remind then public.savings_next_reminder_cycle(anchor_on, frequency, cycle, public.subscription_today() - 1) else cycle end,
        next_reminder_on = case when remind then public.savings_reminder_due_on(anchor_on, frequency,
                                  public.savings_next_reminder_cycle(anchor_on, frequency, cycle, public.subscription_today() - 1)) end,
        snoozed_until = null
    where id = g.id;
  elsif p_status = 'paused' then
    if g.status <> 'active' then
      raise exception 'invalid_transition' using errcode = '23514';
    end if;
    update public.savings_goals set status = 'paused', paused_at = now() where id = g.id;
  elsif p_status = 'completed' then
    if g.status = 'archived' then
      raise exception 'invalid_transition' using errcode = '23514';
    end if;
    if p_release and v_reserved > 0 then
      insert into public.savings_movements (owner_id, goal_id, kind, amount, occurred_on, note)
      values (v_owner, g.id, 'withdrawal', v_reserved, public.subscription_today(), 'Meta completada: reserva liberada');
    end if;
    update public.savings_goals set status = 'completed', completed_at = now(), snoozed_until = null where id = g.id;
  else
    if v_reserved > 0 then
      if not coalesce(p_release, false) then
        raise exception 'release_required' using errcode = '23514', detail = v_reserved::text;
      end if;
      insert into public.savings_movements (owner_id, goal_id, kind, amount, occurred_on, note)
      values (v_owner, g.id, 'withdrawal', v_reserved, public.subscription_today(), 'Meta archivada: reserva liberada');
    end if;
    update public.savings_goals set status = 'archived', archived_at = now(), snoozed_until = null where id = g.id;
  end if;
end;
$$;

revoke execute on function public.set_savings_goal_status(uuid, text, boolean) from public, anon;
grant execute on function public.set_savings_goal_status(uuid, text, boolean) to authenticated;

-- Reminders: snooze to a later date (tomorrow, in a week or a chosen date), or skip to the next scheduled date.
create or replace function public.snooze_goal_reminder(p_goal uuid, p_until date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
  v_today date := public.subscription_today();
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner for update;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  if g.status <> 'active' or not g.remind then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;
  if p_until is null or p_until <= v_today or p_until > v_today + 90 then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  update public.savings_goals set snoozed_until = p_until where id = g.id;
end;
$$;

revoke execute on function public.snooze_goal_reminder(uuid, date) from public, anon;
grant execute on function public.snooze_goal_reminder(uuid, date) to authenticated;

create or replace function public.skip_goal_reminder(p_goal uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  g public.savings_goals%rowtype;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into g from public.savings_goals where id = p_goal and owner_id = v_owner;
  if not found then
    raise exception 'goal_not_found' using errcode = '23503';
  end if;
  if g.status <> 'active' or not g.remind then
    raise exception 'invalid_transition' using errcode = '23514';
  end if;
  perform public.advance_goal_reminder(g.id);
end;
$$;

revoke execute on function public.skip_goal_reminder(uuid) from public, anon;
grant execute on function public.skip_goal_reminder(uuid) to authenticated;

-- Read: goals, the per-account split (balance, reserved, free) and the latest movements ----------------------------
-- Security invoker: RLS limits it to the caller. Alerts are NOT stored: the app derives one per account whose
-- reserved money exceeds its balance, from these figures.

create or replace function public.get_savings_overview(p_today date default null)
returns json
language sql
stable
set search_path = ''
as $$
  with params as (select coalesce(p_today, public.subscription_today()) as today)
  select json_build_object(
    'today', (select today from params),
    'goals', coalesce((
      select json_agg(json_build_object(
        'id', g.id, 'name', g.name, 'icon', g.icon, 'target_amount', g.target_amount,
        'account_id', g.account_id, 'account_name', a.name, 'account_kind', a.kind,
        'account_usable', (a.archived_at is null and a.kind <> 'credit_card'),
        'target_date', g.target_date, 'frequency', g.frequency, 'suggested_amount', g.suggested_amount,
        'remind', g.remind, 'anchor_on', g.anchor_on, 'next_reminder_on', g.next_reminder_on,
        'snoozed_until', g.snoozed_until,
        'reminder_on', case when g.remind and g.status = 'active' then coalesce(g.snoozed_until, g.next_reminder_on) end,
        'status', g.status, 'reserved', public.savings_goal_reserved(g.id), 'created_at', g.created_at
      ) order by g.created_at)
      from public.savings_goals g
      join public.accounts a on a.id = g.account_id
    ), '[]'::json),
    'accounts', coalesce((
      select json_agg(json_build_object(
        'id', a.id, 'name', a.name, 'kind', a.kind, 'archived', a.archived_at is not null,
        'balance', ab.balance, 'reserved', public.savings_account_reserved(a.id),
        'free', ab.balance - public.savings_account_reserved(a.id)
      ) order by a.created_at)
      from public.accounts a
      join public.account_balances ab on ab.account_id = a.id
      where a.kind <> 'credit_card'
        and (a.archived_at is null or exists (select 1 from public.savings_goals g where g.account_id = a.id))
    ), '[]'::json),
    'movements', coalesce((
      select json_agg(x order by x.created_at desc) from (
        select m.id, m.goal_id, m.kind, m.amount, m.occurred_on, m.note, m.status, m.created_at
        from public.savings_movements m
        order by m.created_at desc
        limit 300
      ) x
    ), '[]'::json)
  );
$$;

revoke execute on function public.get_savings_overview(date) from public, anon;
grant execute on function public.get_savings_overview(date) to authenticated;

commit;
