-- ROLLBACK de 20261122000000_payment_reports_accounts.sql. Ejecutable tal cual (una transacción); como rol dueño.
-- Antes: `select count(*) from public.transactions where payment_report_id is not null;` y respaldo.
--
-- Efecto sobre el dinero:
--   * Egresos ligados a un settlement ya confirmado: se CONSERVAN (son pagos reales; solo se pierde el vínculo con el aviso).
--   * Egresos de avisos todavía abiertos / rechazados / cancelados (sin settlement): se BORRAN. En avisos abiertos el
--     pagador recupera ese saldo (el descuento deja de existir) y debe volver a descontarlo a mano si ya transfirió.
--   * Los avisos y settlements no se tocan.
begin;

drop function public.report_payment(uuid, uuid, numeric, uuid);
drop function public.confirm_payment_report(uuid, uuid);

delete from public.transactions where payment_report_id is not null and settlement_id is null;

alter table public.transactions drop constraint transactions_link_kind_check;
drop index public.transactions_payment_report_key;
alter table public.transactions drop column payment_report_id;
alter table public.transactions
  add constraint transactions_link_kind_check check (
    (kind = 'shared_payment') = (shared_expense_id is not null or guest_expense_id is not null)
    and (shared_expense_id is null or guest_expense_id is null)
    and (kind in ('settlement_out', 'settlement_in')) = (settlement_id is not null or guest_settlement_id is not null)
    and (settlement_id is null or guest_settlement_id is null)
    and (guest_settlement_id is null or kind in ('settlement_out', 'settlement_in'))
  );

-- Funciones de 20261111000000_debt_reminders_and_payment_reports.sql, tal como estaban.
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
  public.report_payment(uuid, uuid, numeric), public.confirm_payment_report(uuid),
  public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  from public, anon;
grant execute on function
  public.report_payment(uuid, uuid, numeric), public.confirm_payment_report(uuid),
  public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  to authenticated;

commit;
