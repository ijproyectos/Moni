-- Resumen semanal personalizado por push (Moni amigo financiero, fase 1 — parte 2).
--
-- Hasta ahora el único push "de todos los días" es moni-nightly-push: un texto fijo, igual para todo el mundo
-- (20261119000000_push_always_on_schedules.sql). Esta migración agrega un segundo cron, con contenido propio por
-- persona:
--
--   * public.get_weekly_digest(p_owner): SECURITY DEFINER, service_role only. Para un usuario, calcula (lunes de
--     esta semana -> hoy, hora Argentina):
--       - Ahorro de la semana: ingresos - gastos posteados (no incluye depósitos a metas; es un proxy simple).
--       - Gastos hormiga de la semana: mismo criterio que get_ant_expenses (umbral = min($10.000, mediana de la
--         semana), agrupado por categoría/nota, >= 3 ocurrencias) pero sobre la semana en vez del mes.
--       - Saldo real (cuentas propias, no tarjeta de crédito, en ARS) y días que faltan para fin de mes.
--       - "Poco saldo": si al ritmo de gasto de esta semana el saldo no alcanza para llegar a fin de mes, sugiere
--         cuánto gastar por día para llegar.
--     Devuelve los números crudos + un texto ya armado en 'body' (vacío si no hay nada para contar: usuario nuevo
--     sin movimientos esta semana). Queda disponible para reusarse más adelante (p. ej. una herramienta del chat).
--   * private.run_weekly_digest_cron(): recorre las personas con al menos una suscripción push activa y no
--     suspendidas, arma el resumen de cada una y lo manda con private.run_push_cron (mismo helper que el
--     recordatorio de deuda y el push de Mercado Pago). Una persona que falla no frena a las demás.
--   * Horario: 16:00 UTC = 13:00 en Argentina (mediodía/tarde, a pedido del usuario — no de noche).
--   * Apagable sin tocar código: admin_settings.key = 'weekly_digest_push_enabled' (sin fila = encendido).
--
-- No se toca ninguna tabla ni dato existente. Una transacción.
-- Rollback:
--   do $$ begin
--     if to_regclass('cron.job') is not null then
--       perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'moni-weekly-digest';
--     end if;
--   end $$;
--   drop function private.run_weekly_digest_cron(), public.get_weekly_digest(uuid), private.format_ars(numeric);

begin;

