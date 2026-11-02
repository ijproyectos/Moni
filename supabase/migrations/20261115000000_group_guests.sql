-- Group guests: people who take part in a group without a Moni account ("Sin cuenta").
--
-- A guest is a row of its own (group_guests). It is NOT an auth user: no account is created in
-- Supabase Auth. Expenses and settlements that involve a guest are stored in their own tables
-- (group_guest_expenses / group_guest_settlements); the existing shared_expenses, splits and
-- settlements tables, and the balances computed from them, are not touched. The app adds both ledgers
-- up per person, so a person with and a person without an account are treated the same way.
--
-- "person" ids in the parts/settlement columns are either an auth user id (active member of the group)
-- or a guest id (active guest of the group). They are validated here, so there is no FK to auth.users.
--
-- Linking a guest to a real member (link_group_guest) moves that guest's history to the member.
-- Every write goes through a security definer RPC that requires an active group member.

-- Tables ---------------------------------------------------------------------------------------------

create table public.group_guests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  alias text not null default '' check (char_length(alias) <= 40),
  created_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  -- Set when the guest is linked to a real member; their history then belongs to that member.
  linked_user_id uuid references auth.users (id) on delete no action,
  linked_at timestamptz,
  unique (id, group_id),
  check ((linked_user_id is null) = (linked_at is null))
);

create index group_guests_group_idx on public.group_guests (group_id);

-- One active guest per name in a group: a double tap or a retry never creates the same person twice.
create unique index group_guests_active_name_key
  on public.group_guests (group_id, lower(btrim(name)))
  where removed_at is null and linked_user_id is null;

create table public.group_guest_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  description text not null check (char_length(btrim(description)) between 1 and 120),
  amount numeric(14,2) not null check (amount > 0),
  template_slug text references public.category_templates (slug) on delete no action,
  method_label text not null default '' check (char_length(method_label) <= 60),
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null)),
  unique (id, group_id)
);

create index group_guest_expenses_group_idx on public.group_guest_expenses (group_id, occurred_on desc);

create table public.group_guest_expense_parts (
  expense_id uuid not null,
  group_id uuid not null,
  person_id uuid not null,
  role text not null check (role in ('payer', 'share')),
  amount numeric(14,2) not null check (amount >= 0),
  -- What counts in the person's own monthly reports and budgets. Equal to `amount`, except for what a guest
  -- carried when they were linked to an account: that history stays in the group but is not added to the
  -- account's reports retroactively.
  reported_amount numeric(14,2) not null check (reported_amount >= 0),
  primary key (expense_id, person_id, role),
  foreign key (expense_id, group_id) references public.group_guest_expenses (id, group_id) on delete no action
);

create index group_guest_expense_parts_group_idx on public.group_guest_expense_parts (group_id);
create index group_guest_expense_parts_person_idx on public.group_guest_expense_parts (person_id);

create table public.group_guest_settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  from_person uuid not null,
  to_person uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  method text not null default '' check (char_length(method) <= 60),
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  check (from_person <> to_person),
  check ((status = 'voided') = (voided_at is not null))
);

create index group_guest_settlements_group_idx on public.group_guest_settlements (group_id, occurred_on desc);

-- The payer's own account -----------------------------------------------------------------------------
-- Like a shared expense, a guest expense can be paid from one of the caller's accounts: ONE shared_payment
-- transaction with the amount the caller paid. What each person owes never touches personal accounts.

alter table public.transactions
  add column guest_expense_id uuid references public.group_guest_expenses (id) on delete no action;

create index transactions_guest_expense_idx
  on public.transactions (guest_expense_id) where guest_expense_id is not null;

-- At most one live payment transaction per guest expense and payer account owner.
create unique index transactions_guest_payment_key
  on public.transactions (guest_expense_id, owner_id)
  where kind = 'shared_payment' and guest_expense_id is not null and status = 'posted';

-- A payment recorded with a person without an account can also move the caller's own account: money in
-- (settlement_in) when they received it, money out (settlement_out) when they paid. One transaction per payment.
alter table public.transactions
  add column guest_settlement_id uuid references public.group_guest_settlements (id) on delete no action;

