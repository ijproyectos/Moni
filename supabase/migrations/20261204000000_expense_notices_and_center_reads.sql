-- Avisos: «te incluyeron en un gasto compartido», preferencias extra y estado leído del centro de notificaciones Plus.
--
--   1. notifications admite el tipo 'expense_added' (sin monto, con expense_id y el nombre del gasto en subject). Un trigger sobre
--      shared_expense_splits crea UN aviso por persona incluida que NO creó el gasto. Un índice único (user_id, expense_id) evita
--      duplicados aunque el gasto se edite y sus partes se vuelvan a escribir. Los gastos de personas sin cuenta no avisan a nadie.
--      El aviso dentro de Moni siempre se crea; el push respeta las preferencias (notice_prefs_extra.expense_added_push) y «ocultar
--      detalles» (notification_prefs.hide_details), igual que el resto de los avisos de grupos.
--   2. notice_prefs_extra: preferencias nuevas, una fila por persona (RLS: solo la propia): push de gastos en los que te incluyen y qué
--      eventos muestra el centro de notificaciones de Moni Plus (pagos próximos, aumentos de precio, límites de categorías).
--   3. notice_reads: qué eventos del centro (los que se calculan con datos vivos y no tienen fila propia) leyó la persona. Los avisos de
--      grupos siguen usando notifications.read_at; ahora también se pueden marcar de a uno.
--
-- No toca gastos, partes, saldos, pagos ni permisos de grupos. Aplicar DESPUÉS de 20261203000000_ahorros.sql, con respaldo previo.
-- NO aplicada en producción.
-- Rollback: drop trigger shared_expense_splits_notice on public.shared_expense_splits; drop function private.notify_expense_split();
--   delete from public.notifications where kind = 'expense_added'; luego volver a crear las constraints sin el tipo y
--   alter table public.notifications drop column expense_id; drop table public.notice_reads, public.notice_prefs_extra;
--   y restaurar private.push_group_notice desde 20261202000000.

begin;

-- 1. The notice ---------------------------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications add column expense_id uuid references public.shared_expenses (id) on delete no action;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
  'group_archived', 'expense_added'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
            'group_archived', 'expense_added')
   and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due',
                   'group_archived', 'expense_added')
      and amount is not null and amount > 0));
create unique index notifications_one_per_expense on public.notifications (user_id, expense_id) where kind = 'expense_added';

create or replace function private.notify_expense_split()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_expense public.shared_expenses%rowtype;
  v_group text;
begin
  select * into v_expense from public.shared_expenses e where e.id = new.expense_id;
  if not found or v_expense.status <> 'posted' or new.user_id = v_expense.created_by then
    return new;
  end if;
  -- Editing an expense creates its replacement and voids the old one in the same transaction: whoever was already included in the
  -- old one is not told again.
  if exists (
    select 1
    from public.shared_expenses o
    join public.shared_expense_splits os on os.expense_id = o.id
    where o.group_id = v_expense.group_id and o.id <> v_expense.id and o.status = 'voided'
      and o.voided_at = now() and os.user_id = new.user_id
  ) then
    return new;
  end if;
  select g.name into v_group from public.groups g where g.id = v_expense.group_id;
  insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, expense_id, subject)
  values (new.user_id, 'expense_added', v_expense.group_id, v_group, v_expense.created_by,
          public.display_name_of(v_expense.created_by), v_expense.id, left(btrim(v_expense.description), 60))
  on conflict (user_id, expense_id) where kind = 'expense_added' do nothing;
  return new;
end;
$$;

revoke all on function private.notify_expense_split() from public, anon, authenticated;
drop trigger if exists shared_expense_splits_notice on public.shared_expense_splits;
create trigger shared_expense_splits_notice
after insert on public.shared_expense_splits
for each row execute function private.notify_expense_split();

-- 2. Extra preferences --------------------------------------------------------------------------------------------------------------
create table public.notice_prefs_extra (
  user_id uuid primary key references auth.users (id) on delete cascade,
  expense_added_push boolean not null default true,
  center_payments_due boolean not null default true,
  center_price_changes boolean not null default true,
  center_budgets boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.notice_prefs_extra enable row level security;
revoke all on table public.notice_prefs_extra from anon, authenticated;
grant select on table public.notice_prefs_extra to authenticated;
create policy "notice_prefs_extra_select_own" on public.notice_prefs_extra
for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.get_my_notice_prefs_extra()
returns table (expense_added_push boolean, center_payments_due boolean, center_price_changes boolean, center_budgets boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.expense_added_push, true), coalesce(p.center_payments_due, true),
         coalesce(p.center_price_changes, true), coalesce(p.center_budgets, true)
  from (select 1) x left join public.notice_prefs_extra p on p.user_id = (select auth.uid())
$$;

create or replace function public.set_notice_prefs_extra(
  p_expense_added_push boolean,
  p_center_payments_due boolean,
  p_center_price_changes boolean,
  p_center_budgets boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.notice_prefs_extra (user_id, expense_added_push, center_payments_due, center_price_changes, center_budgets)
  values (v_user, coalesce(p_expense_added_push, true), coalesce(p_center_payments_due, true),
          coalesce(p_center_price_changes, true), coalesce(p_center_budgets, true))
  on conflict (user_id) do update
    set expense_added_push = excluded.expense_added_push, center_payments_due = excluded.center_payments_due,
        center_price_changes = excluded.center_price_changes, center_budgets = excluded.center_budgets, updated_at = now();
end;
$$;

revoke execute on function public.get_my_notice_prefs_extra(), public.set_notice_prefs_extra(boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.get_my_notice_prefs_extra(), public.set_notice_prefs_extra(boolean, boolean, boolean, boolean) to authenticated;

-- 3. Read state of the center ------------------------------------------------------------------------------------------------------------
create table public.notice_reads (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  read_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.notice_reads enable row level security;
revoke all on table public.notice_reads from anon, authenticated;
grant select on table public.notice_reads to authenticated;
create policy "notice_reads_select_own" on public.notice_reads
for select to authenticated using (user_id = (select auth.uid()));

-- One call marks one or many events as read (idempotent: marking twice changes nothing).
create or replace function public.mark_center_notices_read(p_keys text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(array_length(p_keys, 1), 0) > 200 then
    raise exception 'too_many_keys' using errcode = '22023';
  end if;
  insert into public.notice_reads (user_id, key)
  select v_user, left(btrim(k), 120) from unnest(p_keys) k where btrim(k) <> ''
  on conflict (user_id, key) do nothing;
end;
$$;
revoke execute on function public.mark_center_notices_read(text[]) from public, anon;
grant execute on function public.mark_center_notices_read(text[]) to authenticated;

-- 4. Push: the new notice, with its own preference -------------------------------------------------------------------------------------------
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
        'url', case when new.kind = 'recurring_due' then '/grupos/' || new.group_id::text || '/recurrentes'
                    when new.kind = 'expense_added' then '/grupos/' || new.group_id::text
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

drop trigger if exists notifications_push_group_notice on public.notifications;
create trigger notifications_push_group_notice
after insert on public.notifications
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due', 'group_archived', 'expense_added'))
execute function private.push_group_notice();

commit;
