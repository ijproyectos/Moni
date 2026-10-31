-- pgTAP: run with `supabase test db` against a local stack (after 20261112000000_mp_expense_autoimport.sql).
-- NOTE: written without being able to run it (no local Supabase stack / Docker in the authoring environment).
begin;
create extension if not exists pgtap with schema extensions;

select plan(106);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- A: Plus, due for sync. B: Plus, unlinked connection. C: free user. D: lapsed Plus (renews later).
-- E: deleted to check the cascade. F: Plus, no consent. G: Plus, synced recently. H: Plus, leased.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'e@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'f@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'g@example.com'),
  ('88888888-8888-8888-8888-888888888888', 'h@example.com');

insert into public.plus_entitlements (user_id, source, granted_at, expires_at) values
  ('11111111-1111-1111-1111-111111111111', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('22222222-2222-2222-2222-222222222222', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('44444444-4444-4444-4444-444444444444', 'promo', now() - interval '40 days', now() - interval '10 days'),
  ('66666666-6666-6666-6666-666666666666', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('77777777-7777-7777-7777-777777777777', 'promo', now() - interval '1 day', now() + interval '30 days'),
  ('88888888-8888-8888-8888-888888888888', 'promo', now() - interval '1 day', now() + interval '30 days');

insert into public.mp_connections
  (user_id, mp_user_id, status, access_token_enc, refresh_token_enc, key_version, consent_version, consented_at,
   last_sync_at, sync_lease_until)
values
  ('11111111-1111-1111-1111-111111111111', 'mp-1', 'active', 'v1.enc-a', 'v1.enc-a-r', '1', 'v1', now(), null, null),
  ('44444444-4444-4444-4444-444444444444', 'mp-4', 'active', 'v1.enc-d', 'v1.enc-d-r', '1', 'v1', now(), null, null),
  ('66666666-6666-6666-6666-666666666666', 'mp-6', 'active', 'v1.enc-f', 'v1.enc-f-r', '1', null, null, null, null),
  ('77777777-7777-7777-7777-777777777777', 'mp-7', 'active', 'v1.enc-g', 'v1.enc-g-r', '1', 'v1', now(),
    now() - interval '2 minutes', null),
  ('88888888-8888-8888-8888-888888888888', 'mp-8', 'active', 'v1.enc-h', 'v1.enc-h-r', '1', 'v1', now(),
    null, now() + interval '4 minutes');

insert into public.mp_imported_payments (payment_id, owner_id, mp_status, outcome, amount, occurred_on) values
  ('pay-a-1', '11111111-1111-1111-1111-111111111111', 'approved', 'posted', 1500.50, '2026-02-28'),
  ('pay-b-1', '22222222-2222-2222-2222-222222222222', 'approved', 'posted', 300, '2026-02-27');

-- Tables, RLS and grants (R1.6, D4) -------------------------------------------------------------------
select is(
  (select count(*)::int from pg_class
   where oid in ('public.mp_connections'::regclass, 'public.mp_oauth_states'::regclass,
                 'public.mp_imported_payments'::regclass) and relrowsecurity),
  3, 'RLS is enabled on the three MP tables');
select is(has_table_privilege('authenticated', 'public.mp_connections', 'SELECT'), false,
  'authenticated cannot SELECT mp_connections');
select is(has_table_privilege('authenticated', 'public.mp_connections', 'INSERT'), false,
  'authenticated cannot INSERT into mp_connections');
select is(has_table_privilege('authenticated', 'public.mp_connections', 'UPDATE'), false,
  'authenticated cannot UPDATE mp_connections');
select is(has_table_privilege('authenticated', 'public.mp_connections', 'DELETE'), false,
  'authenticated cannot DELETE mp_connections');
select is(has_table_privilege('anon', 'public.mp_connections', 'SELECT'), false,
  'anon cannot SELECT mp_connections');
select is(has_table_privilege('authenticated', 'public.mp_oauth_states', 'SELECT'), false,
  'authenticated cannot SELECT mp_oauth_states');
select is(has_table_privilege('anon', 'public.mp_oauth_states', 'SELECT'), false,
  'anon cannot SELECT mp_oauth_states');
select is(has_table_privilege('service_role', 'public.mp_connections', 'UPDATE'), true,
  'service_role can UPDATE mp_connections');
select is(has_table_privilege('authenticated', 'public.mp_imported_payments', 'SELECT'), true,
  'authenticated can SELECT mp_imported_payments (RLS limits it to own rows)');
select is(has_table_privilege('authenticated', 'public.mp_imported_payments', 'INSERT'), false,
  'authenticated cannot INSERT into mp_imported_payments');
select is(has_table_privilege('authenticated', 'public.mp_imported_payments', 'UPDATE'), false,
  'authenticated cannot UPDATE mp_imported_payments');
select is(has_table_privilege('anon', 'public.mp_imported_payments', 'SELECT'), false,
  'anon cannot SELECT mp_imported_payments');

-- Function execution: service_role only (get_my_mp_connection is the one client-facing function)
select is(has_function_privilege('authenticated', 'public.claim_mp_oauth_state(text, uuid)', 'EXECUTE'), false,
  'authenticated cannot execute claim_mp_oauth_state');
select is(has_function_privilege('service_role', 'public.claim_mp_oauth_state(text, uuid)', 'EXECUTE'), true,
  'service_role can execute claim_mp_oauth_state');
select is(has_function_privilege('authenticated', 'public.claim_mp_sync_batch(int)', 'EXECUTE'), false,
  'authenticated cannot execute claim_mp_sync_batch');
select is(has_function_privilege('service_role', 'public.claim_mp_sync_batch(int)', 'EXECUTE'), true,
  'service_role can execute claim_mp_sync_batch');
select is(has_function_privilege('authenticated', 'public.finish_mp_sync(uuid, text, text, timestamptz)', 'EXECUTE'), false,
  'authenticated cannot execute finish_mp_sync');
select is(has_function_privilege('service_role', 'public.finish_mp_sync(uuid, text, text, timestamptz)', 'EXECUTE'), true,
  'service_role can execute finish_mp_sync');
select is(has_function_privilege('authenticated', 'public.is_plus_user(uuid)', 'EXECUTE'), false,
  'authenticated cannot execute is_plus_user');
select is(has_function_privilege('service_role', 'public.is_plus_user(uuid)', 'EXECUTE'), true,
  'service_role can execute is_plus_user');
select is(has_function_privilege('authenticated', 'public.consume_ai_quota_for(uuid, text, int)', 'EXECUTE'), false,
  'authenticated cannot execute consume_ai_quota_for');
select is(has_function_privilege('service_role', 'public.consume_ai_quota_for(uuid, text, int)', 'EXECUTE'), true,
  'service_role can execute consume_ai_quota_for');
select is(has_function_privilege('authenticated', 'public.ensure_mp_wallet(uuid)', 'EXECUTE'), false,
  'authenticated cannot execute ensure_mp_wallet');
select is(has_function_privilege('service_role', 'public.ensure_mp_wallet(uuid)', 'EXECUTE'), true,
  'service_role can execute ensure_mp_wallet');
select is(has_function_privilege('authenticated', 'public.get_my_mp_connection()', 'EXECUTE'), true,
  'authenticated can execute get_my_mp_connection');
select is(has_function_privilege('anon', 'public.get_my_mp_connection()', 'EXECUTE'), false,
  'anon cannot execute get_my_mp_connection');
select is(
  (select count(*)::int from pg_proc
   where oid in (
     'public.claim_mp_oauth_state(text, uuid)'::regprocedure,
     'public.claim_mp_sync_batch(int)'::regprocedure,
     'public.finish_mp_sync(uuid, text, text, timestamptz)'::regprocedure,
     'public.is_plus_user(uuid)'::regprocedure,
     'public.consume_ai_quota_for(uuid, text, int)'::regprocedure,
     'public.ensure_mp_wallet(uuid)'::regprocedure,
     'public.get_my_mp_connection()'::regprocedure)
   and prosecdef and 'search_path=""' = any (proconfig)),
  7, 'all seven functions are SECURITY DEFINER with search_path set to empty');

-- Constraints (superuser) -------------------------------------------------------------------------------
select throws_ok($$insert into public.mp_connections (user_id, mp_user_id)
  values ('22222222-2222-2222-2222-222222222222', 'mp-1')$$,
  '23505', null, 'a second Moni user cannot reserve an MP account already linked (partial unique)');
select throws_ok($$insert into public.mp_connections (user_id, mp_user_id, status)
  values ('33333333-3333-3333-3333-333333333333', 'mp-1', 'plus_lapsed')$$,
  '23505', null, 'a plus_lapsed connection still reserves the MP account');
select lives_ok($$insert into public.mp_connections (user_id, mp_user_id, status)
  values ('22222222-2222-2222-2222-222222222222', 'mp-1', 'unlinked')$$,
  'an unlinked connection does not reserve the MP account');
select lives_ok($$insert into public.mp_connections (user_id, mp_user_id, status)
  values ('33333333-3333-3333-3333-333333333333', 'mp-1', 'unlinked')$$,
  'several unlinked rows can share an mp_user_id');
select throws_ok($$insert into public.mp_connections (user_id, mp_user_id, status)
  values ('33333333-3333-3333-3333-333333333333', 'mp-9', 'hacked')$$,
  '23514', null, 'an unknown connection status is rejected');
select throws_ok($$insert into public.mp_oauth_states (state_hash, user_id, import_window, consent_version)
  values ('hash-bad-window', '11111111-1111-1111-1111-111111111111', '7', 'v1')$$,
  '23514', null, 'an unknown import window is rejected');
select throws_ok($$insert into public.mp_imported_payments (payment_id, owner_id, mp_status, outcome, amount, occurred_on)
  values ('pay-a-1', '11111111-1111-1111-1111-111111111111', 'approved', 'posted', 1, '2026-02-28')$$,
  '23505', null, 'payment_id is unique');
select throws_ok($$insert into public.mp_imported_payments (payment_id, owner_id, mp_status, outcome, amount, occurred_on)
  values ('pay-bad', '11111111-1111-1111-1111-111111111111', 'approved', 'nope', 1, '2026-02-28')$$,
  '23514', null, 'an unknown outcome is rejected');

-- Cascade on auth user delete (R1.8) ----------------------------------------------------------------------
insert into public.mp_connections (user_id, mp_user_id) values ('55555555-5555-5555-5555-555555555555', 'mp-5');
insert into public.mp_oauth_states (state_hash, user_id, consent_version)
  values ('hash-cascade', '55555555-5555-5555-5555-555555555555', 'v1');
insert into public.mp_imported_payments (payment_id, owner_id, mp_status, outcome, amount, occurred_on)
  values ('pay-e-1', '55555555-5555-5555-5555-555555555555', 'approved', 'posted', 10, '2026-02-28');
delete from auth.users where id = '55555555-5555-5555-5555-555555555555';
select is((select count(*)::int from public.mp_connections where user_id = '55555555-5555-5555-5555-555555555555'), 0,
  'deleting the auth user removes mp_connections');
select is((select count(*)::int from public.mp_oauth_states where user_id = '55555555-5555-5555-5555-555555555555'), 0,
  'deleting the auth user removes mp_oauth_states');
select is((select count(*)::int from public.mp_imported_payments where owner_id = '55555555-5555-5555-5555-555555555555'), 0,
  'deleting the auth user removes mp_imported_payments');

-- Service role: OAuth state claim (R1.4) ---------------------------------------------------------------------
set local role service_role;

insert into public.mp_oauth_states (state_hash, user_id, import_window, consent_version, expires_at, used_at) values
  ('hash-valid', '11111111-1111-1111-1111-111111111111', '30', 'v1', now() + interval '10 minutes', null),
  ('hash-expired', '11111111-1111-1111-1111-111111111111', default, 'v1', now() - interval '1 minute', null),
  ('hash-used', '11111111-1111-1111-1111-111111111111', 'now', 'v1', now() + interval '10 minutes', now());

select throws_ok($$select public.claim_mp_oauth_state('hash-unknown', '11111111-1111-1111-1111-111111111111')$$,
  '22023', 'invalid_state', 'an unknown state is rejected');
select throws_ok($$select public.claim_mp_oauth_state('hash-used', '11111111-1111-1111-1111-111111111111')$$,
  '22023', 'invalid_state', 'a used state is rejected');
select throws_ok($$select public.claim_mp_oauth_state('hash-expired', '11111111-1111-1111-1111-111111111111')$$,
  '22023', 'invalid_state', 'an expired state is rejected');
select throws_ok($$select public.claim_mp_oauth_state('hash-valid', '22222222-2222-2222-2222-222222222222')$$,
  '22023', 'invalid_state', 'a state minted for user A is rejected for user B');
select is((select used_at from public.mp_oauth_states where state_hash = 'hash-valid'), null::timestamptz,
  'a rejected other-user claim does not consume the state');
select is(public.claim_mp_oauth_state('hash-valid', '11111111-1111-1111-1111-111111111111')->>'user_id',
  '11111111-1111-1111-1111-111111111111', 'the owner claims a valid state');
select is((select used_at from public.mp_oauth_states where state_hash = 'hash-valid'), now(),
  'the claim consumes the state');
select throws_ok($$select public.claim_mp_oauth_state('hash-valid', '11111111-1111-1111-1111-111111111111')$$,
  '22023', 'invalid_state', 'a state cannot be claimed twice');
select is((select import_window from public.mp_oauth_states where state_hash = 'hash-valid'), '30',
  'the import window chosen at start is kept');
select is((select import_window from public.mp_oauth_states where state_hash = 'hash-expired'), 'now',
  'the import window defaults to now');

-- Service role: is_plus_user ----------------------------------------------------------------------------------
select is(public.is_plus_user('11111111-1111-1111-1111-111111111111'), true, 'a Plus user is Plus');
select is(public.is_plus_user('33333333-3333-3333-3333-333333333333'), false, 'a free user is not Plus');
select is(public.is_plus_user('44444444-4444-4444-4444-444444444444'), false, 'a lapsed user is not Plus');
select is(public.is_plus_user(null), false, 'NULL is not Plus');

-- Service role: sync batch claim (R2.1, R4.1, D8, D15) --------------------------------------------------------
select is((select array_agg(c.user_id) from public.claim_mp_sync_batch(10) c),
  array['11111111-1111-1111-1111-111111111111']::uuid[],
  'only the active, Plus, consented, due, unleased connection is claimed');
select is((select status from public.mp_connections where user_id = '44444444-4444-4444-4444-444444444444'),
  'plus_lapsed', 'a connection whose Plus expired becomes plus_lapsed');
select is((select sync_lease_until > now() from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  true, 'the claim sets a lease');
select is((select count(*)::int from public.claim_mp_sync_batch(10)), 0,
  'a leased connection is not claimed again');
select is((select status from public.mp_connections where user_id = '66666666-6666-6666-6666-666666666666'),
  'active', 'a connection without consent stays active but is never claimed');

reset role;
update public.plus_entitlements set expires_at = now() + interval '30 days'
where user_id = '44444444-4444-4444-4444-444444444444';
set local role service_role;

select is((select array_agg(c.user_id) from public.claim_mp_sync_batch(10) c),
  array['44444444-4444-4444-4444-444444444444']::uuid[],
  'after renewal the lapsed connection is claimed without relinking');
select is((select status from public.mp_connections where user_id = '44444444-4444-4444-4444-444444444444'),
  'active', 'renewal moves plus_lapsed back to active');

-- Service role: finish_mp_sync -----------------------------------------------------------------------------------
select is(public.finish_mp_sync('11111111-1111-1111-1111-111111111111', 'ok', null, '2026-02-01T00:00:00Z'), true,
  'finish_mp_sync ok returns true');
select is((select cursor_at from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  '2026-02-01T00:00:00Z'::timestamptz, 'a complete run advances the cursor');
select is((select last_sync_status from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  'ok', 'last_sync_status is ok');
select is((select sync_lease_until from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  null::timestamptz, 'finishing releases the lease');

select is(public.finish_mp_sync('11111111-1111-1111-1111-111111111111', 'partial', 'rate_limited', '2026-03-01T00:00:00Z'),
  true, 'finish_mp_sync partial returns true');
select is((select cursor_at from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  '2026-02-01T00:00:00Z'::timestamptz, 'a partial run leaves the cursor unchanged (R2.1)');
select is((select consecutive_failures from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  1, 'a partial run counts as a failure');
select is((select last_error_class from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  'rate_limited', 'the error class is recorded');
select is((select status from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  'active', 'rate_limited keeps the connection active');

select is(public.finish_mp_sync('11111111-1111-1111-1111-111111111111', 'ok', null, '2026-03-01T00:00:00Z'), true,
  'a later complete run');
select is((select consecutive_failures from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'a complete run resets the failure counter');
select is((select last_error_class from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  null::text, 'a complete run clears the error class');
select is((select cursor_at from public.mp_connections where user_id = '11111111-1111-1111-1111-111111111111'),
  '2026-03-01T00:00:00Z'::timestamptz, 'the cursor advances after the complete run');

select is(public.finish_mp_sync('44444444-4444-4444-4444-444444444444', 'error', 'token_invalid', null), true,
  'a token_invalid error is recorded');
select is((select status from public.mp_connections where user_id = '44444444-4444-4444-4444-444444444444'),
  'needs_reconnect', 'token_invalid moves the connection to needs_reconnect');
select is(
  (select access_token_enc is null and refresh_token_enc is null and key_version is null
   from public.mp_connections where user_id = '44444444-4444-4444-4444-444444444444'),
  true, 'token_invalid nulls the ciphertexts and the key version (D13)');
select is(public.finish_mp_sync('99999999-9999-9999-9999-999999999999', 'ok', null, null), false,
  'finishing an unknown connection returns false');
select throws_ok($$select public.finish_mp_sync('11111111-1111-1111-1111-111111111111', 'bogus', null, null)$$,
  '22023', 'invalid_result', 'an unknown result is rejected');
select throws_ok($$select public.finish_mp_sync('11111111-1111-1111-1111-111111111111', 'error', 'bogus', null)$$,
  '22023', 'invalid_error_class', 'an unknown error class is rejected');

-- Service role: AI quota (R4.1, D14) -----------------------------------------------------------------------------
select throws_ok($$select public.consume_ai_quota_for('33333333-3333-3333-3333-333333333333', 'mp_import', 48)$$,
  '54000', 'plus_required', 'a free user cannot consume the import quota');
select is(public.consume_ai_quota_for('11111111-1111-1111-1111-111111111111', 'mp_import', 48), 47,
  'the first call leaves 47 of 48');
select is(public.consume_ai_quota_for('11111111-1111-1111-1111-111111111111', 'mp_import', 48), 46,
  'the second call leaves 46');
select is((select count(*)::int from public.ai_usage
           where owner_id = '11111111-1111-1111-1111-111111111111' and feature = 'mp_import'), 2,
  'usage is recorded for the given user under feature mp_import');
select is((select count(*)::int from public.ai_usage where owner_id = '33333333-3333-3333-3333-333333333333'), 0,
  'a rejected free user consumes nothing');
select is(public.consume_ai_quota_for('88888888-8888-8888-8888-888888888888', 'mp_import', 2), 1, 'H: first of 2');
select is(public.consume_ai_quota_for('88888888-8888-8888-8888-888888888888', 'mp_import', 2), 0, 'H: second of 2');
select throws_ok($$select public.consume_ai_quota_for('88888888-8888-8888-8888-888888888888', 'mp_import', 2)$$,
  '54000', 'ai_quota_exceeded', 'the cap is enforced');
select throws_ok($$select public.consume_ai_quota_for('11111111-1111-1111-1111-111111111111', 'Bad Feature', 48)$$,
  '22023', 'invalid_feature', 'an invalid feature name is rejected');
select throws_ok($$select public.consume_ai_quota_for(null, 'mp_import', 48)$$,
  '22023', 'invalid_user', 'a NULL user is rejected');

-- Service role: wallet (R1.5) --------------------------------------------------------------------------------------
select isnt(public.ensure_mp_wallet('11111111-1111-1111-1111-111111111111'), null::uuid,
  'ensure_mp_wallet creates the wallet');
select is(public.ensure_mp_wallet('11111111-1111-1111-1111-111111111111'),
  (select id from public.accounts where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'Mercado Pago'),
  'relinking returns the same wallet');
select is((select count(*)::int from public.accounts
           where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'Mercado Pago'), 1,
  'exactly one Mercado Pago wallet exists after relinking');
select is(
  (select kind || ':' || currency from public.accounts
   where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'Mercado Pago'),
  'wallet:ARS', 'the wallet is an ARS wallet');

-- User A through the API role: RLS and the safe view -------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select throws_ok($$select count(*) from public.mp_connections$$, '42501', null,
  'a user cannot read mp_connections directly');
select throws_ok($$select count(*) from public.mp_oauth_states$$, '42501', null,
  'a user cannot read mp_oauth_states');
select throws_ok($$update public.mp_connections set status = 'active'$$, '42501', null,
  'a user cannot update mp_connections');
select is((select count(*)::int from public.mp_imported_payments), 1, 'A sees only their own imported payments');
select throws_ok($$insert into public.mp_imported_payments (payment_id, owner_id, mp_status, outcome, amount, occurred_on)
  values ('pay-hack', '11111111-1111-1111-1111-111111111111', 'approved', 'posted', 1, '2026-02-28')$$,
  '42501', null, 'a user cannot insert imported payments');
select is((select g.mp_user_id from public.get_my_mp_connection() g), 'mp-1',
  'get_my_mp_connection returns the caller''s connection');
select is((select g.status from public.get_my_mp_connection() g), 'active',
  'get_my_mp_connection returns the status');
select is((select count(*)::int from public.get_my_mp_connection() g, lateral jsonb_object_keys(to_jsonb(g)) k
           where k in ('access_token_enc', 'refresh_token_enc', 'key_version', 'sync_lease_until')), 0,
  'get_my_mp_connection exposes no token or internal columns');
select throws_ok($$select public.claim_mp_sync_batch(10)$$, '42501', null, 'a user cannot claim sync batches');
select throws_ok($$select public.consume_ai_quota_for('11111111-1111-1111-1111-111111111111', 'mp_import', 48)$$,
  '42501', null, 'a user cannot consume quota through the service function');

select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is((select g.status from public.get_my_mp_connection() g), 'unlinked',
  'C only sees their own (unlinked) row, never the active row of another user');

-- Anonymous callers ---------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok($$select count(*) from public.mp_connections$$, '42501', null, 'anon cannot read mp_connections');
select throws_ok($$select * from public.get_my_mp_connection()$$, '42501', null, 'anon cannot execute get_my_mp_connection');

select * from finish();
rollback;
