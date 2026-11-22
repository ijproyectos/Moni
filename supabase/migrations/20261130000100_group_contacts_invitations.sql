-- G3 · Grupos: «Personas de Moni» (contactos frecuentes) e invitaciones directas que la otra persona debe aceptar.
--
-- Qué hace
--   * Contactos = personas REALES (con cuenta) con las que compartí (o comparto) un grupo. get_my_contacts() devuelve solo nombre y
--     foto: nunca qué grupos compartimos ni datos financieros. No hay búsqueda de usuarios en general: solo entre mis contactos.
--   * Ocultar un contacto lo saca de mi lista. Bloquearlo además impide que esa persona me invite desde ahora (y deja de aparecer
--     en su lista de contactos para ese fin). Nada de esto cambia grupos, deudas ni saldos existentes.
--   * Invitación directa (group_invitations): solo un administrador del grupo la envía, solo a un contacto suyo; la persona recibe
--     un aviso (push + Avisos + lista de Grupos) y ELIGE aceptar o rechazar. Nadie entra a un grupo sin aceptar: no existe el
--     agregado directo (queda para una etapa posterior, con consentimiento previo de ambas partes).
--   * Sin duplicados: una invitación pendiente por persona y grupo; máximo 20 pendientes por grupo; máximo 3 invitaciones a la misma
--     persona y grupo en 24 h; vencen a los 14 días.
--
-- Seguridad: las tablas nuevas tienen RLS y solo lectura propia; toda escritura es por funciones security definer que validan en el
-- servidor el rol (administrador), la relación de contacto, los bloqueos y el estado. Mensajes uniformes: no se revela si alguien
-- bloqueó a otra persona.
--
-- Requiere G1 (lotes A y B) y G2. Aplicar junto con la publicación del front nuevo.
-- Rollback: supabase/ops/group_contacts_invitations_rollback.sql

begin;

-- Relationship helper (internal) -------------------------------------------------------------------------------------------
-- True when both people are, or ever were, members of the same group.
create or replace function public.shares_group_with(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_a <> p_b and exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id and b.user_id = p_b
    where a.user_id = p_a
  );
$$;
revoke execute on function public.shares_group_with(uuid, uuid) from public, anon, authenticated;

-- Contact preferences ---------------------------------------------------------------------------------------------------------
create table public.contact_prefs (
  owner_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references auth.users (id) on delete cascade,
  hidden boolean not null default false,
  blocked boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, contact_id),
  check (owner_id <> contact_id),
  check (hidden or blocked)
);

alter table public.contact_prefs enable row level security;
revoke all on table public.contact_prefs from anon, authenticated;
grant select on table public.contact_prefs to authenticated;
create policy "contact_prefs_select_own" on public.contact_prefs
for select to authenticated using (owner_id = (select auth.uid()));

-- Invitations -----------------------------------------------------------------------------------------------------------------
create table public.group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  invited_user uuid not null references auth.users (id) on delete no action,
  invited_by uuid not null references auth.users (id) on delete no action,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (invited_user <> invited_by),
  check ((status = 'pending') = (resolved_at is null))
);

create unique index group_invitations_one_pending
  on public.group_invitations (group_id, invited_user) where status = 'pending';
create index group_invitations_group_idx on public.group_invitations (group_id, status, created_at desc);
create index group_invitations_user_idx on public.group_invitations (invited_user, status, created_at desc);

alter table public.group_invitations enable row level security;
revoke all on table public.group_invitations from anon, authenticated;
grant select on table public.group_invitations to authenticated;
create policy "group_invitations_select_invited_or_admin" on public.group_invitations
for select to authenticated
using (invited_user = (select auth.uid()) or public.is_group_owner(group_id));

-- Notices -----------------------------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications add column invitation_id uuid references public.group_invitations (id) on delete no action;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted') and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted')
      and amount is not null and amount > 0));

