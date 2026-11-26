-- Moni Free · límite de PARTICIPACIÓN: una persona Free puede estar en UN solo grupo o viaje activo a la vez (el que creó o al que la
-- invitaron). Para sumarse a otro necesita Moni Plus. Es una regla del servidor que cubre todas las vías de ingreso:
--   * invitación directa a un contacto (group_invitations): se rechaza al crearla, así no queda invitación pendiente ni aviso. Quien
--     invita recibe 'invitee_needs_plus' (la app muestra «No pudimos enviar la invitación»).
--   * código general (group_join_requests): se rechaza al pedir ingreso; quien lo usa recibe 'plus_required' (su propia promo de Plus).
--   * enlace personal, aceptar una invitación o que un administrador apruebe una solicitud: se rechaza al sumarse a group_members
--     ('plus_required' si es la propia persona, 'invitee_needs_plus' si lo hace otra, p. ej. un administrador al aprobar).
-- Lo que ya existe no se toca: quien ya está en más grupos sigue en ellos; solo se frena sumarse a uno nuevo. La persona que CREA un
-- grupo no pasa por esta regla (la creación tiene su propio límite). Cuentan los grupos activos de los que la persona es integrante
-- (también los que ocultó); los archivados y a los que ya salió no cuentan. Las operaciones internas (sin sesión) no se tocan.
--
-- Aplicar DESPUÉS de 20261212000100, con respaldo previo. Rollback: drop trigger free_participation_limit on public.group_members;
--   drop trigger free_participation_limit on public.group_invitations; drop trigger free_participation_limit on public.group_join_requests;
--   drop function private.free_participation_limit(), private.free_participation_blocked(uuid, uuid);

begin;

-- Would this person go over the free participation limit by joining p_group?
create or replace function private.free_participation_blocked(p_user uuid, p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not public.is_plus_user(p_user)
     and not exists (select 1 from public.groups g where g.id = p_group and g.created_by = p_user)
     and exists (
       select 1
       from public.group_members m
       join public.groups g on g.id = m.group_id
       where m.user_id = p_user and m.left_at is null and g.archived_at is null and m.group_id <> p_group
     );
$$;
revoke all on function private.free_participation_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function private.free_participation_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_target uuid;
begin
  if v_actor is null then
    return new;
  end if;
  if tg_table_name = 'group_members' then
    -- Only a person being added (or coming back): leaving or any other change is not a join.
    if tg_op = 'UPDATE' and not (old.left_at is not null and new.left_at is null) then
      return new;
    end if;
    if new.left_at is not null then
      return new;
    end if;
    v_target := new.user_id;
  elsif tg_table_name = 'group_invitations' then
    v_target := new.invited_user;
  else
    v_target := new.user_id;
  end if;
  if private.free_participation_blocked(v_target, new.group_id) then
    if v_target = v_actor then
      raise exception 'plus_required' using errcode = '54000';
    end if;
    raise exception 'invitee_needs_plus' using errcode = '54000';
  end if;
  return new;
end;
$$;
revoke all on function private.free_participation_limit() from public, anon, authenticated;

drop trigger if exists free_participation_limit on public.group_members;
create trigger free_participation_limit
before insert or update of left_at on public.group_members
for each row execute function private.free_participation_limit();

drop trigger if exists free_participation_limit on public.group_invitations;
create trigger free_participation_limit
before insert on public.group_invitations
for each row execute function private.free_participation_limit();

drop trigger if exists free_participation_limit on public.group_join_requests;
create trigger free_participation_limit
before insert on public.group_join_requests
for each row execute function private.free_participation_limit();

commit;
