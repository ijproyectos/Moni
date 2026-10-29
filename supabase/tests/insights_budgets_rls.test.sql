-- pgTAP: run with `supabase test db` against a local stack (after the three earlier migrations).
begin;
create extension if not exists pgtap with schema extensions;

select plan(79);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- Users: A (main), B (isolation + median threshold + a shared share), C (suggestions), D (no data).
-- Relative dates (Argentina calendar, same expression as suggest_budgets) are used only for C.
create function pg_temp.mday(p_months int, p_day int)
returns date
language sql
as $$
  select (date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
          + make_interval(months => p_months) + make_interval(days => p_day - 1))::date
$$;

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');

insert into public.accounts (id, owner_id, name, kind) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A Caja', 'cash'),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B Caja', 'cash'),
  ('c0000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'C Caja', 'cash');

insert into public.categories (id, owner_id, kind, name, icon, color) values
  ('ca000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'Comida', 'Utensils', '#E5533D'),
  ('ca000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'expense', 'Super', 'ShoppingCart', '#064735'),
  ('ca000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'income', 'Sueldo', 'Wallet', '#0E8A6D'),
  ('ca000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'expense', 'Transporte', 'BusFront', '#2F9E8F'),
  ('ca000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'expense', 'Cerrada', 'Utensils', '#E5533D'),
  ('ca000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'expense', 'Limite80', 'Utensils', '#E5533D'),
  ('ca000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'expense', 'Limite100', 'Utensils', '#E5533D'),
  ('ca000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'expense', 'Limite101', 'Utensils', '#E5533D'),
  ('cb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'expense', 'B gasto', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug1', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug2', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug3', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug4', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug5', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'expense', 'Sug6', 'Utensils', '#E5533D'),
  ('cc000000-0000-0000-0000-000000000007', '33333333-3333-3333-3333-333333333333', 'income', 'CSueldo', 'Wallet', '#0E8A6D');

-- A, October 2026. Cafe: 3 ants whose notes normalize to one key. Super: 3 ants without a note.
-- Subte: only 2 (does not qualify). 8 big expenses push the median to 26.500 (threshold = 10.000).
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-10-02', 'Cafe '),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-10-03', 'cafe'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-10-04', 'CAFE'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'expense', 1000, '2026-10-05', null),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'expense', 1000, '2026-10-06', null),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'expense', 1000, '2026-10-07', null),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'expense', 500, '2026-10-08', 'Subte'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000004', 'expense', 500, '2026-10-09', 'Subte'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000003', 'income', 3000, '2026-10-12', 'cafe'),
  -- Month boundaries: last day of September and first day of November.
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-09-30', 'cafe'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-11-01', 'cafe');
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note)
select '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001',
       'ca000000-0000-0000-0000-000000000002', 'expense', 50000, date '2026-10-10' + g, 'compra grande'
from generate_series(0, 7) g;
-- A voided small expense: must never count.
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note, status, voided_at) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 3000, '2026-10-13', 'cafe', 'voided', now());

-- A, August 2026: spend against the 80% / 100% / over boundaries (budgets of 1.000 each).
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000006', 'expense', 800, '2026-08-05'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000007', 'expense', 1000, '2026-08-05'),
  ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000008', 'expense', 1000.01, '2026-08-05');

-- Budgets created by fixtures (owner_id is explicit because there is no auth.uid() here).
insert into public.budgets (owner_id, category_id, amount) values
  ('22222222-2222-2222-2222-222222222222', 'cb000000-0000-0000-0000-000000000001', 500),
  ('11111111-1111-1111-1111-111111111111', 'ca000000-0000-0000-0000-000000000005', 1000),
  ('11111111-1111-1111-1111-111111111111', 'ca000000-0000-0000-0000-000000000006', 1000),
  ('11111111-1111-1111-1111-111111111111', 'ca000000-0000-0000-0000-000000000007', 1000),
  ('11111111-1111-1111-1111-111111111111', 'ca000000-0000-0000-0000-000000000008', 1000),
  ('33333333-3333-3333-3333-333333333333', 'cc000000-0000-0000-0000-000000000004', 1000);
-- A budget whose category is archived afterwards must disappear from the status.
update public.categories set archived_at = now() where id = 'ca000000-0000-0000-0000-000000000005';

-- B, October 2026: median 200 => default threshold 200. 'x' qualifies (3 x 100); 'y' (3 x 300) does not.
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, note) values
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 100, '2026-10-02', 'x'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 100, '2026-10-03', 'x'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 100, '2026-10-04', 'x'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 300, '2026-10-05', 'y'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 300, '2026-10-06', 'y'),
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 300, '2026-10-07', 'y');

-- A shared expense paid by A and split 1.500,50 / 1.500,50 between A and B (template 'comida').
-- A owns a category called 'Comida' (share goes there); B does not (virtual 'template:comida').
insert into public.groups (id, name, kind, created_by)
values ('90000000-0000-0000-0000-000000000001', 'Casa', 'casa', '11111111-1111-1111-1111-111111111111');
insert into public.shared_expenses (id, group_id, paid_by, amount, description, template_slug, occurred_on, split_method, created_by)
values ('e0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', 3001.00, 'cena', 'comida', '2026-10-06', 'equal',
        '11111111-1111-1111-1111-111111111111');
insert into public.shared_expense_splits (expense_id, group_id, user_id, share_amount) values
  ('e0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1500.50),
  ('e0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 1500.50);

-- C: suggestion fixtures relative to today (months -1, -2, -3 are the last complete months).
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on) values
  -- Sug1: 1.500 + 2.000 + 1.000 in the window; the current month (9.999) must be ignored => 4.500 / 3 = 1.500 => 2.000.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'expense', 1500, pg_temp.mday(-1, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'expense', 2000, pg_temp.mday(-2, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'expense', 1000, pg_temp.mday(-3, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'expense', 9999, pg_temp.mday(0, 1)),
  -- Sug2: spend in a single month only => no suggestion.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000002', 'expense', 5000, pg_temp.mday(-1, 5)),
  -- Sug3: two months with data (the voided month-2 expense does not count) => 250 / 3 => 1.000.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'expense', 100, pg_temp.mday(-1, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'expense', 150, pg_temp.mday(-3, 5)),
  -- Sug4: has an active budget => no suggestion.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000004', 'expense', 1000, pg_temp.mday(-1, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000004', 'expense', 1000, pg_temp.mday(-2, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000004', 'expense', 1000, pg_temp.mday(-3, 5)),
  -- Sug5: current month and four months ago only => outside the window.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000005', 'expense', 5000, pg_temp.mday(0, 1)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000005', 'expense', 5000, pg_temp.mday(-4, 5)),
  -- Sug6: archived afterwards => no suggestion.
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000006', 'expense', 1000, pg_temp.mday(-1, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000006', 'expense', 1000, pg_temp.mday(-2, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000006', 'expense', 1000, pg_temp.mday(-3, 5));
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on, status, voided_at) values
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000003', 'expense', 500, pg_temp.mday(-2, 5), 'voided', now());
-- Income is never suggested.
insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000007', 'income', 1000, pg_temp.mday(-1, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000007', 'income', 1000, pg_temp.mday(-2, 5)),
  ('33333333-3333-3333-3333-333333333333', 'c0000000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000007', 'income', 1000, pg_temp.mday(-3, 5));
update public.categories set archived_at = now() where id = 'cc000000-0000-0000-0000-000000000006';

-- Act as user A ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Budgets: RLS, grants and validation
select lives_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000001', 10000)$$,
  'A creates a budget (owner_id defaults to auth.uid())');
select is_empty(
  $$select 1 from public.budgets where owner_id = '22222222-2222-2222-2222-222222222222'$$,
  'A cannot read B budgets');
select is(
  (select count(*)::int from public.budgets where owner_id = '11111111-1111-1111-1111-111111111111' and category_id = 'ca000000-0000-0000-0000-000000000001'),
  1, 'the new budget is owned by A');
select throws_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000001', 5000)$$,
  '23505', null, 'a second active budget for the same category is rejected');
select throws_ok(
  $$insert into public.budgets (category_id, amount) values ('cb000000-0000-0000-0000-000000000001', 5000)$$,
  '23503', 'category_not_found', 'A cannot budget a B category');
select throws_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000003', 5000)$$,
  '23514', 'category_kind_mismatch', 'an income category cannot have a budget');
