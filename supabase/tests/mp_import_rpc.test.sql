-- pgTAP for work unit 2: import_mp_payments, the edit trigger, the cross-claim guard and get_mp_import_duplicates().
-- Run with `supabase test db` (after 20261112000100_mp_import_rpc.sql and 20261112000200_mp_dedupe_guard.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(63);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- U1: Plus with a MP wallet. U2: Plus but no account on the connection. U3: free. U4: Plus, no "Otros" category.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('44444444-4444-4444-4444-444444444444', 'promo', now() - interval '1 day', now() + interval '30 days');

insert into public.accounts (id, owner_id, name, kind) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mercado Pago', 'wallet'),
  ('a1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Banco', 'bank'),
  ('a4000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'Mercado Pago', 'wallet');

insert into public.mp_connections (user_id, mp_user_id, account_id) values
  ('11111111-1111-1111-1111-111111111111', 'mp-1', 'a1000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222', 'mp-2', null),
  ('44444444-4444-4444-4444-444444444444', 'mp-4', 'a4000000-0000-0000-0000-000000000001');

insert into public.categories (id, owner_id, kind, name, icon, color, archived_at, created_at) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'Comida', 'Utensils', '#E5533D', null, now()),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'expense', 'Otros', 'Utensils', '#E5533D', null, now()),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'income', 'Sueldo', 'Wallet', '#0E8A6D', null, now()),
  ('c1000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'expense', 'Vieja', 'Utensils', '#E5533D', now(), now()),
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'expense', 'Ajena', 'Utensils', '#E5533D', null, now()),
  ('c4000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'expense', 'Zeta', 'Utensils', '#E5533D', null, now() - interval '2 days'),
  ('c4000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'expense', 'Alfa', 'Utensils', '#E5533D', null, now() - interval '1 day');

-- Netflix 5000 due on 2026-03-10 (monthly) and a fixed expense due on 2026-03-05.
insert into public.subscriptions (id, owner_id, service_id, name, amount, period, anchor_on, next_charge_on, account_id, category_id) values
  ('51000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'netflix', 'Netflix', 5000, 'monthly',
   '2026-03-10', '2026-03-10', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001');
insert into public.fixed_expenses (id, owner_id, kind_id, name, amount, period, anchor_on, next_due_on, account_id, category_id) values
  ('f1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'luz', 'Luz', 3000, 'monthly',
   '2026-03-05', '2026-03-05', 'a1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001');
insert into public.fixed_expense_occurrences (id, owner_id, fixed_expense_id, due_on, expected_amount) values
  ('f2000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'f1000000-0000-0000-0000-000000000001', '2026-03-05', 3000);

-- Privileges ---------------------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'public.import_mp_payments(uuid, jsonb)', 'EXECUTE'), false,
  'authenticated cannot execute import_mp_payments');
select is(has_function_privilege('anon', 'public.import_mp_payments(uuid, jsonb)', 'EXECUTE'), false,
  'anon cannot execute import_mp_payments');
select is(has_function_privilege('service_role', 'public.import_mp_payments(uuid, jsonb)', 'EXECUTE'), true,
  'service_role can execute import_mp_payments');
select is(has_function_privilege('authenticated', 'public.get_mp_import_duplicates()', 'EXECUTE'), true,
  'authenticated can execute get_mp_import_duplicates');
select is(has_function_privilege('anon', 'public.get_mp_import_duplicates()', 'EXECUTE'), false,
  'anon cannot execute get_mp_import_duplicates');

-- Guards ----------------------------------------------------------------------------------------------
select throws_ok($$select public.import_mp_payments(null, '[]'::jsonb)$$, '22023', null, 'null owner is rejected');
select throws_ok($$select public.import_mp_payments('11111111-1111-1111-1111-111111111111', '{}'::jsonb)$$, '22023', null,
  'a non-array payload is rejected');
select throws_ok($$select public.import_mp_payments('33333333-3333-3333-3333-333333333333', '[]'::jsonb)$$, '54000', null,
  'a free user cannot import (plus_required)');
select throws_ok($$select public.import_mp_payments('22222222-2222-2222-2222-222222222222', '[]'::jsonb)$$, '23503', null,
  'a connection without an account raises account_unavailable');

-- Insert path (R2.3) -------------------------------------------------------------------------------------
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "p1", "status": "approved", "operation_type": "regular_payment", "amount": 1200.5,
   "date_approved": "2026-03-01T01:30:00Z", "date_created": "2026-03-01T01:00:00Z", "merchant": "Cafe Martinez",
   "category_id": "c1000000-0000-0000-0000-000000000001"}]$j$::jsonb),
  '{"posted": 1, "voided": 0, "skipped": 0, "needs_review": 0, "failed": 0}'::jsonb, 'a regular payment is posted');
