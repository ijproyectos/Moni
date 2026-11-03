-- pgTAP for the scheduled pushes, the Plus expiry notices, account suspension and the support inbox.
-- Run with `supabase test db` (after 20261120000000_account_suspension_support.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(56);

-- Seed (as the migration role) -------------------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('cccccccc-0000-0000-0000-0000000000c1', 'exp-3d@example.com'),
  ('cccccccc-0000-0000-0000-0000000000c2', 'exp-3d-auto@example.com'),
  ('cccccccc-0000-0000-0000-0000000000c3', 'exp-1d-paused@example.com'),
  ('cccccccc-0000-0000-0000-0000000000c4', 'plain@example.com');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('cccccccc-0000-0000-0000-0000000000c1', 'promo', now() - interval '27 days', now() + interval '3 days'),
  ('cccccccc-0000-0000-0000-0000000000c2', 'mercadopago', now() - interval '27 days', now() + interval '3 days'),
  ('cccccccc-0000-0000-0000-0000000000c3', 'mercadopago', now() - interval '29 days', now() + interval '1 day');

insert into public.plus_subscriptions (id, user_id, external_reference, status) values
  ('dddddddd-0000-0000-0000-0000000000d2', 'cccccccc-0000-0000-0000-0000000000c2', 'sched-test-reference-0002', 'authorized'),
  ('dddddddd-0000-0000-0000-0000000000d3', 'cccccccc-0000-0000-0000-0000000000c3', 'sched-test-reference-0003', 'paused');

-- Grants -----------------------------------------------------------------------------------------------------------
select is((select count(*)::int from unnest(array[
    'public.plus_expiry_due(int[])', 'public.record_plus_expiry_notice(uuid, timestamptz, int, text)',
    'public.admin_plus_expiring(int)', 'public.admin_avisos()', 'public.admin_set_setting(text, boolean, text)',
    'public.admin_apply_suspension(uuid, text, text)', 'public.admin_lift_suspension(uuid)',
    'public.admin_suspended_ids(uuid[])', 'public.admin_usuario_estado(uuid)',
    'public.admin_support_list(text, int, int)', 'public.admin_support_get(uuid)',
    'public.admin_support_reply(uuid, text, text, boolean)', 'public.admin_support_set_status(uuid, text)'
  ]) f where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE')), 0,
  'no client can execute any new admin / job function');
select is((select count(*)::int from unnest(array[
    'public.plus_expiry_due(int[])', 'public.record_plus_expiry_notice(uuid, timestamptz, int, text)',
    'public.admin_plus_expiring(int)', 'public.admin_avisos()', 'public.admin_set_setting(text, boolean, text)',
    'public.admin_apply_suspension(uuid, text, text)', 'public.admin_lift_suspension(uuid)',
    'public.admin_suspended_ids(uuid[])', 'public.admin_usuario_estado(uuid)',
    'public.admin_support_list(text, int, int)', 'public.admin_support_get(uuid)',
    'public.admin_support_reply(uuid, text, text, boolean)', 'public.admin_support_set_status(uuid, text)'
  ]) f where has_function_privilege('service_role', f, 'EXECUTE')), 13,
  'service_role can execute all of them');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proconfig @> array['search_path=""']
      and p.proname in ('plus_expiry_due', 'record_plus_expiry_notice', 'admin_plus_expiring', 'admin_avisos',
        'admin_set_setting', 'admin_apply_suspension', 'admin_lift_suspension', 'admin_suspended_ids',
        'admin_usuario_estado', 'admin_support_list', 'admin_support_get', 'admin_support_reply',
        'admin_support_set_status', 'my_account_suspended', 'create_support_ticket')), 15,
  'all fifteen functions are SECURITY DEFINER with an empty search_path');
select is(has_function_privilege('authenticated', 'public.my_account_suspended()', 'EXECUTE'), true,
  'authenticated can ask whether their own account is suspended');
select is(has_function_privilege('anon', 'public.my_account_suspended()', 'EXECUTE'), false, 'anon cannot');
select is(has_function_privilege('anon', 'public.create_support_ticket(text, text)', 'EXECUTE'), false,
  'anon cannot create a support ticket');
select is(has_table_privilege('authenticated', 'public.admin_settings', 'SELECT'), false,
  'authenticated cannot read admin_settings');
select is(has_table_privilege('authenticated', 'public.plus_expiry_notices', 'SELECT'), false,
  'authenticated cannot read plus_expiry_notices');
