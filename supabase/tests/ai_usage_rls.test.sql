-- pgTAP: run with `supabase test db` against a local stack (after the earlier migrations).
begin;
create extension if not exists pgtap with schema extensions;

select plan(23);

-- Fixtures as superuser, before switching role ----------------------------------------------------
-- A and B: normal users. C: already at the hard ceiling (100 rows today). D: only has old rows.
-- E: only has a row older than 10 minutes.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'e@example.com');

-- consume_ai_quota rejects free users for the AI features (moni_plus), so every fixture user is Plus.
insert into public.plus_entitlements (user_id, source, expires_at)
select id, 'promo', now() + interval '30 days' from auth.users
where id in (
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555'
);

insert into public.ai_usage (owner_id, feature)
select '33333333-3333-3333-3333-333333333333', 'parse_movements' from generate_series(1, 100);

insert into public.ai_usage (owner_id, feature, created_at)
select '44444444-4444-4444-4444-444444444444', 'parse_movements', now() - interval '3 days'
from generate_series(1, 5);

insert into public.ai_usage (owner_id, feature, created_at)
values ('55555555-5555-5555-5555-555555555555', 'parse_movements', now() - interval '10 minutes');

-- Grants and function attributes (a regression here reopens direct client inserts) -------------------------
select is(
  has_table_privilege('authenticated', 'public.ai_usage', 'INSERT'),
  false,
  'authenticated has no INSERT privilege on ai_usage'
);

select is(
  has_any_column_privilege('authenticated', 'public.ai_usage', 'INSERT'),
  false,
  'authenticated has no column-level INSERT privilege on ai_usage'
);

select is(
  has_table_privilege('anon', 'public.ai_usage', 'SELECT'),
  false,
  'anon has no privileges on ai_usage'
);

select is(
  (select prosecdef from pg_proc where oid = 'public.consume_ai_quota(text,int)'::regprocedure),
  true,
  'consume_ai_quota is SECURITY DEFINER'
);

select hasnt_function(
  'public', 'refund_ai_quota', array['text'],
  'refund_ai_quota does not exist (a user-callable refund would bypass the quota)'
);

-- User A ---------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select is(public.consume_ai_quota('parse_movements', 3), 2, 'first call leaves 2 of 3');
select is(public.consume_ai_quota('parse_movements', 3), 1, 'second call leaves 1');
select is(public.consume_ai_quota('parse_movements', 3), 0, 'third call leaves 0');

select throws_ok(
  $$select public.consume_ai_quota('parse_movements', 3)$$,
  '54000',
  'ai_quota_exceeded',
  'the call over the limit is rejected'
);

select is(
  (select count(*)::int from public.ai_usage),
  3,
  'a rejected call records nothing, and the user sees only their own rows'
);

select is(
  public.consume_ai_quota('other_feature', 3),
  2,
  'quota is counted per feature'
);

select throws_ok(
  $$select public.consume_ai_quota('Bad Feature!', 3)$$,
  '22023',
  'invalid_feature',
  'invalid feature names are rejected'
);

select throws_ok(
  $$insert into public.ai_usage (feature) values ('parse_movements')$$,
  '42501',
  null,
  'a user cannot insert into ai_usage directly'
);

select throws_ok(
  $$insert into public.ai_usage (owner_id, feature) values ('22222222-2222-2222-2222-222222222222', 'parse_movements')$$,
  '42501',
  null,
  'a user cannot insert a row for someone else'
);

select throws_ok(
  $$update public.ai_usage set feature = 'x'$$,
  '42501',
  null,
  'rows cannot be updated'
);

select throws_ok(
  $$delete from public.ai_usage$$,
  '42501',
  null,
  'rows cannot be deleted directly'
);

-- User B ---------------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is_empty(
  'select 1 from public.ai_usage',
  'user B does not see the rows of user A'
);

select is(public.consume_ai_quota('parse_movements', 3), 2, 'quota of user B is independent');

-- User C: at the hard ceiling of 100, asking for more does not help --------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select throws_ok(
  $$select public.consume_ai_quota('parse_movements', 100000)$$,
  '54000',
  'ai_quota_exceeded',
  'the limit argument is clamped to 100'
);

-- User D: rows from previous days do not count ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);

select is(public.consume_ai_quota('parse_movements', 3), 2, 'rows from earlier days do not count');

-- Not authenticated and anonymous ----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);

select throws_ok(
  $$select public.consume_ai_quota('parse_movements', 3)$$,
  '42501',
  'not_authenticated',
  'a token without a subject is rejected'
);

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  $$select public.consume_ai_quota('parse_movements', 3)$$,
  '42501',
  null,
  'anon cannot call consume_ai_quota'
);

-- Superuser readback: other users did not touch A's or E's rows -------------------------------------------
reset role;

select is(
  (select count(*)::int from public.ai_usage
   where owner_id in ('11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555')
     and feature = 'parse_movements'),
  4,
  'A keeps 3 rows and E keeps its old row'
);

select * from finish();
rollback;
