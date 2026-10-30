-- pgTAP: run with `supabase test db` against a local stack (after 20261107000000_mp_plus_billing.sql).
-- NOTE: written without being able to run it (no local Supabase stack / Docker in the authoring environment).
begin;
create extension if not exists pgtap with schema extensions;

select plan(60);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- A: gets a subscription and two payments. B: subscription gets cancelled. C: lapsed entitlement, pays again.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('33333333-3333-3333-3333-333333333333', 'promo', now() - interval '40 days', now() - interval '10 days');

-- Grants ---------------------------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.plus_subscriptions', 'INSERT'), false,
  'authenticated cannot INSERT into plus_subscriptions');
select is(has_table_privilege('authenticated', 'public.plus_subscriptions', 'UPDATE'), false,
  'authenticated cannot UPDATE plus_subscriptions');
select is(has_table_privilege('authenticated', 'public.plus_subscriptions', 'DELETE'), false,
  'authenticated cannot DELETE plus_subscriptions');
select is(has_table_privilege('authenticated', 'public.plus_payments', 'INSERT'), false,
  'authenticated cannot INSERT into plus_payments');
select is(has_table_privilege('authenticated', 'public.plus_payments', 'UPDATE'), false,
  'authenticated cannot UPDATE plus_payments');
select is(has_table_privilege('anon', 'public.plus_subscriptions', 'SELECT'), false,
  'anon has no privileges on plus_subscriptions');
select is(has_table_privilege('anon', 'public.plus_payments', 'SELECT'), false,
  'anon has no privileges on plus_payments');
select is(has_table_privilege('authenticated', 'public.plus_subscriptions', 'SELECT'), true,
  'authenticated can SELECT plus_subscriptions (RLS limits it to own rows)');
select is(
  (select count(*)::int from pg_class
   where oid in ('public.plus_subscriptions'::regclass, 'public.plus_payments'::regclass) and relrowsecurity),
  2, 'RLS is enabled on both tables');

-- Function execution: service_role only
select is(has_function_privilege('authenticated', 'public.grant_plus_from_payment(uuid, text, uuid, numeric)', 'EXECUTE'), false,
  'authenticated cannot execute grant_plus_from_payment');
select is(has_function_privilege('anon', 'public.grant_plus_from_payment(uuid, text, uuid, numeric)', 'EXECUTE'), false,
  'anon cannot execute grant_plus_from_payment');
select is(has_function_privilege('service_role', 'public.grant_plus_from_payment(uuid, text, uuid, numeric)', 'EXECUTE'), true,
  'service_role can execute grant_plus_from_payment');
select is(has_function_privilege('authenticated', 'public.set_plus_subscription_status(uuid, text, text)', 'EXECUTE'), false,
  'authenticated cannot execute set_plus_subscription_status');
select is(has_function_privilege('service_role', 'public.set_plus_subscription_status(uuid, text, text)', 'EXECUTE'), true,
  'service_role can execute set_plus_subscription_status');
select is(has_function_privilege('authenticated', 'public.start_plus_subscription(uuid, text)', 'EXECUTE'), false,
  'authenticated cannot execute start_plus_subscription');
select is(has_function_privilege('service_role', 'public.start_plus_subscription(uuid, text)', 'EXECUTE'), true,
  'service_role can execute start_plus_subscription');
select is(has_function_privilege('authenticated', 'public.claim_plus_mp_call(uuid, uuid, text, int)', 'EXECUTE'), false,
  'authenticated cannot execute claim_plus_mp_call');
select is(has_function_privilege('service_role', 'public.claim_plus_mp_call(uuid, uuid, text, int)', 'EXECUTE'), true,
  'service_role can execute claim_plus_mp_call');
select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.grant_plus_from_payment(uuid, text, uuid, numeric)'::regprocedure,
     'public.set_plus_subscription_status(uuid, text, text)'::regprocedure,
     'public.start_plus_subscription(uuid, text)'::regprocedure,
     'public.claim_plus_mp_call(uuid, uuid, text, int)'::regprocedure)
   and prosecdef and 'search_path=""' = any (proconfig)),
  4, 'all four functions are SECURITY DEFINER with search_path set to empty');

-- Service role: subscription lifecycle ---------------------------------------------------------------
set local role service_role;

select isnt(public.start_plus_subscription('11111111-1111-1111-1111-111111111111', 'ref-aaaaaaaaaaaaaaaaaaaa'), null::uuid,
  'start creates a pending subscription');
select throws_ok($$select public.start_plus_subscription('11111111-1111-1111-1111-111111111111', 'ref-aaaaaaaaaaaaaaaaaaab')$$,
  '54000', 'create_throttled', 'a second pending checkout within 60 seconds is refused');

select is(
  public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'),
    'authorized', 'pre-a'),
  true, 'status sync stores the preapproval id and the new status');
select is((select status from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'),
  'authorized', 'the subscription is authorized');
select throws_ok($$select public.start_plus_subscription('11111111-1111-1111-1111-111111111111', 'ref-aaaaaaaaaaaaaaaaaaac')$$,
  '54000', 'already_subscribed', 'a user with an authorized subscription cannot start another');
select throws_ok($$select public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'hacked')$$,
  '22023', 'invalid_status', 'unknown statuses are rejected');
select is(public.set_plus_subscription_status('99999999-9999-9999-9999-999999999999', 'paused'), false,
  'syncing a missing subscription returns false');

select isnt(public.start_plus_subscription('22222222-2222-2222-2222-222222222222', 'ref-bbbbbbbbbbbbbbbbbbbb'), null::uuid,
  'user B starts a subscription');
select is(
  public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-bbbbbbbbbbbbbbbbbbbb'),
    'cancelled', 'pre-b'),
  true, 'B cancels');
