-- Suscripciones y gastos fijos: avisos PUSH reales (con la PWA cerrada), además del centro de avisos de Moni.
--
--   * Un día antes de cada cobro (suscripciones) o vencimiento (gastos fijos): «¡Mañana se cobra Netflix!» / «Recordá que mañana tenés un
--     pago de $200. Asegurate de tener saldo suficiente». Con tarjeta de crédito el texto lo dice (se suma al consumo de la tarjeta).
--   * El día del cobro de una SUSCRIPCIÓN (Moni registra el gasto solo): el push sale DESPUÉS de que el movimiento quedó registrado
--     («¡Netflix registrado!» / «Registré tu gasto de $200 y lo descontué de tu saldo disponible…»; con tarjeta, «…como consumo de tu
--     tarjeta X…»). Se dispara desde el propio registro (disparador sobre subscription_charges al pasar a 'posted'), así que si el cobro falla
--     o se deshace dentro de la misma operación no sale nada: pg_net encola el envío dentro de la transacción. Moni solo registra el gasto: el
--     texto nunca afirma que el comercio cobró.
--   * Un GASTO FIJO no se registra solo: no tiene mensaje de registro, solo recordatorios (el día antes y el día del vencimiento).
--
-- Reglas: nombre, importe y fecha reales; hora de Argentina (como el resto de Moni); sin duplicados (private.recurring_push_log, una fila por
-- aviso); solo quien tiene Moni Plus vigente (como el resto de estos avisos), con dispositivos push y sin suspensión; se respetan las
-- preferencias (center_payments_due apagado = sin avisos de pagos; hide_details = textos sin nombre ni importe) y el «recordarme» de cada
-- pago. Apagable: admin_settings.key = 'recurring_push_enabled' (sin fila = encendido). El toque en el push lleva al detalle del pago o
-- del movimiento y marca el aviso como leído (la app reconoce la clave `aviso`).
--
-- Cron: 12:00 UTC = 09:00 en Argentina. No se toca ningún dato existente.
-- Aplicar DESPUÉS de 20261214000000, con respaldo previo. NO aplicada en producción.
-- Rollback: select cron.unschedule(jobid) from cron.job where jobname = 'moni-recurring-reminders';
--   drop trigger subscription_charges_push on public.subscription_charges;
--   drop function private.push_subscription_charged(), private.run_recurring_reminders(), private.recurring_push_ok(uuid);
--   drop table private.recurring_push_log;

begin;

create table if not exists private.recurring_push_log (
  kind text not null check (kind in ('sub_reminder', 'fixed_reminder', 'fixed_due', 'sub_charged')),
  ref_id uuid not null,
  due_on date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (kind, ref_id, due_on)
);
revoke all on table private.recurring_push_log from public, anon, authenticated;

-- Who can get these pushes right now, and whether they want the details in the text.
create or replace function private.recurring_push_ok(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_plus_user(p_user)
     and exists (select 1 from public.push_subscriptions ps where ps.user_id = p_user)
     and not exists (select 1 from public.account_suspensions s where s.user_id = p_user)
     and coalesce((select e.center_payments_due from public.notice_prefs_extra e where e.user_id = p_user), true);
$$;
revoke all on function private.recurring_push_ok(uuid) from public, anon, authenticated;

create or replace function private.recurring_hide_details(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.hide_details from public.notification_prefs p where p.user_id = p_user), false);
$$;
revoke all on function private.recurring_hide_details(uuid) from public, anon, authenticated;

-- Day-before reminders (subscriptions and fixed expenses) and the due-day reminder of fixed expenses -------------------------------------
create or replace function private.run_recurring_reminders()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  r record;
  v_title text;
  v_body text;
  v_name text;
  v_amount text;
  v_log text;
  v_sent int := 0;
  v_hide boolean;
