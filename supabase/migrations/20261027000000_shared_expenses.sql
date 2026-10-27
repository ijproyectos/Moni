-- Shared expenses (groups): groups, members, invites, shared expenses with splits, settlements and RPCs.
-- Accounting model ("solo tu parte cuenta como gasto tuyo"): payment is not consumption.
--   * A shared expense records who paid the full amount and each participant's share.
--   * Personal EXPENSE statistics count only the caller's own share of posted shared expenses.
--   * If the payer links one of their accounts, the full amount leaves that account as a 'shared_payment'
--     transaction (balance only; never income/expense).
--   * Settlements move money between members ('settlement_out' / 'settlement_in'; balance only).
-- All writes go through security definer RPCs. Clients have SELECT only (RLS: members of the group).
-- Money is numeric(14,2) in ARS. Rows are voided, never deleted. Balances are derived, never stored.
-- Wrapped in one transaction so a mid-script failure (e.g. in the SQL Editor) rolls back completely.
-- Apply AFTER 20261026000000_personal_finance.sql.

begin;

-- Hardening of the existing transactions policy ----------------------------------------------------
-- Reserved kinds (shared_payment, settlement_*) are created, voided and kept consistent only by RPCs.
-- Without this, an owner could edit the amount of a shared_payment and desynchronize it from its expense.

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
for update to authenticated
using (owner_id = (select auth.uid()) and kind in ('expense', 'income'))
with check (owner_id = (select auth.uid()) and kind in ('expense', 'income'));

-- Tables ------------------------------------------------------------------------------------------
-- User references use ON DELETE NO ACTION: group history is financial and must not vanish when an
-- account is deleted (account deletion with group history is a pending product decision).

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  kind text not null check (kind in ('casa', 'viaje', 'pareja', 'amigos')),
  currency char(3) not null default 'ARS' check (currency = 'ARS'),
  created_by uuid not null references auth.users (id) on delete no action,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete no action,
  user_id uuid not null references auth.users (id) on delete no action,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (group_id, user_id),
  check (left_at is null or left_at >= joined_at)
);

create index group_members_user_idx on public.group_members (user_id) where left_at is null;

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  -- 12 chars from an unambiguous alphabet (no I, O, 0, 1): 32^12 codes make guessing impractical.
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{12}$'),
  created_by uuid not null references auth.users (id) on delete no action,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses int not null default 20 check (max_uses between 1 and 100),
  uses int not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (uses <= max_uses)
);

create index group_invites_group_idx on public.group_invites (group_id);

-- Failed join attempts per user, used to throttle invite-code guessing. Written only by join_group.
create table public.group_join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index group_join_attempts_user_idx on public.group_join_attempts (user_id, attempted_at desc);

create table public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  paid_by uuid not null references auth.users (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  description text not null check (char_length(btrim(description)) between 1 and 120),
  template_slug text references public.category_templates (slug) on delete no action,
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  split_method text not null check (split_method in ('equal', 'percent')),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'voided') = (voided_at is not null)),
  -- Lets splits carry group_id with a composite FK, so RLS needs no join.
  unique (id, group_id)
);

create index shared_expenses_group_date_idx on public.shared_expenses (group_id, occurred_on desc);
create index shared_expenses_paid_by_idx on public.shared_expenses (paid_by);

create table public.shared_expense_splits (
  expense_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references auth.users (id) on delete no action,
  share_amount numeric(14,2) not null check (share_amount >= 0),
  percent numeric(5,2) check (percent > 0 and percent <= 100),
  primary key (expense_id, user_id),
  foreign key (expense_id, group_id) references public.shared_expenses (id, group_id) on delete no action
);

