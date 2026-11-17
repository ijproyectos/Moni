-- ROLLBACK de 20261123000000_debt_reminder_push.sql. No toca datos: solo quita el envío push; los avisos dentro de Moni siguen.
begin;
drop trigger if exists notifications_push_debt_reminder on public.notifications;
drop function if exists private.push_debt_reminder();
commit;
