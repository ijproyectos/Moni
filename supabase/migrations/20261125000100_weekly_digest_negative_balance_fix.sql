-- Corrige un error real de 20261125000000_weekly_digest_push.sql, encontrado al probar get_weekly_digest()
-- contra una persona real: con saldo negativo, la rama de "poco saldo" entraba primero (v_balance < pace*days es
-- verdadero para cualquier negativo) y mostraba el número en rojo como si fuera un saldo disponible normal
-- ("Con $981.783,86 y 10 días para fin de mes, tratá de no pasar $98.178,39 por día" con un saldo de -$981.783,86).
-- private.format_ars() nunca mostró el signo (toma abs() a propósito, para no mezclar guiones con el resto del
-- texto); por eso el único lugar donde el signo importa necesita quedar explícito en las palabras, no en el número.
--
-- Esta migración reemplaza get_weekly_digest() con la misma función, moviendo la rama "saldo negativo" primero.
-- Nada más cambia. No se tocó ningún dato; el cron (private.run_weekly_digest_cron, 13:00 ART) quedó sin disparar
-- un mensaje incorrecto porque esto se corrigió antes de su primera corrida.
--
-- Una transacción. Rollback: recrear public.get_weekly_digest con el cuerpo de 20261125000000_weekly_digest_push.sql
-- (no recomendado: eso reintroduce el error).

begin;

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

  -- FIX: el saldo negativo se revisa primero. Antes, "v_balance < v_daily_pace * v_days_left" también era
  -- verdadero para cualquier saldo negativo (un número negativo siempre es menor a uno positivo), así que esa
  -- rama entraba primero y format_ars() (que no muestra el signo) lo mostraba como si fuera un saldo disponible.
  v_balance_line := case
    when v_balance < 0 then
      'Ojo: tus cuentas están en rojo, ' || private.format_ars(v_balance) || '.'
    when v_daily_pace > 0 and v_balance < v_daily_pace * v_days_left then
      'Con ' || private.format_ars(v_balance) || ' y ' || v_days_left
      || ' días para fin de mes, tratá de no pasar ' || private.format_ars(v_daily_budget) || ' por día.'
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

revoke execute on function public.get_weekly_digest(uuid) from public, anon, authenticated;
grant execute on function public.get_weekly_digest(uuid) to service_role;

commit;
