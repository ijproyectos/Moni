-- Cuentas pendientes entre integrantes de un grupo: recordatorios dentro de Moni, "Ya pagué" y "Confirmar recepción".
--
-- What already exists and is REUSED (nothing is duplicated):
--   * Who owes whom comes from the real balances of the group (group_balance_rows: shared expenses + settlements).
--   * Settling a debt is a row of public.settlements, exactly as before. A settlement NEVER touches the payment methods
--     of the people unless one of them records it on an account (create_settlement with an account /
--     record_settlement_receipt); this migration never does that, so the balances of the accounts do not move.
--   * Moni had no real notifications (the "Avisos" screen is a simulation), so this adds the inbox the debts need.
--
-- New
--   * public.payment_reports  "Ya pagué": the debtor reports a transfer (status reported). The debt stays pending.
--                             Only when the receiver confirms it becomes a settlement (status confirmed, settlement_id).
--                             One open report per group / payer / receiver, so confirmations cannot be duplicated.
--   * public.notifications    per-user inbox: debt_reminder, payment_reported, payment_confirmed, payment_rejected. A
--                             reminder may carry the alias / CBU-CVU the receiver CHOSE to share (a snapshot, readable only
--                             by the person it is addressed to).
--   * remind_debt, report_payment, confirm_payment_report, reject_payment_report, cancel_payment_report.
--
-- Security
--   * Both tables have RLS: a person reads only the rows addressed to them (notifications) or that involve them
--     (payment_reports). Nothing is writable by the client except marking its own notifications as read; everything else
--     goes through the functions above, which check that the caller belongs to the group and that the debt is real.
--   * A reminder is limited to one per group / creditor / debtor every 24 hours (and cannot be sent when nothing is owed).
--   * Transfer data is never read from the receiver's accounts here: the app sends what the person confirmed to share.
--
-- Additive. Apply AFTER 20261108000000_account_transfer_data.sql.
-- Rollback:
--   drop function public.remind_debt(uuid, uuid, numeric, text, text, text), public.report_payment(uuid, uuid, numeric),
--     public.confirm_payment_report(uuid), public.reject_payment_report(uuid), public.cancel_payment_report(uuid);
--   drop table public.notifications, public.payment_reports;
-- (settlements created by a confirmation stay: they are real, posted settlements; void them from the group if needed).

begin;

-- Payment reports ("Ya pagué") ---------------------------------------------------------------------------
create table public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  from_user uuid not null references auth.users (id) on delete no action,
  to_user uuid not null references auth.users (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'reported' check (status in ('reported', 'confirmed', 'rejected', 'cancelled')),
  settlement_id uuid references public.settlements (id) on delete no action,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (from_user <> to_user),
  check ((status = 'reported') = (resolved_at is null)),
  check ((status = 'confirmed') = (settlement_id is not null))
);

-- One open report per group / payer / receiver: the same payment cannot be reported (or confirmed) twice.
create unique index payment_reports_one_open
  on public.payment_reports (group_id, from_user, to_user) where status = 'reported';
create index payment_reports_from_idx on public.payment_reports (from_user, reported_at desc);
create index payment_reports_to_idx on public.payment_reports (to_user, reported_at desc);

alter table public.payment_reports enable row level security;
revoke all on table public.payment_reports from anon, authenticated;
grant select on table public.payment_reports to authenticated;
create policy "payment_reports_select_involved" on public.payment_reports
for select to authenticated using (from_user = (select auth.uid()) or to_user = (select auth.uid()));