select is(has_table_privilege('authenticated', 'public.account_suspensions', 'SELECT'), false,
  'authenticated cannot read account_suspensions');
select is(has_function_privilege('authenticated', 'private.set_app_secret(text, text)', 'EXECUTE'), false,
  'authenticated cannot store secrets');

-- Plus expiry ------------------------------------------------------------------------------------------------------
select is((select array_agg(d.o_user_id order by d.o_days_left desc) from public.plus_expiry_due() d
    where d.o_user_id in ('cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-0000000000c2',
      'cccccccc-0000-0000-0000-0000000000c3', 'cccccccc-0000-0000-0000-0000000000c4')),
  array['cccccccc-0000-0000-0000-0000000000c1', 'cccccccc-0000-0000-0000-0000000000c3']::uuid[],
  'due today: the 3-day promo user and the 1-day paused user, not the auto-renewing one');
select is((select d.o_days_left from public.plus_expiry_due() d where d.o_user_id = 'cccccccc-0000-0000-0000-0000000000c1'), 3,
  'days left are counted in Argentina calendar days');

select is(public.record_plus_expiry_notice('cccccccc-0000-0000-0000-0000000000c1',
    (select expires_at from public.plus_entitlements where user_id = 'cccccccc-0000-0000-0000-0000000000c1'), 3, 'cron'),
  true, 'the first notice is recorded');
select is(public.record_plus_expiry_notice('cccccccc-0000-0000-0000-0000000000c1',
    (select expires_at from public.plus_entitlements where user_id = 'cccccccc-0000-0000-0000-0000000000c1'), 3, 'cron'),
  false, 'the same notice is not recorded twice');
select is((select count(*)::int from public.plus_expiry_due() d where d.o_user_id = 'cccccccc-0000-0000-0000-0000000000c1'), 0,
  'a notified user is no longer due');
select throws_ok($$select public.record_plus_expiry_notice('cccccccc-0000-0000-0000-0000000000c1', now(), 3, 'other')$$,
  '23514', null, 'an unknown notice source is rejected');

select is((select count(*)::int from jsonb_array_elements(public.admin_plus_expiring(7) -> 'rows') r
    where r ->> 'user_id' = 'cccccccc-0000-0000-0000-0000000000c2'), 0,
  'the panel list leaves out a subscription that renews by itself');
select ok(((public.admin_plus_expiring(7) ->> 'auto_renewing_excluded')::int) >= 1,
  'and counts it as excluded');
select is((select r -> 'notified_levels' from jsonb_array_elements(public.admin_plus_expiring(7) -> 'rows') r
    where r ->> 'user_id' = 'cccccccc-0000-0000-0000-0000000000c1'), '[3]'::jsonb,
  'the panel list shows the levels already notified');
select is((select r ->> 'subscription_status' from jsonb_array_elements(public.admin_plus_expiring(7) -> 'rows') r
    where r ->> 'user_id' = 'cccccccc-0000-0000-0000-0000000000c3'), 'paused',
  'the panel list shows the latest subscription status');

-- Settings and the scheduled call ----------------------------------------------------------------------------------
select is((public.admin_avisos() ->> 'nightly_push_enabled')::boolean, true, 'the nightly reminder starts enabled');
select lives_ok($$select public.admin_set_setting('nightly_push_enabled', false, 'admin@example.com')$$, 'the switch can be turned off');
select is((public.admin_avisos() ->> 'nightly_push_enabled')::boolean, false, 'and reads back as off');
select throws_ok($$select public.admin_set_setting('anything_else', true, 'admin@example.com')$$, '22023', 'invalid_setting',
  'only the known switches can be written');
select is((select updated_by from public.admin_settings where key = 'nightly_push_enabled'), 'admin@example.com',
  'who changed it is recorded');

select throws_ok($$select private.set_app_secret('Bad Name', 'x-0123456789abcdef-0123456789')$$, '22023', 'invalid_name',
  'a secret name must be a lowercase identifier');
select throws_ok($$select private.set_app_secret('push_cron_secret', 'short')$$, '22023', 'invalid_value',
  'a short secret is refused');
