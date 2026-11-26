-- Moni Free vs Moni Plus · límites y funciones premium validados en el servidor.
--
-- Límites de Free: son TOTALES por persona (cuentan todo lo que creó alguna vez), sin importar el tipo, la categoría o la moneda, y
-- sin que ocultar, archivar, pausar o terminar algo reinicie el contador:
--   * Grupos: UNO creado por la persona en total (pareja, amigos, hogar, viaje… cuentan juntos; archivados y ocultos también). Puede
--     participar en todos los que la inviten. (create_group ya frenaba el segundo grupo ACTIVO; esto cierra el resto.)
--   * Viajes: UNO en total, sumando los personales y los de grupo (un grupo con viaje creado por la persona).
--   * Metas de ahorro: UNA en total, cualquiera sea su tipo, categoría o moneda y su estado (activa, pausada, cumplida o archivada).
--   Ahorros (el módulo de saldos en pesos y dólares) no tiene límite y no se toca.
--   * Pagos recurrentes (suscripciones): crearlos es solo de Plus.
--   * Recordatorios de pago de grupos enviados por Moni (remind_debt): solo Plus. Compartir el mensaje a mano sigue siendo gratis.
--   * Ya estaban en el servidor: foto, voz, asistente y vinculación de Mercado Pago.
--
-- Cómo: disparadores BEFORE (no se reemplaza ninguna función existente). Cada uno deja pasar las operaciones sin sesión de usuario
-- (auth.uid() nulo: tareas internas y cron) y a quien tiene Plus vigente (public.is_plus_user). El error es el mismo que usa el resto de
-- la app: 'plus_required' (SQLSTATE 54000), que la app muestra como la promoción de Moni Plus.
--
-- Si alguien cancela Plus, o ya tenía más que el límite gratuito, NO se borra ni se modifica nada: lo que tiene sigue ahí y se puede
-- consultar y gestionar; solo se bloquean las creaciones nuevas.
--
-- Límite conocido: la importación de Excel y los informes/salud/gastos hormiga se calculan en la app con los movimientos de la propia
-- persona (que son suyos y gratuitos), así que ahí la restricción es de la app, no del servidor.
--
-- Aplicar DESPUÉS de 20261208000000, con respaldo previo. NO aplicada en producción.
-- Rollback: drop trigger free_goal_limit on public.savings_goals; drop trigger free_trip_limit on public.trips;
--   drop trigger free_group_trip_limit on public.group_trips; drop trigger free_group_limit on public.groups;
--   drop trigger plus_subscription_only on public.subscriptions; drop trigger plus_debt_reminder_only on public.notifications;
--   drop function private.free_goal_limit(), private.free_trip_limit(), private.free_group_trip_limit(), private.free_group_limit(),
--   private.free_trips_count(uuid), private.plus_subscription_only(), private.plus_debt_reminder_only();

begin;

-- Goals: one in total, whatever its state, type or currency.
create or replace function private.free_goal_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_plus_user(new.owner_id) then
    return new;
  end if;
  if exists (select 1 from public.savings_goals g where g.owner_id = new.owner_id) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.free_goal_limit() from public, anon, authenticated;

drop trigger if exists free_goal_limit on public.savings_goals;
create trigger free_goal_limit
before insert on public.savings_goals
for each row execute function private.free_goal_limit();

-- Trips: personal ones plus the group trips of groups the person created (everything ever created counts).
create or replace function private.free_trips_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.trips t where t.owner_id = p_user)::int
       + (select count(*) from public.group_trips gt join public.groups g on g.id = gt.group_id where g.created_by = p_user)::int;
$$;
revoke all on function private.free_trips_count(uuid) from public, anon, authenticated;

create or replace function private.free_trip_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_plus_user(new.owner_id) then
    return new;
  end if;
  if private.free_trips_count(new.owner_id) >= 1 then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.free_trip_limit() from public, anon, authenticated;

drop trigger if exists free_trip_limit on public.trips;
create trigger free_trip_limit
before insert on public.trips
for each row execute function private.free_trip_limit();

create or replace function private.free_group_trip_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null or public.is_plus_user(v_user) then
    return new;
  end if;
  if private.free_trips_count(v_user) >= 1 then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.free_group_trip_limit() from public, anon, authenticated;

drop trigger if exists free_group_trip_limit on public.group_trips;
create trigger free_group_trip_limit
before insert on public.group_trips
for each row execute function private.free_group_trip_limit();

-- Groups: one created by the person in total (archived or hidden ones still count), whatever its kind.
create or replace function private.free_group_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_plus_user(new.created_by) then
    return new;
  end if;
  if exists (select 1 from public.groups g where g.created_by = new.created_by) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.free_group_limit() from public, anon, authenticated;

drop trigger if exists free_group_limit on public.groups;
create trigger free_group_limit
before insert on public.groups
for each row execute function private.free_group_limit();

create or replace function private.plus_subscription_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_plus_user(new.owner_id) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.plus_subscription_only() from public, anon, authenticated;

drop trigger if exists plus_subscription_only on public.subscriptions;
create trigger plus_subscription_only
before insert on public.subscriptions
for each row execute function private.plus_subscription_only();

-- The reminder that Moni sends for a debt: only the SENDER needs Plus (receiving one never does).
create or replace function private.plus_debt_reminder_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.kind = 'debt_reminder' and not public.is_plus_user((select auth.uid())) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.plus_debt_reminder_only() from public, anon, authenticated;

drop trigger if exists plus_debt_reminder_only on public.notifications;
create trigger plus_debt_reminder_only
before insert on public.notifications
for each row when (new.kind = 'debt_reminder')
execute function private.plus_debt_reminder_only();

commit;
