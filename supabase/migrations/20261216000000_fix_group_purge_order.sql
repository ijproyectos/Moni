-- Corrige el orden de borrado de un grupo: las solicitudes de ingreso (group_join_requests) apuntan al código (group_invites) que usaron, así
-- que se borran ANTES que los códigos. Con el orden anterior, eliminar definitivamente un grupo que tuvo una solicitud de ingreso fallaba con
-- una violación de clave foránea (el error genérico «Algo salió mal»). Mismo defecto en el borrado de grupos vacíos al eliminar una cuenta
-- (private.delete_account_data). Además, las reservas de viaje del grupo (trip_bookings) también se borran junto con el grupo, y un grupo
-- cuyas reservas tienen pagos míos no se borra: la persona sale de él (como con cualquier registro que hay que conservar).
--
-- Mismos cuerpos que 20261212000000 y 20261210000000 con ese único cambio de orden (más las reservas). No toca datos.
-- Aplicar con respaldo previo. Rollback: volver a crear las dos funciones desde esas migraciones.

begin;

create or replace function public.purge_group_for_me(p_group uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_archived timestamptz;
  v_hidden timestamptz;
  v_creator uuid;
  v_photo text;
  v_net numeric;
  v_next uuid;
begin
  -- Locks the group and requires an active membership (works for archived groups too).
  v_archived := public.lock_group_as_member(p_group);

  select m.hidden_at into v_hidden
  from public.group_members m
  where m.group_id = p_group and m.user_id = v_user and m.left_at is null;
  if v_archived is null and v_hidden is null then
    raise exception 'group_not_removed' using errcode = '23514';
  end if;

  select r.net into v_net from public.group_balance_rows(p_group) r where r.user_id = v_user;
  if coalesce(v_net, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.payment_reports r where r.group_id = p_group and r.status = 'reported'
  ) then
    raise exception 'open_payment_reports' using errcode = '23514';
  end if;

  -- Only mine: nobody else was ever a member, no guest still owes or is owed, and none of my movements points at its records.
  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.user_id <> v_user)
     and public.group_open_balance_count(p_group) = 0
     and not exists (
       select 1 from public.transactions t
       where t.shared_expense_id in (select e.id from public.shared_expenses e where e.group_id = p_group)
          or t.settlement_id in (select s.id from public.settlements s where s.group_id = p_group)
          or t.payment_report_id in (select r.id from public.payment_reports r where r.group_id = p_group)
          or t.guest_settlement_id in (select s.id from public.group_guest_settlements s where s.group_id = p_group)
          or t.booking_id in (select b.id from public.trip_bookings b where b.group_id = p_group)
     )
     and not exists (
       select 1 from public.trip_side_expenses s
       where s.booking_id in (select b.id from public.trip_bookings b where b.group_id = p_group)
     ) then
    select g.created_by, g.photo_path into v_creator, v_photo from public.groups g where g.id = p_group;
    insert into private.purged_groups (group_id, created_by, had_trip)
    values (p_group, v_creator, exists (select 1 from public.group_trips gt where gt.group_id = p_group))
    on conflict (group_id) do nothing;

    alter table public.shared_expense_splits disable trigger shared_expense_splits_immutable;
    delete from public.notifications n
    where n.group_id = p_group
       or n.expense_id in (select e.id from public.shared_expenses e where e.group_id = p_group)
       or n.report_id in (select r.id from public.payment_reports r where r.group_id = p_group)
       or n.occurrence_id in (select o.id from public.group_recurring_occurrences o where o.group_id = p_group)
       or n.invitation_id in (select i.id from public.group_invitations i where i.group_id = p_group)
       or n.request_id in (select r.id from public.group_join_requests r where r.group_id = p_group);
    delete from public.payment_reports where group_id = p_group;
    delete from public.settlements where group_id = p_group;
    delete from public.shared_expense_splits where group_id = p_group;
    delete from public.group_recurring_occurrences where group_id = p_group;
    delete from public.group_recurring_participants where group_id = p_group;
    delete from public.group_recurring_expenses where group_id = p_group;
    delete from public.shared_expenses where group_id = p_group;
    delete from public.group_guest_expenses where group_id = p_group;
    delete from public.group_guest_settlements where group_id = p_group;
    delete from public.group_guests where group_id = p_group;
    delete from public.group_invitations where group_id = p_group;
    -- A join request points at the invite (code) it used: requests go BEFORE the invites.
    delete from public.group_join_requests where group_id = p_group;
    delete from public.group_invites where group_id = p_group;
    delete from public.group_trips where group_id = p_group;
    -- Shared expenses are already gone, so these bookings have no payments left to protect.
    delete from public.trip_booking_participants where booking_id in (select b.id from public.trip_bookings b where b.group_id = p_group);
    delete from public.trip_bookings where group_id = p_group;
    delete from public.group_members where group_id = p_group;
    delete from public.groups where id = p_group;
    alter table public.shared_expense_splits enable trigger shared_expense_splits_immutable;
    return jsonb_build_object('outcome', 'deleted', 'photo_path', v_photo);
  end if;

  -- Shared with other people: I leave for good, what is theirs stays.
  if public.is_group_owner(p_group)
     and not exists (
       select 1 from public.group_members m
       where m.group_id = p_group and m.role = 'owner' and m.left_at is null and m.user_id <> v_user
     )
     and exists (
       select 1 from public.group_members m where m.group_id = p_group and m.left_at is null and m.user_id <> v_user
     ) then
    if v_archived is null then
      raise exception 'last_admin' using errcode = '23514';
    end if;
    select o.user_id into v_next
    from public.group_members o
    where o.group_id = p_group and o.user_id <> v_user and o.left_at is null
    order by o.joined_at asc, o.user_id asc
    limit 1;
    update public.group_members set role = 'owner' where group_id = p_group and user_id = v_next;
  end if;

  update public.group_members
  set left_at = now(), hidden_at = null
  where group_id = p_group and user_id = v_user and left_at is null;

  if not exists (select 1 from public.group_members m where m.group_id = p_group and m.left_at is null) then
    update public.groups set archived_at = coalesce(archived_at, now()) where id = p_group;
    update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  end if;
  return jsonb_build_object('outcome', 'left', 'photo_path', null);
