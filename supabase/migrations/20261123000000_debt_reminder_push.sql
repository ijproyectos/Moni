-- «Enviar recordatorio» también llega como notificación push al celular de quien debe.
--
-- Todo lo demás ya existe: remind_debt guarda el aviso (notifications, kind 'debt_reminder', como mucho uno cada 24 h
-- por deuda), push-send entrega a las suscripciones del usuario (audience 'user') y el service worker abre la url al
-- tocar. Faltaba el puente: un trigger que, al crearse el aviso, pide el envío a push-send con private.run_push_cron
-- (pg_net, URL y secreto de private.app_secrets). Si falta configuración o algo falla, el aviso dentro de Moni se crea igual
-- y no se simula ningún envío (el trigger no puede romper remind_debt).
--
--   * Texto: «🐱 Moni te recuerda» / «Tenés $15.000 pendientes con Iara». Al tocarla abre /grupos/avisos (el aviso con «Ya pagué»).
--   * Apagable sin tocar código: admin_settings.key = 'debt_reminder_push_enabled' con enabled = false (sin fila = encendido).
--   * Sin suscripción push (no activó avisos) o cuenta suspendida: push-send no envía nada.
--
-- Una transacción. Rollback: supabase/ops/debt_reminder_push_rollback.sql (sin migrar datos)

begin;

create or replace function private.push_debt_reminder()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_amount text;
begin
  -- $15.000 o $15.000,50 (punto de miles, coma decimal).
  v_amount := '$' || regexp_replace(trunc(new.amount)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
              || case when new.amount <> trunc(new.amount)
                      then ',' || lpad(((new.amount - trunc(new.amount)) * 100)::int::text, 2, '0') else '' end;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder',
        'title', '🐱 Moni te recuerda',
        'body', 'Tenés ' || v_amount || ' pendientes con ' || left(regexp_replace(new.actor_name, '[[:cntrl:]]', '', 'g'), 40),
        'audience', 'user',
        'user_id', new.user_id,
        'url', '/grupos/avisos'
      ),
      'debt_reminder_push_enabled'
    );
  exception when others then
    null; -- the in-app notice is already saved; a push failure never blocks the reminder
  end;
  return new;
end;
$$;

revoke all on function private.push_debt_reminder() from public, anon, authenticated;

drop trigger if exists notifications_push_debt_reminder on public.notifications;
create trigger notifications_push_debt_reminder
after insert on public.notifications
for each row when (new.kind = 'debt_reminder')
execute function private.push_debt_reminder();

commit;
