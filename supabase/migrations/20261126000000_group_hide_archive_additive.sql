-- G1 · Lote A (ADITIVO, compatible con la versión publicada): ocultar grupos, archivar para todos y administradores.
--
-- Solo AGREGA objetos que la app publicada no usa y no cambia ninguna función de la que depende:
--   * columna group_members.hidden_at (nullable, sin valor por defecto: solo metadatos).
--   * funciones nuevas: is_group_owner, group_open_balance_count (interna), hide_group_for_me, restore_group_for_me,
--     archive_group_for_all, set_member_role, get_my_hidden_and_archived_groups.
--   * get_my_groups se recrea con UNA columna más al final (hidden_at) y las mismas filas de siempre (también devuelve los
--     grupos ocultos, así que deudas, totales y recordatorios no cambian). La app publicada lee cada campo por nombre: ignora la
--     columna nueva. Se borra y se crea dentro de la misma transacción (nadie ve un hueco) y conserva los permisos actuales.
--
-- Ocultar NO quita obligaciones. Archivar (archive_group_for_all) nunca borra filas y se rechaza con deudas o pagos sin resolver.
-- Administradores = rol `owner` ya existente; se permiten varios y siempre queda al menos uno (set_member_role).
--
-- NO incluye (van en el lote B, junto con el front nuevo): leave_group con «último administrador», códigos solo para administradores,
-- Casa→Hogar. Rollback: supabase/ops/group_hide_archive_additive_rollback.sql

begin;

alter table public.group_members add column hidden_at timestamptz;

comment on column public.group_members.hidden_at is
  'El integrante quitó el grupo de SU cuenta (sigue siendo integrante). No afecta a nadie más.';

-- Helpers ------------------------------------------------------------------------------------------------------

create or replace function public.is_group_owner(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.left_at is null
  );
$$;

-- How many people (members and guests without account) still owe or are owed in the group, both ledgers together.
-- Internal: only the functions below call it.
create or replace function public.group_open_balance_count(p_group uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select r.user_id as person, r.net as amount
    from public.group_balance_rows(p_group) r
    union all
    select p.person_id, case p.role when 'payer' then p.amount else -p.amount end
    from public.group_guest_expense_parts p
    join public.group_guest_expenses e on e.id = p.expense_id
    where e.group_id = p_group and e.status = 'posted'
    union all
    select s.from_person, s.amount
    from public.group_guest_settlements s
    where s.group_id = p_group and s.status = 'posted'
    union all
    select s.to_person, -s.amount
    from public.group_guest_settlements s
    where s.group_id = p_group and s.status = 'posted'
  )
  select count(*)::int
  from (
    select l.person from lines l group by l.person having round(sum(l.amount), 2) <> 0
  ) t;
$$;

revoke execute on function public.group_open_balance_count(uuid) from public, anon, authenticated;
revoke execute on function public.is_group_owner(uuid) from public, anon;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- Lists ----------------------------------------------------------------------------------------------------------

-- Same rows and columns as before PLUS one at the end (hidden_at). IT DOES NOT SKIP THE GROUPS I HID: hiding changes only how
-- the main list looks, never my obligations. Debts, totals, movement names, reminders and the assistant keep seeing them.
-- The list screen is the one that filters by hidden_at. (The return type changes, so the function is dropped and recreated;
-- it had no explicit grants, so it keeps the default ones.)
drop function public.get_my_groups();
create function public.get_my_groups()
returns table (
  id uuid, name text, kind text, role text, member_count int, my_net numeric, last_activity timestamptz,
  hidden_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.kind, m.role,
         (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null)::int,
         coalesce((select r.net from public.group_balance_rows(g.id) r where r.user_id = (select auth.uid())), 0),
         greatest(
           g.created_at,
           coalesce((select max(e.created_at) from public.shared_expenses e where e.group_id = g.id), g.created_at),
           coalesce((select max(s.created_at) from public.settlements s where s.group_id = g.id), g.created_at)
         ) as last_activity,
         m.hidden_at
  from public.groups g
  join public.group_members m
    on m.group_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null
  where g.archived_at is null
  order by last_activity desc, g.id;
$$;

-- The groups I hid or that were archived (still mine to read: the history is kept).
create or replace function public.get_my_hidden_and_archived_groups()
returns table (
  id uuid, name text, kind text, role text, member_count int, my_net numeric, last_activity timestamptz,
  hidden_at timestamptz, archived_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.kind, m.role,
         (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null)::int,
         coalesce((select r.net from public.group_balance_rows(g.id) r where r.user_id = (select auth.uid())), 0),
         greatest(
           g.created_at,
           coalesce((select max(e.created_at) from public.shared_expenses e where e.group_id = g.id), g.created_at),
           coalesce((select max(s.created_at) from public.settlements s where s.group_id = g.id), g.created_at)
         ) as last_activity,
         m.hidden_at, g.archived_at
  from public.groups g
  join public.group_members m
    on m.group_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null
  where g.archived_at is not null or m.hidden_at is not null
  order by last_activity desc, g.id;
$$;

-- Hide / restore (only MY membership row) -------------------------------------------------------------------------

create or replace function public.hide_group_for_me(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.group_members
  set hidden_at = coalesce(hidden_at, now())
  where group_id = p_group and user_id = v_user and left_at is null;
  if not found then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.restore_group_for_me(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.group_members
  set hidden_at = null
  where group_id = p_group and user_id = v_user and left_at is null;
  if not found then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
end;
$$;

-- Archive for everybody (administrators only; never deletes) ------------------------------------------------------

create or replace function public.archive_group_for_all(p_group uuid, p_name_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  -- Locks the group (serializes with balance-changing writes) and requires an active membership.
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '55000';
  end if;
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;

  select g.name into v_name from public.groups g where g.id = p_group;
  if lower(btrim(coalesce(p_name_confirmation, ''))) <> lower(btrim(v_name)) then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;

  if public.group_open_balance_count(p_group) > 0 then
    raise exception 'group_has_open_balances' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.payment_reports r where r.group_id = p_group and r.status = 'reported'
  ) then
    raise exception 'open_payment_reports' using errcode = '23514';
  end if;

  update public.groups set archived_at = now() where id = p_group;
  update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
end;
$$;

-- Administrators ------------------------------------------------------------------------------------------------

create or replace function public.set_member_role(p_group uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_role is null or p_role not in ('owner', 'member') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '55000';
  end if;
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = p_user and m.left_at is null
  ) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;

  update public.group_members set role = p_role where group_id = p_group and user_id = p_user;

  -- Always at least one administrator.
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.role = 'owner' and m.left_at is null
  ) then
    raise exception 'last_admin' using errcode = '23514';
  end if;
end;
$$;


revoke execute on function public.get_my_groups() from public, anon;
grant execute on function public.get_my_groups() to authenticated;

-- Grants: authenticated callers only ------------------------------------------------------------------------------
revoke execute on function
  public.get_my_hidden_and_archived_groups(), public.hide_group_for_me(uuid), public.restore_group_for_me(uuid),
  public.archive_group_for_all(uuid, text), public.set_member_role(uuid, uuid, text)
  from public, anon;
grant execute on function
  public.get_my_hidden_and_archived_groups(), public.hide_group_for_me(uuid), public.restore_group_for_me(uuid),
  public.archive_group_for_all(uuid, text), public.set_member_role(uuid, uuid, text)
  to authenticated;

commit;
