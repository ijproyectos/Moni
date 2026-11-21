-- G4 · Pagos y avisos de Grupos: push para «Ya pagué» / confirmado / rechazado, y preferencias de avisos y privacidad.
--
-- Lo que YA existía y NO se toca: remind_debt (un recordatorio por deuda cada 24 h), report_payment («Ya pagué»),
-- confirm_payment_report, reject_payment_report, cancel_payment_report y la tabla notifications con sus avisos dentro de Moni
-- (payment_reported / payment_confirmed / payment_rejected). Un pago NO se considera confirmado hasta que el acreedor lo acepta
-- (confirm_payment_report): informarlo solo deja un aviso y la deuda sigue pendiente.
--
-- Qué se agrega
--   * notification_prefs (una fila por persona, con RLS de solo lectura propia) y las funciones get_my_notification_prefs /
--     set_notification_prefs: activar o no el PUSH de recordatorios, de pagos registrados y de pagos confirmados o rechazados, y
--     elegir si el push muestra nombres e importes o un texto genérico (pantalla bloqueada). Sin fila = todo activado y con detalle.
--     Las preferencias solo controlan el push: los avisos dentro de Moni se crean siempre.
--   * Push (mismo puente que el recordatorio, un fallo nunca bloquea la acción) para payment_reported, payment_confirmed y
--     payment_rejected; el de recordatorios y el de avisos de grupo (G2/G3) ahora respetan las preferencias. Al tocar un push se
--     abre /grupos/avisos?aviso=<id> (el aviso con «Confirmar recepción» / «No lo recibí»).
--   * Un solo aviso por pago y tipo (índice único): imposible duplicarlos.
--
-- Los grupos ocultos siguen generando deudas y avisos (nada de esto mira hidden_at). No toca movimientos, saldos ni deudas.
-- Requiere G1–G3. Aplicar junto con la publicación del front nuevo.
-- Rollback: supabase/ops/group_payment_notices_rollback.sql

begin;

-- Preferences ---------------------------------------------------------------------------------------------------------------------
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  debt_reminders boolean not null default true,
  payments_reported boolean not null default true,
  payments_answered boolean not null default true,
  hide_details boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
revoke all on table public.notification_prefs from anon, authenticated;
grant select on table public.notification_prefs to authenticated;
create policy "notification_prefs_select_own" on public.notification_prefs
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.get_my_notification_prefs()
returns table (debt_reminders boolean, payments_reported boolean, payments_answered boolean, hide_details boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.debt_reminders, true), coalesce(p.payments_reported, true),
         coalesce(p.payments_answered, true), coalesce(p.hide_details, false)
  from (select 1) x
  left join public.notification_prefs p on p.user_id = (select auth.uid());
$$;

create or replace function public.set_notification_prefs(
  p_debt_reminders boolean,
  p_payments_reported boolean,
  p_payments_answered boolean,
  p_hide_details boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.notification_prefs as n (user_id, debt_reminders, payments_reported, payments_answered, hide_details)
  values (v_user, coalesce(p_debt_reminders, true), coalesce(p_payments_reported, true),
          coalesce(p_payments_answered, true), coalesce(p_hide_details, false))
  on conflict (user_id) do update
    set debt_reminders = excluded.debt_reminders,
        payments_reported = excluded.payments_reported,
        payments_answered = excluded.payments_answered,
        hide_details = excluded.hide_details,
        updated_at = now();
end;
$$;

revoke execute on function public.get_my_notification_prefs(), public.set_notification_prefs(boolean, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.get_my_notification_prefs(), public.set_notification_prefs(boolean, boolean, boolean, boolean)
  to authenticated;

-- One notice per payment and kind -------------------------------------------------------------------------------------------------
create unique index notifications_one_per_report_kind
  on public.notifications (report_id, kind)
  where report_id is not null and kind in ('payment_reported', 'payment_confirmed', 'payment_rejected');

-- Push helpers (internal) ----------------------------------------------------------------------------------------------------------
-- $15.000 or $15.000,50 (thousands dot, decimal comma).
create or replace function private.push_amount(p_amount numeric)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select '$' || regexp_replace(trunc(p_amount)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || case when p_amount <> trunc(p_amount)
                 then ',' || lpad(((p_amount - trunc(p_amount)) * 100)::int::text, 2, '0') else '' end;
$$;

create or replace function private.clean_push_text(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select left(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', '', 'g'), 40);
$$;

-- Debt reminders: same bridge as 20261123000000, now with the preferences and the new wording.
create or replace function private.push_debt_reminder()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pref record;
  v_title text;
  v_body text;
begin
  select coalesce(p.debt_reminders, true) as on_, coalesce(p.hide_details, false) as hide
  into v_pref
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;
  if not v_pref.on_ then
    return new;
  end if;
  if v_pref.hide then
    v_title := '🐱 Moni';
    v_body := 'Tenés un recordatorio de pago en Moni';
  else
    v_title := '🐱 Moni te recuerda';
    v_body := private.clean_push_text(new.actor_name) || ' te recordó que tenés un pago pendiente de '
              || private.push_amount(new.amount) || ' en Moni';
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', v_title, 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', '/grupos/avisos?aviso=' || new.id::text
      ),
      'debt_reminder_push_enabled'
    );
  exception when others then
    null; -- the in-app notice is already saved; a push failure never blocks the reminder
  end;
  return new;
end;
$$;

-- Payments: reported (to the creditor) and answered (to the debtor).
create or replace function private.push_payment_notice()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pref record;
  v_actor text := private.clean_push_text(new.actor_name);
  v_amount text := private.push_amount(new.amount);
  v_title text;
  v_body text;
begin
  select coalesce(p.payments_reported, true) as reported, coalesce(p.payments_answered, true) as answered,
         coalesce(p.hide_details, false) as hide
  into v_pref
  from (select 1) x left join public.notification_prefs p on p.user_id = new.user_id;

  if new.kind = 'payment_reported' then
    if not v_pref.reported then return new; end if;
    if v_pref.hide then
      v_title := '🐱 Tenés un pago pendiente de confirmar';
      v_body := 'Abrí Moni para revisarlo';
    else
      v_title := '🐱 Pago por confirmar';
      v_body := v_actor || ' indicó que te pagó ' || v_amount || '. ¿Recibiste el dinero?';
    end if;
  else
    if not v_pref.answered then return new; end if;
    if v_pref.hide then
      v_title := '🐱 Novedades de un pago';
      v_body := 'Abrí Moni para verlas';
    elsif new.kind = 'payment_confirmed' then
      v_title := '🐱 Pago confirmado';
      v_body := v_actor || ' confirmó tu pago de ' || v_amount;
    else
      v_title := '🐱 Pago sin confirmar';
      v_body := v_actor || ' todavía no confirmó tu pago de ' || v_amount;
    end if;
  end if;
  begin
    perform private.run_push_cron(
      jsonb_build_object(
        'kind', 'reminder', 'title', v_title, 'body', v_body, 'audience', 'user', 'user_id', new.user_id,
        'url', '/grupos/avisos?aviso=' || new.id::text
      ),
      'payment_notice_push_enabled'
    );
  exception when others then
    null;
  end;
  return new;
end;
$$;

revoke all on function private.push_payment_notice() from public, anon, authenticated;
drop trigger if exists notifications_push_payment_notice on public.notifications;
create trigger notifications_push_payment_notice
after insert on public.notifications
for each row when (new.kind in ('payment_reported', 'payment_confirmed', 'payment_rejected'))
execute function private.push_payment_notice();

-- Group notices (G2 / G3): same text as before; with "hide details" the push is generic.
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

commit;
