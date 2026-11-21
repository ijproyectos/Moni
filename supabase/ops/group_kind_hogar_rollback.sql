-- Rollback de 20261129000200_group_kind_hogar.sql: vuelve a 'casa' y restaura create_group de 20261106000000.
begin;
alter table public.groups drop constraint groups_kind_check;
update public.groups set kind = 'casa' where kind = 'hogar';
alter table public.groups add constraint groups_kind_check check (kind in ('casa', 'viaje', 'pareja', 'amigos'));

create or replace function public.create_group(p_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if char_length(v_name) not between 1 and 60 then raise exception 'invalid_group_name' using errcode = '22023'; end if;
  if p_kind is null or p_kind not in ('casa', 'viaje', 'pareja', 'amigos') then
    raise exception 'invalid_group_kind' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('create_group:' || v_user::text, 0));
  if not exists (select 1 from public.plus_entitlements e where e.user_id = v_user and e.expires_at > now())
     and exists (select 1 from public.groups g where g.created_by = v_user and g.archived_at is null) then
    raise exception 'plus_required' using errcode = '54000';
  end if;
  insert into public.groups (name, kind, created_by) values (v_name, p_kind, v_user) returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, v_user, 'owner');
  return v_id;
end;
$$;
commit;