select throws_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000005', 5000)$$,
  '23514', 'category_archived', 'an archived category cannot get a new budget');
select throws_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000004', 0)$$,
  '23514', null, 'a zero amount violates the amount > 0 check');
select throws_ok(
  $$insert into public.budgets (owner_id, category_id, amount)
    values ('22222222-2222-2222-2222-222222222222', 'ca000000-0000-0000-0000-000000000004', 5000)$$,
  '42501', null, 'owner_id forgery on insert is rejected');
select throws_ok(
  $$update public.budgets set owner_id = '22222222-2222-2222-2222-222222222222'
    where category_id = 'ca000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner_id cannot be updated');
select throws_ok(
  $$update public.budgets set category_id = 'ca000000-0000-0000-0000-000000000004'
    where category_id = 'ca000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'category_id cannot be updated');
select throws_ok(
  $$update public.budgets set id = gen_random_uuid() where category_id = 'ca000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'id cannot be updated');
select throws_ok(
  $$delete from public.budgets where category_id = 'ca000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'budgets cannot be deleted (no DELETE grant)');
-- Updates against B rows are silently filtered by RLS; verified below as superuser.
update public.budgets set amount = 1 where owner_id = '22222222-2222-2222-2222-222222222222';

-- Archiving frees the category for a new budget; restoring while another is active is rejected.
select lives_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000002', 400000)$$,
  'A creates a Super budget');
select lives_ok(
  $$update public.budgets set archived_at = now()
    where category_id = 'ca000000-0000-0000-0000-000000000002' and archived_at is null$$,
  'A archives the Super budget');
select lives_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000002', 500000)$$,
  'after archiving, a new Super budget is allowed');
select throws_ok(
  $$update public.budgets set archived_at = null
    where category_id = 'ca000000-0000-0000-0000-000000000002' and archived_at is not null$$,
  '23505', null, 'restoring an archived budget while another is active is rejected');
select lives_ok(
  $$insert into public.budgets (category_id, amount) values ('ca000000-0000-0000-0000-000000000004', 100000)$$,
  'A creates a Transporte budget');

-- Budget status (October 2026) ----------------------------------------------------------------------
-- Comida: cafes 9.000 + own share 1.500,50 = 10.500,50 of 10.000 => over. The voided cafe, the 30/09 and
-- 01/11 cafes and the income are all excluded.
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Comida'),
  'over', 'Comida is over its budget');
