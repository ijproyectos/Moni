-- Grupos · Enlace personal de invitación.
--
-- Problema: una administradora invita a una persona por WhatsApp con el enlace/código del grupo y, al entrar, tenía que volver a aprobar
-- su ingreso. El enlace general SIGUE pidiendo aprobación (cualquiera que lo reciba puede reenviarlo). Lo que se suma es un enlace
-- PERSONAL: lo genera una administradora para una persona concreta, sirve UNA sola vez y vence a los 7 días; quien lo abre entra directo
-- al grupo, sin solicitud ni aviso de aprobación.
--
--   * group_invites.personal (boolean, false por defecto): distingue estos enlaces del código general del grupo.
--   * public.create_personal_group_invite(p_group): solo administradores (mismo control que create_group_invite), grupo no archivado,
--     máximo 3 enlaces personales activos por grupo. Crea un código con requires_approval = false, max_uses = 1 y vencimiento a 7 días.
--     Entrar con él usa el camino que ya existe en request_join_group (código sin aprobación: membresía inmediata y uses + 1), así que
--     no se toca ninguna función existente ni las validaciones de seguridad; revoke_group_invite sirve para anularlo.
--
--   * request_join_group: mismo cuerpo que en 20261202000000 con UNA corrección: la rama de códigos sin aprobación usaba
--     ON CONFLICT (group_id, user_id), ambiguo con la columna de salida group_id, y fallaba. Es la rama que usan los enlaces personales.
--
-- No cambia datos existentes (todas las filas quedan personal = false). Aplicar con respaldo previo. NO aplicada en producción.
-- Rollback: drop function public.create_personal_group_invite(uuid); alter table public.group_invites drop column personal;
--   y volver a crear request_join_group desde 20261202000000_group_push_and_invitations.sql.

begin;

alter table public.group_invites add column personal boolean not null default false;

create or replace function public.create_personal_group_invite(p_group uuid)
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
    and gi.personal
    and gi.revoked_at is null
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
  if v_active >= 3 then
    raise exception 'personal_invite_limit' using errcode = '23514';
  end if;

  for v_attempt in 1..5 loop
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, case when i < 6 then i when i = 6 then 7 else i + 2 end) % 32) + 1, 1);
    end loop;
    begin
      insert into public.group_invites (group_id, code, created_by, requires_approval, max_uses, expires_at, personal)
      values (p_group, v_code, v_user, false, 1, now() + interval '7 days', true);
      return v_code;
    exception when unique_violation then
      null; -- extremely unlikely collision: draw another code
    end;
  end loop;

  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