create unique index transactions_guest_settlement_key
  on public.transactions (guest_settlement_id)
  where guest_settlement_id is not null and status = 'posted';

alter table public.transactions drop constraint transactions_link_kind_check;
alter table public.transactions
  add constraint transactions_link_kind_check check (
    (kind = 'shared_payment') = (shared_expense_id is not null or guest_expense_id is not null)
    and (shared_expense_id is null or guest_expense_id is null)
    and (kind in ('settlement_out', 'settlement_in')) = (settlement_id is not null or guest_settlement_id is not null)
    and (settlement_id is null or guest_settlement_id is null)
    and (guest_settlement_id is null or kind in ('settlement_out', 'settlement_in'))
  );

-- Row level security: members read, nobody writes directly ---------------------------------------------

alter table public.group_guests enable row level security;
alter table public.group_guest_expenses enable row level security;
alter table public.group_guest_expense_parts enable row level security;
alter table public.group_guest_settlements enable row level security;

revoke all on table public.group_guests, public.group_guest_expenses,
  public.group_guest_expense_parts, public.group_guest_settlements from anon, authenticated;
grant select on table public.group_guests, public.group_guest_expenses,
  public.group_guest_expense_parts, public.group_guest_settlements to authenticated;

create policy "group_guests_select_member" on public.group_guests
for select to authenticated using (public.is_group_member(group_id));
create policy "group_guest_expenses_select_member" on public.group_guest_expenses
for select to authenticated using (public.is_group_member(group_id));
create policy "group_guest_expense_parts_select_member" on public.group_guest_expense_parts
for select to authenticated using (public.is_group_member(group_id));
create policy "group_guest_settlements_select_member" on public.group_guest_settlements
for select to authenticated using (public.is_group_member(group_id));

-- Helpers (not callable through the API) ---------------------------------------------------------------

-- A person of the group: an active member or an active (not removed, not linked) guest.
create or replace function public.is_group_person(p_group uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = p_person and m.left_at is null
  ) or exists (
    select 1 from public.group_guests g
    where g.group_id = p_group and g.id = p_person
      and g.removed_at is null and g.linked_user_id is null
  );
$$;