-- Contacts --------------------------------------------------------------------------------------------------------------------------
-- Real people I share (or shared) a group with, minus the ones I hid or blocked and the ones who blocked me. Name and photo only.
create or replace function public.get_my_contacts()
returns table (user_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url
  from public.profiles p
  where p.id <> (select auth.uid())
    and public.shares_group_with((select auth.uid()), p.id)
    and not exists (
      select 1 from public.contact_prefs c
      where c.owner_id = (select auth.uid()) and c.contact_id = p.id
    )
    and not exists (
      select 1 from public.contact_prefs c
      where c.owner_id = p.id and c.contact_id = (select auth.uid()) and c.blocked
    )
  order by lower(coalesce(p.display_name, '')), p.id;
$$;

-- The ones I hid or blocked, to be able to show or unblock them again.
create or replace function public.get_hidden_contacts()
returns table (user_id uuid, display_name text, avatar_url text, hidden boolean, blocked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url, c.hidden, c.blocked
  from public.contact_prefs c
  join public.profiles p on p.id = c.contact_id
  where c.owner_id = (select auth.uid())
  order by lower(coalesce(p.display_name, '')), p.id;
$$;

-- Only for people who really are my contacts: it cannot be used to probe arbitrary ids.
create or replace function public.set_contact_pref(p_contact uuid, p_hidden boolean, p_blocked boolean)
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
  if p_contact is null or not public.shares_group_with(v_user, p_contact) then
    raise exception 'not_a_contact' using errcode = 'P0002';
  end if;
  if not coalesce(p_hidden, false) and not coalesce(p_blocked, false) then
    delete from public.contact_prefs where owner_id = v_user and contact_id = p_contact;
  else
    insert into public.contact_prefs (owner_id, contact_id, hidden, blocked)
    values (v_user, p_contact, coalesce(p_hidden, false) or coalesce(p_blocked, false), coalesce(p_blocked, false))
    on conflict (owner_id, contact_id) do update
      set hidden = excluded.hidden, blocked = excluded.blocked, updated_at = now();
  end if;
end;
$$;

-- Invitations ------------------------------------------------------------------------------------------------------------------------
create or replace function public.invite_contact(p_group uuid, p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
  v_existing uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.lock_group_for_write(p_group);
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  -- Only my contacts can be invited from here (no probing of arbitrary users).
  if p_user is null or not public.shares_group_with(v_user, p_user) then
    raise exception 'not_a_contact' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.contact_prefs c where c.owner_id = v_user and c.contact_id = p_user and c.blocked) then
    raise exception 'contact_blocked' using errcode = '23514';
  end if;
  -- If that person blocked me the answer is the same as for anybody who cannot be invited: nothing is revealed.
  if exists (select 1 from public.contact_prefs c where c.owner_id = p_user and c.contact_id = v_user and c.blocked) then
    raise exception 'invitation_unavailable' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_user and m.left_at is null
  ) then
    raise exception 'already_member' using errcode = '23514';
  end if;

  -- An invitation that is already open is returned, never duplicated (an old one is closed first).
  update public.group_invitations
  set status = 'expired', resolved_at = now()
  where group_id = p_group and invited_user = p_user and status = 'pending' and created_at <= now() - interval '14 days';
  select i.id into v_existing from public.group_invitations i
  where i.group_id = p_group and i.invited_user = p_user and i.status = 'pending';
  if v_existing is not null then
    return v_existing;
  end if;

  if (select count(*) from public.group_invitations i where i.group_id = p_group and i.status = 'pending') >= 20 then
    raise exception 'invitations_limit' using errcode = '54000';
  end if;
  if (select count(*) from public.group_invitations i
      where i.group_id = p_group and i.invited_user = p_user and i.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'invitations_throttled' using errcode = '54000';
  end if;

  insert into public.group_invitations (group_id, invited_user, invited_by)
  values (p_group, p_user, v_user)
  returning id into v_id;

  select g.name into v_name from public.groups g where g.id = p_group;
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, invitation_id)
  values (p_user, 'group_invitation', p_group, v_name, v_user, public.display_name_of(v_user), v_id);

  return v_id;
end;
$$;

-- Only the invited person answers. Accepting is the only way in: it creates the membership.
create or replace function public.respond_group_invitation(p_invitation uuid, p_accept boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_inv public.group_invitations%rowtype;
  v_name text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select i.* into v_inv from public.group_invitations i where i.id = p_invitation and i.invited_user = v_user;
  if not found then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;

  -- Serializes with the other writes of the group (the invited person is not a member yet).
  perform 1 from public.groups g where g.id = v_inv.group_id for update;
  select i.* into v_inv from public.group_invitations i where i.id = p_invitation for update;
  if v_inv.status <> 'pending' then
    raise exception 'invitation_resolved' using errcode = '23514';
  end if;
  if v_inv.created_at <= now() - interval '14 days' then
    update public.group_invitations set status = 'expired', resolved_at = now() where id = p_invitation;
    return null;
  end if;

  if not coalesce(p_accept, false) then
    update public.group_invitations set status = 'declined', resolved_at = now() where id = p_invitation;
    return null;
  end if;

  if exists (select 1 from public.groups g where g.id = v_inv.group_id and g.archived_at is not null) then
    raise exception 'group_archived' using errcode = '55000';
  end if;
  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, v_user, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';
  update public.group_invitations set status = 'accepted', resolved_at = now() where id = p_invitation;

  select g.name into v_name from public.groups g where g.id = v_inv.group_id;
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, invitation_id)
  values (v_inv.invited_by, 'invitation_accepted', v_inv.group_id, v_name, v_user, public.display_name_of(v_user), p_invitation);
  return v_inv.group_id;
end;
$$;

-- An administrator withdraws an invitation that is still open.
create or replace function public.cancel_group_invitation(p_invitation uuid)
returns void
language plpgsql
volatile
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
  select i.group_id into v_group from public.group_invitations i where i.id = p_invitation;
  if not found or not public.is_group_member(v_group) then
    raise exception 'invitation_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_as_member(v_group);
  if not public.is_group_owner(v_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  update public.group_invitations
  set status = 'cancelled', resolved_at = now()
  where id = p_invitation and status = 'pending';
  if not found then
    raise exception 'invitation_resolved' using errcode = '23514';
  end if;
end;
$$;

-- Lists ------------------------------------------------------------------------------------------------------------------------------
-- What an administrator sees: who was invited and how it stands (pending, or answered in the last 7 days).
create or replace function public.get_group_invitations(p_group uuid)
returns table (invitation_id uuid, user_id uuid, display_name text, avatar_url text, status text, created_at timestamptz)
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
  select i.id, i.invited_user, p.display_name, p.avatar_url,
         case when i.status = 'pending' and i.created_at <= now() - interval '14 days' then 'expired' else i.status end,
         i.created_at
  from public.group_invitations i
  left join public.profiles p on p.id = i.invited_user
  where i.group_id = p_group
    and ((i.status = 'pending' and i.created_at > now() - interval '14 days')
         or (i.status in ('accepted', 'declined') and i.resolved_at > now() - interval '7 days'))
  order by i.created_at desc, i.id;
end;
$$;

-- The invitations I received and have not answered: group name and who invited me, nothing else.
create or replace function public.get_my_group_invitations()
returns table (invitation_id uuid, group_id uuid, group_name text, invited_by_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.group_id, g.name, public.display_name_of(i.invited_by), i.created_at
  from public.group_invitations i
  join public.groups g on g.id = i.group_id
  where i.invited_user = (select auth.uid())
    and i.status = 'pending'
    and i.created_at > now() - interval '14 days'
    and g.archived_at is null
  order by i.created_at desc;
$$;

-- Push for the new notices (same bridge as the join requests) ------------------------------------------------------------------
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
  elsif new.kind = 'group_invitation' then
    v_title := '🐱 Te invitaron a un grupo';
    v_body := v_actor || ' te invitó a ' || v_group;
  elsif new.kind = 'invitation_accepted' then
    v_title := '🐱 Invitación aceptada';
    v_body := v_actor || ' aceptó entrar a ' || v_group;
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

drop trigger if exists notifications_push_group_notice on public.notifications;
create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted'))
execute function private.push_group_notice();

-- Grants ----------------------------------------------------------------------------------------------------------------------------
revoke execute on function
  public.get_my_contacts(), public.get_hidden_contacts(), public.set_contact_pref(uuid, boolean, boolean),
  public.invite_contact(uuid, uuid), public.respond_group_invitation(uuid, boolean), public.cancel_group_invitation(uuid),
  public.get_group_invitations(uuid), public.get_my_group_invitations()
  from public, anon;
grant execute on function
  public.get_my_contacts(), public.get_hidden_contacts(), public.set_contact_pref(uuid, boolean, boolean),
  public.invite_contact(uuid, uuid), public.respond_group_invitation(uuid, boolean), public.cancel_group_invitation(uuid),
  public.get_group_invitations(uuid), public.get_my_group_invitations()
  to authenticated;

commit;
