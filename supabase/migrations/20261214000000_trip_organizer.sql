-- Viajes · organizador financiero: destino, moneda y origen de fondos, presupuesto opcional, categorías del viaje, reservas (pasajes,
-- alojamiento y otras) con sus pagos, y gastos financiados con ahorros o «de otro lado». No modifica datos existentes: todo es aditivo
-- (los viajes actuales quedan en pesos, con su presupuesto y sin origen de fondos definido).
--
-- Contabilidad (una sola fuente por importe, así nada se cuenta dos veces):
--   * Un PAGO de una reserva es un gasto del viaje que apunta a la reserva (booking_id). Pendiente = total - pagos registrados.
--     Cancelar o borrar una reserva no toca los pagos: lo pagado sigue siendo un gasto real (un pago se anula con su gasto).
--   * Mi saldo: movimiento común (gasto en la cuenta elegida, categoría «Viajes»; con tarjeta de crédito rige la lógica de consumos).
--   * Mis ahorros: el ahorro se «retira» (ahorro_entries). Si el ahorro está reservado en esa cuenta, queda UN movimiento en la cuenta y
--     el retiro solo libera la reserva (el saldo disponible no se descuenta dos veces). Si no (dólares, o pesos sin cuenta), el gasto queda
--     solo en el viaje (trip_side_expenses) y en Ahorros. Anular uno anula el otro (disparador).
--   * De otro lado: solo trip_side_expenses; no toca saldos, ahorros ni medios de pago.
--   * Reservas de un viaje compartido: «solo para mí» (solo su dueño las ve) o «compartida» (los integrantes ven costo, pagado y pendiente;
--     nunca ahorros, saldos ni medios de pago). Sus pagos son gastos compartidos existentes (shared_expenses.booking_id).
--
-- Aplicar DESPUÉS de 20261213000000, con respaldo previo. NO aplicada en producción.
-- Rollback: drop trigger/funciones de abajo; drop table private... ; alter table ... drop column (ver cada bloque).

begin;

-- 1. Trips ----------------------------------------------------------------------------------------------------------------------
alter table public.trips
  add column destination text check (destination is null or char_length(btrim(destination)) between 1 and 80),
  add column currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  add column fund_source text check (fund_source in ('balance', 'savings', 'external')),
  add column fund_account_id uuid references public.accounts (id) on delete set null,
  add column fund_ahorro_currency text check (fund_ahorro_currency in ('ARS', 'USD')),
  alter column budget drop not null;
alter table public.trips drop constraint trips_budget_check;
alter table public.trips add constraint trips_budget_check check (budget is null or budget > 0);
grant insert (destination, currency, fund_source, fund_account_id, fund_ahorro_currency) on table public.trips to authenticated;
grant update (destination, currency, fund_source, fund_account_id, fund_ahorro_currency) on table public.trips to authenticated;

alter table public.group_trips
  add column destination text check (destination is null or char_length(btrim(destination)) between 1 and 80),
  add column currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  alter column budget drop not null;
alter table public.group_trips drop constraint group_trips_budget_check;
alter table public.group_trips add constraint group_trips_budget_check check (budget is null or budget > 0);

drop function public.set_group_trip(uuid, date, date, numeric);
create or replace function public.set_group_trip(
  p_group uuid,
  p_starts_on date,
  p_ends_on date,
  p_budget numeric,
  p_destination text default null,
  p_currency text default 'ARS'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_archived timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if not public.is_group_member(p_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.group_members m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group and m.user_id = v_user and m.left_at is null
      and (m.role = 'owner' or g.created_by = v_user)
  ) then
    raise exception 'not_group_owner' using errcode = '42501';
  end if;
  select g.archived_at into v_archived from public.groups g where g.id = p_group for update;
  if v_archived is not null then
    raise exception 'group_archived' using errcode = '42501';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception 'invalid_trip_dates' using errcode = '22023';
  end if;
  if p_currency is null or p_currency not in ('ARS', 'USD') then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  insert into public.group_trips (group_id, starts_on, ends_on, budget, updated_by, destination, currency)
  values (p_group, p_starts_on, p_ends_on, case when p_budget is null or p_budget <= 0 then null else round(p_budget, 2) end,
          v_user, nullif(btrim(p_destination), ''), p_currency)
  on conflict (group_id) do update
    set starts_on = excluded.starts_on, ends_on = excluded.ends_on, budget = excluded.budget,
        updated_by = excluded.updated_by, destination = excluded.destination, currency = excluded.currency;
end;
$$;
revoke execute on function public.set_group_trip(uuid, date, date, numeric, text, text) from public, anon;
grant execute on function public.set_group_trip(uuid, date, date, numeric, text, text) to authenticated;

-- 2. Each member's PRIVATE default for a group trip (only its owner reads or writes it) ------------------------------------------
create table public.trip_member_prefs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  fund_source text not null check (fund_source in ('balance', 'savings', 'external')),
  fund_account_id uuid references public.accounts (id) on delete set null,
  fund_ahorro_currency text check (fund_ahorro_currency in ('ARS', 'USD')),
  updated_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
alter table public.trip_member_prefs enable row level security;
revoke all on table public.trip_member_prefs from anon, authenticated;
grant select, insert, update, delete on table public.trip_member_prefs to authenticated;
create policy "trip_member_prefs_own" on public.trip_member_prefs
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and public.is_group_member(group_id));

