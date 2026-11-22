-- G5 · Grupos: guardar el nombre del grupo en el servidor y gastos recurrentes compartidos de Hogar (confirmación de un toque).
--
-- 1. update_group_name: solo administradores; el nombre queda en groups.name (lo ven todos los integrantes y sobrevive a recargar).
-- 2. Gastos recurrentes de Hogar (alquiler, expensas, luz, gas, agua, internet…), con su configuración guardada en Supabase:
--      group_recurring_expenses (qué, cuánto, cada cuánto, quién paga, cómo se divide), group_recurring_participants (entre quiénes)
--      y group_recurring_occurrences (un renglón por PERÍODO: pendiente, registrada u omitida).
--    Moni NO registra nada sola: al llegar el período se crea una ocurrencia PENDIENTE y se avisa a quien paga; recién cuando una
--    persona la confirma (confirm_group_recurring_occurrence) se crea el gasto compartido, llamando a la MISMA función de siempre
--    (create_shared_expense): el reparto, los saldos y las deudas son los existentes. Hasta entonces no hay deuda alguna.
--    Gastos variables (luz, gas, agua): el importe del período se puede cambiar al confirmar, sin tocar nada anterior.
--    Reparto: el de la función existente, partes iguales o porcentajes (los importes fijos por persona no existen en esa lógica:
--    quedan como pendiente, usando porcentajes).
-- 3. Sin duplicados: una ocurrencia por recurrencia y período (restricción única), la confirmación bloquea la fila y es
--    idempotente (confirmar dos veces devuelve el mismo gasto) y cada gasto queda vinculado a una sola ocurrencia (índice único).
-- 4. Avisos: kind 'recurring_due' en notifications (uno por ocurrencia), con push que respeta «ocultar detalles».
--
-- Permisos (validados acá, no solo en la app): crear, editar, pausar y eliminar → administradores; confirmar u omitir → quien paga o un
-- administrador; ver → integrantes. Grupos archivados: nada se puede escribir. Grupos ocultos: siguen funcionando igual.
-- Editar o pausar una recurrencia no modifica los gastos ya registrados.
--
-- Requiere G1–G4. Aplicar junto con la publicación del front nuevo.
-- Rollback: supabase/ops/group_recurring_expenses_rollback.sql

begin;

-- 1. Group name ---------------------------------------------------------------------------------------------------------------------
create or replace function public.update_group_name(p_group uuid, p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  perform public.lock_group_for_write(p_group);
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  update public.groups set name = v_name where id = p_group;
end;
$$;

-- 2. Tables -------------------------------------------------------------------------------------------------------------------------
create table public.group_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  template_slug text references public.category_templates (slug) on delete no action,
  -- Estimated amount: each period can be confirmed with its own amount.
  amount numeric(14,2) not null check (amount > 0 and amount < 1000000000000),
  period text not null check (period in ('monthly', 'bimonthly', 'yearly')),
  anchor_on date not null,
  cycle int not null default 0 check (cycle >= 0),
  -- Next due date that has not become an occurrence yet.
  next_due_on date not null,
  paid_by uuid not null references auth.users (id) on delete no action,
  split_method text not null check (split_method in ('equal', 'percent')),
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  created_by uuid not null references auth.users (id) on delete no action,
  request_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, group_id),
  check (next_due_on = public.fixed_expense_due_on(anchor_on, period, cycle))
);
create unique index group_recurring_request_key on public.group_recurring_expenses (group_id, request_key)
  where request_key is not null;
create index group_recurring_group_idx on public.group_recurring_expenses (group_id, status);
create index group_recurring_due_idx on public.group_recurring_expenses (status, next_due_on);

create table public.group_recurring_participants (
  recurring_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references auth.users (id) on delete no action,
  percent numeric(5,2) check (percent is null or (percent > 0 and percent <= 100)),
  primary key (recurring_id, user_id),
  foreign key (recurring_id, group_id) references public.group_recurring_expenses (id, group_id) on delete no action
);

