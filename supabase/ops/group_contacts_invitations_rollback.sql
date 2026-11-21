-- Rollback de 20261128000000_group_contacts_invitations.sql (G3).
-- SE BORRAN (únicas filas que se eliminan, ninguna financiera): las preferencias de contactos (ocultos/bloqueados), las invitaciones
-- directas y los avisos group_invitation / invitation_accepted. Las personas que ya aceptaron SIGUEN en sus grupos (la membresía no
-- se toca). No toca grupos, movimientos, gastos, pagos ni saldos.
begin;
drop trigger if exists notifications_push_group_notice on public.notifications;
drop function if exists public.get_my_group_invitations();
drop function if exists public.get_group_invitations(uuid);
drop function if exists public.cancel_group_invitation(uuid);
drop function if exists public.respond_group_invitation(uuid, boolean);
drop function if exists public.invite_contact(uuid, uuid);
drop function if exists public.set_contact_pref(uuid, boolean, boolean);
drop function if exists public.get_hidden_contacts();
drop function if exists public.get_my_contacts();

delete from public.notifications where kind in ('group_invitation', 'invitation_accepted');
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop column invitation_id;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected') and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected') and amount is not null and amount > 0));

drop table public.group_invitations;
drop table public.contact_prefs;
drop function if exists public.shares_group_with(uuid, uuid);

-- Push de G2 (sin los tipos de G3)
create or replace function private.push_group_notice()
returns trigger language plpgsql volatile security definer set search_path = pg_catalog, pg_temp
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
  else
    v_title := '🐱 Solicitud de ingreso';
    v_body := 'Tu solicitud para entrar a ' || v_group || ' no fue aceptada';
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object('kind', 'reminder', 'title', v_title, 'body', v_body, 'audience', 'user', 'user_id', new.user_id, 'url', '/grupos/avisos'),
      'group_notice_push_enabled');
  exception when others then null;
  end;
  return new;
end;
$$;
create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected'))
execute function private.push_group_notice();
commit;
