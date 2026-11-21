-- G1 · Lote B (CAMBIA FUNCIONES EXISTENTES: aplicar junto con la publicación del front nuevo, después del lote A).
--
--   * leave_group: el único administrador no puede salir mientras queden otras personas: debe nombrar otra primero
--     (antes se promovía a alguien sin preguntar). La app publicada mostraría un error genérico en ese caso.
--   * Códigos de invitación solo para administradores: la política de lectura de group_invites pasa de «cualquier integrante» a
--     «administradores», y create_group_invite / revoke_group_invite exigen ser administrador. La app publicada deja que cualquier
--     integrante invite: con este lote esos botones fallarían. Los códigos ya emitidos siguen funcionando.
--
-- Requiere el lote A (usa is_group_owner). Rollback: supabase/ops/group_admin_enforcement_rollback.sql

begin;

-- Leave: same as before, plus the last administrator cannot leave while others remain ---------------------------

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_net numeric;
begin
  perform public.lock_group_as_member(p_group);

  select r.net into v_net from public.group_balance_rows(p_group) r where r.user_id = v_user;
  if coalesce(v_net, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = '23514';
  end if;

  -- The only administrator must name another one first (the group never ends up without one).
  if public.is_group_owner(p_group)
     and not exists (
       select 1 from public.group_members m
       where m.group_id = p_group and m.role = 'owner' and m.left_at is null and m.user_id <> v_user
     )
     and exists (
       select 1 from public.group_members m
       where m.group_id = p_group and m.left_at is null and m.user_id <> v_user
     ) then
    raise exception 'last_admin' using errcode = '23514';
  end if;

  update public.group_members
  set left_at = now()
  where group_id = p_group and user_id = v_user and left_at is null;

  -- Last active member gone: archive the group and close every invite so nobody can join an empty group.
  if not exists (
    select 1 from public.group_members m where m.group_id = p_group and m.left_at is null
  ) then
    update public.groups set archived_at = now() where id = p_group;
    update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  end if;
end;
$$;

-- Invitation codes: ONLY administrators create, read (share) and revoke them -----------------------------------------
-- Codes that already exist keep working (they are not touched): administrators can see and revoke them. A member who is not an
-- administrator can no longer read the codes (the old policy let every member SELECT them), nor create or revoke one.

drop policy "group_invites_select_member" on public.group_invites;
create policy "group_invites_select_admin" on public.group_invites
for select to authenticated using (public.is_group_owner(group_id));

-- Same body as 20261105000000_shorter_invite_codes.sql plus the administrator check.
create or replace function public.create_group_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols: no modulo bias, no I/O/0/1
  v_bytes bytea;
  v_code text;
  v_attempt int;
  v_active int;
  i int;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  select count(*) into v_active
  from public.group_invites gi
  where gi.group_id = p_group
    and gi.revoked_at is null
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
  if v_active >= 5 then
    raise exception 'invite_limit_reached' using errcode = '23514';
  end if;

  for v_attempt in 1..5 loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, case when i < 6 then i when i = 6 then 7 else i + 2 end) % 32) + 1, 1);
    end loop;
    begin
      insert into public.group_invites (group_id, code, created_by)
      values (p_group, v_code, v_user);
      return v_code;
    exception when unique_violation then
      null; -- extremely unlikely collision: draw another code
    end;
  end loop;

  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

-- Same body as 20261027000000_shared_expenses.sql; the creator exception is gone: only administrators revoke.
create or replace function public.revoke_group_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select gi.group_id into v_group from public.group_invites gi where gi.id = p_invite;
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_group);

  if not public.is_group_owner(v_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  update public.group_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
end;
$$;

commit;
