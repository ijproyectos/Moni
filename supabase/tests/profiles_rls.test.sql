-- pgTAP: run with `supabase test db` against a local stack.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Two users; the signup trigger must create their profiles.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com', '{"full_name": "Ana"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com', '{"full_name": "Beto"}');

select is(
  (select count(*)::int from public.profiles),
  2,
  'signup trigger creates one profile per user'
);

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq(
  'select display_name from public.profiles',
  $$values ('Ana'::text)$$,
  'user A sees only their own profile'
);

select is_empty(
  $$select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222'$$,
  'user A cannot read user B'
);

update public.profiles set display_name = 'Ana María' where id = '11111111-1111-1111-1111-111111111111';
select results_eq(
  'select display_name from public.profiles',
  $$values ('Ana María'::text)$$,
  'user A can update their own profile'
);

update public.profiles set display_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222';

select throws_ok(
  $$insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  null,
  'authenticated users cannot insert profiles'
);

select throws_ok(
  $$update public.profiles set base_currency = 'USD'$$,
  '42501',
  null,
  'authenticated users cannot change protected columns'
);

-- Anonymous visitors.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  'select * from public.profiles',
  '42501',
  null,
  'anon cannot read profiles'
);

-- Verify as superuser that B was not modified by A.
reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Beto',
  'user A update against user B affected no rows'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Ana María',
  'own update persisted'
);

select * from finish();
rollback;