-- Notifications ------------------------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected')),
  group_id uuid not null references public.groups (id) on delete no action,
  group_name text not null,
  actor_id uuid not null references auth.users (id) on delete no action,
  actor_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  report_id uuid references public.payment_reports (id) on delete no action,
  -- What the sender chose to share to be paid (a snapshot; only the addressee can read this row).
  transfer_label text check (char_length(transfer_label) <= 40),
  transfer_alias text check (transfer_alias is null or transfer_alias ~ '^[A-Za-z0-9.-]{6,20}$'),
  transfer_cbu text check (transfer_cbu is null or transfer_cbu ~ '^[0-9]{22}$'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_reminder_idx on public.notifications (actor_id, user_id, group_id, created_at desc)
  where kind = 'debt_reminder';

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
-- The only thing the client writes itself: marking its own notifications as read.
grant update (read_at) on table public.notifications to authenticated;
create policy "notifications_select_own" on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Helpers (not callable by the client) ------------------------------------------------------------------
create or replace function public.display_name_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select nullif(btrim(p.display_name), '') from public.profiles p where p.id = p_user), 'Alguien');
$$;
revoke execute on function public.display_name_of(uuid) from public, anon, authenticated;

-- True when `p_debtor` really owes at least p_amount in the group and `p_creditor` is owed at least that much
-- (positive net = the group owes that member). The group is already locked by the caller.
create or replace function public.debt_is_open(p_group uuid, p_debtor uuid, p_creditor uuid, p_amount numeric)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.net from public.group_balance_rows(p_group) r where r.user_id = p_debtor), 0) <= -p_amount
     and coalesce((select r.net from public.group_balance_rows(p_group) r where r.user_id = p_creditor), 0) >= p_amount;
$$;
revoke execute on function public.debt_is_open(uuid, uuid, uuid, numeric) from public, anon, authenticated;

-- Reminder ("Recordar") ----------------------------------------------------------------------------------
create or replace function public.remind_debt(
  p_group uuid,
  p_debtor uuid,
  p_amount numeric,
  p_transfer_label text default null,
  p_transfer_alias text default null,
  p_transfer_cbu text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_label text := nullif(btrim(coalesce(p_transfer_label, '')), '');
  v_alias text := nullif(btrim(coalesce(p_transfer_alias, '')), '');
  v_cbu text := nullif(regexp_replace(coalesce(p_transfer_cbu, ''), '[\s-]', '', 'g'), '');
  v_group_name text;
  v_id uuid;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_debtor is null or p_debtor = v_user or not exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_debtor and m.left_at is null
  ) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;
  if (v_alias is not null and v_alias !~ '^[A-Za-z0-9.-]{6,20}$') or (v_cbu is not null and v_cbu !~ '^[0-9]{22}$')
     or (v_label is not null and char_length(v_label) > 40) then
    raise exception 'invalid_transfer_data' using errcode = '22023';
  end if;
  if not public.debt_is_open(p_group, p_debtor, v_user, p_amount) then
    raise exception 'no_debt' using errcode = '22023';
  end if;
  -- At most one reminder per day for the same debt: no spam.
  if exists (
    select 1 from public.notifications n
    where n.kind = 'debt_reminder' and n.actor_id = v_user and n.user_id = p_debtor and n.group_id = p_group
      and n.created_at > now() - interval '24 hours'
  ) then
    raise exception 'reminder_too_soon' using errcode = '54000';
  end if;

  select g.name into v_group_name from public.groups g where g.id = p_group;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, transfer_label, transfer_alias, transfer_cbu)
  values
    (p_debtor, 'debt_reminder', p_group, v_group_name, v_user, public.display_name_of(v_user), p_amount,
     v_label, v_alias, v_cbu)
  returning id into v_id;
  return v_id;
end;
$$;

-- "Ya pagué" ---------------------------------------------------------------------------------------------
create or replace function public.report_payment(p_group uuid, p_creditor uuid, p_amount numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group_name text;
  v_id uuid;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_creditor is null or p_creditor = v_user or not exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_creditor and m.left_at is null
  ) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.payment_reports r
    where r.group_id = p_group and r.from_user = v_user and r.to_user = p_creditor and r.status = 'reported'
  ) then
    raise exception 'report_already_open' using errcode = '23505';
  end if;
  if not public.debt_is_open(p_group, v_user, p_creditor, p_amount) then
    raise exception 'no_debt' using errcode = '22023';
  end if;

  insert into public.payment_reports (group_id, from_user, to_user, amount)
  values (p_group, v_user, p_creditor, p_amount)
  returning id into v_id;

  select g.name into v_group_name from public.groups g where g.id = p_group;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, report_id)
  values
    (p_creditor, 'payment_reported', p_group, v_group_name, v_user, public.display_name_of(v_user), p_amount, v_id);
  return v_id;
