-- «Eliminados y archivados»: eliminar DEFINITIVAMENTE un grupo o viaje (los viajes de grupo son grupos).
--
-- public.purge_group_for_me(grupo) solo sirve para un grupo que ya está en esa sección (lo quité de mi cuenta o está archivado para
-- todos); no es una forma de borrar un grupo activo. Reglas:
--   * Con saldo propio distinto de cero, o con pagos sin confirmar del grupo, se rechaza: no sirve para evadir deudas.
--   * Si el grupo es solo mío (ninguna otra persona fue integrante), sin saldos pendientes de invitados sin cuenta y sin movimientos
--     personales atados a sus gastos, se borra de la base. Es el único caso en que se borran filas.
--   * En cualquier otro caso la persona SALE del grupo (left_at): deja de verlo y no puede restaurarlo, pero gastos, pagos y saldos
--     de los demás quedan intactos y su nombre se sigue viendo en el historial. Si era el único administrador y hay más gente en un
--     grupo archivado, la administración pasa al integrante más antiguo (nadie puede operar en un grupo archivado, solo evita
--     dejarlo sin administrador); en un grupo activo se pide nombrar a otra persona antes (last_admin), como siempre.
--   * Límite de Free: un grupo borrado de verdad deja una constancia (private.purged_groups) que SIGUE contando para el límite de
--     grupos y de viajes, así que eliminar no libera el cupo. Si la cuenta se elimina, sus constancias se van con ella.
--
-- Aplicar DESPUÉS de 20261211000000, con respaldo previo. Rollback: drop function public.purge_group_for_me(uuid);
--   restaurar private.free_group_limit() y private.free_trips_count(uuid) de 20261209000000; drop table private.purged_groups;

begin;

create table if not exists private.purged_groups (
  group_id uuid primary key,
  created_by uuid not null references auth.users (id) on delete cascade,
  had_trip boolean not null default false,
  purged_at timestamptz not null default now()
);
revoke all on table private.purged_groups from public, anon, authenticated;

-- The Free limits keep counting what was created and later deleted for good.
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
  if exists (select 1 from public.groups g where g.created_by = new.created_by)
     or exists (select 1 from private.purged_groups p where p.created_by = new.created_by) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  return new;
end;
$$;

create or replace function private.free_trips_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.trips t where t.owner_id = p_user)::int
       + (select count(*) from public.group_trips gt join public.groups g on g.id = gt.group_id where g.created_by = p_user)::int
       + (select count(*) from private.purged_groups p where p.created_by = p_user and p.had_trip)::int;
$$;

create or replace function public.purge_group_for_me(p_group uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_archived timestamptz;
  v_hidden timestamptz;
  v_creator uuid;
  v_photo text;
  v_net numeric;
  v_next uuid;
begin
  -- Locks the group and requires an active membership (works for archived groups too).
  v_archived := public.lock_group_as_member(p_group);

  select m.hidden_at into v_hidden
  from public.group_members m
  where m.group_id = p_group and m.user_id = v_user and m.left_at is null;
  if v_archived is null and v_hidden is null then
    raise exception 'group_not_removed' using errcode = '23514';
  end if;

  select r.net into v_net from public.group_balance_rows(p_group) r where r.user_id = v_user;
  if coalesce(v_net, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.payment_reports r where r.group_id = p_group and r.status = 'reported'
  ) then
    raise exception 'open_payment_reports' using errcode = '23514';
  end if;

  -- Only mine: nobody else was ever a member, no guest still owes or is owed, and none of my movements points at its records.
  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id <> v_user)
     and public.group_open_balance_count(p_group) = 0
     and not exists (
       select 1 from public.transactions t
       where t.shared_expense_id in (select e.id from public.shared_expenses e where e.group_id = p_group)
          or t.settlement_id in (select s.id from public.settlements s where s.group_id = p_group)
          or t.payment_report_id in (select r.id from public.payment_reports r where r.group_id = p_group)
          or t.guest_settlement_id in (select s.id from public.group_guest_settlements s where s.group_id = p_group)
     ) then
    select g.created_by, g.photo_path into v_creator, v_photo from public.groups g where g.id = p_group;
    insert into private.purged_groups (group_id, created_by, had_trip)
    values (p_group, v_creator, exists (select 1 from public.group_trips gt where gt.group_id = p_group))
    on conflict (group_id) do nothing;

    alter table public.shared_expense_splits disable trigger shared_expense_splits_immutable;
    delete from public.notifications n
    where n.group_id = p_group
       or n.expense_id in (select e.id from public.shared_expenses e where e.group_id = p_group)
       or n.report_id in (select r.id from public.payment_reports r where r.group_id = p_group)
       or n.occurrence_id in (select o.id from public.group_recurring_occurrences o where o.group_id = p_group)
       or n.invitation_id in (select i.id from public.group_invitations i where i.group_id = p_group)
       or n.request_id in (select r.id from public.group_join_requests r where r.group_id = p_group);
    delete from public.payment_reports where group_id = p_group;
    delete from public.settlements where group_id = p_group;
    delete from public.shared_expense_splits where group_id = p_group;
    delete from public.group_recurring_occurrences where group_id = p_group;
    delete from public.group_recurring_participants where group_id = p_group;
    delete from public.group_recurring_expenses where group_id = p_group;
    delete from public.shared_expenses where group_id = p_group;
    delete from public.group_guest_expenses where group_id = p_group;
    delete from public.group_guest_settlements where group_id = p_group;
    delete from public.group_guests where group_id = p_group;
    delete from public.group_invitations where group_id = p_group;
    delete from public.group_invites where group_id = p_group;
    delete from public.group_join_requests where group_id = p_group;
    delete from public.group_trips where group_id = p_group;
    delete from public.group_members where group_id = p_group;
    delete from public.groups where id = p_group;
    alter table public.shared_expense_splits enable trigger shared_expense_splits_immutable;
    return jsonb_build_object('outcome', 'deleted', 'photo_path', v_photo);
  end if;

  -- Shared with other people: I leave for good, what is theirs stays.
  if public.is_group_owner(p_group)
     and not exists (
       select 1 from public.group_members m
       where m.group_id = p_group and m.role = 'owner' and m.left_at is null and m.user_id <> v_user
     )
     and exists (
       select 1 from public.group_members m where m.group_id = p_group and m.left_at is null and m.user_id <> v_user
     ) then
    if v_archived is null then
      raise exception 'last_admin' using errcode = '23514';
    end if;
    select o.user_id into v_next
    from public.group_members o
    where o.group_id = p_group and o.user_id <> v_user and o.left_at is null
    order by o.joined_at asc, o.user_id asc
    limit 1;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = v_next;
  end if;

  update public.group_members
  set left_at = now(), hidden_at = null
  where group_id = p_group and user_id = v_user and left_at is null;

  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.left_at is null) then
    update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group;
    update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  end if;
  return jsonb_build_object('outcome', 'left', 'photo_path', null);
end;
$$;
revoke execute on function public.purge_group_for_me(uuid) from public, anon;
grant execute on function public.purge_group_for_me(uuid) to authenticated;

commit;