create index shared_expense_splits_user_idx on public.shared_expense_splits (user_id);
create index shared_expense_splits_group_idx on public.shared_expense_splits (group_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete no action,
  from_user uuid not null references auth.users (id) on delete no action,
  to_user uuid not null references auth.users (id) on delete no action,
  amount numeric(14,2) not null check (amount > 0),
  occurred_on date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date,
  note text check (char_length(note) <= 200),
  status text not null default 'posted' check (status in ('posted', 'voided')),
  voided_at timestamptz,
  created_by uuid not null references auth.users (id) on delete no action,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_user <> to_user),
  check ((status = 'voided') = (voided_at is not null))
);

create index settlements_group_date_idx on public.settlements (group_id, occurred_on desc);
create index settlements_from_idx on public.settlements (from_user);
create index settlements_to_idx on public.settlements (to_user);

-- Links from personal transactions. NO ACTION: a shared expense/settlement with a linked transaction
-- can never be removed from under it.
alter table public.transactions
  add constraint transactions_shared_expense_fk
  foreign key (shared_expense_id) references public.shared_expenses (id) on delete no action;

alter table public.transactions
  add column settlement_id uuid references public.settlements (id) on delete no action;

create index transactions_shared_expense_idx on public.transactions (shared_expense_id) where shared_expense_id is not null;
create index transactions_settlement_idx on public.transactions (settlement_id) where settlement_id is not null;

-- One live payment transaction per shared expense; one live out/in transaction per settlement.
create unique index transactions_shared_payment_key
on public.transactions (shared_expense_id)
where kind = 'shared_payment' and status = 'posted';

create unique index transactions_settlement_kind_key
on public.transactions (settlement_id, kind)
where settlement_id is not null and status = 'posted';

alter table public.transactions
  add constraint transactions_link_kind_check check (
    (kind = 'shared_payment') = (shared_expense_id is not null)
    and (kind in ('settlement_out', 'settlement_in')) = (settlement_id is not null)
  );

-- Triggers ----------------------------------------------------------------------------------------

create trigger groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger shared_expenses_set_updated_at
before update on public.shared_expenses
for each row execute function public.set_updated_at();

create trigger settlements_set_updated_at
before update on public.settlements
for each row execute function public.set_updated_at();

-- Posted -> voided is the only status transition. Voided rows are frozen.
create trigger shared_expenses_guard_status
before update on public.shared_expenses
for each row execute function public.guard_status_transition();

create trigger settlements_guard_status
before update on public.settlements
for each row execute function public.guard_status_transition();

-- Splits are written once, together with their expense.
create or replace function public.forbid_row_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'row_is_immutable' using errcode = '23514';
end;
$$;

create trigger shared_expense_splits_immutable
before update or delete on public.shared_expense_splits
for each row execute function public.forbid_row_mutation();

-- Membership helper (used by RLS) -------------------------------------------------------------------
-- security definer so policies on group_members itself do not recurse.

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = p_group
      and m.user_id = (select auth.uid())
      and m.left_at is null
  );
$$;

revoke execute on function public.is_group_member(uuid) from public, anon;
grant execute on function public.is_group_member(uuid) to authenticated;

-- Row level security ------------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_join_attempts enable row level security;
alter table public.shared_expenses enable row level security;
alter table public.shared_expense_splits enable row level security;
alter table public.settlements enable row level security;

revoke all on table public.groups, public.group_members, public.group_invites,
  public.shared_expenses, public.shared_expense_splits, public.settlements, public.group_join_attempts
  from anon, authenticated;

-- SELECT only: every write goes through an RPC. No INSERT/UPDATE/DELETE grants exist.
-- group_join_attempts has RLS on, no policies and no grants: only security definer code touches it.
grant select on table public.groups, public.group_members, public.group_invites,
  public.shared_expenses, public.shared_expense_splits, public.settlements
  to authenticated;

create policy "groups_select_member" on public.groups
for select to authenticated using (public.is_group_member(id));

create policy "group_members_select_member" on public.group_members
for select to authenticated using (public.is_group_member(group_id));

create policy "group_invites_select_member" on public.group_invites
for select to authenticated using (public.is_group_member(group_id));

create policy "shared_expenses_select_member" on public.shared_expenses
for select to authenticated using (public.is_group_member(group_id));

