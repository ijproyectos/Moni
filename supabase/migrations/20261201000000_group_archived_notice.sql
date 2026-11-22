-- Grupos: aviso a los integrantes cuando un administrador elimina el grupo para todos, y poder quitarlo de la lista de archivados.
--
-- Cambios (ninguno toca saldos, gastos, pagos ni permisos):
--   1. notifications admite el tipo 'group_archived' (sin monto, como los avisos de grupo). No genera push: solo aviso dentro de Moni.
--   2. archive_group_for_all conserva EXACTAMENTE sus reglas (solo administradores, nombre, sin deudas, sin pagos sin confirmar,
--      nunca borra filas) y suma un aviso para cada OTRO integrante activo.
--   4. Plantilla de categoría «Ropa» para los gastos compartidos (hasta ahora no existía y se elegía una incorrecta).
--   3. get_my_hidden_and_archived_groups: un grupo archivado para todos aparece hasta que la persona lo quita de su lista
--      (hide_group_for_me ya existente); un grupo oculto por mí sigue apareciendo para poder restaurarlo. Solo cambia el filtro de lectura.
--
-- Aplicar DESPUÉS de 20261130000300_group_recurring_expenses.sql. NO aplicada en producción (requiere autorización y respaldo).
-- Rollback: volver a crear archive_group_for_all y get_my_hidden_and_archived_groups desde 20261129000000, y
--   delete from public.notifications where kind = 'group_archived'; luego restaurar las dos constraints de notifications sin el tipo.

begin;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
  'group_archived'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived')
   and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived')
      and amount is not null and amount > 0));

create or replace function public.archive_group_for_all(p_group uuid, p_name_confirmation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_user uuid := auth.uid();
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

  -- Everybody else in the group is told (inside Moni).
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name)
  select m.user_id, 'group_archived', p_group, v_name, v_user, public.display_name_of(v_user)
  from public.group_members m
  where m.group_id = p_group and m.left_at is null and m.user_id <> v_user;
end;
$$;

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
  where (g.archived_at is not null and m.hidden_at is null)   -- archived for everybody, until I remove it from my list
     or (g.archived_at is null and m.hidden_at is not null)   -- hidden by me, restorable
  order by last_activity desc, g.id;
$$;

insert into public.category_templates (slug, kind, name, icon, color, sort_order)
values ('ropa', 'expense', 'Ropa', 'Shirt', '#4F86D9', 800)
on conflict (slug) do nothing;

commit;