end;
$$;

-- "Confirmar recepción": only now the debt is settled -----------------------------------------------------
-- Returns the settlement id, or NULL when the debt had already been settled another way (the report is closed as
-- cancelled and nothing is recorded, so a payment is never counted twice).
create or replace function public.confirm_payment_report(p_report uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_report public.payment_reports%rowtype;
  v_group_name text;
  v_settlement uuid;
begin
  select r.* into v_report from public.payment_reports r where r.id = p_report;
  if not found or v_report.to_user is distinct from v_user then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if public.lock_group_as_member(v_report.group_id) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  -- Re-read under the group lock: two taps (or two devices) cannot both confirm.
  select r.* into v_report from public.payment_reports r where r.id = p_report for update;
  if v_report.status <> 'reported' then
    raise exception 'report_not_open' using errcode = '22023';
  end if;

  if not public.debt_is_open(v_report.group_id, v_report.from_user, v_report.to_user, v_report.amount) then
    update public.payment_reports set status = 'cancelled', resolved_at = now() where id = p_report;
    return null;
  end if;

  -- A plain settlement, like the ones the group already has: no account of anybody is touched.
  insert into public.settlements (group_id, from_user, to_user, amount, note, created_by)
  values (v_report.group_id, v_report.from_user, v_report.to_user, v_report.amount,
          'Pago confirmado desde Moni', v_user)
  returning id into v_settlement;

  update public.payment_reports
  set status = 'confirmed', resolved_at = now(), settlement_id = v_settlement
  where id = p_report;

  select g.name into v_group_name from public.groups g where g.id = v_report.group_id;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, report_id)
  values
    (v_report.from_user, 'payment_confirmed', v_report.group_id, v_group_name, v_user,
     public.display_name_of(v_user), v_report.amount, p_report);
  return v_settlement;
end;
$$;

-- "No lo recibí" -------------------------------------------------------------------------------------------
create or replace function public.reject_payment_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_report public.payment_reports%rowtype;
  v_group_name text;
begin
  select r.* into v_report from public.payment_reports r where r.id = p_report;
  if not found or v_report.to_user is distinct from v_user then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if public.lock_group_as_member(v_report.group_id) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  select r.* into v_report from public.payment_reports r where r.id = p_report for update;
  if v_report.status <> 'reported' then
    raise exception 'report_not_open' using errcode = '22023';
  end if;
  update public.payment_reports set status = 'rejected', resolved_at = now() where id = p_report;
  select g.name into v_group_name from public.groups g where g.id = v_report.group_id;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, report_id)
  values
    (v_report.from_user, 'payment_rejected', v_report.group_id, v_group_name, v_user,
     public.display_name_of(v_user), v_report.amount, p_report);
end;
$$;

-- The payer takes back their own report --------------------------------------------------------------------
create or replace function public.cancel_payment_report(p_report uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_report public.payment_reports%rowtype;
begin
  select r.* into v_report from public.payment_reports r where r.id = p_report;
  if not found or v_report.from_user is distinct from v_user then
    raise exception 'report_not_found' using errcode = '42501';
  end if;
  if public.lock_group_as_member(v_report.group_id) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  select r.* into v_report from public.payment_reports r where r.id = p_report for update;
  if v_report.status <> 'reported' then
    raise exception 'report_not_open' using errcode = '22023';
  end if;
  update public.payment_reports set status = 'cancelled', resolved_at = now() where id = p_report;
end;
$$;

revoke execute on function
  public.remind_debt(uuid, uuid, numeric, text, text, text), public.report_payment(uuid, uuid, numeric),
  public.confirm_payment_report(uuid), public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  from public, anon;
grant execute on function
  public.remind_debt(uuid, uuid, numeric, text, text, text), public.report_payment(uuid, uuid, numeric),
  public.confirm_payment_report(uuid), public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  to authenticated;

commit;
