-- Viajes: personal trips (real) and real dates / budget for group trips.
--
-- Until now a "Solo yo" trip lived only in memory and the dates and budget of a group trip lived in an in-memory
-- overlay (both lost on reload). This migration gives both a real home WITHOUT creating a second system for money:
--
--   * public.trips            personal trips: destination, dates and budget of ONE person (RLS: only the owner).
--   * transactions.trip_id    an ordinary expense MAY point to one of the owner's trips. Trip expenses ARE the usual
--                             movements: they show up in Actividad, change the account balance and the month totals
--                             exactly once, and are edited / voided like any other. "Spent so far" is just the sum of
--                             the posted expenses that point to the trip, so nothing is duplicated or stored twice.
--   * public.group_trips      dates and budget of a GROUP trip (one row per group, readable by its members). The group,
--                             its members, invitations, shared expenses and balances stay exactly as they are.
--
-- Rules
--   * Only plain expenses can belong to a trip (check), and only to a trip of the SAME owner (composite foreign key
--     on (trip_id, owner_id)). Nothing else about a movement changes.
--   * Trips are never deleted by the client (no DELETE grant): they are archived. Deleting a trip is therefore not
--     possible while expenses point to it, and the history of a past trip is always there.
--   * Group trips: every ACTIVE member of the group can read the dates and the budget (RLS on group_trips), but only
--     the group's creator / owner (role 'owner' in group_members, or groups.created_by) can set or change them, through
--     set_group_trip. Plain members get 'not_group_owner'. Archived groups cannot be changed. The existing roles of
--     Grupos are not touched.
--   * Linking an EXISTING expense to a trip (or unlinking it) is a plain UPDATE of transactions.trip_id: the movement
--     is not copied and its amount, account and date are not touched, so balances do not move.
--
-- Additive: no existing table loses a column, no existing function changes. The only change to an existing table is the
-- nullable transactions.trip_id (+ its grants).
--
-- Apply AFTER 20261106000000_group_invite_preview.sql.
-- Rollback (only valid while no movement points to a trip, otherwise first run
--   update public.transactions set trip_id = null where trip_id is not null):
--   drop function public.set_group_trip(uuid, date, date, numeric);
--   drop table public.group_trips;
--   alter table public.transactions drop constraint transactions_trip_expense_check,
--     drop constraint transactions_trip_fk, drop column trip_id;
--   drop table public.trips;

begin;

-- Personal trips ---------------------------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  starts_on date not null,
  ends_on date not null,
  budget numeric(14,2) not null check (budget > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (id, owner_id)
);

create index trips_owner_idx on public.trips (owner_id, starts_on desc);

create trigger trips_set_updated_at
before update on public.trips
for each row execute function public.set_updated_at();

alter table public.trips enable row level security;
revoke all on table public.trips from anon, authenticated;
grant select on table public.trips to authenticated;
grant insert (name, starts_on, ends_on, budget) on table public.trips to authenticated;
grant update (name, starts_on, ends_on, budget, archived_at) on table public.trips to authenticated;

create policy "trips_select_own" on public.trips
for select to authenticated using (owner_id = (select auth.uid()));
create policy "trips_insert_own" on public.trips
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "trips_update_own" on public.trips
for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

-- Trip expenses are ordinary movements ------------------------------------------------------------------------
alter table public.transactions
  add column trip_id uuid,
  add constraint transactions_trip_fk foreign key (trip_id, owner_id)
    references public.trips (id, owner_id) on delete no action,
  add constraint transactions_trip_expense_check check (trip_id is null or kind = 'expense');

create index transactions_trip_idx on public.transactions (trip_id) where trip_id is not null;

-- The app sets it when it creates (or later corrects) the person's own expense; RLS and the composite key keep it
-- inside the owner's trips.
grant insert (trip_id) on table public.transactions to authenticated;
grant update (trip_id) on table public.transactions to authenticated;

-- Group trips ------------------------------------------------------------------------------------------------
create table public.group_trips (
  group_id uuid primary key references public.groups (id) on delete no action,
  starts_on date not null,
  ends_on date not null,
  budget numeric(14,2) not null check (budget > 0),
  updated_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create trigger group_trips_set_updated_at
before update on public.group_trips
for each row execute function public.set_updated_at();

alter table public.group_trips enable row level security;
revoke all on table public.group_trips from anon, authenticated;
grant select on table public.group_trips to authenticated;
create policy "group_trips_select_members" on public.group_trips
for select to authenticated using (public.is_group_member(group_id));

create or replace function public.set_group_trip(
  p_group uuid,
  p_starts_on date,
  p_ends_on date,
  p_budget numeric
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
  -- Only the creator / owner of the group sets its trip; any other active member can only read it.
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
  if p_budget is null or p_budget <= 0 then
    raise exception 'invalid_trip_budget' using errcode = '22023';
  end if;

  insert into public.group_trips (group_id, starts_on, ends_on, budget, updated_by)
  values (p_group, p_starts_on, p_ends_on, round(p_budget, 2), v_user)
  on conflict (group_id) do update
    set starts_on = excluded.starts_on, ends_on = excluded.ends_on, budget = excluded.budget,
        updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.set_group_trip(uuid, date, date, numeric) from public, anon;
grant execute on function public.set_group_trip(uuid, date, date, numeric) to authenticated;

commit;