-- "$185.000" o "$185.000,50" (punto de miles, coma decimal). Mismo formato que ya usan otros avisos push.
create or replace function private.format_ars(p_amount numeric)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select '$' || regexp_replace(trunc(abs(p_amount))::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || case when abs(p_amount) <> trunc(abs(p_amount))
                 then ',' || lpad(((abs(p_amount) - trunc(abs(p_amount))) * 100)::int::text, 2, '0')
                 else '' end;
$$;

create or replace function public.get_weekly_digest(p_owner uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_week_start date;
  v_cutoff date;
  v_days_elapsed int;
  v_month_end date;
  v_days_left int;
  v_income_week numeric;
  v_expense_week numeric;
  v_net_week numeric;
  v_balance numeric;
  v_median numeric;
  v_threshold numeric;
  v_ants_total numeric;
  v_ants_count int;
  v_daily_pace numeric;
  v_daily_budget numeric;
  v_savings_line text;
  v_ants_line text;
  v_balance_line text;
  v_body text;
begin
  if p_owner is null then
    raise exception 'invalid_owner' using errcode = '22023';
  end if;

  v_today := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_week_start := v_today - (extract(isodow from v_today)::int - 1); -- lunes de esta semana
  v_cutoff := v_today + 1; -- exclusivo: incluye lo de hoy
  v_days_elapsed := greatest(v_today - v_week_start + 1, 1);
  v_month_end := (date_trunc('month', v_today) + interval '1 month')::date;
  v_days_left := greatest(v_month_end - v_today, 1);

  select coalesce(sum(case when t.kind = 'income' then t.amount else 0 end), 0),
         coalesce(sum(case when t.kind = 'expense' then t.amount else 0 end), 0)
    into v_income_week, v_expense_week
  from public.transactions t
  where t.owner_id = p_owner and t.status = 'posted' and t.kind in ('expense', 'income')
    and t.occurred_on >= v_week_start and t.occurred_on < v_cutoff;
  v_net_week := v_income_week - v_expense_week;

  select coalesce(sum(ab.balance), 0) into v_balance
  from public.account_balances ab
  join public.accounts a on a.id = ab.account_id
  where ab.owner_id = p_owner and ab.archived_at is null and a.kind <> 'credit_card' and ab.currency = 'ARS';

  -- Gastos hormiga de la semana: mismo criterio que get_ant_expenses (20261028000000), ventana semanal.
  select round((percentile_cont(0.5) within group (order by t.amount))::numeric, 2) into v_median
  from public.transactions t
  where t.owner_id = p_owner and t.status = 'posted' and t.kind = 'expense'
    and t.occurred_on >= v_week_start and t.occurred_on < v_cutoff;
  v_threshold := least(10000, coalesce(v_median, 10000));

  with tx as (
    select t.amount, lower(btrim(coalesce(nullif(btrim(t.note), ''), c.name))) as norm_key
    from public.transactions t
    join public.categories c on c.id = t.category_id
    where t.owner_id = p_owner and t.status = 'posted' and t.kind = 'expense'
      and t.occurred_on >= v_week_start and t.occurred_on < v_cutoff
      and t.amount <= v_threshold
  ),
  grp as (
    select count(*) as occurrences, sum(amount) as total
    from tx
    group by norm_key
    having count(*) >= 3
  )
  select coalesce(sum(total), 0), coalesce(sum(occurrences), 0) into v_ants_total, v_ants_count
  from grp;

  -- "Poco saldo": al ritmo de gasto de esta semana, ¿el saldo alcanza para llegar a fin de mes?
  v_daily_pace := v_expense_week / v_days_elapsed;
  v_daily_budget := v_balance / v_days_left;

  v_savings_line := case
    when v_net_week > 0 then 'Ahorraste ' || private.format_ars(v_net_week) || ' esta semana. '
    when v_net_week < 0 then 'Esta semana gastaste ' || private.format_ars(v_net_week * -1)
                              || ' más de lo que entró. '
    else null
  end;

  v_ants_line := case when v_ants_count >= 1
    then 'Gastos hormiga: ' || private.format_ars(v_ants_total) || ' en ' || v_ants_count
         || case when v_ants_count = 1 then ' compra chica. ' else ' compras chicas. ' end
    else null
  end;

  v_balance_line := case
    when v_daily_pace > 0 and v_balance < v_daily_pace * v_days_left then
      'Con ' || private.format_ars(v_balance) || ' y ' || v_days_left
      || ' días para fin de mes, tratá de no pasar ' || private.format_ars(v_daily_budget) || ' por día.'
    when v_balance < 0 then
      'Ojo: tus cuentas están en ' || private.format_ars(v_balance) || '.'
    else null
  end;

  v_body := btrim(coalesce(v_savings_line, '') || coalesce(v_ants_line, '') || coalesce(v_balance_line, ''));
  if v_body = '' then
    v_body := null; -- nada para contar esta semana (usuario nuevo, sin movimientos): no se manda push
  end if;

  return jsonb_build_object(
    'weekStart', v_week_start, 'today', v_today,
    'incomeWeekCents', round(v_income_week * 100), 'expenseWeekCents', round(v_expense_week * 100),
    'netWeekCents', round(v_net_week * 100),
    'antsTotalCents', round(v_ants_total * 100), 'antsCount', v_ants_count,
    'balanceCents', round(v_balance * 100), 'daysLeft', v_days_left,
    'dailyBudgetCents', round(v_daily_budget * 100),
    'body', left(v_body, 240)
  );
end;
$$;

create or replace function private.run_weekly_digest_cron()
returns int
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user record;
  v_digest jsonb;
  v_sent int := 0;
begin
  for v_user in
    select distinct ps.user_id
    from public.push_subscriptions ps
    where not exists (select 1 from public.account_suspensions s where s.user_id = ps.user_id)
  loop
    begin
      v_digest := public.get_weekly_digest(v_user.user_id);
      if v_digest ->> 'body' is not null then
        perform private.run_push_cron(
          jsonb_build_object(
            'kind', 'reminder',
            'title', '🐱 Tu semana con Moni',
            'body', v_digest ->> 'body',
            'audience', 'user',
            'user_id', v_user.user_id,
            'url', '/'
          ),
          'weekly_digest_push_enabled'
        );
        v_sent := v_sent + 1;
      end if;
    exception when others then
      -- Una persona que falla no frena al resto; nada se loguea (privacy, igual que el resto de los crons).
      null;
    end;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function private.format_ars(numeric) from public, anon, authenticated;
revoke execute on function public.get_weekly_digest(uuid) from public, anon, authenticated;
grant execute on function public.get_weekly_digest(uuid) to service_role;
revoke all on function private.run_weekly_digest_cron() from public, anon, authenticated;

do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'moni-weekly-digest';
    -- 16:00 UTC = 13:00 en Argentina (mediodía/tarde).
    perform cron.schedule('moni-weekly-digest', '0 16 * * *', $job$ select private.run_weekly_digest_cron() $job$);
  end if;
end $$;

commit;
