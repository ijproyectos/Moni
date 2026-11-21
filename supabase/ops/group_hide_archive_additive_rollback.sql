-- Rollback de 20261126000000_group_hide_archive_additive.sql (lote A).
-- No toca ninguna fila financiera. Pierde solo el estado «oculto» de cada integrante (hidden_at: esos grupos vuelven a verse en
-- la lista; sus deudas nunca dejaron de contar). Los grupos ARCHIVADOS con archive_group_for_all siguen archivados (no se borró nada):
-- para reabrir alguno a mano: update public.groups set archived_at = null where id = '…'.
-- Si ya se aplicó el lote B, revertir PRIMERO el lote B (group_admin_enforcement_rollback.sql): usa is_group_owner.
begin;
drop function if exists public.set_member_role(uuid, uuid, text);
drop function if exists public.archive_group_for_all(uuid, text);
drop function if exists public.restore_group_for_me(uuid);
drop function if exists public.hide_group_for_me(uuid);
drop function if exists public.get_my_hidden_and_archived_groups();
drop function if exists public.group_open_balance_count(uuid);
drop function if exists public.is_group_owner(uuid);

-- get_my_groups: cuerpo original de 20261027000000_shared_expenses.sql
drop function if exists public.get_my_groups();
create function public.get_my_groups()
returns table (id uuid, name text, kind text, role text, member_count int, my_net numeric, last_activity timestamptz)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.name, g.kind, m.role,
         (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null)::int,
         coalesce((select r.net from public.group_balance_rows(g.id) r where r.user_id = (select auth.uid())), 0),
         greatest(
           g.created_at,
           coalesce((select max(e.created_at) from public.shared_expenses e where e.group_id = g.id), g.created_at),
           coalesce((select max(s.created_at) from public.settlements s where s.group_id = g.id), g.created_at)
         ) as last_activity
  from public.groups g
  join public.group_members m on m.group_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null
  where g.archived_at is null
  order by last_activity desc, g.id;
$$;

alter table public.group_members drop column hidden_at;
commit;
