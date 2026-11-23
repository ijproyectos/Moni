-- Avisos: borrar de a uno o todos, y limpieza automática de los de más de 7 días.
--
--   1. public.delete_my_notices(p_ids uuid[] default null): borra avisos PROPIOS de `notifications` (null = todos). Nunca borra los que
--      todavía piden una respuesta: solicitud de ingreso pendiente, invitación pendiente o pago informado sin confirmar.
--   2. notice_reads.dismissed_at + public.dismiss_center_notices(p_keys): los eventos del centro que se calculan con datos vivos (cobros
--      próximos, aumentos, límites) no tienen fila propia: «eliminar» los oculta guardando su clave, así no vuelven al actualizar.
--   3. public.purge_old_notices(): borra los avisos propios de más de 7 días (salvo los pendientes de respuesta) y las claves descartadas
--      de más de 60 días. La app la llama al abrir los avisos; no hace falta cron.
--
-- Borrar un aviso NO toca el gasto, el pago, la invitación ni el evento que lo originó (las filas de origen no se modifican).
-- No cambia las preferencias de avisos. Aplicar DESPUÉS de 20261204000000, con respaldo previo. NO aplicada en producción.
-- Rollback: drop function public.purge_old_notices(); drop function public.dismiss_center_notices(text[]);
--   drop function public.delete_my_notices(uuid[]); alter table public.notice_reads drop column dismissed_at; drop function private.notice_is_pending(public.notifications);

begin;

alter table public.notice_reads add column dismissed_at timestamptz;

-- A notice that still waits for an answer is kept: its request, invitation or payment report is still open.
create or replace function private.notice_is_pending(n public.notifications)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case n.kind
    when 'join_request' then exists (select 1 from public.group_join_requests r where r.id = n.request_id and r.status = 'pending')
    when 'group_invitation' then exists (select 1 from public.group_invitations i where i.id = n.invitation_id and i.status = 'pending')
    when 'payment_reported' then exists (select 1 from public.payment_reports p where p.id = n.report_id and p.status = 'reported')
    else false
  end;
$$;
revoke all on function private.notice_is_pending(public.notifications) from public, anon, authenticated;

create or replace function public.delete_my_notices(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_count integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.notifications n
  where n.user_id = v_user
    and (p_ids is null or n.id = any (p_ids))
    and not private.notice_is_pending(n);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.delete_my_notices(uuid[]) from public, anon;
grant execute on function public.delete_my_notices(uuid[]) to authenticated;

create or replace function public.dismiss_center_notices(p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_keys is null or cardinality(p_keys) > 200 then
    raise exception 'invalid_keys' using errcode = '22023';
  end if;
  insert into public.notice_reads (user_id, key, dismissed_at)
  select v_user, left(btrim(k), 120), now() from unnest(p_keys) k where btrim(k) <> ''
  on conflict (user_id, key) do update set dismissed_at = coalesce(public.notice_reads.dismissed_at, excluded.dismissed_at);
end;
$$;
revoke execute on function public.dismiss_center_notices(text[]) from public, anon;
grant execute on function public.dismiss_center_notices(text[]) to authenticated;

create or replace function public.purge_old_notices()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    return;
  end if;
  delete from public.notifications n
  where n.user_id = v_user
    and n.created_at < now() - interval '7 days'
    and not private.notice_is_pending(n);
  delete from public.notice_reads r
  where r.user_id = v_user and r.read_at < now() - interval '60 days';
end;
$$;
revoke execute on function public.purge_old_notices() from public, anon;
grant execute on function public.purge_old_notices() to authenticated;

commit;