-- 3. Custom categories of the trip (the nine predefined ones live in the app) -----------------------------------------------------
create table public.trip_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  icon text not null default 'Tag',
  created_at timestamptz not null default now()
);
create unique index trip_categories_owner_name_key on public.trip_categories (owner_id, lower(btrim(name)));
alter table public.trip_categories enable row level security;
revoke all on table public.trip_categories from anon, authenticated;
grant select, insert, update, delete on table public.trip_categories to authenticated;
create policy "trip_categories_own" on public.trip_categories
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- 4. Bookings ----------------------------------------------------------------------------------------------------------------------
create table public.trip_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  trip_id uuid,
  group_id uuid references public.groups (id) on delete no action,
  scope text not null default 'personal' check (scope in ('personal', 'shared')),
  kind text not null check (kind in ('transport', 'lodging', 'other')),
  subtype text check (subtype is null or char_length(subtype) <= 30),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  origin text check (origin is null or char_length(origin) <= 80),
  destination text check (destination is null or char_length(destination) <= 80),
  address text check (address is null or char_length(address) <= 160),
  starts_on date,
  ends_on date,
  total numeric(14,2) not null check (total > 0 and total < 1000000000000),
  currency text not null default 'ARS' check (currency in ('ARS', 'USD')),
  pay_deadline date,
  notes text check (notes is null or char_length(notes) <= 400),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (trip_id, owner_id) references public.trips (id, owner_id) on delete no action,
  unique (id, owner_id),
  check ((trip_id is null) <> (group_id is null)),
  check (scope = 'personal' or group_id is not null),
  check (starts_on is null or ends_on is null or ends_on >= starts_on),
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index trip_bookings_trip_idx on public.trip_bookings (trip_id) where trip_id is not null;
create index trip_bookings_group_idx on public.trip_bookings (group_id) where group_id is not null;
create trigger trip_bookings_set_updated_at before update on public.trip_bookings
for each row execute function public.set_updated_at();

create table public.trip_booking_participants (
  booking_id uuid not null references public.trip_bookings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete no action,
  primary key (booking_id, user_id)
);

alter table public.trip_bookings enable row level security;
alter table public.trip_booking_participants enable row level security;
revoke all on table public.trip_bookings, public.trip_booking_participants from anon, authenticated;
grant select on table public.trip_bookings, public.trip_booking_participants to authenticated;
grant insert (trip_id, group_id, scope, kind, subtype, title, origin, destination, address, starts_on, ends_on, total, currency, pay_deadline, notes)
  on table public.trip_bookings to authenticated;
grant update (scope, kind, subtype, title, origin, destination, address, starts_on, ends_on, total, currency, pay_deadline, notes, status, cancelled_at)
  on table public.trip_bookings to authenticated;
grant delete on table public.trip_bookings to authenticated;
grant insert, delete on table public.trip_booking_participants to authenticated;

