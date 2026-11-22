-- Rollback de 20261130000300_group_recurring_expenses.sql (G5).
-- SE BORRAN (únicas filas que se eliminan): la configuración de gastos recurrentes, sus participantes y sus ocurrencias (los
-- períodos pendientes y el historial de períodos), y los avisos recurring_due. LOS GASTOS COMPARTIDOS YA REGISTRADOS NO SE TOCAN:
-- siguen en el grupo con sus saldos (solo se pierde el vínculo «de qué recurrencia vino»). Nombres de grupo ya cambiados: se conservan.
begin;
drop trigger if exists notifications_push_group_notice on public.notifications;
drop function if exists public.get_group_recurring_occurrences(uuid);
drop function if exists public.get_group_recurring(uuid);
drop function if exists public.skip_group_recurring_occurrence(uuid);
drop function if exists public.confirm_group_recurring_occurrence(uuid, numeric, uuid);
drop function if exists private.process_all_group_recurring();
drop function if exists public.process_group_recurring(uuid);
drop function if exists private.process_group_recurring_core(uuid, date);
drop function if exists public.set_group_recurring_status(uuid, text);
drop function if exists public.update_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[]);
drop function if exists public.create_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[], uuid);
drop function if exists private.check_group_recurring(uuid, text, text, numeric, text, uuid, text, uuid[], numeric[]);
drop function if exists private.first_recurring_cycle(date, text, date);
drop function if exists private.today_ar();
drop function if exists public.update_group_name(uuid, text);

delete from public.notifications where kind = 'recurring_due';
drop index if exists public.notifications_one_per_occurrence;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop column occurrence_id;
alter table public.notifications drop column subject;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted') and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted')
      and amount is not null and amount > 0));

drop table public.group_recurring_occurrences;
drop table public.group_recurring_participants;
drop table public.group_recurring_expenses;

-- Push de avisos de grupo: versión de G4 (sin recurring_due)
create or replace function private.push_group_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hide boolean;
  v_group text := private.clean_push_text(new.group_name);
  v_actor text := private.clean_push_text(new.actor_name);
  v_title text;
  v_body text;
begin
  select coalesce(p.hide_details, false) into v_hide
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;
  if v_hide then
    v_title := '🐱 Moni';
    v_body := 'Tenés un aviso de grupo en Moni';
  elsif new.kind = 'join_request' then
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
        'kind', 'reminder', 'title', v_title, 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', '/grupos/avisos?aviso=' || new.id::text
      ),
      'group_notice_push_enabled'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;


create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted'))
execute function private.push_group_notice();
commit;