select is((select count(*)::int from public.transactions where owner_id = '11111111-1111-1111-1111-111111111111'), 1,
  'one transaction was created');
select is((select t.occurred_on from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p1'), '2026-02-28'::date, 'date_approved 2026-03-01T01:30Z maps to 2026-02-28 in Buenos Aires');
select is((select t.account_id from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p1'), 'a1000000-0000-0000-0000-000000000001'::uuid, 'posted in the connection account');
select is((select t.category_id from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p1'), 'c1000000-0000-0000-0000-000000000001'::uuid, 'a valid category is kept');
select is((select t.amount from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p1'), 1200.50::numeric, 'amount is copied');
select is((select t.note from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p1'), 'Cafe Martinez', 'note comes from the merchant text');
select is((select m.outcome || '/' || m.mp_status from public.mp_imported_payments m where m.payment_id = 'p1'),
  'posted/approved', 'the import row records outcome and MP status');
select is((select count(*)::int from pg_locks
           where locktype = 'advisory' and pid = pg_backend_pid()
             and ((classid::bigint << 32) | objid::bigint) = hashtextextended('mp_import:11111111-1111-1111-1111-111111111111', 0)),
  1, 'the per-user advisory lock is held');

-- Dedupe on payment_id (R2.4)
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "p1", "status": "approved", "operation_type": "regular_payment", "amount": 1200.5,
   "date_approved": "2026-03-01T01:30:00Z", "merchant": "Cafe Martinez"}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 1, "needs_review": 0, "failed": 0}'::jsonb, 're-importing the same payment is a noop');
select is((select count(*)::int from public.transactions where owner_id = '11111111-1111-1111-1111-111111111111'), 1,
  'no second transaction after a re-sync');

-- Date fallback, note limit, merchant limit
select public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "p2", "status": "approved", "operation_type": "money_transfer", "amount": 10,
   "date_created": "2026-03-05T12:00:00Z", "merchant": "Juan"}]$j$::jsonb);
select is((select t.occurred_on from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p2'), '2026-03-05'::date, 'created date is the fallback when there is no approval date');
select public.import_mp_payments('11111111-1111-1111-1111-111111111111',
  jsonb_build_array(jsonb_build_object('payment_id', 'p3', 'status', 'approved', 'operation_type', 'regular_payment',
    'amount', 10, 'date_approved', '2026-03-05T12:00:00Z', 'merchant', repeat('x', 300))));
select is((select char_length(t.note) from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'p3'), 200, 'note is limited to 200 characters');
select is((select char_length(m.merchant) from public.mp_imported_payments m where m.payment_id = 'p3'), 120,
  'stored merchant is limited to 120 characters');

-- Privacy allowlist (R2.8)
select is((select array_agg(column_name::text order by column_name) from information_schema.columns
           where table_schema = 'public' and table_name = 'mp_imported_payments'),
  array['amount', 'duplicate_dismissed', 'edited_at', 'imported_at', 'merchant', 'mp_status', 'occurred_on', 'operation_type',
        'outcome', 'owner_id', 'payment_id', 'suggested_subscription_id', 'transaction_id', 'updated_at'],
  'mp_imported_payments columns match the allowlist (no payload, payer or card data)');

-- Category validation with fallback (R2.6): income, other user's, archived, missing and malformed ids -> Otros
select public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "c1", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z",
   "category_id": "c1000000-0000-0000-0000-000000000003"},
  {"payment_id": "c2", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z",
   "category_id": "c2000000-0000-0000-0000-000000000001"},
  {"payment_id": "c3", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z",
   "category_id": "c1000000-0000-0000-0000-000000000004"},
  {"payment_id": "c4", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z"},
  {"payment_id": "c5", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z",
   "category_id": "not-a-uuid"}]$j$::jsonb);
select is((select count(*)::int from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id like 'c_' and t.category_id = 'c1000000-0000-0000-0000-000000000002'), 5,
  'invalid or missing categories fall back to Otros');
select public.import_mp_payments('44444444-4444-4444-4444-444444444444', $j$[
  {"payment_id": "c6", "status": "approved", "operation_type": "regular_payment", "amount": 1, "date_approved": "2026-03-06T12:00:00Z"}]$j$::jsonb);
select is((select t.category_id from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'c6'), 'c4000000-0000-0000-0000-000000000001'::uuid,
  'without Otros the first active expense category is the fallback');

-- Savepoint per payment (R2.4): malformed rows are counted and the rest of the batch imports
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "m1", "status": "approved", "operation_type": "regular_payment", "amount": "abc", "date_approved": "2026-03-07T12:00:00Z"},
  {"payment_id": "m2", "status": "approved", "operation_type": "regular_payment", "amount": 20, "date_approved": "2026-03-07T12:00:00Z"},
  {"status": "approved", "operation_type": "regular_payment", "amount": 20, "date_approved": "2026-03-07T12:00:00Z"},
  {"payment_id": "m3", "status": "approved", "operation_type": "regular_payment", "amount": -5, "date_approved": "2026-03-07T12:00:00Z"},
  {"payment_id": "m4", "status": "approved", "operation_type": "regular_payment", "amount": 20}]$j$::jsonb),
  '{"posted": 1, "voided": 0, "skipped": 0, "needs_review": 0, "failed": 4}'::jsonb,
  'malformed rows fail individually and the others import');
select is((select count(*)::int from public.mp_imported_payments where payment_id in ('m1', 'm3', 'm4')), 0,
  'a failed row leaves nothing behind');
select is((select count(*)::int from public.mp_imported_payments where payment_id = 'm2'), 1, 'the valid row of the batch was imported');

-- Filtering leftovers: pending is skipped until approved, other operation types are dropped unstored
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "s1", "status": "pending", "operation_type": "regular_payment", "amount": 30, "date_approved": "2026-03-08T12:00:00Z"},
  {"payment_id": "s2", "status": "approved", "operation_type": "account_fund", "amount": 30, "date_approved": "2026-03-08T12:00:00Z"}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 2, "needs_review": 0, "failed": 0}'::jsonb, 'pending and account_fund are skipped');
