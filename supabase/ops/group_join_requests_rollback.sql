-- Rollback de 20261130000000_group_join_requests.sql (G2).
-- SE BORRAN (únicas filas que se eliminan, ninguna es financiera): las solicitudes de ingreso (group_join_requests) y los avisos
-- join_request / join_approved / join_rejected. Los integrantes ya aprobados SIGUEN en sus grupos (la membresía no se toca).
-- No toca grupos, movimientos, gastos, pagos ni saldos. Los códigos vuelven a entrar directo.
begin;
drop trigger if exists notifications_push_group_notice on public.notifications;
drop function if exists private.push_group_notice();
drop function if exists public.get_my_join_requests();
drop function if exists public.get_join_requests(uuid);
drop function if exists public.cancel_join_request(uuid);
drop function if exists public.reject_join_request(uuid);
drop function if exists public.approve_join_request(uuid);
drop function if exists public.request_join_group(text);

-- create_group_invite: versión del lote B de G1 (administradores, sin requires_approval). join_group: original.
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

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
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
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Throttle code guessing: 10 failed attempts per user per hour. Successful joins do not count.
  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  -- Lock order matches revoke_group_invite (group row first, then invite row), which rules out
  -- deadlocks. The group is resolved from the invite without locking, then locked, then the invite
  -- is locked and re-validated.
  select gi.group_id into v_group from public.group_invites gi where gi.code = v_code;
  if found then
    select g.archived_at into v_archived from public.groups g where g.id = v_group for update;

    -- Row lock makes the uses counter atomic under concurrent joins.
    select * into v_invite from public.group_invites gi where gi.code = v_code for update;
    if found then
      -- Idempotent for current members: no use is consumed.
      if exists (
        select 1 from public.group_members m
        where m.group_id = v_invite.group_id and m.user_id = v_user and m.left_at is null
      ) then
        return v_invite.group_id;
      end if;

      v_valid := v_archived is null
        and v_invite.group_id = v_group
        and v_invite.revoked_at is null
        and v_invite.expires_at > now()
        and v_invite.uses < v_invite.max_uses;
    end if;
  end if;

  if not v_valid then
    -- Unknown, expired, revoked, exhausted and archived-group codes are indistinguishable. A failed
    -- attempt is recorded and the function RETURNS NULL (an exception would roll the record back);
    -- the client turns NULL into the uniform 'invite_invalid' error.
    delete from public.group_join_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.group_join_attempts (user_id) values (v_user);
    return null;
  end if;

  -- First join, or re-join after leaving (restores the membership row).
  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_user, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;


delete from public.notifications where kind in ('join_request', 'join_approved', 'join_rejected');
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop column request_id;
alter table public.notifications alter column amount set not null;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected'));
alter table public.notifications add constraint notifications_amount_check check (amount > 0);
drop table public.group_join_requests;
alter table public.group_invites drop column requires_approval;
commit;
