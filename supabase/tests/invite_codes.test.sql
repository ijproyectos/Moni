-- pgTAP: run with `supabase test db` against a local stack (after 20261105000000_shorter_invite_codes.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- A owns the group; C and D are outsiders who join with codes typed in different shapes.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');

insert into public.groups (id, name, kind, created_by)
values ('90000000-0000-0000-0000-000000000001', 'Casa', 'casa', '11111111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role)
values ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');

-- The constraint accepts 8 or 12 chars of the alphabet and nothing else.
select lives_ok(
  $$insert into public.group_invites (group_id, code, created_by)
    values ('90000000-0000-0000-0000-000000000001', 'WXYZ2345', '11111111-1111-1111-1111-111111111111')$$,
  'an 8-char code is accepted');
select lives_ok(
  $$insert into public.group_invites (group_id, code, created_by)
    values ('90000000-0000-0000-0000-000000000001', 'ABCDEFGH2345', '11111111-1111-1111-1111-111111111111')$$,
  'a legacy 12-char code is still accepted');
select throws_ok(
  $$insert into public.group_invites (group_id, code, created_by)
    values ('90000000-0000-0000-0000-000000000001', 'ABCDEFGH23', '11111111-1111-1111-1111-111111111111')$$,
  '23514', null, 'a 10-char code is rejected');
select throws_ok(
  $$insert into public.group_invites (group_id, code, created_by)
    values ('90000000-0000-0000-0000-000000000001', 'ABCDEFG0', '11111111-1111-1111-1111-111111111111')$$,
  '23514', null, 'a code with an ambiguous symbol (0) is rejected');

-- Act as the owner ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select matches(
  (select public.create_group_invite('90000000-0000-0000-0000-000000000001')),
  '^[A-HJ-NP-Z2-9]{8}$',
  'create_group_invite now returns an 8-char code');

-- Act as C: dashes, spaces and lowercase are ignored server-side -----------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select is((select public.join_group(' wxyz-2345 ')), '90000000-0000-0000-0000-000000000001'::uuid,
  'a dashed, lowercase 8-char code joins');
select is((select uses from public.group_invites where code = 'WXYZ2345'), 1, 'the dashed code consumed one use');

-- Act as D: a legacy 12-char code typed in blocks still works --------------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);

select is((select public.join_group('abcd-efgh 2345')), '90000000-0000-0000-0000-000000000001'::uuid,
  'a legacy 12-char code with dashes and spaces joins');
select is((select public.join_group('---- ')), null::uuid, 'a code that is only separators fails uniformly');

select * from finish();
rollback;
