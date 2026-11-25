-- Eliminar cuenta: borrado real de la cuenta y de sus datos, con los grupos y viajes compartidos a salvo.
--
-- Cómo funciona (la parte segura corre en la Edge Function `delete-account`, con la clave de servicio, que nunca llega a la app):
--   1. La función verifica quién es la persona (su propia sesión) y que haya escrito «ELIMINAR».
--   2. Cancela su suscripción de Mercado Pago (si no se puede cancelar, NO sigue: no se borra nada y se puede reintentar). Si tiene
--      una suscripción de la tienda (App Store / Google Play) activa pide cancelarla allí primero: no se puede cancelar desde acá.
--   3. Llama a public.delete_account(p_user): UNA sola transacción (todo o nada, idempotente, con candado por persona) que
--      - deja a la persona fuera de todos sus grupos y viajes (avisa a quienes siguen: «X dejó de formar parte del grupo/viaje Y»,
--        sin decir que borró la cuenta ni exigir Plus);
--      - si era la única administradora y quedan integrantes, pasa la administración a quien lleva más tiempo en el grupo (desempata
--        el id): regla fija, sin azar;
--      - anonimiza lo compartido: todo lo que la persona hizo en grupos (gastos, pagos, liquidaciones, recurrentes…) pasa a un
--        «Ex integrante» (una cuenta vacía, sin correo ni sesión) para que los saldos y el historial de los demás NO cambien;
--      - borra la cuenta de acceso y, por cascada, todo lo personal: perfil, movimientos, medios de pago, ahorros, metas, viajes,
--        categorías, avisos y preferencias, tokens push, vinculaciones externas, suscripciones y pagos de Plus, soporte;
--      - los grupos que quedan sin integrantes se borran completos; si algún integrante anterior conserva movimientos propios
--        ligados a ese grupo, el grupo se archiva (no se tocan los movimientos de otras personas).
--   4. La función devuelve los archivos de Storage a borrar (archivos personales de cualquier bucket y las fotos de los grupos que se
--      borraron) y la Edge Function los borra. Las fotos que subió a grupos que siguen quedan, sin figurar a su nombre.
--
-- Esta migración agrega: notifications.group_kind + el aviso 'member_left' (con su push), la tabla private.deleted_account_ghosts
-- y public.delete_account(uuid) (solo service_role).
-- Aplicar DESPUÉS de 20261209000000, con respaldo previo. NO aplicada en producción.
-- Rollback: drop function public.delete_account(uuid), private.delete_account_data(uuid); drop table private.deleted_account_ghosts;
--   borrar los avisos member_left, volver a crear notifications_kind_check/notifications_amount_check sin 'member_left',
--   alter table public.notifications drop column group_kind; y volver a crear private.push_group_notice desde 20261208000000.

begin;

-- 1. The notice that tells the others somebody left --------------------------------------------------------------------------------
alter table public.notifications add column group_kind text;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected', 'join_request', 'join_approved', 'join_rejected',
  'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived', 'expense_added', 'member_left'));

alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
            'group_archived', 'expense_added', 'member_left') and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
                   'group_archived', 'expense_added', 'member_left') and amount is not null and amount > 0));

create or replace function private.push_group_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hide boolean;
  v_expense_push boolean;
  v_group text := private.clean_push_text(new.group_name);
  v_actor text := private.clean_push_text(new.actor_name);
  v_body text;
begin
  select coalesce(p.hide_details, false) into v_hide
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;
  if new.kind = 'expense_added' then
    select coalesce(e.expense_added_push, true) into v_expense_push
    from (select 1) x left join public.notice_prefs_extra e on e.user_id = new.user_id;
    if not v_expense_push then
      return new;
    end if;
  end if;
  if v_hide then
    v_body := case when new.kind = 'recurring_due' then 'Tenés un gasto recurrente para registrar' else 'Tenés un aviso de grupo' end;
  elsif new.kind = 'recurring_due' then
    v_body := 'Tenés un gasto recurrente para registrar: ' || private.clean_push_text(new.subject) || ' (' || v_group || ')';
  elsif new.kind = 'expense_added' then
    v_body := v_actor || ' te incluyó en un gasto de ' || v_group || ': ' || private.clean_push_text(new.subject);
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
  elsif new.kind = 'member_left' then
    v_body := v_actor || ' dejó de formar parte del ' || case when new.group_kind = 'viaje' then 'viaje ' else 'grupo ' end || v_group;
  else
    v_body := 'Tu solicitud para entrar a ' || v_group || ' no fue aceptada';
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', 'Moni', 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', case when new.kind = 'recurring_due' then '/grupos/' || new.group_id::text || '/recurrentes?aviso=' || new.id::text
                    when new.kind = 'expense_added' then '/grupos/' || new.group_id::text || '?aviso=' || new.id::text
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
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived', 'expense_added', 'member_left'))
execute function private.push_group_notice();

-- 2. The anonymous stand-ins ------------------------------------------------------------------------------------------------------
-- An empty auth user (no e-mail, no identity, no session possible) named "Ex integrante" takes the place of the person in what is
-- shared with others. One per deleted account, so two people who left the same group stay two different people in the ledger.
create table if not exists private.deleted_account_ghosts (
  ghost_id uuid primary key,
  created_at timestamptz not null default now()
);
revoke all on table private.deleted_account_ghosts from public, anon, authenticated;

-- 3. The deletion -----------------------------------------------------------------------------------------------------------------
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
    delete from public.group_invites where group_id = v_gid;
    delete from public.group_join_requests where group_id = v_gid;
    delete from public.group_trips where group_id = v_gid;
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
revoke all on function private.delete_account_data(uuid) from public, anon, authenticated;

-- The only door: the service role (the Edge Function) after it verified the person. Never reachable from the app.
create or replace function public.delete_account(p_user uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.delete_account_data(p_user);
$$;
revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_account(uuid) to service_role;

commit;