create table public.group_recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  recurring_id uuid not null,
  group_id uuid not null,
  -- The first day of the month of the due date: one occurrence per recurrence and PERIOD, even if the schedule is edited.
  period_key date not null,
  due_on date not null,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'registered', 'skipped')),
  expense_id uuid references public.shared_expenses (id) on delete no action,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete no action,
  foreign key (recurring_id, group_id) references public.group_recurring_expenses (id, group_id) on delete no action,
  unique (recurring_id, period_key),
  check ((status = 'registered') = (expense_id is not null)),
  check ((status = 'pending') = (resolved_at is null))
);
-- A shared expense belongs to at most one occurrence.
create unique index group_recurring_occurrence_expense on public.group_recurring_occurrences (expense_id)
  where expense_id is not null;
create index group_recurring_occurrence_group_idx on public.group_recurring_occurrences (group_id, status, due_on desc);

alter table public.group_recurring_expenses enable row level security;
alter table public.group_recurring_participants enable row level security;
alter table public.group_recurring_occurrences enable row level security;
revoke all on table public.group_recurring_expenses, public.group_recurring_participants, public.group_recurring_occurrences
  from anon, authenticated;
grant select on table public.group_recurring_expenses, public.group_recurring_participants, public.group_recurring_occurrences
  to authenticated;
create policy "group_recurring_select_member" on public.group_recurring_expenses
for select to authenticated using (public.is_group_member(group_id));
create policy "group_recurring_participants_select_member" on public.group_recurring_participants
for select to authenticated using (public.is_group_member(group_id));
create policy "group_recurring_occurrences_select_member" on public.group_recurring_occurrences
for select to authenticated using (public.is_group_member(group_id));

create trigger group_recurring_set_updated_at
before update on public.group_recurring_expenses
for each row execute function public.set_updated_at();

-- Notices ------------------------------------------------------------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications drop constraint notifications_amount_check;
alter table public.notifications add column occurrence_id uuid references public.group_recurring_occurrences (id) on delete no action;
alter table public.notifications add column subject text check (subject is null or char_length(subject) <= 60);
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'debt_reminder', 'payment_reported', 'payment_confirmed', 'payment_rejected',
  'join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due'));
alter table public.notifications add constraint notifications_amount_check check (
  (kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due')
   and amount is null)
  or (kind not in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due')
      and amount is not null and amount > 0));
-- One notice per occurrence: it can never be announced twice.
create unique index notifications_one_per_occurrence on public.notifications (occurrence_id) where kind = 'recurring_due';

-- Helpers (internal) --------------------------------------------------------------------------------------------------------------------
create or replace function private.today_ar()
returns date
language sql
stable
set search_path = pg_catalog, pg_temp
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- First cycle whose due date is not older than a month (a period that just passed still shows up; very old ones do not).
create or replace function private.first_recurring_cycle(p_anchor date, p_period text, p_today date)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_cycle int := 0;
begin
  while public.fixed_expense_due_on(p_anchor, p_period, v_cycle) < p_today - 31 and v_cycle < 1200 loop
    v_cycle := v_cycle + 1;
  end loop;
  return v_cycle;
end;
$$;