select is((select count(*)::int from public.mp_imported_payments where payment_id in ('s1', 's2')), 0, 'skipped rows are not stored');
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "s1", "status": "approved", "operation_type": "regular_payment", "amount": 30, "date_approved": "2026-03-08T12:00:00Z"}]$j$::jsonb)
  ->> 'posted', '1', 'a payment imports once it is approved');

-- Subscription overlap (R2.7): no expense, recorded as skipped with a suggestion
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "r1", "status": "approved", "operation_type": "recurring_payment", "amount": 5000,
   "date_approved": "2026-03-11T15:00:00Z", "merchant": "NETFLIX.COM"}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 1, "needs_review": 0, "failed": 0}'::jsonb, 'a recurring payment matching a subscription is skipped');
select is((select m.outcome || '/' || m.suggested_subscription_id::text || '/' || coalesce(m.transaction_id::text, 'none')
           from public.mp_imported_payments m where m.payment_id = 'r1'),
  'skipped_subscription/51000000-0000-0000-0000-000000000001/none', 'the suggestion points to the subscription and no expense exists');
select public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "r2", "status": "approved", "operation_type": "recurring_payment", "amount": 777, "date_approved": "2026-03-11T15:00:00Z"},
  {"payment_id": "r3", "status": "approved", "operation_type": "recurring_payment", "amount": 5000, "date_approved": "2026-03-20T15:00:00Z"}]$j$::jsonb);
select is((select count(*)::int from public.mp_imported_payments where payment_id in ('r2', 'r3')), 0,
  'recurring payments without a matching amount and date are dropped unstored');