end;
$$;

create or replace function private.delete_account_data(p_user uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ghost uuid;
  v_first text;
  g record;
  v_next uuid;
  v_dead uuid[] := '{}';
  v_gid uuid;
  v_files jsonb := '[]'::jsonb;
  v_left int := 0;
  v_deleted int := 0;
  v_dead_files jsonb;
  v_archived int := 0;
begin
  -- One deletion per person at a time (a double tap or a retry waits for the first one).
  perform pg_advisory_xact_lock(hashtextextended('delete_account:' || p_user::text, 0));

  -- Idempotent: nothing left to do if the account is already gone.
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return jsonb_build_object('status', 'already_deleted', 'storage', '[]'::jsonb);
  end if;

  select nullif(btrim(split_part(coalesce(p.display_name, ''), ' ', 1)), '') into v_first
  from public.profiles p where p.id = p_user;
  v_first := left(regexp_replace(coalesce(v_first, 'Alguien'), '[[:cntrl:]]', '', 'g'), 40);

  v_ghost := gen_random_uuid();
  insert into auth.users (id, raw_user_meta_data)
  values (v_ghost, jsonb_build_object('full_name', 'Ex integrante'));
  update public.profiles set display_name = 'Ex integrante', avatar_url = null where id = v_ghost;
  insert into private.deleted_account_ghosts (ghost_id) values (v_ghost);

  -- Invitations and requests that involve the person are not financial history: they go (with the notices that point at them).
  delete from public.notifications n
  where n.invitation_id in (select i.id from public.group_invitations i where i.invited_user = p_user or i.invited_by = p_user)
     or n.request_id in (select r.id from public.group_join_requests r where r.user_id = p_user);
  delete from public.group_invitations where invited_user = p_user or invited_by = p_user;
  delete from public.group_join_requests where user_id = p_user;

  -- Leave every group and trip: hand the administration over, tell whoever stays.
  for g in
    select m.group_id, m.role, gr.name, gr.kind
    from public.group_members m
    join public.groups gr on gr.id = m.group_id
    where m.user_id = p_user and m.left_at is null
    order by m.group_id
    for update of m
  loop
    if not exists (
      select 1 from public.group_members o where o.group_id = g.group_id and o.user_id <> p_user and o.left_at is null
    ) then
      v_dead := v_dead || g.group_id;
      continue;
    end if;
    if g.role = 'owner' and not exists (
      select 1 from public.group_members o
      where o.group_id = g.group_id and o.user_id <> p_user and o.left_at is null and o.role = 'owner'
    ) then
      -- Deterministic and safe: the member who has been in the group the longest; the id breaks a tie.
      select o.user_id into v_next
      from public.group_members o
      where o.group_id = g.group_id and o.user_id <> p_user and o.left_at is null
      order by o.joined_at asc, o.user_id asc
      limit 1;
      update public.group_members set role = 'owner' where group_id = g.group_id and user_id = v_next;
    end if;
    insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, group_kind)
    select o.user_id, 'member_left', g.group_id, g.name, v_ghost, v_first, g.kind
    from public.group_members o
    where o.group_id = g.group_id and o.user_id <> p_user and o.left_at is null;
    v_left := v_left + 1;
  end loop;

  -- The person is out of every group before anything is re-pointed.
  update public.group_members set left_at = now() where user_id = p_user and left_at is null;

  -- The split rows are immutable on purpose (no app or user can edit them). This one transaction, which keeps every amount exactly as
  -- it was and only changes WHO the row names, lifts the guard on that table and puts it back before it ends.
  alter table public.shared_expense_splits disable trigger shared_expense_splits_immutable;

  -- Everything the person did in shared spaces now belongs to "Ex integrante": ledger, debts and history stay exactly as they were.
  update public.group_guest_expenses set created_by = v_ghost where created_by = p_user;
  update public.group_guest_settlements set created_by = v_ghost where created_by = p_user;
  update public.group_guests set created_by = v_ghost where created_by = p_user;
  update public.group_guests set linked_user_id = v_ghost where linked_user_id = p_user;
  update public.group_invites set created_by = v_ghost where created_by = p_user;
  update public.group_join_requests set resolved_by = v_ghost where resolved_by = p_user;
  update public.group_members set user_id = v_ghost where user_id = p_user;
  update public.group_recurring_expenses set created_by = v_ghost where created_by = p_user;
  update public.group_recurring_expenses set paid_by = v_ghost where paid_by = p_user;
  update public.group_recurring_occurrences set resolved_by = v_ghost where resolved_by = p_user;
  update public.group_recurring_participants set user_id = v_ghost where user_id = p_user;
  update public.group_trips set updated_by = v_ghost where updated_by = p_user;
  update public.groups set created_by = v_ghost where created_by = p_user;
  update public.payment_reports set from_user = v_ghost where from_user = p_user;
  update public.payment_reports set to_user = v_ghost where to_user = p_user;
  update public.settlements set created_by = v_ghost where created_by = p_user;
  update public.settlements set from_user = v_ghost where from_user = p_user;
  update public.settlements set to_user = v_ghost where to_user = p_user;
  update public.shared_expense_splits set user_id = v_ghost where user_id = p_user;
  update public.shared_expenses set created_by = v_ghost where created_by = p_user;
  update public.shared_expenses set paid_by = v_ghost where paid_by = p_user;
  -- Notices other people already have that were caused by this person keep their meaning but not the name.
  update public.notifications set actor_id = v_ghost, actor_name = 'Ex integrante' where actor_id = p_user;

  -- Files in Storage: anything personal the person uploaded (any bucket except the shared group photos) is returned to be removed; the
  -- group photos they uploaded to groups that stay keep existing (they belong to the group) but no longer name them as the owner.
  if to_regclass('storage.objects') is not null
     and exists (select 1 from information_schema.columns c where c.table_schema = 'storage' and c.table_name = 'objects' and c.column_name = 'owner_id') then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(''bucket'', o.bucket_id, ''name'', o.name)), ''[]''::jsonb)
             from storage.objects o where o.owner_id = $1 and o.bucket_id <> ''group-photos'''
      into v_files using p_user::text;
    execute 'update storage.objects set owner_id = null where owner_id = $1 and bucket_id = ''group-photos''' using p_user::text;
  end if;
  if to_regclass('storage.objects') is not null
     and exists (select 1 from information_schema.columns c where c.table_schema = 'storage' and c.table_name = 'objects' and c.column_name = 'owner') then
    execute 'update storage.objects set owner = null where owner = $1 and bucket_id = ''group-photos''' using p_user;
  end if;

  -- The account itself: Auth user and, by cascade, every personal row (profile, movements, payment methods, savings, goals,
  -- trips, categories, notices, preferences, push tokens, linked services, Plus, support…).
  delete from auth.users where id = p_user;

  -- Groups left without members: delete them whole, unless somebody who left earlier still has personal movements tied to them
  -- (then they are only archived: other people's movements are never touched).
  foreach v_gid in array v_dead loop
    if exists (
      select 1 from public.transactions t
      where t.shared_expense_id in (select e.id from public.shared_expenses e where e.group_id = v_gid)
         or t.settlement_id in (select s.id from public.settlements s where s.group_id = v_gid)
         or t.payment_report_id in (select r.id from public.payment_reports r where r.group_id = v_gid)
    ) then
      update public.groups set archived_at = coalesce(archived_at, now()) where id = v_gid;
      v_archived := v_archived + 1;
      continue;
    end if;
    if to_regclass('storage.objects') is not null then
      execute 'select coalesce(jsonb_agg(jsonb_build_object(''bucket'', o.bucket_id, ''name'', o.name)), ''[]''::jsonb)
               from storage.objects o where o.bucket_id = ''group-photos'' and split_part(o.name, ''/'', 1) = $1'
        into v_dead_files using v_gid::text;
      v_files := v_files || v_dead_files;
    end if;
    delete from public.notifications n
    where n.group_id = v_gid
       or n.expense_id in (select e.id from public.shared_expenses e where e.group_id = v_gid)
       or n.report_id in (select r.id from public.payment_reports r where r.group_id = v_gid)
       or n.occurrence_id in (select o.id from public.group_recurring_occurrences o where o.group_id = v_gid)
       or n.invitation_id in (select i.id from public.group_invitations i where i.group_id = v_gid)
       or n.request_id in (select r.id from public.group_join_requests r where r.group_id = v_gid);
    delete from public.payment_reports where group_id = v_gid;
    delete from public.settlements where group_id = v_gid;
    delete from public.shared_expense_splits where group_id = v_gid;
    delete from public.group_recurring_occurrences where group_id = v_gid;
    delete from public.group_recurring_participants where group_id = v_gid;
    delete from public.group_recurring_expenses where group_id = v_gid;
    delete from public.shared_expenses where group_id = v_gid;
    delete from public.group_guest_expenses where group_id = v_gid;
    delete from public.group_guest_settlements where group_id = v_gid;
    delete from public.group_guests where group_id = v_gid;
    delete from public.group_invitations where group_id = v_gid;
    -- A join request points at the invite (code) it used: requests go BEFORE the invites.
    delete from public.group_join_requests where group_id = v_gid;
    delete from public.group_invites where group_id = v_gid;
    delete from public.group_trips where group_id = v_gid;
    delete from public.trip_booking_participants where booking_id in (select b.id from public.trip_bookings b where b.group_id = v_gid);
    delete from public.trip_bookings where group_id = v_gid;
    delete from public.group_members where group_id = v_gid;
    delete from public.groups where id = v_gid;
    v_deleted := v_deleted + 1;
  end loop;

  alter table public.shared_expense_splits enable trigger shared_expense_splits_immutable;

  -- A stand-in nobody ended up needing (no groups, or every group was deleted) is removed too.
  begin
    delete from auth.users where id = v_ghost;
    delete from private.deleted_account_ghosts where ghost_id = v_ghost;
  exception when foreign_key_violation then
    null;
  end;

  return jsonb_build_object(
    'status', 'deleted',
    'storage', v_files,
    'groups_left', v_left,
    'groups_deleted', v_deleted,
    'groups_archived', v_archived
  );
end;
$$;

commit;