create policy "trip_bookings_select" on public.trip_bookings for select to authenticated
using (owner_id = (select auth.uid()) or (scope = 'shared' and public.is_group_member(group_id)));
create policy "trip_bookings_insert" on public.trip_bookings for insert to authenticated
with check (owner_id = (select auth.uid()) and (group_id is null or public.is_group_member(group_id)));
create policy "trip_bookings_update" on public.trip_bookings for update to authenticated
using (owner_id = (select auth.uid()) or (scope = 'shared' and public.is_group_owner(group_id)))
with check (owner_id = (select auth.uid()) or (scope = 'shared' and public.is_group_owner(group_id)));
create policy "trip_bookings_delete" on public.trip_bookings for delete to authenticated
using (owner_id = (select auth.uid()) or (scope = 'shared' and public.is_group_owner(group_id)));
create policy "trip_booking_participants_select" on public.trip_booking_participants for select to authenticated
using (exists (select 1 from public.trip_bookings b where b.id = booking_id)); -- trip_bookings' own policy decides who sees it
create policy "trip_booking_participants_insert" on public.trip_booking_participants for insert to authenticated
with check (exists (select 1 from public.trip_bookings b where b.id = booking_id and b.owner_id = (select auth.uid()) and b.scope = 'shared'
  and public.is_group_member(b.group_id)
  and exists (select 1 from public.group_members m where m.group_id = b.group_id and m.user_id = trip_booking_participants.user_id and m.left_at is null)));
create policy "trip_booking_participants_delete" on public.trip_booking_participants for delete to authenticated
using (exists (select 1 from public.trip_bookings b where b.id = booking_id and b.owner_id = (select auth.uid())));

-- 5. Side expenses: part of a personal trip but with no movement in the person's accounts ---------------------------------------
create table public.trip_side_expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  trip_id uuid not null,
  booking_id uuid references public.trip_bookings (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null check (currency in ('ARS', 'USD')),
  fx_rate numeric(12,4) check (fx_rate is null or fx_rate > 0),
  description text check (description is null or char_length(description) <= 200),
  occurred_on date not null,
  trip_category text,
  funding text not null check (funding in ('external', 'savings')),
  ahorro_entry_id uuid references public.ahorro_entries (id) on delete no action,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (trip_id, owner_id) references public.trips (id, owner_id) on delete no action,
  check ((status = 'voided') = (voided_at is not null)),
  check ((funding = 'savings') = (ahorro_entry_id is not null))
);
create index trip_side_expenses_trip_idx on public.trip_side_expenses (trip_id);
alter table public.trip_side_expenses enable row level security;
revoke all on table public.trip_side_expenses from anon, authenticated;
grant select on table public.trip_side_expenses to authenticated;
create policy "trip_side_expenses_select_own" on public.trip_side_expenses for select to authenticated
using (owner_id = (select auth.uid()));

-- 6. Links on movements and shared expenses ---------------------------------------------------------------------------------------
alter table public.transactions
  add column trip_category text check (trip_category is null or char_length(trip_category) <= 60),
  add column booking_id uuid,
  add column funding text check (funding is null or funding = 'savings'),
  add column ahorro_entry_id uuid references public.ahorro_entries (id) on delete no action,
  add constraint transactions_booking_fk foreign key (booking_id, owner_id) references public.trip_bookings (id, owner_id) on delete no action,
  add constraint transactions_booking_trip_check check (booking_id is null or kind = 'expense');
create index transactions_booking_idx on public.transactions (booking_id) where booking_id is not null;
grant insert (trip_category, booking_id) on table public.transactions to authenticated;
grant update (trip_category, booking_id) on table public.transactions to authenticated;

alter table public.shared_expenses add column booking_id uuid references public.trip_bookings (id) on delete no action;
create index shared_expenses_booking_idx on public.shared_expenses (booking_id) where booking_id is not null;

-- A movement linked to a booking belongs to that booking's trip (filled in when missing, refused when it is another trip's).
create or replace function private.transactions_check_booking()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_trip uuid;
begin
  if new.booking_id is null then
    return new;
  end if;
  select b.trip_id into v_trip from public.trip_bookings b
  where b.id = new.booking_id and b.owner_id = new.owner_id and b.trip_id is not null;
  if not found then
    raise exception 'booking_not_found' using errcode = '23503';
  end if;
  if new.trip_id is null then
    new.trip_id := v_trip;
  elsif new.trip_id <> v_trip then
    raise exception 'booking_trip_mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger transactions_check_booking before insert or update of booking_id, trip_id on public.transactions
for each row execute function private.transactions_check_booking();

