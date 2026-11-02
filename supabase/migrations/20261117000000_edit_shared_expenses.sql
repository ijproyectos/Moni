-- Editing expenses: one atomic step that replaces an expense by another.
--
-- * An individual expense can become a shared one (real members and/or people without an account).
-- * A shared expense can be edited: the old one is voided and the new one created in the same transaction, so a
--   failure never leaves a missing or doubled expense, and the payer's account is charged exactly once.
-- * A shared expense can become an individual expense of the payer.
--
-- Changing what people owe is refused while payments could be left inconsistent: a payment recorded in the group
-- after the expense, or a payment notice waiting to be confirmed. The payments have to be voided first.
--
-- Nothing is deleted. create_shared_expense / create_guest_expense get two optional trailing parameters; calls that do
-- not send them behave exactly as before. (The functions are re-created, so grants are applied again below.)

-- Guard + retire (internal) ------------------------------------------------------------------------------

-- Refuses the change when the group has a payment recorded after `p_since` or a payment notice still open.
create or replace function public.assert_no_payments_after(p_group uuid, p_since timestamptz)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.settlements s where s.group_id = p_group and s.status = 'posted' and s.created_at > p_since)
     or exists (select 1 from public.group_guest_settlements s where s.group_id = p_group and s.status = 'posted' and s.created_at > p_since)
     or exists (select 1 from public.payment_reports r where r.group_id = p_group and r.status = 'reported') then
    raise exception 'expense_has_payments' using errcode = '23514';
  end if;
end;
$$;

-- Voids the expense being replaced. kind: 'transaction' (an individual expense of the caller), 'shared' or 'guest'.
create or replace function public.retire_expense_for_edit(p_kind text, p_id uuid, p_group uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tx public.transactions%rowtype;
  v_group uuid;
  v_created timestamptz;
begin
  if p_id is null or p_kind not in ('transaction', 'shared', 'guest') then
    raise exception 'invalid_replacement' using errcode = '22023';
  end if;

  if p_kind = 'transaction' then
    select * into v_tx from public.transactions t where t.id = p_id and t.owner_id = v_user for update;
    if not found or v_tx.status <> 'posted' or v_tx.kind <> 'expense' then
      raise exception 'transaction_not_found' using errcode = 'P0002';
    end if;
    if v_tx.trip_id is not null then
      raise exception 'transaction_in_trip' using errcode = '23514';
    end if;
    if v_tx.installment_plan_id is not null then
      raise exception 'transaction_is_installment' using errcode = '23514';
    end if;
    update public.transactions set status = 'voided' where id = p_id;
    return;
  end if;

  if p_kind = 'shared' then
    select e.group_id, e.created_at into v_group, v_created from public.shared_expenses e where e.id = p_id and e.status = 'posted';
  else
    select e.group_id, e.created_at into v_group, v_created from public.group_guest_expenses e where e.id = p_id and e.status = 'posted';
  end if;
  if v_group is null then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  if v_group <> p_group then
    raise exception 'expense_group_mismatch' using errcode = '22023';
  end if;
  perform public.assert_no_payments_after(v_group, v_created);
  if p_kind = 'shared' then
    perform public.void_shared_expense(p_id);
  else
    perform public.void_guest_expense(p_id);
  end if;
end;
$$;

-- Shared -> individual ------------------------------------------------------------------------------------

-- The payer turns a shared expense into an individual expense for the full amount they paid. The shared expense is
-- voided (the payer's account gets its money back) and the individual one is created on the chosen account.
create or replace function public.convert_shared_to_expense(
  p_kind text,
  p_id uuid,
  p_account uuid,
  p_category uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_group uuid;
  v_amount numeric;
  v_on date;
  v_desc text;
  v_created timestamptz;
  v_only_me boolean;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_kind = 'shared' then
    select e.group_id, e.amount, e.occurred_on, e.description, e.created_at, (e.paid_by = v_user)
      into v_group, v_amount, v_on, v_desc, v_created, v_only_me
    from public.shared_expenses e where e.id = p_id and e.status = 'posted';
  elsif p_kind = 'guest' then
    select e.group_id, e.amount, e.occurred_on, e.description, e.created_at,
           not exists (select 1 from public.group_guest_expense_parts pt where pt.expense_id = e.id and pt.role = 'payer' and pt.person_id <> v_user)
      into v_group, v_amount, v_on, v_desc, v_created, v_only_me
    from public.group_guest_expenses e where e.id = p_id and e.status = 'posted';
  else
    raise exception 'invalid_replacement' using errcode = '22023';
  end if;
  if v_group is null then
    raise exception 'expense_not_found' using errcode = 'P0002';
  end if;
  -- Same rule as any group write: active member, group not archived.
  if public.lock_group_as_member(v_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;
  if not v_only_me then
    raise exception 'only_payer_can_convert' using errcode = '42501';
  end if;
  perform public.retire_expense_for_edit(p_kind, p_id, v_group);
  insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note)
  values (v_user, p_account, p_category, 'expense', v_amount, v_on, left(coalesce(nullif(btrim(p_note), ''), v_desc), 200))
  returning id into v_id;
  return v_id;
end;
$$;

-- The two creators, with the optional "replaces" parameters ---------------------------------------------------

drop function public.create_shared_expense(uuid, numeric, text, text, date, uuid, text, uuid[], numeric[], uuid);
drop function public.create_guest_expense(uuid, text, numeric, date, text, text, jsonb, jsonb, uuid);

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
  p_payer_account_id uuid default null,
  p_replaces_kind text default null,
  p_replaces_id uuid default null
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

  -- Editing: the expense this one replaces is retired in the same transaction (all or nothing).
  if p_replaces_kind is not null then
    perform public.retire_expense_for_edit(p_replaces_kind, p_replaces_id, p_group);
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

create or replace function public.create_guest_expense(
  p_group uuid,
  p_description text,
  p_amount numeric,
  p_occurred_on date,
  p_template_slug text,
  p_method_label text,
  p_payers jsonb,
  p_shares jsonb,
  p_payer_account_id uuid default null,
  p_replaces_kind text default null,
  p_replaces_id uuid default null
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

  -- Editing: the expense this one replaces is retired in the same transaction (all or nothing).
  if p_replaces_kind is not null then
    perform public.retire_expense_for_edit(p_replaces_kind, p_replaces_id, p_group);
  end if;
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

-- Permissions ------------------------------------------------------------------------------------------------

revoke execute on function
  public.assert_no_payments_after(uuid, timestamptz),
  public.retire_expense_for_edit(text, uuid, uuid)
from public, anon, authenticated;

revoke execute on function
  public.create_shared_expense(uuid, numeric, text, text, date, uuid, text, uuid[], numeric[], uuid, text, uuid),
  public.create_guest_expense(uuid, text, numeric, date, text, text, jsonb, jsonb, uuid, text, uuid),
  public.convert_shared_to_expense(text, uuid, uuid, uuid, text)
from public, anon;

grant execute on function
  public.create_shared_expense(uuid, numeric, text, text, date, uuid, text, uuid[], numeric[], uuid, text, uuid),
  public.create_guest_expense(uuid, text, numeric, date, text, text, jsonb, jsonb, uuid, text, uuid),
  public.convert_shared_to_expense(text, uuid, uuid, uuid, text)
to authenticated;
