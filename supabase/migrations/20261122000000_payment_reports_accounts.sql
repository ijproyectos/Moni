-- "Ya pagué" / "Confirmar recepción" con cuentas.
--
--   * «Ya pagué» con una cuenta elegida: el egreso (settlement_out) se registra y descuenta AL INSTANTE, ligado al
--     aviso (transactions.payment_report_id). La deuda del grupo NO cambia todavía: sigue abierta hasta que el
--     receptor confirma (el settlement recién se crea ahí).
--   * «Confirmar recepción»: exige una cuenta del receptor y acredita el ingreso (settlement_in). El egreso del pagador
--     que ya existía se liga al settlement (misma fila: no se crea otro, no se descuenta dos veces).
--   * «No lo recibí» (rechazo) o «cancelar» (el pagador retira el aviso): el egreso del pagador se ANULA (status
--     'voided'), así su saldo vuelve a lo que era. Si al confirmar la deuda ya estaba saldada de otra forma, el aviso se
--     cierra como cancelado y también se anula ese egreso.
--   * Estadísticas: no cambian. Los resúmenes cuentan solo kind 'expense' / 'income'; settlement_in / settlement_out
--     afectan el saldo de la cuenta y aparecen en Movimientos, nunca en ingresos/gastos del mes.
--   * Un solo movimiento vivo por aviso (índice único) y uno por lado y settlement (índice existente).
--
-- Una transacción. Aplicar DESPUÉS de 20261121000000_movement_original_currency.sql (ya aplicada en producción) y con respaldo previo.
--
-- Rollback ejecutable: supabase/ops/payment_reports_accounts_rollback.sql (el efecto sobre el dinero está en su encabezado).

begin;

-- Vínculo del egreso con el aviso ------------------------------------------------------------------------------
alter table public.transactions
  add column payment_report_id uuid references public.payment_reports (id) on delete no action;

create unique index transactions_payment_report_key
  on public.transactions (payment_report_id)
  where payment_report_id is not null and status = 'posted';

alter table public.transactions drop constraint transactions_link_kind_check;
alter table public.transactions
  add constraint transactions_link_kind_check check (
    (kind = 'shared_payment') = (shared_expense_id is not null or guest_expense_id is not null)
    and (shared_expense_id is null or guest_expense_id is null)
    and (kind in ('settlement_out', 'settlement_in'))
        = (settlement_id is not null or guest_settlement_id is not null or payment_report_id is not null)
    and (settlement_id is null or guest_settlement_id is null)
    and (guest_settlement_id is null or kind in ('settlement_out', 'settlement_in'))
    -- El egreso de un aviso es siempre del pagador y de tipo settlement_out.
    and (payment_report_id is null or kind = 'settlement_out')
  );

drop function public.report_payment(uuid, uuid, numeric);
drop function public.confirm_payment_report(uuid);

-- «Ya pagué»: avisa y, con cuenta elegida, descuenta ya ---------------------------------------------------------
create or replace function public.report_payment(
  p_group uuid,
  p_creditor uuid,
  p_amount numeric,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group_name text;
  v_account_archived timestamptz;
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
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
  if p_account_id is not null then
    select a.archived_at into v_account_archived
    from public.accounts a where a.id = p_account_id and a.owner_id = v_user;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_account_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  insert into public.payment_reports (group_id, from_user, to_user, amount)
  values (p_group, v_user, p_creditor, p_amount)
  returning id into v_id;

  -- El dinero ya salió de la cuenta del pagador; la deuda del grupo sigue abierta hasta que el receptor confirme.
  if p_account_id is not null then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, payment_report_id)
    values (v_user, p_account_id, 'settlement_out', p_amount, v_today, 'Pago de deuda', v_id);
  end if;

  select g.name into v_group_name from public.groups g where g.id = p_group;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, report_id)
  values
    (p_creditor, 'payment_reported', p_group, v_group_name, v_user, public.display_name_of(v_user), p_amount, v_id);
  return v_id;
end;
$$;

-- «Confirmar recepción»: ahora sí se salda la deuda y entra el dinero ---------------------------------------------
-- Devuelve el id del settlement, o NULL si la deuda ya estaba saldada de otra forma (el aviso se cierra como
-- cancelado, el egreso del pagador se anula y no se registra nada más).
create or replace function public.confirm_payment_report(p_report uuid, p_account_id uuid)
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
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_archived timestamptz;
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

  if p_account_id is null then
    raise exception 'account_required' using errcode = '22023';
  end if;
  select a.archived_at into v_archived
  from public.accounts a where a.id = p_account_id and a.owner_id = v_user;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if v_archived is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;

  if not public.debt_is_open(v_report.group_id, v_report.from_user, v_report.to_user, v_report.amount) then
    update public.payment_reports set status = 'cancelled', resolved_at = now() where id = p_report;
    update public.transactions set status = 'voided'
    where payment_report_id = p_report and status = 'posted';
    return null;
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount, occurred_on, note, created_by)
  values (v_report.group_id, v_report.from_user, v_report.to_user, v_report.amount, v_today,
          'Pago confirmado desde Moni', v_user)
  returning id into v_settlement;

  -- Pagador: su egreso ya existe (descontado al avisar); solo se liga al settlement. Si no eligió cuenta, no hay egreso.
  update public.transactions set settlement_id = v_settlement
  where payment_report_id = p_report and kind = 'settlement_out' and status = 'posted';

  -- Receptor: el ingreso entra recién ahora, en la cuenta elegida.
  insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, settlement_id)
  values (v_user, p_account_id, 'settlement_in', v_report.amount, v_today, 'Cobro de deuda', v_settlement);

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

-- «No lo recibí»: el egreso del pagador se anula (su saldo vuelve) ----------------------------------------------
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
  update public.transactions set status = 'voided'
  where payment_report_id = p_report and status = 'posted';
  select g.name into v_group_name from public.groups g where g.id = v_report.group_id;
  insert into public.notifications
    (user_id, kind, group_id, group_name, actor_id, actor_name, amount, report_id)
  values
    (v_report.from_user, 'payment_rejected', v_report.group_id, v_group_name, v_user,
     public.display_name_of(v_user), v_report.amount, p_report);
end;
$$;

-- El pagador retira su aviso: también se anula su egreso -------------------------------------------------------
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
  update public.transactions set status = 'voided'
  where payment_report_id = p_report and status = 'posted';
end;
$$;

revoke execute on function
  public.report_payment(uuid, uuid, numeric, uuid), public.confirm_payment_report(uuid, uuid),
  public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  from public, anon;
grant execute on function
  public.report_payment(uuid, uuid, numeric, uuid), public.confirm_payment_report(uuid, uuid),
  public.reject_payment_report(uuid), public.cancel_payment_report(uuid)
  to authenticated;

commit;
