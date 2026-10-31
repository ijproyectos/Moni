-- pgTAP for dismiss_mp_import_duplicate(): owner-scoped, idempotent, authenticated only.
-- Run with `supabase test db` (after 20261112000300_mp_dismiss_duplicate.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.accounts (id, owner_id, name, kind) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Mercado Pago', 'wallet');
insert into public.categories (id, owner_id, kind, name, icon, color, archived_at, created_at) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'Comida', 'Utensils', '#E5533D', null, now());
insert into public.transactions (id, owner_id, account_id, category_id, kind, amount, occurred_on) values
  ('71000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 800, '2026-05-10'),
  ('71000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'expense', 800, '2026-05-11');
insert into public.mp_imported_payments (payment_id, owner_id, transaction_id, mp_status, outcome, amount, occurred_on) values
  ('dup-1', '11111111-1111-1111-1111-111111111111', '71000000-0000-0000-0000-000000000001', 'approved', 'posted', 800, '2026-05-10');

select is(has_function_privilege('authenticated', 'public.dismiss_mp_import_duplicate(text)', 'EXECUTE'), true,
  'authenticated can execute dismiss_mp_import_duplicate');
select is(has_function_privilege('anon', 'public.dismiss_mp_import_duplicate(text)', 'EXECUTE'), false,
  'anon cannot execute dismiss_mp_import_duplicate');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from public.get_mp_import_duplicates()), 1, 'the pair is listed before dismissal');
select lives_ok($$select public.dismiss_mp_import_duplicate('dup-1')$$, 'the owner can dismiss');
select is((select count(*)::int from public.get_mp_import_duplicates()), 0, 'a dismissed pair is no longer listed');
select lives_ok($$select public.dismiss_mp_import_duplicate('dup-1')$$, 'dismissing twice is a no-op');
select throws_ok($$select public.dismiss_mp_import_duplicate('nope')$$, '23503', 'payment_not_found',
  'an unknown payment is rejected');

select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select throws_ok($$select public.dismiss_mp_import_duplicate('dup-1')$$, '23503', 'payment_not_found',
  'another user cannot dismiss it (same error as unknown)');
reset role;

select is((select duplicate_dismissed from public.mp_imported_payments where payment_id = 'dup-1'), true,
  'the flag stayed set');

set local role anon;
select throws_ok($$select public.dismiss_mp_import_duplicate('dup-1')$$, '42501', null, 'anon is refused');
reset role;
select is((select count(*)::int from public.mp_imported_payments), 1, 'no row was created or removed');

select * from finish();
rollback;
