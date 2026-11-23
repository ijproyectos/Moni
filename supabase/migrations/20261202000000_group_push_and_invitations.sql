-- Grupos y Viajes (correcciones):
--   1. request_join_group: si la persona YA tiene una invitación directa pendiente a ese grupo (la envió un integrante y está dirigida a
--      su cuenta), entrar con el código del grupo la acepta y la deja adentro de inmediato: no queda como «Solicitud enviada».
--      El ingreso con código SIN invitación previa sigue pidiendo aprobación, igual que antes. Misma validación de código, de archivado
--      y de límites; la invitación solo sirve para su destinatario (invited_user = quien llama).
--   2. Push de grupos simples: título «Moni» (sin el gato) y el texto correspondiente. Se suma el aviso de grupo eliminado
--      ('group_archived', creado en 20261201000000) a los push de grupos. Los demás push (otros módulos) no se tocan.
--   3. trips.icon: ícono de destino elegido por la persona (nullable: sin valor, la app lo deduce del destino).
--
-- Aplicar DESPUÉS de 20261201000000_group_archived_notice.sql, con respaldo previo. NO aplicada en producción.
-- Rollback: volver a crear private.push_debt_reminder / push_payment_notice / push_group_notice y request_join_group desde
--   20261130000200 / 20261130000300 / 20261130000000, y: alter table public.trips drop column icon;

begin;

-- 1. Direct invitation + group code ------------------------------------------------------------------------------------
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


-- 2. Push without the cat ----------------------------------------------------------------------------------------------
create or replace function private.push_debt_reminder()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pref record;
  v_body text;
begin
  select coalesce(p.debt_reminders, true) as on_, coalesce(p.hide_details, false) as hide
  into v_pref
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;
  if not v_pref.on_ then
    return new;
  end if;
  if v_pref.hide then
    v_body := 'Tenés un recordatorio de pago';
  else
    v_body := private.clean_push_text(new.actor_name) || ' te recordó que tenés un pago pendiente de '
              || private.push_amount(new.amount);
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', 'Moni', 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', '/grupos/avisos?aviso=' || new.id::text
      ),
      'debt_reminder_push_enabled'
    );
  exception when others then
    null; -- the in-app notice is already saved; a push failure never blocks the reminder
  end;
  return new;
end;
$$;

create or replace function private.push_payment_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pref record;
  v_actor text := private.clean_push_text(new.actor_name);
  v_amount text := private.push_amount(new.amount);
  v_body text;
begin
  select coalesce(p.payments_reported, true) as reported, coalesce(p.payments_answered, true) as answered,
         coalesce(p.hide_details, false) as hide
  into v_pref
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;

  if new.kind = 'payment_reported' then
    if not v_pref.reported then return new; end if;
    v_body := case when v_pref.hide then 'Tenés un pago pendiente de confirmar'
                   else v_actor || ' indicó que te pagó ' || v_amount || '. ¿Recibiste el dinero?' end;
  else
    if not v_pref.answered then return new; end if;
    v_body := case when v_pref.hide then 'Tenés novedades de un pago'
                   when new.kind = 'payment_confirmed' then v_actor || ' confirmó tu pago de ' || v_amount
                   else v_actor || ' todavía no confirmó tu pago de ' || v_amount end;
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', 'Moni', 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', '/grupos/avisos?aviso=' || new.id::text
      ),
      'payment_notice_push_enabled'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

create or replace function private.push_group_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hide boolean;
  v_group text := private.clean_push_text(new.group_name);
  v_actor text := private.clean_push_text(new.actor_name);
  v_body text;
begin
  select coalesce(p.hide_details, false) into v_hide
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;
  if v_hide then
    v_body := case when new.kind = 'recurring_due' then 'Tenés un gasto recurrente para registrar' else 'Tenés un aviso de grupo' end;
  elsif new.kind = 'recurring_due' then
    v_body := 'Tenés un gasto recurrente para registrar: ' || private.clean_push_text(new.subject) || ' (' || v_group || ')';
  elsif new.kind = 'join_request' then
    v_body := v_actor || ' quiere entrar a ' || v_group;
  elsif new.kind = 'join_approved' then
    v_body := 'Ya sos parte de ' || v_group;
  elsif new.kind = 'group_invitation' then
    v_body := v_actor || ' te invitó a ' || v_group;
  elsif new.kind = 'invitation_accepted' then
    v_body := v_actor || ' aceptó entrar a ' || v_group;
  elsif new.kind = 'group_archived' then
    v_body := v_actor || ' eliminó el grupo ' || v_group || ' para todos';
  else
    v_body := 'Tu solicitud para entrar a ' || v_group || ' no fue aceptada';
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', 'Moni', 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', case when new.kind = 'recurring_due' then '/grupos/' || new.group_id::text || '/recurrentes'
                    else '/grupos/avisos?aviso=' || new.id::text end
      ),
      'group_notice_push_enabled'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists notifications_push_group_notice on public.notifications;
create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived'))
execute function private.push_group_notice();

-- 3. Trip icon chosen by the person ------------------------------------------------------------------------------------
alter table public.trips
  add column icon text check (icon is null or icon in ('beach', 'palm', 'sea', 'sun', 'mountain', 'snow', 'city', 'landmark', 'nature', 'eiffel', 'plane'));
grant insert (icon) on table public.trips to authenticated;
grant update (icon) on table public.trips to authenticated;

commit;
