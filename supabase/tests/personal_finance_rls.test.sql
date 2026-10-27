-- pgTAP: run with `supabase test db` against a local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(36);

-- Fixtures as superuser: users A, B, C and some owned rows.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com');

insert into public.accounts (id, owner_id, name, kind, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A Caja', 'cash', 5000),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A Banco', 'bank', 0),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B Caja', 'cash', 100);

insert into public.categories (id, owner_id, kind, name, icon, color) values
  ('ca000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'A gasto', 'Utensils', '#E5533D'),
  ('ca000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'income', 'A ingreso', 'Wallet', '#0E8A6D'),
  ('cb000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'expense', 'B gasto', 'Utensils', '#E5533D');

insert into public.transactions (id, owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('f0000000-0000-0000-0000-00000000000b', '22222222-2222-2222-2222-222222222222',
   'b0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 10, '2026-10-02');

insert into public.accounts (id, owner_id, name, kind) values
  ('b0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B Banco', 'bank');
insert into public.transfers (owner_id, from_account_id, to_account_id, amount, occurred_on) values
  ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000002', 5, '2026-10-02');

-- User D has no profile row (to exercise profile_not_found).
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'd@example.com');
delete from public.profiles where id = '44444444-4444-4444-4444-444444444444';

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from public.accounts), 2, 'A sees only their own accounts');
select is_empty($$select 1 from public.accounts where owner_id = '22222222-2222-2222-2222-222222222222'$$, 'A cannot read B accounts');
select is_empty($$select 1 from public.categories where owner_id = '22222222-2222-2222-2222-222222222222'$$, 'A cannot read B categories');
select is_empty($$select 1 from public.transactions where owner_id = '22222222-2222-2222-2222-222222222222'$$, 'A cannot read B transactions');
select is_empty($$select 1 from public.transfers where owner_id = '22222222-2222-2222-2222-222222222222'$$, 'A cannot read B transfers');
select is_empty($$select 1 from public.account_balances where owner_id = '22222222-2222-2222-2222-222222222222'$$, 'A cannot read B balances');

-- Updates against B rows are silently filtered by RLS; verified below as superuser.
update public.accounts set name = 'hacked' where id = 'b0000000-0000-0000-0000-000000000001';
update public.categories set name = 'hacked' where id = 'cb000000-0000-0000-0000-000000000001';
update public.transactions set note = 'hacked' where id = 'f0000000-0000-0000-0000-00000000000b';
update public.transfers set note = 'hacked' where owner_id = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$insert into public.transactions (account_id, category_id, kind, amount, occurred_on)
    values ('b0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 10, '2026-10-05')$$,
  '23503', 'account_not_found', 'A cannot create a transaction on a B account');

select throws_ok(
  $$insert into public.transactions (account_id, category_id, kind, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000001', 'expense', 10, '2026-10-05')$$,
  '23503', 'category_not_found', 'A cannot use a B category');

-- owner_id is not writable by clients (column privilege), on insert and update.
select throws_ok(
  $$insert into public.transactions (owner_id, account_id, category_id, kind, amount, occurred_on)
    values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001',
            'ca000000-0000-0000-0000-000000000001', 'expense', 10, '2026-10-05')$$,
  '42501', null, 'owner_id forgery on insert is rejected');

select throws_ok(
  $$update public.transactions set owner_id = '22222222-2222-2222-2222-222222222222'
    where owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'owner_id forgery on update is rejected');

-- Archived categories cannot receive new movements.
insert into public.categories (kind, name, icon, color) values ('expense', 'A archivada', 'Utensils', '#E5533D');
update public.categories set archived_at = now() where name = 'A archivada';
select throws_ok(
  $$insert into public.transactions (account_id, category_id, kind, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001',
            (select id from public.categories where name = 'A archivada'), 'expense', 10, '2026-10-05')$$,
  '23514', 'category_archived', 'archived category is rejected');

select throws_ok(
  $$insert into public.transactions (account_id, category_id, kind, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'expense', 10, '2026-10-05')$$,
  '23514', 'category_kind_mismatch', 'expense with an income category is rejected');

-- Same valid row as an expense except for kind: only the RLS insert policy can reject it.
select throws_ok(
  $$insert into public.transactions (account_id, category_id, kind, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'shared_payment', 10, '2026-10-05')$$,
  '42501', 'new row violates row-level security policy for table "transactions"',
  'clients cannot create reserved kinds (RLS policy)');

select throws_ok(
  $$insert into public.transfers (from_account_id, to_account_id, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10, '2026-10-05')$$,
  '23503', 'account_not_found', 'transfer to a foreign account is rejected');

select throws_ok(
  $$delete from public.transactions$$, '42501', null, 'clients cannot delete transactions');

-- Balances and month summary. Opening balance of A Caja is 5000.
-- Fixture rows are inserted without id (id is not insertable by clients) and located by note.
insert into public.transactions (account_id, category_id, kind, amount, occurred_on, note) values
  ('a0000000-0000-0000-0000-000000000001',
   'ca000000-0000-0000-0000-000000000001', 'expense', 1000, '2026-10-10', 'exp1');

select is(
  (select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  4000.00::numeric, 'expense lowers the account balance');

insert into public.transactions (account_id, category_id, kind, amount, occurred_on, note) values
  ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'income', 3000, '2026-10-11', 'inc1');

select is(
  (select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  7000.00::numeric, 'income raises the account balance');

select is(
  (select (public.get_month_summary('2026-10-20')->>'income')::numeric
        || '/' || (public.get_month_summary('2026-10-20')->>'expense')::numeric),
  '3000.00/1000.00', 'month summary totals income and expense');

insert into public.transfers (from_account_id, to_account_id, amount, occurred_on, note) values
  ('a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002', 500, '2026-10-12', 'tr1');

select is(
  (select (public.get_month_summary('2026-10-20')->>'income')::numeric
        || '/' || (public.get_month_summary('2026-10-20')->>'expense')::numeric),
  '3000.00/1000.00', 'transfer does not change income/expense');

select is(
  (select string_agg(balance::text, ',' order by account_id) from public.account_balances),
  '6500.00,500.00', 'transfer moves money between account balances');

select is(
  (public.get_month_summary('2026-10-20')->>'available_balance')::numeric,
  7000.00::numeric, 'available balance is unchanged by an internal transfer');

-- voided_at is trigger-managed: clients cannot write it directly.
select throws_ok(
  $$update public.transactions set voided_at = now() where note = 'inc1'$$,
  '42501', null, 'voided_at cannot be written directly');

update public.transactions set status = 'voided' where note = 'exp1';

select is(
  (select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  7500.00::numeric, 'voided transaction is excluded from the balance');

select is(
  (public.get_month_summary('2026-10-20')->>'expense')::numeric,
  0::numeric, 'voided transaction is excluded from the month summary');

select throws_ok(
  $$update public.transactions set note = 'edit' where note = 'exp1'$$,
  '23514', 'voided_row_is_immutable', 'voided transactions cannot be edited');

select throws_ok(
  $$update public.transactions set status = 'posted' where note = 'exp1'$$,
  '23514', 'voided_row_is_immutable', 'voided -> posted is rejected');

-- Voiding the transfer returns the money: Caja 7500 + 500 = 8000, Banco back to 0.
update public.transfers set status = 'voided' where note = 'tr1';

select is(
  (select string_agg(balance::text, ',' order by account_id) from public.account_balances),
  '8000.00,0.00', 'voided transfer is excluded from balances');

-- Summary isolation and month scoping: a September row must not show in October recent,
-- and none of B's October data may leak into A''s summary.
insert into public.transactions (account_id, category_id, kind, amount, occurred_on, note) values
  ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000002', 'income', 7, '2026-09-15', 'sep');

select is(
  (select count(*)::int from json_array_elements(public.get_month_summary('2026-10-20')->'recent') e
   where e->>'account_id' = 'b0000000-0000-0000-0000-000000000001'),
  0, 'A month summary does not include B data');

select is(
  (select string_agg(e->>'occurred_on', ',') from json_array_elements(public.get_month_summary('2026-10-20')->'recent') e),
  '2026-10-11', 'recent is limited to the selected month (voided and other-month rows excluded)');

-- Onboarding: user C has no accounts; calling twice must not duplicate anything.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select public.complete_onboarding(array['ahorrar'], array['comida', 'sueldo']);
select public.complete_onboarding(array['ahorrar'], array['comida', 'sueldo']);

select is((select count(*)::int from public.categories), 2, 'complete_onboarding copies each template once');
select is((select count(*)::int from public.accounts where name = 'Efectivo'), 1, 'complete_onboarding creates one default account');
select is(
  (select goals from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  array['ahorrar'], 'complete_onboarding stores goals');

-- Onboarding without a profile row fails clearly.
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);
select throws_ok(
  $$select public.complete_onboarding(array['ahorrar'], array['comida'])$$,
  'P0002', 'profile_not_found', 'complete_onboarding without a profile raises profile_not_found');

-- Anonymous visitors.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from public.accounts', '42501', null, 'anon cannot read accounts');

-- B rows untouched by A (verified as superuser).
reset role;
select is((select name from public.accounts where id = 'b0000000-0000-0000-0000-000000000001'), 'B Caja', 'A update did not touch B account');
select is((select note from public.transactions where id = 'f0000000-0000-0000-0000-00000000000b'), null, 'A update did not touch B transaction');

select * from finish();
rollback;