-- Same as lock_group_as_member, and refuses archived groups for writes.
create or replace function public.lock_group_for_write(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '55000';
  end if;
end;
$$;

-- Turns [{"personId": "...", "amount": 12.5}, ...] into rows, rejecting bad shapes and duplicates.
create or replace function public.parse_guest_parts(p_group uuid, p_parts jsonb)
returns table (person_id uuid, amount numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0 then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;
  return query
  select (x ->> 'personId')::uuid, round((x ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_parts) x;
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception 'invalid_parts' using errcode = '22023';
end;
$$;

-- RPC: guests ------------------------------------------------------------------------------------------

create or replace function public.add_group_guest(p_group uuid, p_name text, p_alias text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_alias text := btrim(coalesce(p_alias, ''));
  v_id uuid;
begin
  perform public.lock_group_for_write(p_group);
  if char_length(v_name) not between 1 and 40 or char_length(v_alias) > 40 then
    raise exception 'invalid_guest' using errcode = '22023';
  end if;
  -- The same person is never added twice: not as a guest and not as a member with that name.
  if exists (
    select 1 from public.group_guests g
    where g.group_id = p_group and g.removed_at is null and g.linked_user_id is null
      and lower(btrim(g.name)) = lower(v_name)
  ) or exists (
    select 1 from public.group_members m
    join public.profiles p on p.id = m.user_id
    where m.group_id = p_group and m.left_at is null
      and lower(btrim(coalesce(p.display_name, ''))) = lower(v_name)
  ) then
    raise exception 'guest_name_taken' using errcode = '23505';
  end if;
  insert into public.group_guests (group_id, name, alias, created_by)
  values (p_group, v_name, v_alias, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.update_group_guest(p_guest uuid, p_name text, p_alias text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_alias text := btrim(coalesce(p_alias, ''));
begin
  select g.group_id into v_group from public.group_guests g where g.id = p_guest;
  if v_group is null then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  if not exists (
    select 1 from public.group_guests g
    where g.id = p_guest and g.removed_at is null and g.linked_user_id is null
  ) then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if char_length(v_name) not between 1 and 40 or char_length(v_alias) > 40 then
    raise exception 'invalid_guest' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.group_guests g
    where g.group_id = v_group and g.id <> p_guest and g.removed_at is null and g.linked_user_id is null
      and lower(btrim(g.name)) = lower(v_name)
  ) then
    raise exception 'guest_name_taken' using errcode = '23505';
  end if;
  update public.group_guests set name = v_name, alias = v_alias where id = p_guest;
end;
$$;

-- A guest with posted history cannot be removed: that would change what the others owe. Link it to a
-- member instead, or settle it first (a guest settled to zero still has history, so it stays listed).
create or replace function public.remove_group_guest(p_guest uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select g.group_id into v_group from public.group_guests g where g.id = p_guest;
  if v_group is null then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  if not exists (
    select 1 from public.group_guests g
    where g.id = p_guest and g.removed_at is null and g.linked_user_id is null
  ) then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.group_guest_expense_parts pt
    join public.group_guest_expenses e on e.id = pt.expense_id
    where pt.person_id = p_guest and e.status = 'posted'
  ) or exists (
    select 1 from public.group_guest_settlements s
    where s.status = 'posted' and (s.from_person = p_guest or s.to_person = p_guest)
  ) then
    raise exception 'guest_has_history' using errcode = '23503';
  end if;
  update public.group_guests set removed_at = now() where id = p_guest;
end;
$$;

-- RPC: expenses and settlements involving guests ---------------------------------------------------------

create or replace function public.create_guest_expense(
  p_group uuid,
  p_description text,
  p_amount numeric,
  p_occurred_on date,
  p_template_slug text,
  p_method_label text,
  p_payers jsonb,
  p_shares jsonb,
  p_payer_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_amount numeric := round(p_amount, 2);
  v_count int;
  v_user uuid := auth.uid();
  v_paid_by_me numeric;
  v_account_archived timestamptz;
  v_occurred_on date := coalesce(p_occurred_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
begin
  perform public.lock_group_for_write(p_group);
  if v_amount is null or v_amount <= 0 or char_length(btrim(coalesce(p_description, ''))) not between 1 and 120 then
    raise exception 'invalid_expense' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct person_id) from public.parse_guest_parts(p_group, p_payers))
     or (select count(*) <> count(distinct person_id) from public.parse_guest_parts(p_group, p_shares)) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;
  if exists (select 1 from public.parse_guest_parts(p_group, p_payers) pt where pt.amount < 0)
     or exists (select 1 from public.parse_guest_parts(p_group, p_shares) pt where pt.amount < 0) then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;
  -- Nobody outside the group, and what was paid and what is owed both add up to the expense.
  select count(*) into v_count from (
    select person_id from public.parse_guest_parts(p_group, p_payers)
    union all select person_id from public.parse_guest_parts(p_group, p_shares)
  ) all_people where not public.is_group_person(p_group, all_people.person_id);
  if v_count > 0 then
    raise exception 'person_not_in_group' using errcode = '42501';
  end if;
  if (select coalesce(sum(amount), 0) from public.parse_guest_parts(p_group, p_payers)) <> v_amount
     or (select coalesce(sum(amount), 0) from public.parse_guest_parts(p_group, p_shares)) <> v_amount then
    raise exception 'parts_do_not_add_up' using errcode = '22023';
  end if;

  -- Paying from an account: only the caller's own account, and only for what the caller paid.
  if p_payer_account_id is not null then
    select pt.amount into v_paid_by_me from public.parse_guest_parts(p_group, p_payers) pt where pt.person_id = v_user;
    if v_paid_by_me is null or v_paid_by_me <= 0 then
      raise exception 'payer_account_requires_payer' using errcode = '22023';
    end if;
    select a.archived_at into v_account_archived
    from public.accounts a where a.id = p_payer_account_id and a.owner_id = v_user;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_account_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  insert into public.group_guest_expenses (
    group_id, description, amount, template_slug, method_label, occurred_on, created_by
  ) values (
    p_group, btrim(p_description), v_amount, nullif(p_template_slug, ''), coalesce(p_method_label, ''),
    v_occurred_on, v_user
  ) returning id into v_id;

  insert into public.group_guest_expense_parts (expense_id, group_id, person_id, role, amount, reported_amount)
  select v_id, p_group, person_id, 'payer', amount, amount from public.parse_guest_parts(p_group, p_payers);
  insert into public.group_guest_expense_parts (expense_id, group_id, person_id, role, amount, reported_amount)
  select v_id, p_group, person_id, 'share', amount, amount from public.parse_guest_parts(p_group, p_shares);

  if p_payer_account_id is not null then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, guest_expense_id)
    values (v_user, p_payer_account_id, 'shared_payment', v_paid_by_me, v_occurred_on, left(btrim(p_description), 200), v_id);
  end if;
  return v_id;
end;
$$;

create or replace function public.void_guest_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select e.group_id into v_group from public.group_guest_expenses e where e.id = p_expense;
  if v_group is null then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  update public.group_guest_expenses
  set status = 'voided', voided_at = now()
  where id = p_expense and status = 'posted';
  -- The payment taken from a personal account is given back with it (exactly once: only posted rows change).
  update public.transactions set status = 'voided'
  where guest_expense_id = p_expense and status = 'posted';
end;
$$;

create or replace function public.create_guest_settlement(
  p_group uuid,
  p_from uuid,
  p_to uuid,
  p_amount numeric,
  p_method text,
  p_occurred_on date,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_amount numeric := round(p_amount, 2);
  v_user uuid := auth.uid();
  v_occurred_on date := coalesce(p_occurred_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_account_archived timestamptz;
begin
  perform public.lock_group_for_write(p_group);
  if v_amount is null or v_amount <= 0 or p_from is null or p_to is null or p_from = p_to then
    raise exception 'invalid_settlement' using errcode = '22023';
  end if;
  if not public.is_group_person(p_group, p_from) or not public.is_group_person(p_group, p_to) then
    raise exception 'person_not_in_group' using errcode = '42501';
  end if;
  -- An account can only be the caller's own, and only for a payment the caller is part of.
  if p_account_id is not null then
    if v_user <> p_from and v_user <> p_to then
      raise exception 'account_requires_party' using errcode = '22023';
    end if;
    select a.archived_at into v_account_archived
    from public.accounts a where a.id = p_account_id and a.owner_id = v_user;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_account_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  insert into public.group_guest_settlements (group_id, from_person, to_person, amount, method, occurred_on, created_by)
  values (p_group, p_from, p_to, v_amount, coalesce(p_method, ''), v_occurred_on, v_user)
  returning id into v_id;

  if p_account_id is not null then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, guest_settlement_id)
    values (
      v_user, p_account_id,
      case when v_user = p_to then 'settlement_in' else 'settlement_out' end,
      v_amount, v_occurred_on, left(nullif(btrim(coalesce(p_method, '')), ''), 200), v_id
    );
  end if;
  return v_id;
end;
$$;

-- Voiding a payment gives back its balance effect and, once, the money moved in the caller's account.
create or replace function public.void_guest_settlement(p_settlement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select s.group_id into v_group from public.group_guest_settlements s where s.id = p_settlement;
  if v_group is null then
    raise exception 'settlement_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  update public.group_guest_settlements
  set status = 'voided', voided_at = now()
  where id = p_settlement and status = 'posted';
  update public.transactions set status = 'voided'
  where guest_settlement_id = p_settlement and status = 'posted';
end;
$$;

-- Linking: the guest becomes a real member ------------------------------------------------------------

-- Moves everything the guest has in the group (paid, owed, settled) to the member, keeping the history.
-- The member must already be in the group (they joined with the invite code). Nothing is deleted and no
-- row of the real ledger changes; a guest can be linked once, and a member can absorb several guests.
create or replace function public.link_group_guest(p_guest uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  select g.group_id into v_group from public.group_guests g where g.id = p_guest;
  if v_group is null then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  perform public.lock_group_for_write(v_group);
  if not exists (
    select 1 from public.group_guests g
    where g.id = p_guest and g.removed_at is null and g.linked_user_id is null
  ) then
    raise exception 'guest_not_found' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = v_group and m.user_id = p_user and m.left_at is null
  ) then
    raise exception 'person_not_in_group' using errcode = '42501';
  end if;
  -- A settlement between the guest and that member would become a payment to oneself.
  if exists (
    select 1 from public.group_guest_settlements s
    where s.group_id = v_group
      and ((s.from_person = p_guest and s.to_person = p_user) or (s.from_person = p_user and s.to_person = p_guest))
  ) then
    raise exception 'guest_link_conflict' using errcode = '23505';
  end if;

  -- The guest's history moves to the member (group balances are the sum of `amount`). It does NOT count in the
  -- member's reports: moved rows carry reported_amount 0, and when the member already had a part in the same
  -- expense the two amounts are added but only the member's own reported amount is kept.
  insert into public.group_guest_expense_parts (expense_id, group_id, person_id, role, amount, reported_amount)
  select pt.expense_id, pt.group_id, p_user, pt.role, pt.amount, 0
  from public.group_guest_expense_parts pt
  where pt.group_id = v_group and pt.person_id = p_guest
  on conflict (expense_id, person_id, role)
  do update set amount = public.group_guest_expense_parts.amount + excluded.amount;
  delete from public.group_guest_expense_parts where group_id = v_group and person_id = p_guest;

  update public.group_guest_settlements set from_person = p_user where group_id = v_group and from_person = p_guest;
  update public.group_guest_settlements set to_person = p_user where group_id = v_group and to_person = p_guest;

  update public.group_guests set linked_user_id = p_user, linked_at = now() where id = p_guest;
end;
$$;

-- Month summary / budgets: the caller's own part of a guest expense counts like any shared expense, except what
-- came from a guest linked to them (reported_amount).
-- Same signature and output; the real shares come first, unchanged.
create or replace function public.my_shared_shares(p_from date, p_to date)
returns table (amount numeric, occurred_on date, template_slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.share_amount, e.occurred_on, e.template_slug
  from public.shared_expense_splits s
  join public.shared_expenses e on e.id = s.expense_id
  where s.user_id = (select auth.uid())
    and e.status = 'posted'
    and e.occurred_on >= p_from
    and e.occurred_on < p_to
  union all
  select pt.reported_amount, e.occurred_on, e.template_slug
  from public.group_guest_expense_parts pt
  join public.group_guest_expenses e on e.id = pt.expense_id
  where pt.person_id = (select auth.uid())
    and pt.role = 'share'
    and pt.reported_amount > 0
    and e.status = 'posted'
    and e.occurred_on >= p_from
    and e.occurred_on < p_to;
$$;

-- Permissions ------------------------------------------------------------------------------------------

revoke execute on function
  public.is_group_person(uuid, uuid),
  public.lock_group_for_write(uuid),
  public.parse_guest_parts(uuid, jsonb)
from public, anon, authenticated;

revoke execute on function
  public.add_group_guest(uuid, text, text),
  public.update_group_guest(uuid, text, text),
  public.remove_group_guest(uuid),
  public.create_guest_expense(uuid, text, numeric, date, text, text, jsonb, jsonb, uuid),
  public.void_guest_expense(uuid),
  public.void_guest_settlement(uuid),
  public.create_guest_settlement(uuid, uuid, uuid, numeric, text, date, uuid),
  public.link_group_guest(uuid, uuid)
from public, anon;

grant execute on function
  public.add_group_guest(uuid, text, text),
  public.update_group_guest(uuid, text, text),
  public.remove_group_guest(uuid),
  public.create_guest_expense(uuid, text, numeric, date, text, text, jsonb, jsonb, uuid),
  public.void_guest_expense(uuid),
  public.void_guest_settlement(uuid),
  public.create_guest_settlement(uuid, uuid, uuid, numeric, text, date, uuid),
  public.link_group_guest(uuid, uuid)
to authenticated;