select ok(
  (select (e->>'spent')::numeric from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Comida') = 10500.50,
  'spent includes the caller share and excludes voided, other-month rows and income');
select ok(
  (select (e->>'remaining')::numeric from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Comida') = -500.50,
  'remaining goes negative when over');
select ok(
  (select (e->>'percent')::numeric from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Comida') = 105.0,
  'percent is rounded to one decimal');
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Super'),
  'warning', 'Super at 80.6% is a warning');
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Transporte'),
  'ok', 'Transporte at 1% is ok');
select is(
  (select count(*)::int from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Super'),
  1, 'the archived Super budget is not listed');
select is(
  (select count(*)::int from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Cerrada'),
  0, 'a budget of an archived category is not listed');
select is(
  (select count(*)::int from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'B gasto'),
  0, 'B budgets never appear for A');
select ok(
  (select (e->>'spent')::numeric from json_array_elements(public.get_budget_status('2026-09-01')) e where e->>'name' = 'Comida') = 3000,
  'the status is scoped to the requested month (September)');
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-08-20')) e where e->>'name' = 'Limite80'),
  'warning', 'exactly 80% is a warning');
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-08-20')) e where e->>'name' = 'Limite100'),
  'warning', 'exactly 100% is still a warning (over means strictly above)');
select is(
  (select e->>'state' from json_array_elements(public.get_budget_status('2026-08-20')) e where e->>'name' = 'Limite101'),
  'over', 'above 100% is over');

-- Period summary ------------------------------------------------------------------------------------
select is(
  (public.get_period_summary('2026-10-01', '2026-11-01')->'by_category')::jsonb,
  (public.get_month_summary('2026-10-15')->'by_category')::jsonb,
  'period by_category equals get_month_summary for a full month');
select is(
  (public.get_period_summary('2026-10-01', '2026-11-01')->'daily')::jsonb,
  (public.get_month_summary('2026-10-15')->'daily')::jsonb,
  'period daily equals get_month_summary for a full month');
select is(
  (select jsonb_build_object('income', p->'income', 'expense', p->'expense', 'balance', p->'balance')
   from (select public.get_period_summary('2026-10-01', '2026-11-01') as p) s),
  (select jsonb_build_object('income', m->'income', 'expense', m->'expense', 'balance', m->'balance')
   from (select public.get_month_summary('2026-10-15') as m) s),
  'period totals equal get_month_summary totals');
select ok(
  (public.get_period_summary('2026-10-01', '2026-11-01')->>'expense')::numeric = 414500.50,
  'period expense includes the caller own share of the shared expense');
select ok(
  (public.get_period_summary('2026-09-30', '2026-11-01')->>'expense')::numeric = 417500.50,
  'from is inclusive (30/09 counted) and to is exclusive (01/11 not counted)');
select throws_ok(
  $$select public.get_period_summary('2026-10-01', '2026-10-01')$$,
  '22023', 'invalid_period', 'an empty range is rejected');
select throws_ok(
  $$select public.get_period_summary('2026-10-02', '2026-10-01')$$,
  '22023', 'invalid_period', 'an inverted range is rejected');
select throws_ok(
  $$select public.get_period_summary('2025-01-01', '2026-02-06')$$,
  '22023', 'invalid_period', 'a range of more than 400 days is rejected');
select lives_ok(
  $$select public.get_period_summary('2025-01-01', '2026-02-05')$$,
  'a range of exactly 400 days is accepted');
select throws_ok(
  $$select public.get_period_summary(null, '2026-10-01')$$,
  '22023', 'invalid_period', 'a null bound is rejected');

-- Ants (A, October 2026) ----------------------------------------------------------------------------
select is(
  json_array_length(public.get_ant_expenses('2026-10-20')->'groups'),
  2, 'two groups qualify (cafe and super); Subte has only 2 occurrences');
select ok(
  (public.get_ant_expenses('2026-10-20')->>'threshold')::numeric = 10000,
  'the default threshold is the lesser of 10.000 and the median (26.500)');
select is(
  public.get_ant_expenses('2026-10-20')->'groups'->0->>'category_name',
  'Comida', 'groups are ordered by total desc (Comida cafes first)');
select is(
  (public.get_ant_expenses('2026-10-20')->'groups'->0->>'count')::int,
  3, 'notes Cafe / cafe / CAFE normalize to one group; the voided one is excluded');
select ok(
  (public.get_ant_expenses('2026-10-20')->'groups'->0->>'total')::numeric = 9000,
  'group total excludes the share, voided, other-month and income rows');
select ok(
  (public.get_ant_expenses('2026-10-20')->'groups'->0->>'average')::numeric = 3000,
  'group average');
select ok(
  (public.get_ant_expenses('2026-10-20')->'groups'->0->>'yearly_projection')::numeric = 108000,
  'yearly projection is total x 12');
select is(
  public.get_ant_expenses('2026-10-20')->'groups'->1->>'label',
  'Super', 'an empty note falls back to the category name');
select is(
  (select count(*)::int from json_array_elements(public.get_ant_expenses('2026-10-20')->'groups') g where g->>'label' = 'Subte'),
  0, 'a group below 3 occurrences is not listed');
select ok(
  (public.get_ant_expenses('2026-10-20')->>'month_total')::numeric = 12000,
  'month_total adds the qualifying groups');
select ok(
  (public.get_ant_expenses('2026-10-20')->>'share_of_expenses')::numeric = 2.9,
  'share_of_expenses divides by the dashboard expense total (shares included)');
select is(
  json_array_length(public.get_ant_expenses('2026-10-20', 500)->'groups'),
  0, 'an explicit threshold of 500 leaves no group with 3 occurrences');
select ok(
  (public.get_ant_expenses('2026-10-20', 500)->>'share_of_expenses') is null,
  'share_of_expenses is null when there are no ants');
select is(
  json_array_length(public.get_ant_expenses('2026-10-20', 1000)->'groups'),
  1, 'an explicit threshold of 1.000 keeps only the Super group');
select throws_ok(
  $$select public.get_ant_expenses('2026-10-20', 0)$$,
  '22023', 'invalid_amount', 'a non-positive threshold is rejected');
select ok(
  (public.get_ant_expenses('2026-01-15')->>'threshold')::numeric = 10000
  and json_array_length(public.get_ant_expenses('2026-01-15')->'groups') = 0,
  'a month without expenses has the default threshold and no groups');

-- Act as user B: isolation and a median below 10.000 ----------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select ok(
  (public.get_ant_expenses('2026-10-20')->>'threshold')::numeric = 200,
  'B default threshold is the median (200) when it is below 10.000');
select is(
  json_array_length(public.get_ant_expenses('2026-10-20')->'groups'),
  1, 'B: only the x group is at or below the threshold');
select is(
  json_array_length(public.get_ant_expenses('2026-10-20', 300)->'groups'),
  2, 'B: raising the threshold to 300 adds the y group');
select ok(
  (public.get_period_summary('2026-10-01', '2026-11-01')->>'expense')::numeric = 2700.50,
  'B period expense is B own data plus B share only (A data does not leak)');
select is(
  (select count(*)::int from json_array_elements(public.get_period_summary('2026-10-01', '2026-11-01')->'by_category') c
   where c->>'category_id' = 'template:comida'),
  1, 'B share without a matching category shows up as a virtual template category');
select is(
  (select count(*)::int from json_array_elements(public.get_budget_status('2026-10-15')) e where e->>'name' = 'Comida'),
  0, 'A budgets never appear for B');

-- Act as user C: suggestions ------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select is(
  (select string_agg(e->>'name', ',' order by ord) from json_array_elements(public.suggest_budgets()) with ordinality as t(e, ord)),
  'Sug1,Sug3',
  'only categories with spend in 2+ of the last 3 complete months, no budget, not archived, expense kind');
select ok(
  (select (e->>'suggested_amount')::numeric from json_array_elements(public.suggest_budgets()) e where e->>'name' = 'Sug1') = 2000,
  'Sug1: 4.500 / 3 = 1.500 rounded up to 2.000 (current month ignored)');
select is(
  (select (e->>'months_with_data')::int from json_array_elements(public.suggest_budgets()) e where e->>'name' = 'Sug1'),
  3, 'Sug1 has 3 months with data');
select ok(
  (select (e->>'suggested_amount')::numeric from json_array_elements(public.suggest_budgets()) e where e->>'name' = 'Sug3') = 1000,
  'Sug3: 250 / 3 rounded up to 1.000');
select is(
  (select (e->>'months_with_data')::int from json_array_elements(public.suggest_budgets()) e where e->>'name' = 'Sug3'),
  2, 'Sug3 counts 2 months (the voided expense does not add a month)');

-- Act as user A again: C data does not leak into suggestions.
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(
  (select count(*)::int from json_array_elements(public.suggest_budgets()) e where e->>'name' like 'Sug%'),
  0, 'A never sees C suggestions');

-- Act as user D: no data.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);
select is(public.suggest_budgets()::text, '[]', 'a user without spend gets no suggestions');
select is(public.get_budget_status('2026-10-01')::text, '[]', 'a user without budgets gets an empty status');

-- Function privileges ---------------------------------------------------------------------------------
select throws_ok(
  $$select public.validate_budget()$$,
  '42501', null, 'the budget trigger function is not executable by authenticated');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from public.budgets', '42501', null, 'anon cannot read budgets');
select throws_ok($$select public.get_period_summary('2026-10-01', '2026-11-01')$$, '42501', null, 'anon cannot call get_period_summary');
select throws_ok($$select public.get_ant_expenses('2026-10-01')$$, '42501', null, 'anon cannot call get_ant_expenses');
select throws_ok($$select public.get_budget_status('2026-10-01')$$, '42501', null, 'anon cannot call get_budget_status');
select throws_ok($$select public.suggest_budgets()$$, '42501', null, 'anon cannot call suggest_budgets');
select throws_ok($$select * from public.personal_movements('2026-10-01', '2026-11-01')$$, '42501', null, 'anon cannot call personal_movements');

-- B budget untouched by A (verified as superuser) -------------------------------------------------
reset role;
select ok(
  (select amount from public.budgets where owner_id = '22222222-2222-2222-2222-222222222222') = 500,
  'A update did not touch the B budget');

select * from finish();
rollback;
