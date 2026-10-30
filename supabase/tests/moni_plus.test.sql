-- pgTAP: run with `supabase test db` against a local stack (after 20261106000000_moni_plus.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- A: free. B: free, will redeem the code. C: plus with an expired entitlement. D: active plus (granted directly).
-- E: free, used to exhaust the throttle.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'e@example.com');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('33333333-3333-3333-3333-333333333333', 'promo', now() - interval '40 days', now() - interval '10 days'),
  ('44444444-4444-4444-4444-444444444444', 'promo', now(), now() + interval '30 days');

-- Grants -------------------------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.plus_entitlements', 'INSERT'), false,
  'authenticated cannot INSERT into plus_entitlements');
select is(has_table_privilege('authenticated', 'public.plus_entitlements', 'UPDATE'), false,
  'authenticated cannot UPDATE plus_entitlements');
select is(has_table_privilege('authenticated', 'public.plus_entitlements', 'DELETE'), false,
  'authenticated cannot DELETE plus_entitlements');
select is(has_table_privilege('authenticated', 'public.promo_redeem_attempts', 'SELECT'), false,
  'authenticated cannot read the attempts table');
select is(has_table_privilege('anon', 'public.plus_entitlements', 'SELECT'), false,
  'anon has no privileges on plus_entitlements');
select is((select prosecdef from pg_proc where oid = 'public.redeem_promo_code(text)'::regprocedure), true,
  'redeem_promo_code is SECURITY DEFINER');

-- User A (free) ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is(public.is_plus(), false, 'a user without an entitlement is not plus');
select is(public.my_plus_status(), null::timestamptz, 'my_plus_status is null for a free user');

select lives_ok($$select public.create_group('Primero', 'casa')$$, 'a free user can create one group');
select throws_ok($$select public.create_group('Segundo', 'amigos')$$, '54000', 'plus_required',
  'a free user cannot create a second active group');

select throws_ok($$select public.consume_ai_quota('parse_movements', 3)$$, '54000', 'plus_required',
  'free users cannot use parse_movements');
select throws_ok($$select public.consume_ai_quota('parse_receipt', 3)$$, '54000', 'plus_required',
  'free users cannot use parse_receipt');
select throws_ok($$select public.consume_ai_quota('insights_chat', 3)$$, '54000', 'plus_required',
  'free users cannot use insights_chat');
select is((select count(*)::int from public.ai_usage), 0, 'a rejected free call records no usage');

select throws_ok($$insert into public.plus_entitlements (user_id, source, expires_at)
  values ('11111111-1111-1111-1111-111111111111', 'promo', now() + interval '30 days')$$,
  '42501', null, 'a user cannot grant themselves plus');

-- A archives nothing from the client side (no UPDATE grant on groups), so archive as superuser to test the count.
reset role;
update public.groups set archived_at = now() where created_by = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok($$select public.create_group('Despues de archivar', 'amigos')$$,
  'archived groups do not count toward the free limit');

-- User B redeems the code in several spellings ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is(public.redeem_promo_code('nope'), null::timestamptz, 'a wrong code returns null');
select cmp_ok(public.redeem_promo_code('  Moni   Plus '), '>', now() + interval '29 days',
  'a normalized code grants about 30 days');
select is(public.is_plus(), true, 'redeeming makes the user plus');
select lives_ok($$select public.consume_ai_quota('parse_movements', 3)$$, 'a plus user can use the AI features');

select is(
  public.redeem_promo_code('MONIPLUS'),
  (select expires_at from public.plus_entitlements where user_id = '22222222-2222-2222-2222-222222222222'),
  'redeeming again returns the existing expiry and extends nothing');
select is(
  (select count(*)::int from public.plus_entitlements),
  1, 'a user sees only their own entitlement');

select lives_ok($$select public.create_group('Uno', 'casa')$$, 'a plus user creates a group');
select lives_ok($$select public.create_group('Dos', 'casa')$$, 'a plus user creates a second group');

-- User C: expired entitlement is free again ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is(public.is_plus(), false, 'an expired entitlement is not plus');
select throws_ok($$select public.consume_ai_quota('parse_receipt', 3)$$, '54000', 'plus_required',
  'an expired entitlement cannot use the AI features');

-- User D: plus granted directly keeps working ------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);
select is(public.consume_ai_quota('parse_movements', 3), 2, 'consume_ai_quota keeps its behavior for plus users');

-- User E: throttle after 10 wrong attempts --------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}', true);
select lives_ok($$select public.redeem_promo_code('wrong-' || g) from generate_series(1, 10) g$$,
  'ten wrong attempts return null without raising');
select throws_ok($$select public.redeem_promo_code('moniplus')$$, '54000', 'too_many_attempts',
  'the 11th attempt in an hour is throttled, even with the right code');

-- Anonymous callers ----------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select public.redeem_promo_code('moniplus')$$, '42501', null, 'anon cannot redeem');

select * from finish();
rollback;