select is(
  public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-bbbbbbbbbbbbbbbbbbbb'),
    'authorized'),
  true, 'a stale notification tries to reopen it');
select is((select status from public.plus_subscriptions where external_reference = 'ref-bbbbbbbbbbbbbbbbbbbb'),
  'cancelled', 'cancelled is terminal');

-- Service role: paused subscriptions also block a new checkout (user D) ---------------------------------
select isnt(public.start_plus_subscription('44444444-4444-4444-4444-444444444444', 'ref-dddddddddddddddddddd'), null::uuid,
  'user D starts a subscription');
select is(
  public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-dddddddddddddddddddd'),
    'paused', 'pre-d'),
  true, 'D pauses');
select throws_ok($$select public.start_plus_subscription('44444444-4444-4444-4444-444444444444', 'ref-dddddddddddddddddddc')$$,
  '54000', 'already_subscribed', 'a user with a paused subscription cannot start another');
select is(
  public.set_plus_subscription_status(
    (select id from public.plus_subscriptions where external_reference = 'ref-dddddddddddddddddddd'),
    'cancelled'),
  true, 'D cancels the paused subscription');
select isnt(public.start_plus_subscription('44444444-4444-4444-4444-444444444444', 'ref-dddddddddddddddddddf'), null::uuid,
  'once cancelled, D can start a new checkout');

-- Service role: rate limit of Mercado Pago calls ----------------------------------------------------------
select is(
  public.claim_plus_mp_call('11111111-1111-1111-1111-111111111111',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'sync', 15),
  true, 'the first sync claim is granted');
select is(
  public.claim_plus_mp_call('11111111-1111-1111-1111-111111111111',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'sync', 15),
  false, 'a second sync claim inside 15 seconds is refused');
select is(
  public.claim_plus_mp_call('11111111-1111-1111-1111-111111111111',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'write', 5),
  true, 'the first write claim is granted');
select is(
  public.claim_plus_mp_call('11111111-1111-1111-1111-111111111111',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'write', 5),
  false, 'a second write claim inside 5 seconds is refused');
select is(
  public.claim_plus_mp_call('22222222-2222-2222-2222-222222222222',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'write', 5),
  false, 'a subscription of another user cannot be claimed');
select throws_ok($$select public.claim_plus_mp_call('11111111-1111-1111-1111-111111111111',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 'nope', 5)$$,
  '22023', 'invalid_claim', 'an unknown claim kind is rejected');

-- Service role: crediting payments ---------------------------------------------------------------------
select is(
  public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-1',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 2999),
  now() + interval '1 month',
  'the first payment grants one month from now');
select is((select source from public.plus_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  'mercadopago', 'the entitlement source is mercadopago');
select is(
  public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-1',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 2999),
  null::timestamptz,
  'replaying the same payment_id returns NULL');
select is((select expires_at from public.plus_entitlements where user_id = '11111111-1111-1111-1111-111111111111'),
  now() + interval '1 month', 'a replay extends nothing');
select is((select count(*)::int from public.plus_payments where payment_id = 'pay-1'), 1,
  'a replay inserts no second payment row');

select is(
  public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-2',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 2999),
  (now() + interval '1 month') + interval '1 month',
  'a new payment while Plus is running stacks on the current expiry');

select isnt(public.start_plus_subscription('33333333-3333-3333-3333-333333333333', 'ref-cccccccccccccccccccc'), null::uuid,
  'user C starts a subscription');
select is(
  public.grant_plus_from_payment('33333333-3333-3333-3333-333333333333', 'pay-3',
    (select id from public.plus_subscriptions where external_reference = 'ref-cccccccccccccccccccc'), 2999),
  now() + interval '1 month',
  'a lapsed entitlement restarts from now, not from the old expiry');

select throws_ok($$select public.grant_plus_from_payment('22222222-2222-2222-2222-222222222222', 'pay-4',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 2999)$$,
  'P0002', 'subscription_not_found', 'a subscription of another user cannot be used to credit someone');
select throws_ok($$select public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-5',
    (select id from public.plus_subscriptions where external_reference = 'ref-aaaaaaaaaaaaaaaaaaaa'), 0)$$,
  '22023', 'invalid_payment', 'a zero amount is rejected');
select is((select amount from public.plus_payments where payment_id = 'pay-1'), 2999.00::numeric,
  'the credited amount is stored');

-- User A through the API role: RLS ------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is((select count(*)::int from public.plus_subscriptions), 1, 'A sees only their own subscription');
select is((select count(*)::int from public.plus_payments), 2, 'A sees only their own payments');
select is((select count(*)::int from public.plus_subscriptions where user_id = '22222222-2222-2222-2222-222222222222'), 0,
  'A cannot see B''s subscription');
select throws_ok($$insert into public.plus_subscriptions (user_id, external_reference)
  values ('11111111-1111-1111-1111-111111111111', 'ref-hackedhackedhacked')$$,
  '42501', null, 'a user cannot insert a subscription');
select throws_ok($$select public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-hack',
    (select id from public.plus_subscriptions limit 1), 2999)$$,
  '42501', null, 'a user cannot credit themselves through grant_plus_from_payment');
select throws_ok($$select public.set_plus_subscription_status((select id from public.plus_subscriptions limit 1), 'authorized')$$,
  '42501', null, 'a user cannot change a subscription status');

-- Anonymous callers ----------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select count(*) from public.plus_subscriptions$$, '42501', null, 'anon cannot read subscriptions');
select throws_ok($$select public.grant_plus_from_payment('11111111-1111-1111-1111-111111111111', 'pay-anon',
    '99999999-9999-9999-9999-999999999999', 2999)$$,
  '42501', null, 'anon cannot execute grant_plus_from_payment');

select * from finish();
rollback;