-- request_join_group: same body as 20261202000000 with one fix. Its branch for codes that do not require approval used
-- ON CONFLICT (group_id, user_id), ambiguous with the function's OUT column group_id, so such codes raised an error. Nothing else changes:
-- approval codes, direct invitations, limits and attempts behave exactly as before.
create or replace function public.request_join_group(p_code text)
returns table (result text, group_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(left(coalesce(p_code, ''), 64), '[\s-]', '', 'g'));
  v_group uuid;
  v_invite public.group_invites%rowtype;
  v_archived timestamptz;
  v_valid boolean := false;
  v_name text;
  v_request uuid;
  v_actor text;
  v_direct public.group_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  -- Same lock order as join_group / revoke_group_invite: group row first, then the invite row.
  select gi.group_id into v_group from public.group_invites gi where gi.code = v_code;
  if found then
    select g.archived_at, g.name into v_archived, v_name from public.groups g where g.id = v_group for update;
    select * into v_invite from public.group_invites gi where gi.code = v_code for update;
    if found then
      if exists (
        select 1 from public.group_members m
        where m.group_id = v_invite.group_id and m.user_id = v_user and m.left_at is null
      ) then
        return query select 'already_member'::text, v_invite.group_id;
        return;
      end if;
      v_valid := v_archived is null
        and v_invite.group_id = v_group
        and v_invite.revoked_at is null
        and v_invite.expires_at > now()
        and v_invite.uses < v_invite.max_uses;
    end if;
  end if;

  if not v_valid then
    delete from public.group_join_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.group_join_attempts (user_id) values (v_user);
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  -- A direct invitation to MY account for this group: the code only confirms it, and I enter at once (no second approval).
  select i.* into v_direct
  from public.group_invitations i
  where i.group_id = v_invite.group_id and i.invited_user = v_user and i.status = 'pending'
    and i.created_at > now() - interval '14 days'
  order by i.created_at desc
  limit 1
  for update;
  if found then
    -- (two steps instead of ON CONFLICT: the function's OUT column group_id would make that target ambiguous)
    update public.group_members gm set left_at = null, joined_at = now(), role = 'member'
    where gm.group_id = v_invite.group_id and gm.user_id = v_user;
    if not found then
      insert into public.group_members (group_id, user_id, role) values (v_invite.group_id, v_user, 'member');
    end if;
    update public.group_invitations set status = 'accepted', resolved_at = now() where id = v_direct.id;
    update public.group_join_requests r set status = 'approved', resolved_at = now()
    where r.group_id = v_invite.group_id and r.user_id = v_user and r.status = 'pending';
    insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, invitation_id)
    values (v_direct.invited_by, 'invitation_accepted', v_invite.group_id, v_name, v_user, public.display_name_of(v_user), v_direct.id);
    return query select 'joined'::text, v_invite.group_id;
    return;
  end if;

  -- Old-style code (issued before the requests existed): joins directly, as before.
  if not v_invite.requires_approval then
    -- (two steps instead of ON CONFLICT: the function's OUT column group_id makes that conflict target ambiguous, which made every
    -- code that does not require approval fail; personal links are exactly such codes)
    update public.group_members gm set left_at = null, joined_at = now(), role = 'member'
    where gm.group_id = v_invite.group_id and gm.user_id = v_user;
    if not found then
      insert into public.group_members (group_id, user_id, role) values (v_invite.group_id, v_user, 'member');
    end if;
    update public.group_invites set uses = uses + 1 where id = v_invite.id;
    return query select 'joined'::text, v_invite.group_id;
    return;
  end if;

  -- A request that is already open is answered again, never duplicated.
  if exists (
    select 1 from public.group_join_requests r
    where r.group_id = v_invite.group_id and r.user_id = v_user and r.status = 'pending' and r.created_at > now() - interval '14 days'
  ) then
    return query select 'pending'::text, v_invite.group_id;
    return;
  end if;
  -- An old pending request (expired) is closed so a new one can be made.
  update public.group_join_requests r
  set status = 'expired', resolved_at = now()
  where r.group_id = v_invite.group_id and r.user_id = v_user and r.status = 'pending';

  if (select count(*) from public.group_join_requests r
      where r.group_id = v_invite.group_id and r.status = 'pending') >= 20 then
    raise exception 'requests_limit' using errcode = '54000';
  end if;
  if (select count(*) from public.group_join_requests r
      where r.group_id = v_invite.group_id and r.user_id = v_user and r.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'requests_throttled' using errcode = '54000';
  end if;

  insert into public.group_join_requests (group_id, user_id, invite_id)
  values (v_invite.group_id, v_user, v_invite.id)
  returning id into v_request;

  v_actor := public.display_name_of(v_user);
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, request_id)
  select m.user_id, 'join_request', v_invite.group_id, v_name, v_user, v_actor, v_request
  from public.group_members m
  where m.group_id = v_invite.group_id and m.role = 'owner' and m.left_at is null;

  return query select 'pending'::text, v_invite.group_id;
end;
$$;

revoke execute on function public.create_personal_group_invite(uuid) from public, anon;
grant execute on function public.create_personal_group_invite(uuid) to authenticated;

commit;
