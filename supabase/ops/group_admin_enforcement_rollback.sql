-- Rollback de 20261126000100_group_admin_enforcement.sql (lote B): vuelve a «cualquier integrante crea y lee códigos; el creador o un
-- administrador los revoca» y a la versión anterior de leave_group. No toca ninguna fila financiera.
begin;
drop policy if exists "group_invites_select_admin" on public.group_invites;
create or replace function public.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = ''
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
  update public.group_members set left_at = now()
  where group_id = p_group and user_id = v_user and left_at is null;
  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.role = 'owner' and m.left_at is null) then
    update public.group_members m set role = 'owner'
    where m.group_id = p_group and m.user_id = (
      select m2.user_id from public.group_members m2
      where m2.group_id = p_group and m2.left_at is null order by m2.joined_at, m2.user_id limit 1);
  end if;
  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.left_at is null) then
    update public.groups set archived_at = now() where id = p_group;
    update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  end if;
end;
$$;

-- Invitation codes: back to "any member creates / reads; the creator or an administrator revokes".
drop policy if exists "group_invites_select_admin" on public.group_invites;
create policy "group_invites_select_member" on public.group_invites
for select to authenticated using (public.is_group_member(group_id));

create or replace function public.create_group_invite(p_group uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea; v_code text; v_attempt int; v_active int; i int;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  select count(*) into v_active from public.group_invites gi
  where gi.group_id = p_group and gi.revoked_at is null and gi.expires_at > now() and gi.uses < gi.max_uses;
  if v_active >= 5 then raise exception 'invite_limit_reached' using errcode = '23514'; end if;
  for v_attempt in 1..5 loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, case when i < 6 then i when i = 6 then 7 else i + 2 end) % 32) + 1, 1);
    end loop;
    begin
      insert into public.group_invites (group_id, code, created_by) values (p_group, v_code, v_user);
      return v_code;
    exception when unique_violation then null;
    end;
  end loop;
  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

create or replace function public.revoke_group_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_created_by uuid;
begin
  if v_user is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select gi.group_id, gi.created_by into v_group, v_created_by from public.group_invites gi where gi.id = p_invite;
  if not found then raise exception 'invite_invalid' using errcode = 'P0002'; end if;
  perform public.lock_group_as_member(v_group);
  if v_created_by <> v_user and not exists (
    select 1 from public.group_members m
    where m.group_id = v_group and m.user_id = v_user and m.role = 'owner' and m.left_at is null
  ) then raise exception 'not_allowed' using errcode = '42501'; end if;
  update public.group_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
end;
$$;

commit;