create policy "shared_expense_splits_select_member" on public.shared_expense_splits
for select to authenticated using (public.is_group_member(group_id));

create policy "settlements_select_member" on public.settlements
for select to authenticated using (public.is_group_member(group_id));

-- Internal helpers (not callable through the API) ---------------------------------------------------

-- Locks the group row (serializes balance-changing writes per group), then requires an active
-- membership for auth.uid(). Returns archived_at. Missing group and non-member are indistinguishable.
create or replace function public.lock_group_as_member(p_group uuid)
returns timestamptz
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
  select g.archived_at into v_archived
  from public.groups g
  where g.id = p_group
  for update;
  if not found or not public.is_group_member(p_group) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;
  return v_archived;
end;
$$;

-- Per-member ledger of posted rows. net = paid - owed + settled_out - settled_in.
-- Positive net: the group owes that member. The nets of a group always add up to zero.
create or replace function public.group_balance_rows(p_group uuid)
returns table (user_id uuid, paid numeric, owed numeric, settled_out numeric, settled_in numeric, net numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with ledger as (
    select e.paid_by as uid, e.amount as v_paid, 0::numeric as v_owed, 0::numeric as v_out, 0::numeric as v_in
    from public.shared_expenses e
    where e.group_id = p_group and e.status = 'posted'
    union all
    select sp.user_id, 0, sp.share_amount, 0, 0
    from public.shared_expense_splits sp
    join public.shared_expenses e on e.id = sp.expense_id
    where e.group_id = p_group and e.status = 'posted'
    union all
    select st.from_user, 0, 0, st.amount, 0
    from public.settlements st
    where st.group_id = p_group and st.status = 'posted'
    union all
    select st.to_user, 0, 0, 0, st.amount
    from public.settlements st
    where st.group_id = p_group and st.status = 'posted'
  ),
  sums as (
    select l.uid, sum(l.v_paid) as v_paid, sum(l.v_owed) as v_owed, sum(l.v_out) as v_out, sum(l.v_in) as v_in
    from ledger l
    group by l.uid
  )
  select m.user_id,
         coalesce(s.v_paid, 0),
         coalesce(s.v_owed, 0),
         coalesce(s.v_out, 0),
         coalesce(s.v_in, 0),
         coalesce(s.v_paid, 0) - coalesce(s.v_owed, 0) + coalesce(s.v_out, 0) - coalesce(s.v_in, 0)
  from public.group_members m
  left join sums s on s.uid = m.user_id
  where m.group_id = p_group;
$$;

-- RPC: groups -------------------------------------------------------------------------------------

create or replace function public.create_group(p_name text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('casa', 'viaje', 'pareja', 'amigos') then
    raise exception 'invalid_group_kind' using errcode = '22023';
  end if;

  insert into public.groups (name, kind, created_by)
  values (v_name, p_kind, v_user)
  returning id into v_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_id, v_user, 'owner');

  return v_id;
end;
$$;

create or replace function public.create_group_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols: no modulo bias, no I/O/0/1
  v_bytes bytea;
  v_code text;
  v_attempt int;
  v_active int;
  i int;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;

  select count(*) into v_active
  from public.group_invites gi
  where gi.group_id = p_group
    and gi.revoked_at is null
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
  if v_active >= 5 then
    raise exception 'invite_limit_reached' using errcode = '23514';
  end if;

  for v_attempt in 1..5 loop
    -- gen_random_uuid() is cryptographically random; bytes 6 (version) and 8 (variant) are skipped.
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..11 loop
      -- Byte indexes used: 0-5, 7, 9-13 (6 and 8 hold the uuid version/variant bits).
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, case when i < 6 then i when i = 6 then 7 else i + 2 end) % 32) + 1, 1);
    end loop;
    begin
      insert into public.group_invites (group_id, code, created_by)
      values (p_group, v_code, v_user);
      return v_code;
    exception when unique_violation then
      null; -- extremely unlikely collision: draw another code
    end;
  end loop;

  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

