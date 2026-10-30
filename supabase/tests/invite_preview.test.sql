-- pgTAP: run with `supabase test db` against a local stack (after 20261106000000_group_invite_preview.sql).
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');

insert into public.groups (id, name, kind, created_by)
values ('90000000-0000-0000-0000-000000000001', 'Viaje a Brasil', 'viaje', '11111111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role)
values ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner');
insert into public.group_invites (group_id, code, created_by)
values ('90000000-0000-0000-0000-000000000001', 'WXYZ2345', '11111111-1111-1111-1111-111111111111');

-- B is not a member: the preview gives the real name and nothing else.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is((select public.preview_group_invite('wxyz-2345')), 'Viaje a Brasil', 'a valid code, typed loosely, gives the group name');
select is((select count(*)::int from public.group_members where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'previewing does not join');
select is((select public.preview_group_invite('ZZZZ2222')), null::text, 'an unknown code gives NULL');

reset role;
update public.group_invites set expires_at = now() - interval '1 minute' where code = 'WXYZ2345';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);
select is((select public.preview_group_invite('WXYZ2345')), null::text, 'an expired code gives NULL');

-- group_join_attempts has no grants: look at it as the superuser.
reset role;
select is((select count(*)::int from public.group_join_attempts a where a.user_id = '22222222-2222-2222-2222-222222222222'), 2, 'the two failed previews are recorded for the throttle');

-- A is a member of the group: the expired code still gives them the group name (join_group keeps recognising them).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select is((select public.preview_group_invite('WXYZ2345')), 'Viaje a Brasil', 'a current member still gets the name of an expired invite');
select is((select public.join_group('WXYZ2345')), '90000000-0000-0000-0000-000000000001'::uuid, 'and joining with it is recognised as already a member');
reset role;

set local role anon;
select throws_ok($$select public.preview_group_invite('WXYZ2345')$$, '42501', null, 'anon cannot call it');

select * from finish();
rollback;