-- Validates a recurrence definition (shared by create and update). Raises the same errors as create_shared_expense.
create or replace function private.check_group_recurring(
  p_group uuid, p_name text, p_template_slug text, p_amount numeric, p_period text, p_paid_by uuid,
  p_split_method text, p_participants uuid[], p_percents numeric[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_n int := coalesce(cardinality(p_participants), 0);
begin
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 60 then
    raise exception 'invalid_description' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_period is null or p_period not in ('monthly', 'bimonthly', 'yearly') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if p_template_slug is not null and not exists (
    select 1 from public.category_templates t where t.slug = p_template_slug and t.kind = 'expense'
  ) then
    raise exception 'template_not_found' using errcode = '23503';
  end if;
  if p_split_method is null or p_split_method not in ('equal', 'percent') then
    raise exception 'invalid_split_method' using errcode = '22023';
  end if;
  if v_n < 1 or v_n > 50
     or exists (select 1 from unnest(p_participants) u where u is null)
     or (select count(distinct u) from unnest(p_participants) u) <> v_n then
    raise exception 'invalid_participants' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.group_members m where m.group_id = p_group and m.user_id = p_paid_by and m.left_at is null
  ) then
    raise exception 'payer_not_member' using errcode = '22023';
  end if;
  if (select count(*) from public.group_members m
      where m.group_id = p_group and m.left_at is null and m.user_id = any (p_participants)) <> v_n then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;
  if p_split_method = 'percent' then
    if p_percents is null or cardinality(p_percents) <> v_n
       or exists (select 1 from unnest(p_percents) p where p is null or p <= 0 or p > 100 or p <> round(p, 2)) then
      raise exception 'invalid_percent' using errcode = '22023';
    end if;
    if (select sum(p) from unnest(p_percents) p) <> 100 then
      raise exception 'percents_must_sum_100' using errcode = '22023';
    end if;
  end if;
end;
$$;
revoke execute on function private.check_group_recurring(uuid, text, text, numeric, text, uuid, text, uuid[], numeric[])
  from public, anon, authenticated;

-- Create / edit / pause / remove (administrators) --------------------------------------------------------------------------------------
create or replace function public.create_group_recurring(
  p_group uuid, p_name text, p_template_slug text, p_amount numeric, p_period text, p_anchor_on date, p_paid_by uuid,
  p_split_method text, p_participants uuid[], p_percents numeric[] default null, p_request_key uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_cycle int;
  v_today date := private.today_ar();
begin
  perform public.lock_group_for_write(p_group);
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if not exists (select 1 from public.groups g where g.id = p_group and g.kind in ('hogar', 'casa')) then
    raise exception 'not_a_home_group' using errcode = '22023';
  end if;
  -- The same request (double tap, retry after a lost connection) returns the same recurrence.
  if p_request_key is not null then
    select r.id into v_id from public.group_recurring_expenses r where r.group_id = p_group and r.request_key = p_request_key;
    if found then
      return v_id;
    end if;
  end if;
  if p_anchor_on is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  perform private.check_group_recurring(p_group, p_name, p_template_slug, p_amount, p_period, p_paid_by,
                                        p_split_method, p_participants, p_percents);
  if (select count(*) from public.group_recurring_expenses r where r.group_id = p_group and r.status <> 'removed') >= 30 then
    raise exception 'recurring_limit' using errcode = '54000';
  end if;

  v_cycle := private.first_recurring_cycle(p_anchor_on, p_period, v_today);
  insert into public.group_recurring_expenses
    (group_id, name, template_slug, amount, period, anchor_on, cycle, next_due_on, paid_by, split_method, created_by, request_key)
  values
    (p_group, btrim(p_name), p_template_slug, p_amount, p_period, p_anchor_on, v_cycle,
     public.fixed_expense_due_on(p_anchor_on, p_period, v_cycle), p_paid_by, p_split_method, v_user, p_request_key)
  returning id into v_id;

  insert into public.group_recurring_participants (recurring_id, group_id, user_id, percent)
  select v_id, p_group, u.id, case when p_split_method = 'percent' then p.pct end
  from unnest(p_participants) with ordinality as u(id, i)
  left join unnest(coalesce(p_percents, array[]::numeric[])) with ordinality as p(pct, i) on p.i = u.i;
  return v_id;
end;
$$;

-- Edits the DEFINITION: from now on. Registered expenses and already created occurrences are not touched.
create or replace function public.update_group_recurring(
  p_id uuid, p_name text, p_template_slug text, p_amount numeric, p_period text, p_anchor_on date, p_paid_by uuid,
  p_split_method text, p_participants uuid[], p_percents numeric[] default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_status text;
  v_cycle int;
begin
  select r.group_id, r.status into v_group, v_status from public.group_recurring_expenses r where r.id = p_id;
  if not found or not public.is_group_member(v_group) then
    raise exception 'recurring_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  if not public.is_group_owner(v_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if v_status = 'removed' then
    raise exception 'recurring_removed' using errcode = '23514';
  end if;
  if p_anchor_on is null then
    raise exception 'invalid_date' using errcode = '22023';
  end if;
  perform private.check_group_recurring(v_group, p_name, p_template_slug, p_amount, p_period, p_paid_by,
                                        p_split_method, p_participants, p_percents);
  v_cycle := private.first_recurring_cycle(p_anchor_on, p_period, private.today_ar());
  update public.group_recurring_expenses
  set name = btrim(p_name), template_slug = p_template_slug, amount = p_amount, period = p_period, anchor_on = p_anchor_on,
      cycle = v_cycle, next_due_on = public.fixed_expense_due_on(p_anchor_on, p_period, v_cycle), paid_by = p_paid_by,
      split_method = p_split_method
  where id = p_id;
  delete from public.group_recurring_participants where recurring_id = p_id;
  insert into public.group_recurring_participants (recurring_id, group_id, user_id, percent)
  select p_id, v_group, u.id, case when p_split_method = 'percent' then p.pct end
  from unnest(p_participants) with ordinality as u(id, i)
  left join unnest(coalesce(p_percents, array[]::numeric[])) with ordinality as p(pct, i) on p.i = u.i;
end;
$$;

-- Pause (stops creating periods), resume, or remove. Registered expenses are always kept; pending periods of a removed
-- recurrence are marked as skipped (no expense is created or deleted).
create or replace function public.set_group_recurring_status(p_id uuid, p_status text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_old text;
  v_r public.group_recurring_expenses%rowtype;
  v_cycle int;
begin
  if p_status is null or p_status not in ('active', 'paused', 'removed') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select r.* into v_r from public.group_recurring_expenses r where r.id = p_id;
  if not found or not public.is_group_member(v_r.group_id) then
    raise exception 'recurring_not_found' using errcode = 'P0002';
  end if;
  v_group := v_r.group_id;
  v_old := v_r.status;
  perform public.lock_group_for_write(v_group);
  if not public.is_group_owner(v_group) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if v_old = 'removed' then
    raise exception 'recurring_removed' using errcode = '23514';
  end if;
  if p_status = 'active' and v_old = 'paused' then
    -- The periods that passed while it was paused are not created afterwards.
    v_cycle := private.first_recurring_cycle(v_r.anchor_on, v_r.period, private.today_ar());
    update public.group_recurring_expenses
    set status = 'active', cycle = greatest(cycle, v_cycle),
        next_due_on = public.fixed_expense_due_on(anchor_on, period, greatest(cycle, v_cycle))
    where id = p_id;
  else
    update public.group_recurring_expenses set status = p_status where id = p_id;
  end if;
  if p_status = 'removed' then
    update public.group_recurring_occurrences
    set status = 'skipped', resolved_at = now(), resolved_by = auth.uid()
    where recurring_id = p_id and status = 'pending';
  end if;
end;
$$;

-- Periods ------------------------------------------------------------------------------------------------------------------------------
-- Creates the pending occurrences that are due (never an expense) and tells who pays, once per occurrence. Idempotent.
create or replace function private.process_group_recurring_core(p_group uuid, p_today date)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.group_recurring_expenses%rowtype;
  v_created int := 0;
  v_steps int;
  v_occ uuid;
  v_name text;
  v_to uuid;
begin
  select g.name into v_name from public.groups g where g.id = p_group and g.archived_at is null;
  if not found then
    return 0;
  end if;
  for v_r in
    select * from public.group_recurring_expenses r
    where r.group_id = p_group and r.status = 'active' and r.next_due_on <= p_today
    for update
  loop
    -- Periods older than two months are not created afterwards (nobody is asked about last year's rent); the recent ones all are,
    -- so running this again, from the screen or from the daily schedule, finds nothing left to do.
    while v_r.next_due_on < p_today - 62 and v_r.cycle < 1200 loop
      v_r.cycle := v_r.cycle + 1;
      v_r.next_due_on := public.fixed_expense_due_on(v_r.anchor_on, v_r.period, v_r.cycle);
    end loop;
    v_steps := 0;
    while v_r.next_due_on <= p_today and v_steps < 6 loop
      v_occ := null;
      insert into public.group_recurring_occurrences (recurring_id, group_id, period_key, due_on, amount)
      values (v_r.id, p_group, date_trunc('month', v_r.next_due_on)::date, v_r.next_due_on, v_r.amount)
      on conflict (recurring_id, period_key) do nothing
      returning id into v_occ;
      if v_occ is not null then
        v_created := v_created + 1;
        -- Who is told: the person who pays (an administrator if they left).
        for v_to in
          select m.user_id from public.group_members m
          where m.group_id = p_group and m.left_at is null
            and (m.user_id = v_r.paid_by
                 or (m.role = 'owner' and not exists (
                       select 1 from public.group_members x where x.group_id = p_group and x.user_id = v_r.paid_by and x.left_at is null)))
        loop
          insert into public.notifications (user_id, kind, group_id, group_name, actor_id, actor_name, occurrence_id, subject)
          values (v_to, 'recurring_due', p_group, v_name, v_to, 'Moni', v_occ, v_r.name)
          on conflict do nothing;
        end loop;
      end if;
      v_r.cycle := v_r.cycle + 1;
      v_r.next_due_on := public.fixed_expense_due_on(v_r.anchor_on, v_r.period, v_r.cycle);
      v_steps := v_steps + 1;
    end loop;
    update public.group_recurring_expenses set cycle = v_r.cycle, next_due_on = v_r.next_due_on where id = v_r.id;
  end loop;
  return v_created;
end;
$$;
revoke execute on function private.process_group_recurring_core(uuid, date) from public, anon, authenticated;

-- Called when someone opens the recurring expenses of the group.
create or replace function public.process_group_recurring(p_group uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  return private.process_group_recurring_core(p_group, private.today_ar());
end;
$$;

-- For a daily schedule (see supabase/ops/group_recurring_cron.sql; not scheduled by this migration).
create or replace function private.process_all_group_recurring()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_g uuid;
  v_total int := 0;
begin
  for v_g in
    select distinct r.group_id from public.group_recurring_expenses r where r.status = 'active' and r.next_due_on <= private.today_ar()
  loop
    v_total := v_total + private.process_group_recurring_core(v_g, private.today_ar());
  end loop;
  return v_total;
end;
$$;
revoke execute on function private.process_all_group_recurring() from public, anon, authenticated;

-- The one-tap confirmation: registers the shared expense with the EXISTING function (split, balances and debts are theirs).
create or replace function public.confirm_group_recurring_occurrence(
  p_occurrence uuid, p_amount numeric default null, p_payer_account_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_occ public.group_recurring_occurrences%rowtype;
  v_r public.group_recurring_expenses%rowtype;
  v_ids uuid[];
  v_percents numeric[];
  v_total int;
  v_expense uuid;
  v_amount numeric;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select o.* into v_occ from public.group_recurring_occurrences o where o.id = p_occurrence;
  if not found or not public.is_group_member(v_occ.group_id) then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_occ.group_id);

  -- Two taps at once, or a retry after a lost connection: the row is locked and the second one finds it registered.
  select o.* into v_occ from public.group_recurring_occurrences o where o.id = p_occurrence for update;
  if v_occ.status = 'registered' then
    return v_occ.expense_id;
  end if;
  if v_occ.status = 'skipped' then
    raise exception 'occurrence_skipped' using errcode = '23514';
  end if;
  select r.* into v_r from public.group_recurring_expenses r where r.id = v_occ.recurring_id;
  if v_r.status <> 'active' then
    raise exception 'recurring_paused' using errcode = '23514';
  end if;
  if v_user <> v_r.paid_by and not public.is_group_owner(v_occ.group_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  -- Who splits it: the people of the definition who are still in the group.
  select array_agg(p.user_id order by p.user_id), array_agg(p.percent order by p.user_id), count(*)
  into v_ids, v_percents, v_total
  from public.group_recurring_participants p
  join public.group_members m on m.group_id = p.group_id and m.user_id = p.user_id and m.left_at is null
  where p.recurring_id = v_r.id;
  if v_total is null or v_total = 0 then
    raise exception 'invalid_participants' using errcode = '22023';
  end if;
  if v_r.split_method = 'percent'
     and v_total <> (select count(*) from public.group_recurring_participants p where p.recurring_id = v_r.id) then
    -- Somebody with a percentage left: it has to be edited, not guessed.
    raise exception 'split_changed' using errcode = '23514';
  end if;

  v_amount := coalesce(p_amount, v_occ.amount);
  v_expense := public.create_shared_expense(
    v_occ.group_id, v_amount, v_r.name || ' · ' || to_char(v_occ.due_on, 'MM/YYYY'), v_r.template_slug, v_occ.due_on,
    v_r.paid_by, v_r.split_method, v_ids, case when v_r.split_method = 'percent' then v_percents end, p_payer_account_id
  );

  update public.group_recurring_occurrences
  set status = 'registered', amount = v_amount, expense_id = v_expense, resolved_at = now(), resolved_by = v_user
  where id = p_occurrence;
  return v_expense;
end;
$$;

create or replace function public.skip_group_recurring_occurrence(p_occurrence uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_occ public.group_recurring_occurrences%rowtype;
  v_payer uuid;
begin
  select o.* into v_occ from public.group_recurring_occurrences o where o.id = p_occurrence;
  if not found or not public.is_group_member(v_occ.group_id) then
    raise exception 'occurrence_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_occ.group_id);
  select r.paid_by into v_payer from public.group_recurring_expenses r where r.id = v_occ.recurring_id;
  if auth.uid() <> v_payer and not public.is_group_owner(v_occ.group_id) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.group_recurring_occurrences
  set status = 'skipped', resolved_at = now(), resolved_by = auth.uid()
  where id = p_occurrence and status = 'pending';
  if not found then
    raise exception 'occurrence_resolved' using errcode = '23514';
  end if;
end;
$$;

-- Reads (members) -----------------------------------------------------------------------------------------------------------------------
create or replace function public.get_group_recurring(p_group uuid)
returns table (
  id uuid, name text, template_slug text, amount numeric, period text, anchor_on date, next_due_on date,
  paid_by uuid, paid_by_name text, split_method text, status text, participants jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  return query
  select r.id, r.name, r.template_slug, r.amount, r.period, r.anchor_on, r.next_due_on, r.paid_by,
         public.display_name_of(r.paid_by), r.split_method, r.status,
         coalesce((select jsonb_agg(jsonb_build_object('user_id', p.user_id, 'name', public.display_name_of(p.user_id),
                                                       'percent', p.percent) order by public.display_name_of(p.user_id))
                   from public.group_recurring_participants p where p.recurring_id = r.id), '[]'::jsonb)
  from public.group_recurring_expenses r
  where r.group_id = p_group and r.status <> 'removed'
  order by r.created_at, r.id;
end;
$$;

-- Pending periods and the history (registered and skipped) of the last 12 months.
create or replace function public.get_group_recurring_occurrences(p_group uuid)
returns table (
  id uuid, recurring_id uuid, period_key date, due_on date, amount numeric, status text, expense_id uuid, resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if (select auth.uid()) is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  return query
  select o.id, o.recurring_id, o.period_key, o.due_on, o.amount, o.status, o.expense_id, o.resolved_at
  from public.group_recurring_occurrences o
  where o.group_id = p_group and (o.status = 'pending' or o.due_on > private.today_ar() - 366)
  order by o.due_on desc, o.id;
end;
$$;

-- Push: the notice of a recurring expense (same bridge; generic with "hide details") ----------------------------------------------
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
    v_body := case when new.kind = 'recurring_due' then 'Tenés un gasto recurrente para registrar' else 'Tenés un aviso de grupo en Moni' end;
  elsif new.kind = 'recurring_due' then
    v_title := '🐱 Gasto recurrente';
    v_body := 'Tenés un gasto recurrente para registrar: ' || private.clean_push_text(new.subject) || ' (' || v_group || ')';
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
        'url', case when new.kind = 'recurring_due' then '/grupos/' || new.group_id::text || '/recurrentes'
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
for each row when (new.kind in ('join_request', 'join_approved', 'join_rejected', 'group_invitation', 'invitation_accepted', 'recurring_due'))
execute function private.push_group_notice();

-- Grants -------------------------------------------------------------------------------------------------------------------------------
revoke execute on function
  public.update_group_name(uuid, text),
  public.create_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[], uuid),
  public.update_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[]),
  public.set_group_recurring_status(uuid, text), public.process_group_recurring(uuid),
  public.confirm_group_recurring_occurrence(uuid, numeric, uuid), public.skip_group_recurring_occurrence(uuid),
  public.get_group_recurring(uuid), public.get_group_recurring_occurrences(uuid)
  from public, anon;
grant execute on function
  public.update_group_name(uuid, text),
  public.create_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[], uuid),
  public.update_group_recurring(uuid, text, text, numeric, text, date, uuid, text, uuid[], numeric[]),
  public.set_group_recurring_status(uuid, text), public.process_group_recurring(uuid),
  public.confirm_group_recurring_occurrence(uuid, numeric, uuid), public.skip_group_recurring_occurrence(uuid),
  public.get_group_recurring(uuid), public.get_group_recurring_occurrences(uuid)
  to authenticated;

commit;
