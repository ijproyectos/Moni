-- Avisos abiertos desde una notificación push.
--
-- Al tocar una notificación push, la app abre la pantalla correspondiente y llama a public.open_my_notice(id): el aviso queda leído y,
-- si no pide una respuesta, se elimina del centro de avisos (persistido en Supabase: vale en todos tus dispositivos, no vuelve por una
-- recarga ni por sincronizar). Los avisos que todavía piden una acción (solicitud de ingreso pendiente, invitación pendiente, pago
-- informado sin confirmar) se marcan como leídos pero se conservan: la acción sigue disponible hasta que se resuelva.
--
--   1. public.open_my_notice(p_id uuid) returns text: 'deleted' | 'read' | 'none'. Solo toca avisos PROPIOS; reutiliza
--      private.notice_is_pending (20261205000000). No modifica el gasto, el pago ni la invitación de origen.
--   2. private.push_group_notice(): mismo cuerpo que en 20261204000000, con una sola diferencia: los push de «gasto agregado» y de
--      «gasto recurrente» llevan también ?aviso=<id> en su dirección (los demás ya lo llevaban), para poder identificar el aviso.
--
-- Aplicar DESPUÉS de 20261207000000, con respaldo previo. NO aplicada en producción.
-- Rollback: drop function public.open_my_notice(uuid); y volver a crear private.push_group_notice desde 20261204000000.

begin;

create or replace function public.open_my_notice(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_n public.notifications%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select n.* into v_n from public.notifications n where n.id = p_id and n.user_id = v_user for update;
  if not found then
    return 'none';
  end if;
  if private.notice_is_pending(v_n) then
    update public.notifications set read_at = coalesce(read_at, now()) where id = v_n.id;
    return 'read';
  end if;
  delete from public.notifications where id = v_n.id;
  return 'deleted';
end;
$$;
revoke execute on function public.open_my_notice(uuid) from public, anon;
grant execute on function public.open_my_notice(uuid) to authenticated;

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

commit;
