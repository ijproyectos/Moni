-- G2 · Grupos: solicitudes de ingreso con aprobación de un administrador.
--
-- Qué cambia
--   * Los códigos NUEVOS exigen aprobación (group_invites.requires_approval = true: lo fija create_group_invite). Los códigos ya
--     emitidos siguen entrando directo por ahora (la columna vale false para las filas existentes); los administradores pueden
--     verlos y revocarlos (lote B de G1).
--   * Con un código que exige aprobación, entrar NO da acceso: se crea una solicitud pendiente (group_join_requests) y los
--     administradores reciben un aviso. Solo al aprobar se crea la membresía. Antes de aprobar, la persona no es integrante, así que
--     las políticas de seguridad (is_group_member) no le dejan ver gastos, saldos ni integrantes del grupo.
--   * request_join_group(code) es la entrada nueva (devuelve 'joined' | 'pending' | 'already_member' | 'invalid').
--     join_group(code) se mantiene para apps viejas: con un código que exige aprobación NO deja entrar (devuelve null).
--   * approve_join_request / reject_join_request: solo administradores. cancel_join_request: solo quien la hizo.
--   * get_join_requests(group): solo administradores (con nombre y foto de quien pide). get_my_join_requests(): las mías.
--   * Avisos: notifications admite join_request / join_approved / join_rejected (sin monto) y los envía como push.
--
-- Límites: una solicitud pendiente por persona y grupo; máximo 20 pendientes por grupo; máximo 3 solicitudes por persona y grupo en
-- 24 h; las pendientes vencen a los 14 días (no se pueden aprobar). El contador de uso del código sube al APROBAR.
--
-- Requiere G1 (lotes A y B). Aditiva salvo: create_group_invite y join_group (reemplazadas) y notifications (amount admite null solo
-- para los avisos nuevos). IMPORTANTE: aplicar junto con la publicación del front nuevo (la app anterior no sabe mostrar los avisos
-- nuevos). Rollback: supabase/ops/group_join_requests_rollback.sql

begin;

-- 1. Codes that require approval ------------------------------------------------------------------------------------
alter table public.group_invites add column requires_approval boolean not null default false;

-- 2. Requests -----------------------------------------------------------------------------------------------------------
create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  user_id uuid not null references auth.users (id) on delete no action,
  invite_id uuid references public.group_invites (id) on delete no action,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete no action,
  check ((status = 'pending') = (resolved_at is null))
);

-- One open request per person and group: asking twice never creates two.
create unique index group_join_requests_one_pending
  on public.group_join_requests (group_id, user_id) where status = 'pending';
create index group_join_requests_group_idx on public.group_join_requests (group_id, status, created_at desc);
create index group_join_requests_user_idx on public.group_join_requests (user_id, created_at desc);

alter table public.group_join_requests enable row level security;
revoke all on table public.group_join_requests from anon, authenticated;
grant select on table public.group_join_requests to authenticated;
-- The person who asked sees their own request; administrators see the requests of their groups. Nobody writes directly.
create policy "group_join_requests_select_requester_or_admin" on public.group_join_requests
for select to authenticated
using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

-- 3. Notices without an amount -----------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications alter column amount drop not null;
alter table public.notifications add column request_id uuid references public.group_join_requests (id) on delete no action;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected'));
-- Debt notices keep requiring a positive amount; the group notices carry none.
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected') and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected') and amount is not null and amount > 0));

-- 4. Codes: new ones require approval; the old entry point never lets an approval code in -------------------------
-- Same body as 20261126000100_group_admin_enforcement.sql plus requires_approval = true.
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
      insert into public.group_invites (group_id, code, created_by, requires_approval)
      values (p_group, v_code, v_user, true);
      return v_code;
    exception when unique_violation then
      null; -- extremely unlikely collision: draw another code
    end;
  end loop;

  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

-- Same body as 20261105000000_shorter_invite_codes.sql; a code that requires approval is treated as not valid HERE (apps that
-- predate the requests cannot create one, so nobody gets in without approval through this old door).
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

  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  select gi.group_id into v_group from public.group_invites gi where gi.code = v_code;
  if found then
    select g.archived_at into v_archived from public.groups g where g.id = v_group for update;

    select * into v_invite from public.group_invites gi where gi.code = v_code for update;
    if found then
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
        and v_invite.uses < v_invite.max_uses
        and not v_invite.requires_approval;
    end if;
  end if;

  if not v_valid then
    delete from public.group_join_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.group_join_attempts (user_id) values (v_user);
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_user, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

-- 5. New entry point ------------------------------------------------------------------------------------------------------
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

  -- Old-style code (issued before the requests existed): joins directly, as before.
  if not v_invite.requires_approval then
    insert into public.group_members (group_id, user_id, role)
    values (v_invite.group_id, v_user, 'member')
    on conflict (group_id, user_id) do update
      set left_at = null, joined_at = now(), role = 'member';
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

