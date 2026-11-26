-- «Personas de Moni»: una cuenta eliminada (queda en lo compartido como «Ex integrante», ver private.deleted_account_ghosts) no es una
-- persona con la que se pueda compartir nada nuevo. Se la excluye en el servidor, no solo en la pantalla:
--   * get_my_contacts y get_hidden_contacts no la devuelven.
--   * invite_contact y set_contact_pref la rechazan como cualquier otra persona que no es un contacto (not_a_contact).
-- El historial de gastos, pagos y saldos sigue nombrándola «Ex integrante»: no se toca. Si la persona se registra de nuevo es una
-- cuenta nueva (otro id), sin relación con la anterior.
--
-- Aplicar DESPUÉS de 20261212000000, con respaldo previo. Rollback: volver a crear las cuatro funciones desde 20261130000100.

begin;

create or replace function private.is_deleted_account(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.deleted_account_ghosts g where g.ghost_id = p_user);
$$;
revoke all on function private.is_deleted_account(uuid) from public, anon, authenticated;

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
    and not private.is_deleted_account(p.id)
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
    and not private.is_deleted_account(p.id)
  order by lower(coalesce(p.display_name, '')), p.id;
$$;

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
  if p_contact is null or private.is_deleted_account(p_contact) or not public.shares_group_with(v_user, p_contact) then
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

-- Same body as 20261130000100 plus the check of deleted accounts.
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
  if p_user is null or private.is_deleted_account(p_user) or not public.shares_group_with(v_user, p_user) then
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

commit;