-- A movement paid from savings keeps its withdrawal in step: voiding one voids the other; amount and account are locked.
create or replace function private.sync_savings_funded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ahorro_entry_id is null then
    return new;
  end if;
  if new.status = 'voided' and old.status = 'posted' then
    update public.ahorro_entries set status = 'voided', voided_at = now() where id = old.ahorro_entry_id and status = 'posted';
  elsif new.status = 'posted' and (new.amount is distinct from old.amount or new.account_id is distinct from old.account_id) then
    raise exception 'savings_funded_locked' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.sync_savings_funded() from public, anon, authenticated;
create trigger transactions_sync_savings before update on public.transactions
for each row when (old.ahorro_entry_id is not null) execute function private.sync_savings_funded();

-- A booking with payments cannot be deleted (it is cancelled instead); a booking's payments are the expenses that point to it.
create or replace function private.booking_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.transactions t where t.booking_id = old.id and t.status = 'posted')
     or exists (select 1 from public.trip_side_expenses s where s.booking_id = old.id and s.status = 'posted')
     or exists (select 1 from public.shared_expenses e where e.booking_id = old.id and e.status = 'posted') then
    raise exception 'booking_has_payments' using errcode = '23514';
  end if;
  -- Voided payments no longer count: unlink them so the booking can go.
  update public.transactions set booking_id = null where booking_id = old.id;
  update public.trip_side_expenses set booking_id = null where booking_id = old.id;
  update public.shared_expenses set booking_id = null where booking_id = old.id;
  return old;
end;
$$;
revoke all on function private.booking_delete_guard() from public, anon, authenticated;
create trigger trip_bookings_delete_guard before delete on public.trip_bookings
for each row execute function private.booking_delete_guard();

-- 7. Writes -----------------------------------------------------------------------------------------------------------------------
create or replace function private.trip_category_id(p_owner uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id from public.categories c
  where c.owner_id = p_owner and c.kind = 'expense' and lower(c.name) = 'viajes' and c.archived_at is null
  order by c.created_at limit 1;
  if v_id is null then
    insert into public.categories (owner_id, kind, name, icon, color) values (p_owner, 'expense', 'Viajes', 'Send', '#1F9FC4')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function private.trip_category_id(uuid) from public, anon, authenticated;

-- One expense of a personal trip, from the chosen origin of the money (see the header). Returns what was created.
create or replace function public.add_trip_expense(
  p_trip uuid,
  p_amount numeric,
  p_currency text,
  p_fx_rate numeric default null,
  p_description text default null,
  p_on date default null,
  p_category text default null,
  p_funding text default 'balance',
  p_account uuid default null,
  p_ahorro_currency text default null,
  p_booking uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
  v_on date := coalesce(p_on, public.subscription_today());
  v_note text := nullif(btrim(p_description), '');
  v_ars numeric;
  v_entry uuid;
  v_tx uuid;
  v_side uuid;
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = v_owner) then
    raise exception 'trip_not_found' using errcode = '23503';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if p_currency is null or p_currency not in ('ARS', 'USD') then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;
  if p_funding is null or p_funding not in ('balance', 'savings', 'external') then
    raise exception 'invalid_funding' using errcode = '22023';
  end if;
  if p_booking is not null and not exists (
    select 1 from public.trip_bookings b where b.id = p_booking and b.owner_id = v_owner and b.trip_id = p_trip and b.status = 'active'
  ) then
    raise exception 'booking_not_found' using errcode = '23503';
  end if;
  if p_currency = 'USD' and (p_fx_rate is null or p_fx_rate <= 0) and (p_funding = 'balance' or (p_funding = 'savings' and p_account is not null)) then
    raise exception 'fx_rate_required' using errcode = '22023';
  end if;
  v_ars := case when p_currency = 'USD' then round(p_amount * p_fx_rate, 2) else round(p_amount, 2) end;

  if p_funding = 'balance' then
    if p_account is null then
      raise exception 'account_required' using errcode = '22023';
    end if;
    insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note, trip_id, trip_category, booking_id,
                                     original_amount, original_currency, fx_rate)
    values (v_owner, p_account, private.trip_category_id(v_owner), 'expense', v_ars, v_on, v_note, p_trip, p_category, p_booking,
            case when p_currency = 'USD' then round(p_amount, 2) end, case when p_currency = 'USD' then 'USD' end,
            case when p_currency = 'USD' then p_fx_rate end)
    returning id into v_tx;
  elsif p_funding = 'savings' then
    if p_ahorro_currency is distinct from p_currency then
      raise exception 'ahorro_currency_mismatch' using errcode = '22023';
    end if;
    if p_currency = 'ARS' and p_account is not null and public.ahorro_account_reserved(p_account) >= round(p_amount, 2) then
      v_entry := public.create_ahorro_entry('ARS', 'withdrawal', p_amount, v_on, coalesce(v_note, 'Gasto de viaje'), p_account, null);
      insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note, trip_id, trip_category, booking_id,
                                       funding, ahorro_entry_id)
      values (v_owner, p_account, private.trip_category_id(v_owner), 'expense', v_ars, v_on, v_note, p_trip, p_category, p_booking,
              'savings', v_entry)
      returning id into v_tx;
    else
      v_entry := public.create_ahorro_entry(p_currency, 'withdrawal', p_amount, v_on, coalesce(v_note, 'Gasto de viaje'), null, null);
      insert into public.trip_side_expenses (owner_id, trip_id, booking_id, amount, currency, fx_rate, description, occurred_on, trip_category,
                                             funding, ahorro_entry_id)
      values (v_owner, p_trip, p_booking, round(p_amount, 2), p_currency, p_fx_rate, v_note, v_on, p_category, 'savings', v_entry)
      returning id into v_side;
    end if;
  else
    insert into public.trip_side_expenses (owner_id, trip_id, booking_id, amount, currency, fx_rate, description, occurred_on, trip_category, funding)
    values (v_owner, p_trip, p_booking, round(p_amount, 2), p_currency, p_fx_rate, v_note, v_on, p_category, 'external')
    returning id into v_side;
  end if;
  return jsonb_build_object('transaction_id', v_tx, 'side_expense_id', v_side, 'ahorro_entry_id', v_entry);
