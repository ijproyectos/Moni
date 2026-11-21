-- Rollback de 20261130000200_group_payment_notices.sql (G4).
-- Se borran las preferencias de avisos (notification_prefs: la tabla nueva). Los avisos, los pagos y los saldos no se tocan.
-- Se restauran los push de recordatorio (20261123) y de avisos de grupo (G3) y se quita el push de pagos.
begin;
drop trigger if exists notifications_push_payment_notice on public.notifications;
drop function if exists private.push_payment_notice();
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


drop index if exists public.notifications_one_per_report_kind;
drop function if exists private.clean_push_text(text);
drop function if exists private.push_amount(numeric);
drop function if exists public.set_notification_prefs(boolean, boolean, boolean, boolean);
drop function if exists public.get_my_notification_prefs();
drop table public.notification_prefs;
commit;