create or replace function public.revoke_group_invite(p_invite uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_created_by uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select gi.group_id, gi.created_by into v_group, v_created_by
  from public.group_invites gi
  where gi.id = p_invite;
  if not found then
    raise exception 'invite_invalid' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_group);

  if v_created_by <> v_user and not exists (
    select 1 from public.group_members m
    where m.group_id = v_group and m.user_id = v_user and m.role = 'owner' and m.left_at is null
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  update public.group_invites set revoked_at = coalesce(revoked_at, now()) where id = p_invite;
end;
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_group uuid;
  v_invite public.group_invites%rowtype;
  v_archived timestamptz;
  v_valid boolean := false;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Throttle code guessing: 10 failed attempts per user per hour. Successful joins do not count.
  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  -- Lock order matches revoke_group_invite (group row first, then invite row), which rules out
  -- deadlocks. The group is resolved from the invite without locking, then locked, then the invite
  -- is locked and re-validated.
  select gi.group_id into v_group from public.group_invites gi where gi.code = v_code;
  if found then
    select g.archived_at into v_archived from public.groups g where g.id = v_group for update;

    -- Row lock makes the uses counter atomic under concurrent joins.
    select * into v_invite from public.group_invites gi where gi.code = v_code for update;
    if found then
      -- Idempotent for current members: no use is consumed.
      if exists (
        select 1 from public.group_members m
        where m.group_id = v_invite.group_id and m.user_id = v_user and m.left_at is null
      ) then
        return v_invite.group_id;
      end if;

      v_valid := v_archived is null
        and v_invite.group_id = v_group
        and v_invite.revoked_at is null
        and v_invite.expires_at > now()
        and v_invite.uses < v_invite.max_uses;
    end if;
  end if;

  if not v_valid then
    -- Unknown, expired, revoked, exhausted and archived-group codes are indistinguishable. A failed
    -- attempt is recorded and the function RETURNS NULL (an exception would roll the record back);
    -- the client turns NULL into the uniform 'invite_invalid' error.
    delete from public.group_join_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.group_join_attempts (user_id) values (v_user);
    return null;
  end if;

  -- First join, or re-join after leaving (restores the membership row).
  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_user, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

create or replace function public.leave_group(p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_net numeric;
begin
  perform public.lock_group_as_member(p_group);

  select r.net into v_net from public.group_balance_rows(p_group) r where r.user_id = v_user;
  if coalesce(v_net, 0) <> 0 then
    raise exception 'balance_not_zero' using errcode = '23514';
  end if;

  update public.group_members
  set left_at = now()
  where group_id = p_group and user_id = v_user and left_at is null;

  -- Never leave an active group without an owner: promote the longest-standing active member.
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.role = 'owner' and m.left_at is null
  ) then
    update public.group_members m
    set role = 'owner'
    where m.group_id = p_group
      and m.user_id = (
        select m2.user_id from public.group_members m2
        where m2.group_id = p_group and m2.left_at is null
        order by m2.joined_at, m2.user_id
        limit 1
      );
  end if;

  -- Last active member gone: archive the group and close every invite so nobody can join an empty group.
  if not exists (
    select 1 from public.group_members m where m.group_id = p_group and m.left_at is null
  ) then
    update public.groups set archived_at = now() where id = p_group;
    update public.group_invites set revoked_at = now() where group_id = p_group and revoked_at is null;
  end if;
end;
$$;

-- Names of co-members without widening the profiles policy.
create or replace function public.get_group_members(p_group uuid)
returns table (user_id uuid, display_name text, avatar_url text, role text, joined_at timestamptz, left_at timestamptz)
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
  select m.user_id, p.display_name, p.avatar_url, m.role, m.joined_at, m.left_at
  from public.group_members m
  left join public.profiles p on p.id = m.user_id
  where m.group_id = p_group
  order by m.joined_at, m.user_id;
end;
$$;

-- RPC: shared expenses ----------------------------------------------------------------------------

create or replace function public.create_shared_expense(
  p_group uuid,
  p_amount numeric,
  p_description text,
  p_template_slug text,
  p_occurred_on date,
  p_paid_by uuid,
  p_split_method text,
  p_participants uuid[],
  p_percents numeric[] default null,
  p_payer_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_paid_by uuid := coalesce(p_paid_by, auth.uid());
  v_description text := btrim(coalesce(p_description, ''));
  v_occurred_on date := coalesce(p_occurred_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_n int := coalesce(cardinality(p_participants), 0);
  v_percents numeric[];
  v_cents bigint;
  v_account_archived timestamptz;
  v_id uuid;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  v_cents := round(p_amount * 100)::bigint;

  if char_length(v_description) not between 1 and 120 then
    raise exception 'invalid_description' using errcode = '22023';
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
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = v_paid_by and m.left_at is null
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
    v_percents := p_percents;
  else
    v_percents := array_fill(null::numeric, array[v_n]);
  end if;

  if p_payer_account_id is not null then
    if v_paid_by <> v_user then
      raise exception 'payer_account_requires_payer' using errcode = '22023';
    end if;
    select a.archived_at into v_account_archived
    from public.accounts a
    where a.id = p_payer_account_id and a.owner_id = v_user;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_account_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  insert into public.shared_expenses
    (group_id, paid_by, amount, description, template_slug, occurred_on, split_method, created_by)
  values
    (p_group, v_paid_by, p_amount, v_description, p_template_slug, v_occurred_on, p_split_method, v_user)
  returning id into v_id;

  -- Cents are assigned in integer arithmetic. Leftover cents go first to the payer (if a participant),
  -- then to participants by ascending user_id, one cent each. Equal split: base = floor(total / n).
  -- Percent split: base = floor(total * percent / 100). The client mirrors this exactly.
  insert into public.shared_expense_splits (expense_id, group_id, user_id, share_amount, percent)
  select v_id, p_group, s.user_id,
         (s.base + case when s.rnk <= (v_cents - s.base_total) then 1 else 0 end)::numeric / 100,
         s.percent
  from (
    select x.user_id, x.percent, b.base,
           sum(b.base) over () as base_total,
           row_number() over (order by (x.user_id <> v_paid_by), x.user_id) as rnk
    from unnest(p_participants, v_percents) as x(user_id, percent)
    cross join lateral (
      select case when p_split_method = 'equal'
                  then (v_cents / v_n)::numeric
                  else floor(v_cents * x.percent / 100) end as base
    ) b
  ) s;

  if (select sum(sp.share_amount) from public.shared_expense_splits sp where sp.expense_id = v_id) <> p_amount then
    raise exception 'split_mismatch' using errcode = '23514';
  end if;

  if p_payer_account_id is not null then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, shared_expense_id)
    values (v_user, p_payer_account_id, 'shared_payment', p_amount, v_occurred_on, left(v_description, 200), v_id);
  end if;

  return v_id;
end;
$$;

create or replace function public.void_shared_expense(p_expense uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_expense public.shared_expenses%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select e.group_id into v_group from public.shared_expenses e where e.id = p_expense;
  if not found then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_group);

  select * into v_expense from public.shared_expenses e where e.id = p_expense for update;

  if v_user <> v_expense.created_by and v_user <> v_expense.paid_by and not exists (
    select 1 from public.shared_expense_splits sp where sp.expense_id = p_expense and sp.user_id = v_user
  ) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_expense.status = 'voided' then
    return; -- idempotent
  end if;

  -- Voiding after someone left would silently break their zero balance.
  if exists (
    select 1 from public.group_members m
    where m.group_id = v_group and m.left_at is not null
      and (m.user_id = v_expense.paid_by
           or m.user_id in (select sp.user_id from public.shared_expense_splits sp where sp.expense_id = p_expense))
  ) then
    raise exception 'participant_left' using errcode = '23514';
  end if;

  update public.shared_expenses set status = 'voided' where id = p_expense;
  update public.transactions set status = 'voided' where shared_expense_id = p_expense and status = 'posted';
end;
$$;

-- RPC: settlements --------------------------------------------------------------------------------

create or replace function public.create_settlement(
  p_group uuid,
  p_to_user uuid,
  p_amount numeric,
  p_occurred_on date default null,
  p_note text default null,
  p_account_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_occurred_on date := coalesce(p_occurred_on, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_account_archived timestamptz;
  v_id uuid;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount >= 1000000000000 or p_amount <> round(p_amount, 2) then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  if p_to_user is null or p_to_user = v_user then
    raise exception 'invalid_settlement_target' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.group_members m
    where m.group_id = p_group and m.user_id = p_to_user and m.left_at is null
  ) then
    raise exception 'participant_not_member' using errcode = '22023';
  end if;

  if p_account_id is not null then
    select a.archived_at into v_account_archived
    from public.accounts a
    where a.id = p_account_id and a.owner_id = v_user;
    if not found then
      raise exception 'account_not_found' using errcode = '23503';
    end if;
    if v_account_archived is not null then
      raise exception 'account_archived' using errcode = '23514';
    end if;
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount, occurred_on, note, created_by)
  values (p_group, v_user, p_to_user, p_amount, v_occurred_on, v_note, v_user)
  returning id into v_id;

  if p_account_id is not null then
    insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, settlement_id)
    values (v_user, p_account_id, 'settlement_out', p_amount, v_occurred_on, v_note, v_id);
  end if;

  return v_id;
end;
$$;

-- The receiver records the money into one of their own accounts (once). Returns the transaction id.
create or replace function public.record_settlement_receipt(p_settlement uuid, p_account_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_settlement public.settlements%rowtype;
  v_account_archived timestamptz;
  v_tx uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then
    raise exception 'settlement_not_found' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_group);

  select * into v_settlement from public.settlements s where s.id = p_settlement for update;

  if v_settlement.to_user <> v_user then
    raise exception 'not_settlement_receiver' using errcode = '42501';
  end if;
  if v_settlement.status <> 'posted' then
    raise exception 'voided_row_is_immutable' using errcode = '23514';
  end if;

  select t.id into v_tx
  from public.transactions t
  where t.settlement_id = p_settlement and t.kind = 'settlement_in' and t.owner_id = v_user and t.status = 'posted';
  if found then
    return v_tx; -- idempotent
  end if;

  select a.archived_at into v_account_archived
  from public.accounts a
  where a.id = p_account_id and a.owner_id = v_user;
  if not found then
    raise exception 'account_not_found' using errcode = '23503';
  end if;
  if v_account_archived is not null then
    raise exception 'account_archived' using errcode = '23514';
  end if;

  insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, note, settlement_id)
  values (v_user, p_account_id, 'settlement_in', v_settlement.amount, v_settlement.occurred_on, v_settlement.note, p_settlement)
  returning id into v_tx;

  return v_tx;
