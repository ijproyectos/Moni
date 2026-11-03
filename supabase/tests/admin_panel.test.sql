-- pgTAP for the admin panel: the aggregate functions are service_role only, the audit tables are closed to clients.
-- Run with `supabase test db` (after 20261114000000_admin_panel.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(28);

-- Seed (as the migration role). Fixed ids; the assertions never assume the database is otherwise empty. ------------
insert into auth.users (id, email, created_at) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', 'adm-old@example.com', now() - interval '40 days'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', 'adm-new@example.com', now() - interval '1 day');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a2', 'mercadopago', now() - interval '1 day', now() + interval '29 days');

insert into public.plus_subscriptions (id, user_id, external_reference, status, created_at)
values ('bbbbbbbb-0000-0000-0000-0000000000b1', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'adm-test-reference-0001', 'authorized', now() - interval '1 day');
insert into public.plus_payments (payment_id, user_id, subscription_id, amount)
values ('adm-test-payment-1', 'aaaaaaaa-0000-0000-0000-0000000000a2', 'bbbbbbbb-0000-0000-0000-0000000000b1', 1234.00);

insert into public.mp_connections (user_id, mp_user_id, status, last_sync_status, last_sync_at)
values ('aaaaaaaa-0000-0000-0000-0000000000a2', 'adm-test-mp-1', 'active', 'ok', now());

-- Grants ------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from unnest(array[
    'public.admin_last_activity()', 'public.admin_resumen()', 'public.admin_usuarios(text, text, int, int)',
    'public.admin_usuario(uuid)', 'public.admin_plus()', 'public.admin_ia()', 'public.admin_mp()',
    'public.admin_sistema()']) f where has_function_privilege('anon', f, 'EXECUTE')), 0,
  'anon cannot execute any admin function');
select is((select count(*)::int from unnest(array[
    'public.admin_last_activity()', 'public.admin_resumen()', 'public.admin_usuarios(text, text, int, int)',
    'public.admin_usuario(uuid)', 'public.admin_plus()', 'public.admin_ia()', 'public.admin_mp()',
    'public.admin_sistema()']) f where has_function_privilege('authenticated', f, 'EXECUTE')), 0,
  'authenticated cannot execute any admin function');
select is((select count(*)::int from unnest(array[
    'public.admin_last_activity()', 'public.admin_resumen()', 'public.admin_usuarios(text, text, int, int)',
    'public.admin_usuario(uuid)', 'public.admin_plus()', 'public.admin_ia()', 'public.admin_mp()',
    'public.admin_sistema()']) f where has_function_privilege('service_role', f, 'EXECUTE')), 8,
  'service_role can execute every admin function');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%'
      and not (p.prosecdef and p.proconfig @> array['search_path=""'])), 0,
  'every admin function (later migrations add more) is SECURITY DEFINER with an empty search_path');

-- Audit tables: RLS on, no policies, closed to clients -------------------------------------------------------------
select is((select count(*)::int from pg_class c where c.oid in ('public.admin_accesos'::regclass, 'public.admin_acciones'::regclass)
    and c.relrowsecurity), 2, 'RLS is on for both audit tables');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename in ('admin_accesos', 'admin_acciones')), 0,
  'the audit tables have no policies');
select is(has_table_privilege('authenticated', 'public.admin_accesos', 'SELECT'), false, 'authenticated has no access to admin_accesos');
select is(has_table_privilege('anon', 'public.admin_acciones', 'INSERT'), false, 'anon has no access to admin_acciones');
select is(has_table_privilege('service_role', 'public.admin_acciones', 'INSERT'), true, 'service_role can write admin_acciones');

-- A client is refused ----------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0000-0000-0000-0000000000a1", "role": "authenticated"}', true);
select throws_ok($$select public.admin_resumen()$$, '42501', null, 'authenticated cannot call admin_resumen');
select throws_ok($$select * from public.admin_usuarios(null, 'todos', 10, 0)$$, '42501', null, 'authenticated cannot call admin_usuarios');
select throws_ok($$select public.admin_usuario('aaaaaaaa-0000-0000-0000-0000000000a2')$$, '42501', null, 'authenticated cannot call admin_usuario');
select throws_ok($$select * from public.admin_accesos$$, '42501', null, 'authenticated cannot read admin_accesos');
reset role;

set local role anon;
select throws_ok($$select public.admin_sistema()$$, '42501', null, 'anon cannot call admin_sistema');
reset role;

-- service_role works -------------------------------------------------------------------------------------------------
set local role service_role;

select ok((select public.admin_resumen()) ? 'users_total', 'admin_resumen returns the KPIs');
select is((select (public.admin_resumen() ->> 'ai_cost_tracked')::boolean), false, 'AI cost is reported as untracked');
select is((select o_email from public.admin_usuarios('ADM-NEW@', 'todos', 10, 0)), 'adm-new@example.com',
  'search is case-insensitive and matches the email');
select is((select o_plus_active from public.admin_usuarios('adm-new@', 'todos', 10, 0)), true, 'the Plus user is flagged active');
select is((select o_mp_linked from public.admin_usuarios('adm-new@', 'todos', 10, 0)), true, 'the MP link is reported');
select is((select count(*)::int from public.admin_usuarios('adm-', 'plus', 10, 0)), 1, 'the plus filter keeps only the Plus user');
select is((select o_email from public.admin_usuarios('adm-', 'inactivos_30', 10, 0)), 'adm-old@example.com',
  'inactivos_30 keeps only the user idle for more than 30 days');
select is((select count(*)::int from public.admin_usuarios('adm-', 'todos', 1, 0)), 1, 'the limit is honored');
select is((select count(*)::int from public.admin_usuarios('adm-', 'todos', 100000, -5)), 2, 'limit and offset are clamped');
select throws_ok($$select * from public.admin_usuarios(null, 'nope', 10, 0)$$, '22023', 'invalid_filter', 'an unknown filter is rejected');
select is((select public.admin_usuario('aaaaaaaa-0000-0000-0000-0000000000a2') -> 'plus' -> 'payments' -> 0 ->> 'payment_id'),
  'adm-test-payment-1', 'the detail lists the Plus payment');
select is((select public.admin_usuario('aaaaaaaa-0000-0000-0000-0000000000ff')) is null, true, 'an unknown user returns null');
select is((select jsonb_array_length(public.admin_usuario('aaaaaaaa-0000-0000-0000-0000000000a1') -> 'daily')), 30,
  'the detail carries 30 days of activity');
select ok(((select public.admin_plus() -> 'revenue' ->> 'last_30d')::numeric) >= 1234, 'admin_plus counts the revenue');

reset role;

select * from finish();
rollback;
