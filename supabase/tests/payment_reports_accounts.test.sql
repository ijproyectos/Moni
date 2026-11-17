-- pgTAP: run with `supabase test db` against a LOCAL stack, after 20261122000000_payment_reports_accounts.sql.
-- Never against production. Scenario: Ana (A) and Beto (B) share the group "Casa"; A paid a shared expense, so B owes A.
begin;
create extension if not exists pgtap with schema extensions;

select plan(34);

-- Fixtures as superuser ----------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.accounts (id, owner_id, name, kind, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A Caja', 'cash', 1000),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B Caja', 'cash', 500);

insert into public.groups (id, name, kind, created_by)
values ('90000000-0000-0000-0000-000000000001', 'Casa', 'casa', '11111111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role) values
  ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('90000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member');

-- A pays 100.00 split between A and B from A Caja: A Caja 900, B owes A 50.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 100.00, p_description => 'Cena',
  p_template_slug => null, p_occurred_on => '2026-10-05',
  p_paid_by => '11111111-1111-1111-1111-111111111111', p_split_method => 'equal',
  p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[],
  p_payer_account_id => 'a0000000-0000-0000-0000-000000000001');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  900.00::numeric, 'the group expense took its full amount from the payer account; the 50 owed is not credited');

-- 1. «Ya pagué» (partial, 20 of 50) with an account: B's money leaves at once -----------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('t.r1', public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 20.00, 'b0000000-0000-0000-0000-000000000001')::text, true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'),
  480.00::numeric, 'reporting with an account discounts the payer immediately');
select is((select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
           where m->>'user_id' = '22222222-2222-2222-2222-222222222222'),
  -50.00::numeric, 'the group debt is still open until the receiver confirms');
select is((select count(*)::int from public.transactions where payment_report_id = current_setting('t.r1')::uuid
           and kind = 'settlement_out' and status = 'posted' and settlement_id is null), 1, 'one outgoing movement linked to the notice');
select throws_ok($$select public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 20.00, 'b0000000-0000-0000-0000-000000000001')$$,
  '23505', 'report_already_open', 'a second open notice for the same pair is refused (no double discount)');
select throws_ok($$insert into public.transactions (owner_id, account_id, kind, amount, occurred_on, settlement_id)
  values ('22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'settlement_out', 1, '2026-10-05', gen_random_uuid())$$,
  '42501', null, 'RLS: a person cannot write settlement movements directly');
select is((select count(*)::int from public.transactions where owner_id = '11111111-1111-1111-1111-111111111111'), 0,
  'RLS: B does not see A''s movements');

-- 2. «Confirmar recepción» --------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$select public.confirm_payment_report(current_setting('t.r1')::uuid, null)$$,
  '22023', 'account_required', 'confirming needs an account');
select throws_ok($$select public.confirm_payment_report(current_setting('t.r1')::uuid, 'b0000000-0000-0000-0000-000000000001')$$,
  '23503', 'account_not_found', 'the account must be the receiver''s own');
select isnt((select public.confirm_payment_report(current_setting('t.r1')::uuid, 'a0000000-0000-0000-0000-000000000001')), null,
  'confirming settles the debt and returns the settlement');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  920.00::numeric, 'the receiver account is credited only now');
select throws_ok($$select public.confirm_payment_report(current_setting('t.r1')::uuid, 'a0000000-0000-0000-0000-000000000001')$$,
  '22023', 'report_not_open', 'a duplicate confirmation is refused (no double credit)');
select is((select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
           where m->>'user_id' = '22222222-2222-2222-2222-222222222222'),
  -30.00::numeric, 'partial payment: 30 are still owed');
reset role;
select is((select count(*)::int from public.transactions t join public.payment_reports r on r.settlement_id = t.settlement_id
           where r.id = current_setting('t.r1')::uuid and t.kind in ('settlement_out', 'settlement_in') and t.status = 'posted'),
  2, 'exactly one movement per side, both linked to the settlement');
select is((select count(*)::int from public.transactions where payment_report_id = current_setting('t.r1')::uuid), 1,
  'the payer''s movement is the same row from the notice (not a new one)');
set local role authenticated;

-- 3. Cancel: the payer takes the notice back, the money returns -------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('t.r2', public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 30.00, 'b0000000-0000-0000-0000-000000000001')::text, true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 450.00::numeric,
  'second notice discounts again, once');
select lives_ok($$select public.cancel_payment_report(current_setting('t.r2')::uuid)$$, 'the payer cancels the notice');
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 480.00::numeric,
  'cancelling gives the money back');
select throws_ok($$select public.cancel_payment_report(current_setting('t.r2')::uuid)$$, '22023', 'report_not_open',
  'cancelling twice is refused (no double refund)');

-- 4. Reject: the receiver says "No lo recibí", the money returns -------------------------------------------------
select set_config('t.r3', public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 30.00, 'b0000000-0000-0000-0000-000000000001')::text, true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 450.00::numeric,
  'third notice discounts');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok($$select public.reject_payment_report(current_setting('t.r3')::uuid)$$, 'the receiver rejects it');
select throws_ok($$select public.confirm_payment_report(current_setting('t.r3')::uuid, 'a0000000-0000-0000-0000-000000000001')$$,
  '22023', 'report_not_open', 'a rejected notice cannot be confirmed afterwards');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'), 920.00::numeric,
  'rejecting credits nothing to the receiver');
reset role;
select is((select count(*)::int from public.transactions where payment_report_id = current_setting('t.r3')::uuid and status = 'voided'), 1,
  'the payer''s movement of the rejected notice is voided');
set local role authenticated;

-- 5. Notice without an account (also what old notices look like): nothing is discounted, confirming credits only the receiver
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('t.r4', public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 30.00)::text, true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 480.00::numeric,
  'without an account nothing is discounted');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select isnt((select public.confirm_payment_report(current_setting('t.r4')::uuid, 'a0000000-0000-0000-0000-000000000001')), null,
  'it can still be confirmed');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'), 950.00::numeric,
  'the receiver is credited, the payer is not discounted twice');
select is((select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
           where m->>'user_id' = '22222222-2222-2222-2222-222222222222'), 0.00::numeric, 'the debt is paid off');

-- 6. Debt settled another way before the confirmation: the notice closes and the payer's money returns -----------
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 40.00, p_description => 'Super',
  p_template_slug => null, p_occurred_on => '2026-10-06',
  p_paid_by => '11111111-1111-1111-1111-111111111111', p_split_method => 'equal',
  p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[],
  p_payer_account_id => 'a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select set_config('t.r5', public.report_payment('90000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111', 20.00, 'b0000000-0000-0000-0000-000000000001')::text, true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 460.00::numeric,
  'a new notice discounts 20');
select public.create_settlement('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 20.00);
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select public.confirm_payment_report(current_setting('t.r5')::uuid, 'a0000000-0000-0000-0000-000000000001')), null::uuid,
  'confirming a debt that was already settled returns NULL');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'), 910.00::numeric,
  'and credits nothing');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'), 480.00::numeric,
  'the payer''s discount of that notice was given back');

-- 7. Statistics are untouched: payments and collections are never income or expense -----------------------------
select is(((public.get_month_summary(date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date))->>'income')::numeric,
  0::numeric, 'B has no income in the month summary');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is(((public.get_month_summary(date_trunc('month', (now() at time zone 'America/Argentina/Buenos_Aires'))::date))->>'income')::numeric,
  0::numeric, 'A has no income in the month summary either (the collections are balance only)');

select * from finish();
rollback;
