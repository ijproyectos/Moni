-- pgTAP for web push: push_subscriptions RLS, register / remove RPCs, push_messages service-only.
-- Run with `supabase test db` (after 20261113000000_web_push.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.push_messages (kind, title, body) values ('news', 'Hola', 'Novedades');

select is(has_function_privilege('authenticated', 'public.register_push_subscription(text, text, text, text)', 'EXECUTE'), true,
  'authenticated can execute register_push_subscription');
select is(has_function_privilege('anon', 'public.register_push_subscription(text, text, text, text)', 'EXECUTE'), false,
  'anon cannot execute register_push_subscription');
select is(has_function_privilege('anon', 'public.remove_push_subscription(text)', 'EXECUTE'), false,
  'anon cannot execute remove_push_subscription');

-- User A -------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select lives_ok($$select public.register_push_subscription('https://push.example.com/a', 'p1', 'a1', 'UA-1')$$,
  'A registers an endpoint');
select lives_ok($$select public.register_push_subscription('https://push.example.com/a', 'p1', 'a1', 'UA-1')$$,
  'registering the same endpoint again is idempotent');
select is((select count(*)::int from public.push_subscriptions), 1, 'still one row after the repeat');

select throws_ok($$select public.register_push_subscription('http://push.example.com/x', 'p', 'a', null)$$, '22023', 'invalid_endpoint',
  'a non-https endpoint is rejected');
select throws_ok($$select public.register_push_subscription('https://push.example.com/x', '', 'a', null)$$, '22023', 'invalid_key',
  'an empty p256dh is rejected');
select throws_ok($$select public.register_push_subscription('https://push.example.com/x', 'p', '  ', null)$$, '22023', 'invalid_key',
  'a blank auth is rejected');

select throws_ok($$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example.com/direct', 'p', 'a')$$, '42501', null,
  'a client cannot insert directly');
select throws_ok($$update public.push_subscriptions set p256dh = 'x'$$, '42501', null,
  'a client cannot update directly');

-- User B -------------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is((select count(*)::int from public.push_subscriptions), 0, 'B does not see A''s subscription');
select lives_ok($$select public.remove_push_subscription('https://push.example.com/a')$$, 'B removing A''s endpoint is a no-op');
select lives_ok($$select public.register_push_subscription('https://push.example.com/b', 'p2', 'a2', null)$$,
  'B registers their own endpoint');

-- B takes over A's endpoint (shared browser, new login): the row is reassigned.
select lives_ok($$select public.register_push_subscription('https://push.example.com/a', 'p3', 'a3', 'UA-2')$$,
  'B registers an endpoint that belonged to A');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example.com/a'), 1,
  'the endpoint now belongs to B');

select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.push_subscriptions), 0, 'A lost the reassigned endpoint');
reset role;

select is((select count(*)::int from public.push_subscriptions), 2, 'two rows in total, no duplicates');

-- Remove only own ----------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select public.remove_push_subscription('https://push.example.com/b');
select is((select count(*)::int from public.push_subscriptions), 1, 'B removed their own endpoint only');

-- push_messages is service-only --------------------------------------------------------------------------
select throws_ok($$select * from public.push_messages$$, '42501', null, 'authenticated cannot read push_messages');
reset role;

set local role anon;
select throws_ok($$select public.register_push_subscription('https://push.example.com/z', 'p', 'a', null)$$, '42501', null,
  'anon is refused');
reset role;

select * from finish();
rollback;