begin
  for r in
    -- Subscriptions: the day before the charge (the charge itself gets the «registrado» push once it is recorded).
    select s.owner_id, 'sub'::text as src, 'sub_reminder'::text as log_kind, s.id as ref, s.name, s.amount, s.next_charge_on as due_on,
           (v_today + 1) = s.next_charge_on as day_before, a.kind as account_kind, a.name as account_name
    from public.subscriptions s
    join public.accounts a on a.id = s.account_id
    where s.status = 'active' and s.remind and s.next_charge_on = v_today + 1
    union all
    -- Fixed expenses without an occurrence yet, and pending occurrences (moved ones count on the date they moved to).
    select f.owner_id, 'fixed', case when f.next_due_on = v_today + 1 then 'fixed_reminder' else 'fixed_due' end, f.id, f.name, f.amount,
           f.next_due_on, f.next_due_on = v_today + 1, a.kind, a.name
    from public.fixed_expenses f
    join public.accounts a on a.id = f.account_id
    where f.status = 'active' and f.remind and f.next_due_on in (v_today, v_today + 1)
    union all
    select f.owner_id, 'fixed', case when coalesce(o.rescheduled_to, o.due_on) = v_today + 1 then 'fixed_reminder' else 'fixed_due' end,
           f.id, f.name, o.expected_amount, coalesce(o.rescheduled_to, o.due_on), coalesce(o.rescheduled_to, o.due_on) = v_today + 1,
           a.kind, a.name
    from public.fixed_expense_occurrences o
    join public.fixed_expenses f on f.id = o.fixed_expense_id
    join public.accounts a on a.id = f.account_id
    where o.status = 'pending' and f.status = 'active' and f.remind and coalesce(o.rescheduled_to, o.due_on) in (v_today, v_today + 1)
  loop
    begin
      if not private.recurring_push_ok(r.owner_id) then
        continue;
      end if;
      -- One notice per (kind, payment, date): a second run, or the occurrence appearing after the bill, never repeats it.
      insert into private.recurring_push_log (kind, ref_id, due_on, user_id)
      values (r.log_kind, r.ref, r.due_on, r.owner_id)
      on conflict do nothing;
      if not found then
        continue;
      end if;
      v_hide := private.recurring_hide_details(r.owner_id);
      v_name := private.clean_push_text(r.name);
      v_amount := private.format_ars(r.amount);
      if v_hide then
        v_title := case when r.day_before then '¡Mañana tenés un pago!' else 'Hoy vence un pago' end;
        v_body := 'Abrí Moni para ver el detalle.';
      elsif r.day_before then
        v_title := case when r.src = 'sub' then '¡Mañana se cobra ' || v_name || '!' else '¡Mañana vence ' || v_name || '!' end;
        v_body := case
          when r.account_kind = 'credit_card'
            then 'Recordá que mañana tenés un pago de ' || v_amount || ' con tu tarjeta ' || private.clean_push_text(r.account_name)
                 || '. Se va a sumar a lo que gastás con la tarjeta.'
          else 'Recordá que mañana tenés un pago de ' || v_amount || '. Asegurate de tener saldo suficiente'
        end;
      else
        v_title := 'Hoy vence ' || v_name;
        v_body := 'Recordá pagarlo: ' || v_amount || ' estimados. Registralo en Moni cuando lo pagues.';
      end if;
      v_log := case when r.src = 'sub' then 'due:' || r.ref || ':' || r.due_on else 'fdue:' || r.ref || ':' || r.due_on end;
      perform private.run_push_cron(
        jsonb_build_object(
          'kind', 'reminder',
          'title', v_title,
          'body', v_body,
          'audience', 'user',
          'user_id', r.owner_id,
          'url', case when r.src = 'sub' then '/recurrentes?suscripcion=' || r.ref else '/recurrentes?tab=gastos-fijos&gasto=' || r.ref end
                 || '&aviso=' || v_log
        ),
        'recurring_push_enabled'
      );
      v_sent := v_sent + 1;
    exception when others then
      -- One payment that fails never stops the others (nothing is logged: privacy, like the other crons).
      null;
    end;
  end loop;
  return v_sent;
end;
$$;
revoke all on function private.run_recurring_reminders() from public, anon, authenticated;

-- «Registrado»: only after the charge exists as a movement ---------------------------------------------------------------------------------
create or replace function private.push_subscription_charged()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_name text;
  v_account_kind text;
  v_account_name text;
  v_title text;
  v_body text;
begin
  -- Old catch-up charges (after an outage) are registered silently: only today's or yesterday's are news.
  if new.due_on < v_today - 1 or new.transaction_id is null then
    return new;
  end if;
  if not private.recurring_push_ok(new.owner_id) then
    return new;
  end if;
  select s.name, a.kind, a.name into v_name, v_account_kind, v_account_name
  from public.subscriptions s join public.accounts a on a.id = s.account_id
  where s.id = new.subscription_id;
  if v_name is null then
    return new;
  end if;
  insert into private.recurring_push_log (kind, ref_id, due_on, user_id)
  values ('sub_charged', new.id, new.due_on, new.owner_id)
  on conflict do nothing;
  if not found then
    return new;
  end if;
  if private.recurring_hide_details(new.owner_id) then
    v_title := 'Registré un pago';
    v_body := 'Ya podés verlo en Movimientos.';
  else
    v_title := '¡' || private.clean_push_text(v_name) || ' registrado!';
    v_body := case
      when v_account_kind = 'credit_card'
        then 'Registré tu gasto de ' || private.format_ars(new.amount) || ' como consumo de tu tarjeta ' || private.clean_push_text(v_account_name)
             || '. Ya podés verlo en Movimientos'
      else 'Registré tu gasto de ' || private.format_ars(new.amount) || ' y lo descontué de tu saldo disponible. Ya podés verlo en Movimientos'
    end;
  end if;
  perform private.run_push_cron(
    jsonb_build_object(
      'kind', 'reminder',
      'title', v_title,
      'body', v_body,
      'audience', 'user',
      'user_id', new.owner_id,
      'url', '/actividad?mov=' || new.transaction_id || '&aviso=charged:' || new.id
    ),
    'recurring_push_enabled'
  );
  return new;
exception when others then
  -- A failed notice must never undo or block the charge it is about.
  return new;
end;
$$;
revoke all on function private.push_subscription_charged() from public, anon, authenticated;

drop trigger if exists subscription_charges_push on public.subscription_charges;
create trigger subscription_charges_push
after update of status on public.subscription_charges
for each row when (new.status = 'posted' and old.status is distinct from 'posted')
execute function private.push_subscription_charged();

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'moni-recurring-reminders';
    -- 12:00 UTC = 09:00 in Argentina.
    perform cron.schedule('moni-recurring-reminders', '0 12 * * *', $job$ select private.run_recurring_reminders() $job$);
  end if;
end $$;

commit;