select is(private.run_nightly_push_cron(), null, 'the nightly job does nothing while its switch is off');
select lives_ok($$select public.admin_set_setting('nightly_push_enabled', true, 'admin@example.com')$$, 'turned back on');
delete from private.app_secrets where name in ('push_cron_secret', 'supabase_url');
select is(private.run_nightly_push_cron(), null, 'and does nothing (no error) while the secret is not stored');
select is(private.run_plus_expiry_cron(), null, 'the Plus expiry job also waits for its secret');
select is((public.admin_avisos() ->> 'cron_configured')::boolean, false, 'the panel reports the cron as not configured');

-- Suspension -------------------------------------------------------------------------------------------------------
select lives_ok($$select public.admin_apply_suspension('cccccccc-0000-0000-0000-0000000000c4', 'abuso de prueba', 'admin@example.com')$$,
  'an account can be suspended');
select is((select array_agg(x) from public.admin_suspended_ids(array['cccccccc-0000-0000-0000-0000000000c3',
    'cccccccc-0000-0000-0000-0000000000c4']::uuid[]) x), array['cccccccc-0000-0000-0000-0000000000c4']::uuid[],
  'the list badge finds only the suspended one');
select is((public.admin_usuario_estado('cccccccc-0000-0000-0000-0000000000c4') ->> 'suspended')::boolean, true,
  'the user detail shows the suspension');
select throws_ok($$select public.admin_apply_suspension('cccccccc-0000-0000-0000-0000000000ff', 'no existe', 'admin@example.com')$$,
  'P0002', 'not_found', 'a missing user cannot be suspended');
select throws_ok($$select public.admin_apply_suspension('cccccccc-0000-0000-0000-0000000000c3', 'x', 'admin@example.com')$$,
  '23514', null, 'a too short reason is refused');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-0000000000c4", "role": "authenticated"}', true);
select is(public.my_account_suspended(), true, 'the suspended person is told they are suspended');
select throws_ok($$select * from public.account_suspensions$$, '42501', null, 'but cannot read the reason');
select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);
select is(public.my_account_suspended(), false, 'someone else is not suspended');
reset role;

select is(public.admin_lift_suspension('cccccccc-0000-0000-0000-0000000000c4'), true, 'the suspension can be lifted');
select is(public.admin_lift_suspension('cccccccc-0000-0000-0000-0000000000c4'), false, 'lifting twice is a no-op');

-- Support ------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-0000000000c1", "role": "authenticated"}', true);
select lives_ok($$select public.create_support_ticket('No me carga un gasto', 'Cargo un gasto y no aparece en Actividad.')$$,
  'a person opens a ticket');
select throws_ok($$select public.create_support_ticket('ab', 'texto')$$, '22023', 'invalid_subject', 'a too short subject is refused');
select throws_ok($$select public.create_support_ticket('Asunto válido', '   ')$$, '22023', 'invalid_message', 'a blank message is refused');
select throws_ok($$select public.create_support_ticket('Asunto válido', repeat('x', 2001))$$, '22023', 'invalid_message',
  'a message over 2000 characters is refused');
select throws_ok($$insert into public.support_tickets (user_id, subject, message)
  values ('cccccccc-0000-0000-0000-0000000000c1', 'Directo', 'sin pasar por la función')$$, '42501', null,
  'a client cannot insert a ticket directly');
select throws_ok($$update public.support_tickets set status = 'resolved'$$, '42501', null, 'a client cannot update a ticket');
select lives_ok($$select public.create_support_ticket('Segunda consulta', 'Texto 2')$$, 'second ticket');
select lives_ok($$select public.create_support_ticket('Tercera consulta', 'Texto 3')$$, 'third ticket');
select lives_ok($$select public.create_support_ticket('Cuarta consulta', 'Texto 4')$$, 'fourth ticket');
select lives_ok($$select public.create_support_ticket('Quinta consulta', 'Texto 5')$$, 'fifth ticket');
select throws_ok($$select public.create_support_ticket('Sexta consulta', 'Texto 6')$$, '54000', 'too_many_tickets',
  'the sixth ticket in 24 hours is refused');
select is((select count(*)::int from public.support_tickets), 5, 'the person sees their five tickets');

select set_config('request.jwt.claims', '{"sub": "cccccccc-0000-0000-0000-0000000000c3", "role": "authenticated"}', true);
select is((select count(*)::int from public.support_tickets), 0, 'another person sees none of them');
reset role;

set local role anon;
select throws_ok($$select public.create_support_ticket('Asunto válido', 'Texto')$$, '42501', null, 'anon is refused');
reset role;

select * from finish();
rollback;