-- Administrators answer ----------------------------------------------------------------------------------------------
create or replace function public.approve_join_request(p_request uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_req public.group_join_requests%rowtype;
  v_name text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select r.* into v_req from public.group_join_requests r where r.id = p_request;
  if not found or not public.is_group_member(v_req.group_id) then
    -- Does not reveal whether the request exists to people who are not in the group.
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  perform public.lock_group_for_write(v_req.group_id);
  if not public.is_group_owner(v_req.group_id) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  select r.* into v_req from public.group_join_requests r where r.id = p_request for update;
  if v_req.status <> 'pending' then
    raise exception 'request_resolved' using errcode = '23514';
  end if;
  if v_req.created_at < now() - interval '14 days' then
    update public.group_join_requests set status = 'expired', resolved_at = now() where id = p_request;
    return null;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_req.group_id, v_req.user_id, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';
  if v_req.invite_id is not null then
    update public.group_invites set uses = least(uses + 1, max_uses) where id = v_req.invite_id;
  end if;
  update public.group_join_requests
  set status = 'approved', resolved_at = now(), resolved_by = v_user
  where id = p_request;

  select g.name into v_name from public.groups g where g.id = v_req.group_id;
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, request_id)
  values (v_req.user_id, 'join_approved', v_req.group_id, v_name, v_user, public.display_name_of(v_user), p_request);

  return v_req.group_id;
end;
$$;

create or replace function public.reject_join_request(p_request uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_req public.group_join_requests%rowtype;
  v_name text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select r.* into v_req from public.group_join_requests r where r.id = p_request;
  if not found or not public.is_group_member(v_req.group_id) then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_req.group_id);
  if not public.is_group_owner(v_req.group_id) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  select r.* into v_req from public.group_join_requests r where r.id = p_request for update;
  if v_req.status <> 'pending' then
    raise exception 'request_resolved' using errcode = '23514';
  end if;

  update public.group_join_requests
  set status = 'rejected', resolved_at = now(), resolved_by = v_user
  where id = p_request;

  select g.name into v_name from public.groups g where g.id = v_req.group_id;
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, request_id)
  values (v_req.user_id, 'join_rejected', v_req.group_id, v_name, v_user, public.display_name_of(v_user), p_request);
end;
$$;

-- The person who asked can withdraw it.
create or replace function public.cancel_join_request(p_request uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.group_join_requests
  set status = 'cancelled', resolved_at = now(), resolved_by = v_user
  where id = p_request and user_id = v_user and status = 'pending';
  if not found then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Lists ---------------------------------------------------------------------------------------------------------------------
create or replace function public.get_join_requests(p_group uuid)
returns table (request_id uuid, user_id uuid, display_name text, avatar_url text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  return query
  select r.id, r.user_id, p.display_name, p.avatar_url, r.created_at
  from public.group_join_requests r
  left join public.profiles p on p.id = r.user_id
  where r.group_id = p_group and r.status = 'pending' and r.created_at > now() - interval '14 days'
  order by r.created_at, r.id;
end;
$$;

create or replace function public.get_my_join_requests()
returns table (request_id uuid, group_id uuid, group_name text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.group_id, g.name, r.status, r.created_at
  from public.group_join_requests r
  join public.groups g on g.id = r.group_id
  where r.user_id = (select auth.uid())
    and ((r.status = 'pending' and r.created_at > now() - interval '14 days')
         or (r.status = 'rejected' and r.resolved_at > now() - interval '7 days'))
  order by r.created_at desc;
$$;

-- 6. Push for the group notices (same bridge as the debt reminders; a failure never blocks the action) ------------
create or replace function private.push_group_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group text := left(regexp_replace(new.group_name, '[[:cntrl:]]', '', 'g'), 40);
  v_actor text := left(regexp_replace(new.actor_name, '[[:cntrl:]]', '', 'g'), 40);
  v_title text;
  v_body text;
begin
  if new.kind = 'join_request' then
    v_title := '🐱 Solicitud para entrar';
    v_body := v_actor || ' quiere entrar a ' || v_group;
  elsif new.kind = 'join_approved' then
    v_title := '🐱 ¡Te aceptaron!';
    v_body := 'Ya sos parte de ' || v_group;
  else
    v_title := '🐱 Solicitud de ingreso';
    v_body := 'Tu solicitud para entrar a ' || v_group || ' no fue aceptada';
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder',
        'title', v_title,
        'body', v_body,
        'audience', 'user',
        'user_id', new.user_id,
        'url', '/grupos/avisos'
      ),
      'group_notice_push_enabled'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function private.push_group_notice() from public, anon, authenticated;

drop trigger if exists notifications_push_group_notice on public.notifications;
create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected'))
execute function private.push_group_notice();

-- Grants -------------------------------------------------------------------------------------------------------------------
revoke execute on function
  public.request_join_group(text), public.approve_join_request(uuid), public.reject_join_request(uuid),
  public.cancel_join_request(uuid), public.get_join_requests(uuid), public.get_my_join_requests()
  from public, anon;
grant execute on function
  public.request_join_group(text), public.approve_join_request(uuid), public.reject_join_request(uuid),
  public.cancel_join_request(uuid), public.get_join_requests(uuid), public.get_my_join_requests()
  to authenticated;

commit;