end;
$$;
revoke execute on function public.add_trip_expense(uuid, numeric, text, numeric, text, date, text, text, uuid, text, uuid) from public, anon;
grant execute on function public.add_trip_expense(uuid, numeric, text, numeric, text, date, text, text, uuid, text, uuid) to authenticated;

create or replace function public.void_trip_side_expense(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.trip_side_expenses%rowtype;
begin
  select * into e from public.trip_side_expenses where id = p_id and owner_id = (select auth.uid()) for update;
  if not found then
    raise exception 'expense_not_found' using errcode = '23503';
  end if;
  if e.status <> 'posted' then
    return;
  end if;
  update public.trip_side_expenses set status = 'voided', voided_at = now() where id = p_id;
  if e.ahorro_entry_id is not null then
    update public.ahorro_entries set status = 'voided', voided_at = now() where id = e.ahorro_entry_id and status = 'posted';
  end if;
end;
$$;
revoke execute on function public.void_trip_side_expense(uuid) from public, anon;
grant execute on function public.void_trip_side_expense(uuid) to authenticated;

-- Shared trips: a shared expense becomes a payment of a shared booking (member of the group; the booking belongs to that group).
create or replace function public.link_shared_expense_booking(p_expense uuid, p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group uuid;
  v_created uuid;
  v_paid uuid;
begin
  select e.group_id, e.created_by, e.paid_by into v_group, v_created, v_paid from public.shared_expenses e where e.id = p_expense;
  if not found or v_user is null or not public.is_group_member(v_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  if v_user <> v_created and v_user <> v_paid then
    raise exception 'not_expense_owner' using errcode = '42501';
  end if;
  if p_booking is not null and not exists (
    select 1 from public.trip_bookings b where b.id = p_booking and b.group_id = v_group and b.scope = 'shared' and b.status = 'active'
  ) then
    raise exception 'booking_not_found' using errcode = '23503';
  end if;
  update public.shared_expenses set booking_id = p_booking where id = p_expense;
end;
$$;
revoke execute on function public.link_shared_expense_booking(uuid, uuid) from public, anon;
grant execute on function public.link_shared_expense_booking(uuid, uuid) to authenticated;

-- What each shared booking has collected so far (everybody in the group sees the totals, never who funds what).
create or replace function public.get_group_booking_paid(p_group uuid)
returns table (booking_id uuid, paid numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select e.booking_id, coalesce(sum(e.amount), 0)
  from public.shared_expenses e
  where e.group_id = p_group and e.booking_id is not null and e.status = 'posted' and public.is_group_member(p_group)
  group by e.booking_id;
$$;
revoke execute on function public.get_group_booking_paid(uuid) from public, anon;
grant execute on function public.get_group_booking_paid(uuid) to authenticated;

commit;
