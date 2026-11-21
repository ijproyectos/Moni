-- pgTAP: `supabase test db` en un stack local, después de aplicar 20261126000000, 20261126000100 y 20261126000200.
-- (Las mismas comprobaciones se ejecutaron también en PGlite con la cadena completa de migraciones.)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');
insert into public.plus_entitlements (user_id, source, expires_at)
select id, 'promo', now() + interval '30 days' from auth.users;

-- A creates "Depto" with the legacy kind: it is stored as hogar. B and C are members, D is an outsider.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok($$select public.create_group('Depto', 'casa')$$, 'create_group still accepts casa');
select is((select kind from public.groups where name = 'Depto'), 'hogar', 'casa is stored as hogar');
select throws_ok($$select public.create_group('Mal', 'zzz')$$, '22023', null, 'invalid kind rejected');

reset role;
insert into public.group_members (group_id, user_id, role)
select g.id, u.id, 'member' from public.groups g, auth.users u
where g.name = 'Depto' and u.id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- Hide is only mine.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select lives_ok($$select public.hide_group_for_me((select id from public.groups where name = 'Depto'))$$, 'B hides the group');
select is((select count(*)::int from public.get_my_groups() where name = 'Depto' and hidden_at is not null), 1,
  'hidden group is still returned (flagged), so debts and totals keep seeing it');
select is((select count(*)::int from public.get_my_hidden_and_archived_groups() where name = 'Depto'), 1, 'it is in B hidden list');
select throws_ok($$update public.group_members set hidden_at = null$$, '42501', null, 'no direct writes');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select count(*)::int from public.get_my_groups() where name = 'Depto'), 1, 'A still sees it');
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);
select throws_ok($$select public.hide_group_for_me((select id from public.groups where name = 'Depto'))$$, '42501', null, 'outsider cannot hide');

-- Roles.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select throws_ok($$select public.set_member_role((select id from public.groups where name = 'Depto'), '22222222-2222-2222-2222-222222222222', 'owner')$$,
  '42501', null, 'a member cannot promote');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$select public.set_member_role((select id from public.groups where name = 'Depto'), '11111111-1111-1111-1111-111111111111', 'member')$$,
  '23514', null, 'the last administrator cannot be demoted');
select lives_ok($$select public.set_member_role((select id from public.groups where name = 'Depto'), '22222222-2222-2222-2222-222222222222', 'owner')$$,
  'A promotes B');

-- Leave: the only administrator must name another first.
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select lives_ok($$select public.set_member_role((select id from public.groups where name = 'Depto'), '22222222-2222-2222-2222-222222222222', 'member')$$,
  'B steps down');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$select public.leave_group((select id from public.groups where name = 'Depto'))$$, '23514', null,
  'the only administrator cannot leave while others remain');

-- Archive: administrators only, name must match, nothing is deleted.
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select throws_ok($$select public.archive_group_for_all((select id from public.groups where name = 'Depto'), 'Depto')$$, '42501', null, 'a member cannot archive');
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$select public.archive_group_for_all((select id from public.groups where name = 'Depto'), 'otro')$$, '22023', null, 'name must match');
select lives_ok($$select public.archive_group_for_all((select id from public.groups where name = 'Depto'), ' depto ')$$, 'clean group is archived');
select is((select count(*)::int from public.group_members where group_id = (select id from public.groups where name = 'Depto')), 3, 'archiving deleted no membership');

select * from finish();
rollback;