end;
$$;

create or replace function public.void_settlement(p_settlement uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_settlement public.settlements%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select s.group_id into v_group from public.settlements s where s.id = p_settlement;
  if not found then
    raise exception 'settlement_not_found' using errcode = 'P0002';
  end if;

  perform public.lock_group_as_member(v_group);

  select * into v_settlement from public.settlements s where s.id = p_settlement for update;

  if v_user not in (v_settlement.from_user, v_settlement.to_user, v_settlement.created_by) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if v_settlement.status = 'voided' then
    return; -- idempotent
  end if;

  if exists (
    select 1 from public.group_members m
    where m.group_id = v_group and m.left_at is not null
      and m.user_id in (v_settlement.from_user, v_settlement.to_user)
  ) then
    raise exception 'participant_left' using errcode = '23514';
  end if;

  update public.settlements set status = 'voided' where id = p_settlement;
  -- Both sides' personal transactions (the payer's settlement_out and the receiver's settlement_in).
  update public.transactions set status = 'voided' where settlement_id = p_settlement and status = 'posted';
end;
$$;

-- RPC: reads --------------------------------------------------------------------------------------

create or replace function public.get_group_balances(p_group uuid)
returns json
language plpgsql
stable
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

  return (
    select json_build_object('members', coalesce(json_agg(json_build_object(
      'user_id', r.user_id,
      'display_name', p.display_name,
      'paid', r.paid,
      'owed', r.owed,
      'settled_out', r.settled_out,
      'settled_in', r.settled_in,
      'net', r.net
    ) order by p.display_name nulls last, r.user_id), '[]'::json))
    from public.group_balance_rows(p_group) r
    left join public.profiles p on p.id = r.user_id
  );
end;
$$;

create or replace function public.get_my_groups()
returns table (id uuid, name text, kind text, role text, member_count int, my_net numeric, last_activity timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.kind, m.role,
         (select count(*) from public.group_members gm where gm.group_id = g.id and gm.left_at is null)::int,
         coalesce((select r.net from public.group_balance_rows(g.id) r where r.user_id = (select auth.uid())), 0),
         greatest(
           g.created_at,
           coalesce((select max(e.created_at) from public.shared_expenses e where e.group_id = g.id), g.created_at),
           coalesce((select max(s.created_at) from public.settlements s where s.group_id = g.id), g.created_at)
         ) as last_activity
  from public.groups g
  join public.group_members m
    on m.group_id = g.id and m.user_id = (select auth.uid()) and m.left_at is null
  where g.archived_at is null
  order by last_activity desc, g.id;
$$;

-- The caller's own posted shares in a date range, regardless of current membership: leaving a group
-- (balance zero) must not rewrite the user's personal history. Strictly filtered by auth.uid().
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
    and e.occurred_on < p_to;
$$;

-- Month summary: now also counts the caller's own share of shared expenses -----------------------------
-- Same signature and output shape as before. Expense and by_category add the caller's own posted splits
-- (grouped under their own non-archived category named like the template, else under a virtual
-- category 'template:<slug>' using the template's name/icon/color). shared_payment and settlement_*
-- stay out of income/expense. `recent` is unchanged.
create or replace function public.get_month_summary(p_month date)
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as from_day,
           (date_trunc('month', p_month) + interval '1 month')::date as to_day
  ),
  month_tx as (
    select t.*
    from public.transactions t, bounds b
    where t.owner_id = (select auth.uid())
      and t.status = 'posted'
      and t.kind in ('expense', 'income')
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
  ),
  share_cat as (
    select coalesce(c.id::text, 'template:' || coalesce(ms.template_slug, 'none')) as category_id,
           coalesce(c.name, t.name, 'Gastos compartidos') as name,
           coalesce(c.color, t.color, '#6B7280') as color,
           coalesce(c.icon, t.icon, 'Sparkles') as icon,
           ms.amount,
           ms.occurred_on
    from bounds b
    cross join lateral public.my_shared_shares(b.from_day, b.to_day) ms
    left join public.category_templates t on t.slug = ms.template_slug
    left join public.categories c
      on c.owner_id = (select auth.uid())
     and c.kind = 'expense'
     and c.archived_at is null
     and lower(c.name) = lower(t.name)
  ),
  totals as (
    select coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
           coalesce(sum(amount) filter (where kind = 'expense'), 0)
             + (select coalesce(sum(sc.amount), 0) from share_cat sc) as expense
    from month_tx
  ),
  by_cat as (
    select x.category_id, x.name, x.color, x.icon, sum(x.amount) as amount
    from (
      select c.id::text as category_id, c.name, c.color, c.icon, m.amount
      from month_tx m
      join public.categories c on c.id = m.category_id
      where m.kind = 'expense'
      union all
      select sc.category_id, sc.name, sc.color, sc.icon, sc.amount
      from share_cat sc
    ) x
    group by x.category_id, x.name, x.color, x.icon
  ),
  daily as (
    select d.day, sum(d.expense) as expense, sum(d.income) as income
    from (
      select m.occurred_on as day,
             case when m.kind = 'expense' then m.amount else 0 end as expense,
             case when m.kind = 'income' then m.amount else 0 end as income
      from month_tx m
      union all
      select sc.occurred_on, sc.amount, 0
      from share_cat sc
    ) d
    group by d.day
  ),
  recent as (
    select t.id, t.kind, t.amount, t.occurred_on, t.note, t.account_id, t.created_at,
           c.name as category_name, c.color as category_color, c.icon as category_icon,
           a.name as account_name
    from public.transactions t
    cross join bounds b
    join public.accounts a on a.id = t.account_id
    left join public.categories c on c.id = t.category_id
    where t.owner_id = (select auth.uid()) and t.status = 'posted'
      and t.occurred_on >= b.from_day and t.occurred_on < b.to_day
    order by t.occurred_on desc, t.created_at desc
    limit 5
  )
  select json_build_object(
    'income', (select income from totals),
    'expense', (select expense from totals),
    'balance', (select income - expense from totals),
    'available_balance', coalesce((
      select sum(ab.balance) from public.account_balances ab
      where ab.owner_id = (select auth.uid()) and ab.archived_at is null and ab.currency = 'ARS'
    ), 0),
    'by_category', coalesce((
      select json_agg(json_build_object(
        'category_id', bc.category_id, 'name', bc.name, 'color', bc.color, 'icon', bc.icon,
        'amount', bc.amount,
        'percent', round(bc.amount * 100 / nullif((select expense from totals), 0), 1)
      ) order by bc.amount desc, bc.name)
      from by_cat bc
    ), '[]'::json),
    'daily', coalesce((
      select json_agg(json_build_object('day', d.day, 'expense', d.expense, 'income', d.income) order by d.day)
      from daily d
    ), '[]'::json),
    'recent', coalesce((
      select json_agg(to_json(r) order by r.occurred_on desc, r.created_at desc)
      from recent r
    ), '[]'::json)
  );
$$;

-- Function privileges -------------------------------------------------------------------------------
-- RPCs: authenticated only. Internal helpers and trigger functions: nobody through the API.

revoke execute on function
  public.create_group(text, text),
  public.create_group_invite(uuid),
  public.revoke_group_invite(uuid),
  public.join_group(text),
  public.leave_group(uuid),
  public.get_group_members(uuid),
  public.create_shared_expense(uuid, numeric, text, text, date, uuid, text, uuid[], numeric[], uuid),
  public.void_shared_expense(uuid),
  public.create_settlement(uuid, uuid, numeric, date, text, uuid),
  public.record_settlement_receipt(uuid, uuid),
  public.void_settlement(uuid),
  public.get_group_balances(uuid),
  public.get_my_groups(),
  public.my_shared_shares(date, date),
  public.get_month_summary(date)
from public, anon;

grant execute on function
  public.create_group(text, text),
  public.create_group_invite(uuid),
  public.revoke_group_invite(uuid),
  public.join_group(text),
  public.leave_group(uuid),
  public.get_group_members(uuid),
  public.create_shared_expense(uuid, numeric, text, text, date, uuid, text, uuid[], numeric[], uuid),
  public.void_shared_expense(uuid),
  public.create_settlement(uuid, uuid, numeric, date, text, uuid),
  public.record_settlement_receipt(uuid, uuid),
  public.void_settlement(uuid),
  public.get_group_balances(uuid),
  public.get_my_groups(),
  public.my_shared_shares(date, date),
  public.get_month_summary(date)
to authenticated;

revoke execute on function public.forbid_row_mutation() from public, anon, authenticated;
revoke execute on function public.lock_group_as_member(uuid) from public, anon, authenticated;
revoke execute on function public.group_balance_rows(uuid) from public, anon, authenticated;

commit;