-- Void on refund / chargeback / cancel (R2.5) and the edit trigger (R3.3, D20)
select public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "v1", "status": "approved", "operation_type": "regular_payment", "amount": 41, "date_approved": "2026-04-01T12:00:00Z"},
  {"payment_id": "v2", "status": "approved", "operation_type": "regular_payment", "amount": 42, "date_approved": "2026-04-01T12:00:00Z"},
  {"payment_id": "v3", "status": "approved", "operation_type": "regular_payment", "amount": 43, "date_approved": "2026-04-01T12:00:00Z"},
  {"payment_id": "v4", "status": "approved", "operation_type": "regular_payment", "amount": 44, "date_approved": "2026-04-01T12:00:00Z"},
  {"payment_id": "v5", "status": "approved", "operation_type": "regular_payment", "amount": 45, "date_approved": "2026-04-01T12:00:00Z"},
  {"payment_id": "v6", "status": "approved", "operation_type": "regular_payment", "amount": 46, "date_approved": "2026-04-01T12:00:00Z"}]$j$::jsonb);

update public.transactions set note = 'mine' where id = (select transaction_id from public.mp_imported_payments where payment_id = 'v2');
update public.transactions set amount = 47 where id = (select transaction_id from public.mp_imported_payments where payment_id = 'v6');
select isnt((select edited_at from public.mp_imported_payments where payment_id = 'v2'), null, 'editing the note sets edited_at');
select isnt((select edited_at from public.mp_imported_payments where payment_id = 'v6'), null, 'editing the amount sets edited_at');
select is((select edited_at from public.mp_imported_payments where payment_id = 'v1'), null, 'an untouched import has no edited_at');
select lives_ok($$update public.transactions set note = 'x' where id = (select id from public.transactions where note is null limit 1)$$,
  'updating a transaction that is not an import still works');
update public.transactions set status = 'voided' where id = (select transaction_id from public.mp_imported_payments where payment_id = 'v5');
select is((select edited_at from public.mp_imported_payments where payment_id = 'v5'), null, 'a status change alone does not mark an edit');
insert into public.subscription_charges (owner_id, subscription_id, due_on, amount, status, transaction_id)
select owner_id, '51000000-0000-0000-0000-000000000001', '2026-01-10', 44, 'posted', transaction_id
from public.mp_imported_payments where payment_id = 'v4';

select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "v1", "status": "refunded", "operation_type": "regular_payment", "amount": 41},
  {"payment_id": "v2", "status": "charged_back", "operation_type": "regular_payment", "amount": 42},
  {"payment_id": "v3", "status": "cancelled", "operation_type": "regular_payment", "amount": 43},
  {"payment_id": "v4", "status": "refunded", "operation_type": "regular_payment", "amount": 44},
  {"payment_id": "v5", "status": "refunded", "operation_type": "regular_payment", "amount": 45},
  {"payment_id": "v6", "status": "refunded", "operation_type": "regular_payment", "amount": 46}]$j$::jsonb),
  '{"posted": 0, "voided": 3, "skipped": 0, "needs_review": 3, "failed": 0}'::jsonb,
  'unedited imports are voided; edited and claimed ones need review');
select is((select t.status from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id where m.payment_id = 'v1'),
  'voided', 'a refunded unedited import is voided');
select is((select t.status from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id where m.payment_id = 'v3'),
  'voided', 'a cancelled unedited import is voided');
select is((select t.status || '/' || m.outcome from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'v2'), 'posted/needs_review', 'an edited import stays posted and is flagged');
select is((select t.status || '/' || m.outcome from public.transactions t join public.mp_imported_payments m on m.transaction_id = t.id
           where m.payment_id = 'v4'), 'posted/needs_review', 'an import owned by a subscription charge is flagged, not voided');
select is((select m.outcome from public.mp_imported_payments m where m.payment_id = 'v5'), 'voided',
  'an already voided transaction is recorded as voided without error');
select is((select m.outcome || '/' || m.mp_status from public.mp_imported_payments m where m.payment_id = 'v1'), 'voided/refunded',
  'the import row tracks the new MP status');
select is((select edited_at from public.mp_imported_payments where payment_id = 'v1'), null, 'the void does not mark an edit');
select is(public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "v1", "status": "refunded", "operation_type": "regular_payment", "amount": 41}]$j$::jsonb),
  '{"posted": 0, "voided": 0, "skipped": 1, "needs_review": 0, "failed": 0}'::jsonb, 'an already voided import is a noop');

