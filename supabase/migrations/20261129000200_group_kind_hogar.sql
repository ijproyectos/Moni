-- G1 · Grupos: «Casa» pasa a llamarse «Hogar».
--
-- Tres pasos en una transacción, pensados para que una app con caché vieja siga funcionando:
--   1. create_group acepta 'hogar' y trata 'casa' como alias (guarda 'hogar'). Es la versión con el límite del plan Free de
--      20261106000000 (misma lógica; solo cambia el tipo).
--   2. Los grupos guardados como 'casa' pasan a 'hogar' (nombre, integrantes, gastos y saldos no se tocan).
--   3. La restricción de `groups.kind` queda ('hogar','viaje','pareja','amigos').
--
-- Rollback: supabase/ops/group_kind_hogar_rollback.sql

begin;

create or replace function public.create_group(p_name text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_kind text := case when p_kind = 'casa' then 'hogar' else p_kind end;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if v_kind is null or v_kind not in ('hogar', 'viaje', 'pareja', 'amigos') then
    raise exception 'invalid_group_kind' using errcode = '22023';
  end if;

  -- Serialize this user's group creation so two concurrent calls cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('create_group:' || v_user::text, 0));

  if not exists (
    select 1 from public.plus_entitlements e where e.user_id = v_user and e.expires_at > now()
  ) and exists (
    select 1 from public.groups g where g.created_by = v_user and g.archived_at is null
  ) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  insert into public.groups (name, kind, created_by)
  values (v_name, v_kind, v_user)
  returning id into v_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_id, v_user, 'owner');

  return v_id;
end;
$$;

alter table public.groups drop constraint groups_kind_check;
update public.groups set kind = 'hogar' where kind = 'casa';
alter table public.groups
  add constraint groups_kind_check check (kind in ('hogar', 'viaje', 'pareja', 'amigos'));

commit;
