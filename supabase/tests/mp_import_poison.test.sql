-- pgTAP for the poison-row policy of import_mp_payments (20261112000400_mp_import_poison_rows.sql).
-- Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

-- U5: Plus, a connection with a wallet, NO expense category (every payment fails with category_unavailable).
-- U6: Plus, wallet and a category (used for a malformed row next to a good one).
insert into auth.users (id, email)
values
  ('55555555-5555-5555-5555-555555555555', 'e@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'f@example.com');
insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('55555555-5555-5555-5555-555555555555', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('66666666-6666-6666-6666-666666666666', 'promo', now() - interval '1 day', now() + interval '30 days');
insert into public.accounts (id, owner_id, name, kind) values
  ('a5000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'Mercado Pago', 'wallet'),
  ('a6000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'Mercado Pago', 'wallet');
insert into public.mp_connections (user_id, mp_user_id, account_id) values
  ('55555555-5555-5555-5555-555555555555', 'mp-5', 'a5000000-0000-0000-0000-000000000001'),
  ('66666666-6666-6666-6666-666666666666', 'mp-6', 'a6000000-0000-0000-0000-000000000001');
insert into public.categories (id, owner_id, kind, name, icon, color) values
  ('c6000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666', 'expense', 'Comida', 'Utensils', '#E5533D');

select is(has_table_privilege('authenticated', 'public.mp_import_failures', 'SELECT'), false,
  'authenticated cannot read the failure counters');
select is(has_table_privilege('anon', 'public.mp_import_failures', 'SELECT'), false,
  'anon cannot read the failure counters');

-- Failures 1 and 2: reported as failed (the run stays partial and retries) ------------------------------------
select is(public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x1", "status": "approved", "operation_type": "regular_payment", "amount": 700,
   "date_approved": "2026-03-01T15:00:00Z", "merchant": "Kiosco"}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 0, "needs_review": 0, "failed": 1}'::jsonb,
  'first failure is reported as failed');
select is((select attempts::int from public.mp_import_failures where payment_id = 'x1'), 1, 'the counter starts at 1');
select is((select count(*)::int from public.mp_imported_payments where payment_id = 'x1'), 0, 'nothing is stored yet');
select is((public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x1", "status": "approved", "operation_type": "regular_payment", "amount": 700,
   "date_approved": "2026-03-01T15:00:00Z", "merchant": "Kiosco"}]$j$::jsonb) ->> 'failed')::int, 1,
  'second failure is still reported as failed');
select is((select attempts::int from public.mp_import_failures where payment_id = 'x1'), 2, 'the counter is 2');

-- Failure 3: quarantined (reported as needs_review, the run can complete) ----------------------------------------
select is(public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x1", "status": "approved", "operation_type": "regular_payment", "amount": 700,
   "date_approved": "2026-03-01T15:00:00Z", "merchant": "Kiosco"}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 0, "needs_review": 1, "failed": 0}'::jsonb,
  'third failure quarantines the payment (needs_review, not failed)');
select is((select m.outcome || '/' || coalesce(m.transaction_id::text, 'none') || '/' || m.amount::text || '/' || m.merchant
           from public.mp_imported_payments m where m.payment_id = 'x1'),
  'needs_review/none/700.00/Kiosco', 'the quarantined payment keeps its data and has no transaction');
select is((select count(*)::int from public.transactions where owner_id = '55555555-5555-5555-5555-555555555555'), 0,
  'no transaction was created');
select is((select count(*)::int from public.mp_import_failures where payment_id = 'x1'), 0, 'the counter is cleared');
select is((public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x1", "status": "approved", "operation_type": "regular_payment", "amount": 700,
   "date_approved": "2026-03-01T15:00:00Z", "merchant": "Kiosco"}]$j$::jsonb) ->> 'skipped')::int, 1,
  'a quarantined payment is a seen payment: later runs skip it');

-- A success clears the counter (the user fixed the cause in between) ---------------------------------------------
select public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x2", "status": "approved", "operation_type": "regular_payment", "amount": 90,
   "date_approved": "2026-03-02T15:00:00Z", "merchant": "Cafe"}]$j$::jsonb);
select is((select attempts::int from public.mp_import_failures where payment_id = 'x2'), 1, 'x2 failed once');
insert into public.categories (id, owner_id, kind, name, icon, color) values
  ('c5000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'expense', 'Comida', 'Utensils', '#E5533D');
select is((public.import_mp_payments('55555555-5555-5555-5555-555555555555', $j$[
  {"payment_id": "x2", "status": "approved", "operation_type": "regular_payment", "amount": 90,
   "date_approved": "2026-03-02T15:00:00Z", "merchant": "Cafe"}]$j$::jsonb) ->> 'posted')::int, 1,
  'once the category exists the payment is posted');
select is((select count(*)::int from public.mp_import_failures where payment_id = 'x2'), 0, 'the success clears the counter');

-- A malformed row next to a good one: the good one is never blocked, the bad one is quarantined on run 3 ----------
select is(public.import_mp_payments('66666666-6666-6666-6666-666666666666', $j$[
  {"payment_id": "g1", "status": "approved", "operation_type": "regular_payment", "amount": 10,
   "date_approved": "2026-03-03T15:00:00Z", "merchant": "A"},
  {"payment_id": "bad1", "status": "approved", "operation_type": "regular_payment", "amount": "abc",
   "date_approved": "2026-03-03T15:00:00Z", "merchant": "B"}]$j$::jsonb),
  '{"posted": 1, "voided": 0, "skipped": 0, "needs_review": 0, "failed": 1}'::jsonb,
  'a malformed payment fails alone and the good one is posted');
select public.import_mp_payments('66666666-6666-6666-6666-666666666666', $j$[
  {"payment_id": "bad1", "status": "approved", "operation_type": "regular_payment", "amount": "abc",
   "date_approved": "2026-03-03T15:00:00Z", "merchant": "B"}]$j$::jsonb);
select is((public.import_mp_payments('66666666-6666-6666-6666-666666666666', $j$[
  {"payment_id": "bad1", "status": "approved", "operation_type": "regular_payment", "amount": "abc",
   "date_approved": "2026-03-03T15:00:00Z", "merchant": "B"}]$j$::jsonb) ->> 'needs_review')::int, 1,
  'a malformed payment is quarantined with a neutral amount on the third failure');

select * from finish();
rollback;