-- Cross-claim guard (R3.2, D21) ----------------------------------------------------------------------------
insert into public.transactions (id, owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('71000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'expense', 100, '2026-02-10'),
  ('71000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'expense', 100, '2026-02-10'),
  ('71000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'expense', 100, '2026-02-10');
insert into public.subscription_charges (id, owner_id, subscription_id, due_on, amount, status, transaction_id) values
  ('52000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '51000000-0000-0000-0000-000000000001',
   '2026-02-10', 100, 'posted', '71000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok($$select public.link_subscription_charge('52000000-0000-0000-0000-000000000001',
  (select transaction_id from public.mp_imported_payments where payment_id = 'v2'))$$, '23514', 'invalid_link',
  'a subscription charge cannot claim an imported expense');
select throws_ok($$select public.link_fixed_expense_payment('f2000000-0000-0000-0000-000000000001',
  (select transaction_id from public.mp_imported_payments where payment_id = 'v2'))$$, '23514', 'invalid_link',
  'a fixed-expense payment cannot claim an imported expense');
select lives_ok($$select public.link_fixed_expense_payment('f2000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002')$$, 'an unclaimed expense still links to a fixed payment');
select lives_ok($$select public.link_subscription_charge('52000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000003')$$, 'an unclaimed expense still links to a subscription charge');
reset role;

-- Duplicates (R2.7, R3.1, D22) ----------------------------------------------------------------------------
select public.import_mp_payments('11111111-1111-1111-1111-111111111111', $j$[
  {"payment_id": "d1", "status": "approved", "operation_type": "regular_payment", "amount": 800, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d2", "status": "approved", "operation_type": "regular_payment", "amount": 650, "date_approved": "2026-06-10T15:00:00Z"},
  {"payment_id": "d3", "status": "approved", "operation_type": "regular_payment", "amount": 910, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d4", "status": "approved", "operation_type": "regular_payment", "amount": 920, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d5", "status": "approved", "operation_type": "regular_payment", "amount": 930, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d6", "status": "approved", "operation_type": "regular_payment", "amount": 960, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d7", "status": "approved", "operation_type": "regular_payment", "amount": 960, "date_approved": "2026-05-10T15:00:00Z"},
  {"payment_id": "d8", "status": "approved", "operation_type": "regular_payment", "amount": 940, "date_approved": "2026-05-10T15:00:00Z"}]$j$::jsonb);
insert into public.transactions (id, owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('72000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 800, '2026-05-11'),
  ('72000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 650, '2026-06-08'),
  ('72000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000001', 'expense', 910, '2026-05-10'),
  ('72000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 920, '2026-05-14'),
  ('72000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 930, '2026-05-10'),
  ('72000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 940, '2026-05-09');
insert into public.subscription_charges (owner_id, subscription_id, due_on, amount, status, transaction_id) values
  ('11111111-1111-1111-1111-111111111111', '51000000-0000-0000-0000-000000000001', '2026-05-12', 930, 'posted',
   '72000000-0000-0000-0000-000000000005');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select duplicate_transaction_id from public.get_mp_import_duplicates() where payment_id = 'd1'),
  '72000000-0000-0000-0000-000000000001'::uuid, 'a manual expense added after the import is a possible duplicate');
select is((select duplicate_transaction_id from public.get_mp_import_duplicates() where payment_id = 'd2'),
  '72000000-0000-0000-0000-000000000002'::uuid, 'a manual expense dated before the import is a possible duplicate');
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id = 'd3'), 0, 'a different account is not a duplicate');
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id = 'd4'), 0, 'more than 3 days apart is not a duplicate');
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id = 'd5'), 0,
  'an expense owned by a subscription charge stays excluded');
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id in ('d6', 'd7')), 0,
  'two imports are never duplicates of each other');
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id = 'd8'), 1, 'd8 is a possible duplicate before dismissal');
reset role;
update public.mp_imported_payments set duplicate_dismissed = true where payment_id = 'd8';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_mp_import_duplicates() where payment_id = 'd8'), 0, 'a dismissed duplicate disappears');
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_mp_import_duplicates()), 0, 'another user sees none of these duplicates');
reset role;
set local role anon;
select throws_ok($$select * from public.get_mp_import_duplicates()$$, '42501', null, 'anon cannot read duplicates');
reset role;

select * from finish();
rollback;
