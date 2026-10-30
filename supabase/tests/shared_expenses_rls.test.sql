-- pgTAP: run with `supabase test db` against a local stack (after both migrations).
begin;
create extension if not exists pgtap with schema extensions;

select plan(121);

-- Fixtures as superuser ----------------------------------------------------------------------------
-- Users: A (owner), B and D (members), C (outsider until the join tests).
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'c@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'd@example.com');

update public.profiles set display_name = 'Ana' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set display_name = 'Beto' where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set display_name = 'Caro' where id = '33333333-3333-3333-3333-333333333333';
update public.profiles set display_name = 'Dani' where id = '44444444-4444-4444-4444-444444444444';

insert into public.accounts (id, owner_id, name, kind, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A Caja', 'cash', 1000),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'A Banco', 'bank', 0),
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B Caja', 'cash', 500);
insert into public.accounts (id, owner_id, name, kind, opening_balance, archived_at) values
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'A Vieja', 'cash', 0, now());

-- A has a personal category named like the "comida" template; B and D do not (virtual category).
insert into public.categories (id, owner_id, kind, name, icon, color) values
  ('ca000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'expense', 'Comida', 'Utensils', '#E5533D');

insert into public.groups (id, name, kind, created_by)
values ('90000000-0000-0000-0000-000000000001', 'Casa', 'casa', '11111111-1111-1111-1111-111111111111');
insert into public.group_members (group_id, user_id, role) values
  ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('90000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'member'),
  ('90000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'member');

insert into public.group_invites (group_id, code, created_by, expires_at, revoked_at, max_uses, uses) values
  ('90000000-0000-0000-0000-000000000001', 'AAAAAAAAAAA2', '11111111-1111-1111-1111-111111111111', now() + interval '7 days', null, 20, 0),
  ('90000000-0000-0000-0000-000000000001', 'BBBBBBBBBBB2', '11111111-1111-1111-1111-111111111111', now() - interval '1 day', null, 20, 0),
  ('90000000-0000-0000-0000-000000000001', 'CCCCCCCCCCC2', '11111111-1111-1111-1111-111111111111', now() + interval '7 days', now(), 20, 0),
  ('90000000-0000-0000-0000-000000000001', 'DDDDDDDDDDD2', '11111111-1111-1111-1111-111111111111', now() + interval '7 days', null, 1, 1);

-- Act as user A ------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

-- Groups and invites
select public.create_group('  Casa Test  ', 'casa');
select is(
  (select m.role from public.group_members m join public.groups g on g.id = m.group_id
   where g.name = 'Casa Test' and m.user_id = '11111111-1111-1111-1111-111111111111'),
  'owner', 'create_group trims the name and makes the creator owner');
select throws_ok($$select public.create_group('X', 'hotel')$$, '22023', 'invalid_group_kind', 'invalid group kind is rejected');
select throws_ok($$select public.create_group('   ', 'casa')$$, '22023', 'invalid_group_name', 'blank group name is rejected');

select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$, 'invite 1');
select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$, 'invite 2');
select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$, 'invite 3');
select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$, 'invite 4');
select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$, 'invite 5');
select throws_ok(
  $$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$,
  '23514', 'invite_limit_reached', 'a sixth active invite is rejected');
select is(
  (select count(*)::int from public.group_invites
   where group_id = (select id from public.groups where name = 'Casa Test') and code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  5, 'new invite codes are 8 chars from the unambiguous alphabet');
select lives_ok(
  $$select public.revoke_group_invite((select id from public.group_invites
      where group_id = (select id from public.groups where name = 'Casa Test') order by created_at, id limit 1))$$,
  'creator can revoke an invite');
select lives_ok($$select public.create_group_invite((select id from public.groups where name = 'Casa Test'))$$,
  'revoking frees an invite slot');

-- Personal expense of A (adds to the shared share in the same category).
insert into public.transactions (account_id, category_id, kind, amount, occurred_on, note)
values ('a0000000-0000-0000-0000-000000000001', 'ca000000-0000-0000-0000-000000000001', 'expense', 20, '2026-10-03', 'personal');

-- Shared expenses ----------------------------------------------------------------------------------
-- X1: A pays 100.00 split equally among B, D, A; linked to A Caja.
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 100.00, p_description => 'X1 cena',
  p_template_slug => 'comida', p_occurred_on => '2026-10-05',
  p_paid_by => '11111111-1111-1111-1111-111111111111', p_split_method => 'equal',
  p_participants => array['22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444',
                          '11111111-1111-1111-1111-111111111111']::uuid[],
  p_payer_account_id => 'a0000000-0000-0000-0000-000000000001');
select set_config('test.x1', (select id::text from public.shared_expenses where description = 'X1 cena'), true);

select is(
  (select string_agg(substr(user_id::text, 1, 1) || ':' || share_amount::text, ',' order by user_id)
   from public.shared_expense_splits where expense_id = current_setting('test.x1')::uuid),
  '1:33.34,2:33.33,4:33.33', '100.00 / 3: the payer gets the extra cent');
select is(
  (select sum(share_amount) from public.shared_expense_splits where expense_id = current_setting('test.x1')::uuid),
  100.00::numeric, 'split shares add up to the amount');

-- X2: A pays 100.01 between B and D only; the extra cent goes to the lowest user_id.
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 100.01, p_description => 'X2 super',
  p_template_slug => 'super', p_occurred_on => '2026-10-07',
  p_paid_by => '11111111-1111-1111-1111-111111111111', p_split_method => 'equal',
  p_participants => array['44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222']::uuid[]);
select is(
  (select string_agg(substr(user_id::text, 1, 1) || ':' || share_amount::text, ',' order by user_id)
   from public.shared_expense_splits where expense_id = (select id from public.shared_expenses where description = 'X2 super')),
  '2:50.01,4:50.00', 'payer outside the split: extra cent goes to the lowest user_id');

-- X3: percent split with rounding, voided right away.
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 100.01, p_description => 'X3 porcentaje',
  p_template_slug => null, p_occurred_on => '2026-10-08',
  p_paid_by => '11111111-1111-1111-1111-111111111111', p_split_method => 'percent',
  p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                          '44444444-4444-4444-4444-444444444444']::uuid[],
  p_percents => array[33.33, 33.33, 33.34]::numeric[]);
select is(
  (select string_agg(substr(user_id::text, 1, 1) || ':' || share_amount::text, ',' order by user_id)
   from public.shared_expense_splits where expense_id = (select id from public.shared_expenses where description = 'X3 porcentaje')),
  '1:33.34,2:33.33,4:33.34', 'percent split in cents; leftover cent goes to the payer');

select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'mal',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '11111111-1111-1111-1111-111111111111',
      p_split_method => 'percent',
      p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[],
      p_percents => array[50, 40]::numeric[])$$,
  '22023', 'percents_must_sum_100', 'percentages must add up to 100');

select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'mal',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '11111111-1111-1111-1111-111111111111',
      p_split_method => 'equal',
      p_participants => array['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333']::uuid[])$$,
  '22023', 'participant_not_member', 'a participant outside the group is rejected');

select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'mal',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '11111111-1111-1111-1111-111111111111',
      p_split_method => 'equal',
      p_participants => array['11111111-1111-1111-1111-111111111111']::uuid[],
      p_payer_account_id => 'b0000000-0000-0000-0000-000000000001')$$,
  '23503', 'account_not_found', 'the payer account must be the caller''s own');

select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'mal',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '11111111-1111-1111-1111-111111111111',
      p_split_method => 'equal',
      p_participants => array['11111111-1111-1111-1111-111111111111']::uuid[],
      p_payer_account_id => 'a0000000-0000-0000-0000-000000000003')$$,
  '23514', 'account_archived', 'an archived payer account is rejected');

select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'mal',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '22222222-2222-2222-2222-222222222222',
      p_split_method => 'equal',
      p_participants => array['11111111-1111-1111-1111-111111111111']::uuid[],
      p_payer_account_id => 'a0000000-0000-0000-0000-000000000001')$$,
  '22023', 'payer_account_requires_payer', 'only the payer can link an account');

select is(
  (select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000001'),
  880.00::numeric, 'shared_payment lowers the payer account balance (1000 - 20 personal - 100 shared)');
select is(
  (select count(*)::int from public.transactions
   where shared_expense_id = current_setting('test.x1')::uuid and kind = 'shared_payment' and amount = 100),
  1, 'one shared_payment transaction for the full amount');

-- Reserved kinds stay out of reach for clients.
select throws_ok(
  $$insert into public.transactions (account_id, kind, amount, occurred_on)
    values ('a0000000-0000-0000-0000-000000000001', 'settlement_in', 10, '2026-10-05')$$,
  '42501', 'new row violates row-level security policy for table "transactions"',
  'clients cannot create reserved kinds');
update public.transactions set amount = 1, status = 'voided' where kind = 'shared_payment';
select is(
  (select amount::text || '/' || status from public.transactions where kind = 'shared_payment'),
  '100.00/posted', 'clients cannot edit or void a reserved-kind transaction');

-- Voiding ----------------------------------------------------------------------------------------
select public.void_shared_expense((select id from public.shared_expenses where description = 'X3 porcentaje'));
select public.void_shared_expense((select id from public.shared_expenses where description = 'X3 porcentaje'));
select is((select status from public.shared_expenses where description = 'X3 porcentaje'), 'voided',
  'void_shared_expense voids (and is idempotent)');

-- A's own month summary (X3 is already voided): personal 20 + own share 33.34, merged in the same category.
select is((public.get_month_summary('2026-10-20')->>'expense')::numeric, 53.34::numeric,
  'summary counts only the payer''s share (not the 100 paid)');
select is((public.get_month_summary('2026-10-20')->>'income')::numeric, 0::numeric,
  'shared expenses never create income');
select is(
  (select (c->>'category_id') || '/' || (c->>'amount')::numeric
   from json_array_elements(public.get_month_summary('2026-10-20')->'by_category') c
   where c->>'category_id' = 'ca000000-0000-0000-0000-000000000001'),
  'ca000000-0000-0000-0000-000000000001/53.34', 'share merges into the user''s own matching category');
select is((public.get_month_summary('2026-10-20')->>'available_balance')::numeric, 880.00::numeric,
  'available balance reflects the full payment');

-- Group reads as A
select is(
  (select string_agg(display_name, ',' order by display_name) from public.get_group_members('90000000-0000-0000-0000-000000000001')),
  'Ana,Beto,Dani', 'get_group_members returns co-member names');
select is_empty($$select 1 from public.profiles where id = '22222222-2222-2222-2222-222222222222'$$,
  'co-member profiles are still not directly readable');
select is((select count(*)::int from public.groups), 2, 'A sees both of their groups');
select is(
  (select my_net::text || '/' || member_count::text from public.get_my_groups() where id = '90000000-0000-0000-0000-000000000001'),
  '166.67/3', 'get_my_groups reports net and member count');
select is(
  (select sum((m->>'net')::numeric) from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m),
  0::numeric, 'group nets add up to zero');
select is(
  (select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
   where m->>'user_id' = '11111111-1111-1111-1111-111111111111'),
  166.67::numeric, 'payer net = paid 200.01 - owed 33.34');

-- Direct client writes are impossible (RPC-only) ----------------------------------------------------
select throws_ok($$insert into public.groups (name, kind) values ('Directo', 'casa')$$, '42501', null, 'clients cannot insert groups');
select throws_ok($$update public.groups set name = 'Hack'$$, '42501', null, 'clients cannot update groups');
select throws_ok(
  $$insert into public.group_members (group_id, user_id) values ('90000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333')$$,
  '42501', null, 'clients cannot add members directly');
select throws_ok($$update public.group_invites set uses = 0$$, '42501', null, 'clients cannot edit invites');
select throws_ok($$delete from public.shared_expenses$$, '42501', null, 'clients cannot delete shared expenses');
select throws_ok($$update public.shared_expense_splits set share_amount = 0$$, '42501', null, 'clients cannot edit splits');
select throws_ok(
  $$insert into public.settlements (group_id, from_user, to_user, amount, created_by) values
    ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 1, '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'clients cannot insert settlements');

-- Act as user B ------------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "22222222-2222-2222-2222-222222222222", "role": "authenticated"}', true);

select is_empty($$select 1 from public.groups where name = 'Casa Test'$$, 'B cannot see a group they do not belong to');
select is_empty($$select 1 from public.group_invites where group_id = (select id from public.groups where name = 'Casa Test')$$,
  'B cannot read invites of another group');
select is((select count(*)::int from public.shared_expenses), 3, 'B sees the expenses of their group');

-- X4: B pays 30 from their own account, then voids it (linked transaction is voided too).
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 30, p_description => 'X4 B paga',
  p_template_slug => 'hogar', p_occurred_on => '2026-10-09',
  p_paid_by => '22222222-2222-2222-2222-222222222222', p_split_method => 'equal',
  p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
                          '44444444-4444-4444-4444-444444444444']::uuid[],
  p_payer_account_id => 'b0000000-0000-0000-0000-000000000001');
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'),
  470.00::numeric, 'B shared_payment lowers B account');
select public.void_shared_expense((select id from public.shared_expenses where description = 'X4 B paga'));
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'),
  500.00::numeric, 'voiding the expense voids the linked shared_payment and restores the balance');
select is((select status from public.transactions where kind = 'shared_payment' and owner_id = '22222222-2222-2222-2222-222222222222'),
  'voided', 'linked transaction is voided');

-- B's summary: shares of X1 (33.33, template comida) + X2 (50.01, template super), virtual categories.
select is((public.get_month_summary('2026-10-20')->>'expense')::numeric, 83.34::numeric,
  'non-payer summary counts their own shares only');
select is(
  (select string_agg(c->>'category_id', ',' order by c->>'category_id')
   from json_array_elements(public.get_month_summary('2026-10-20')->'by_category') c),
  'template:comida,template:super', 'without a matching category, shares use the template as a virtual category');

-- Settlement S1: B pays A 83.34 from B Caja.
select public.create_settlement(
  p_group => '90000000-0000-0000-0000-000000000001', p_to_user => '11111111-1111-1111-1111-111111111111',
  p_amount => 83.34, p_occurred_on => '2026-10-10', p_note => 'pago B a A',
  p_account_id => 'b0000000-0000-0000-0000-000000000001');
select set_config('test.s1', (select id::text from public.settlements where note = 'pago B a A'), true);
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'),
  416.66::numeric, 'settlement_out lowers the payer account balance');
select is(
  (public.get_month_summary('2026-10-20')->>'expense')::numeric || '/' || (public.get_month_summary('2026-10-20')->>'income')::numeric,
  '83.34/0', 'settlement changes neither income nor expense');
select is(
  (select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
   where m->>'user_id' = '22222222-2222-2222-2222-222222222222'),
  0::numeric, 'settlement brings the payer net to zero');
select throws_ok($$select public.record_settlement_receipt(current_setting('test.s1')::uuid, 'b0000000-0000-0000-0000-000000000001')$$,
  '42501', 'not_settlement_receiver', 'only the receiver can record the receipt');

-- S2: B -> D 10.00 with account, then voided.
select public.create_settlement(
  p_group => '90000000-0000-0000-0000-000000000001', p_to_user => '44444444-4444-4444-4444-444444444444',
  p_amount => 10, p_note => 'pago B a D', p_account_id => 'b0000000-0000-0000-0000-000000000001');
select public.void_settlement((select id from public.settlements where note = 'pago B a D'));
select is((select balance from public.account_balances where account_id = 'b0000000-0000-0000-0000-000000000001'),
  416.66::numeric, 'voiding a settlement voids its settlement_out and restores the balance');
select is((select status from public.settlements where note = 'pago B a D'), 'voided', 'settlement is voided');

-- Act as user A: record receipt ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select public.record_settlement_receipt(current_setting('test.s1')::uuid, 'a0000000-0000-0000-0000-000000000002');
select public.record_settlement_receipt(current_setting('test.s1')::uuid, 'a0000000-0000-0000-0000-000000000002');
select is((select count(*)::int from public.transactions where kind = 'settlement_in'), 1,
  'record_settlement_receipt is idempotent');
select is((select balance from public.account_balances where account_id = 'a0000000-0000-0000-0000-000000000002'),
  83.34::numeric, 'settlement_in raises the receiver account balance');
select is(
  (public.get_month_summary('2026-10-20')->>'expense')::numeric || '/' || (public.get_month_summary('2026-10-20')->>'income')::numeric,
  '53.34/0', 'receiving a settlement is not income');
select is(
  (select (m->>'net')::numeric from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m
   where m->>'user_id' = '11111111-1111-1111-1111-111111111111'),
  83.33::numeric, 'balances reflect the settlement (166.67 - 83.34)');

-- Fixtures for the void-permission tests: X5 (A pays, A and B split; D is a non-participant member),
-- X6 (A pays, A and D split) and S3 (A pays D).
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'X5 sin D',
  p_template_slug => null, p_occurred_on => '2026-10-11', p_paid_by => '11111111-1111-1111-1111-111111111111',
  p_split_method => 'equal',
  p_participants => array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[]);
select public.create_shared_expense(
  p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'X6 con D',
  p_template_slug => null, p_occurred_on => '2026-10-11', p_paid_by => '11111111-1111-1111-1111-111111111111',
  p_split_method => 'equal',
  p_participants => array['11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444']::uuid[]);
select public.create_settlement(
  p_group => '90000000-0000-0000-0000-000000000001', p_to_user => '44444444-4444-4444-4444-444444444444',
  p_amount => 5, p_note => 'pago A a D');

-- Act as user D: cannot leave with a balance, then settles and leaves -----------------------------------
select set_config('request.jwt.claims', '{"sub": "44444444-4444-4444-4444-444444444444", "role": "authenticated"}', true);

select throws_ok($$select public.leave_group('90000000-0000-0000-0000-000000000001')$$, '23514', 'balance_not_zero',
  'leave_group is blocked while the net balance is not zero');
select throws_ok($$select public.void_shared_expense((select id from public.shared_expenses where description = 'X5 sin D'))$$,
  '42501', 'not_allowed', 'a member who is not creator, payer or participant cannot void an expense');
select lives_ok($$select public.void_shared_expense((select id from public.shared_expenses where description = 'X6 con D'))$$,
  'a participant can void an expense');
select is((select status from public.shared_expenses where description = 'X6 con D'), 'voided',
  'the participant''s void took effect');
select throws_ok($$select public.void_settlement(current_setting('test.s1')::uuid)$$, '42501', 'not_allowed',
  'a member unrelated to a settlement cannot void it');
select lives_ok($$select public.void_settlement((select id from public.settlements where note = 'pago A a D'))$$,
  'the receiver of a settlement can void it');
select is((select status from public.settlements where note = 'pago A a D'), 'voided',
  'the receiver''s void took effect');
select is((public.get_month_summary('2026-10-20')->>'expense')::numeric, 83.33::numeric,
  'D summary: 33.33 + 50.00 (voided expenses excluded)');

select public.create_settlement(
  p_group => '90000000-0000-0000-0000-000000000001', p_to_user => '11111111-1111-1111-1111-111111111111',
  p_amount => 83.33, p_note => 'pago D a A');
select lives_ok($$select public.leave_group('90000000-0000-0000-0000-000000000001')$$, 'leave_group works at zero balance');
select is((select public.is_group_member('90000000-0000-0000-0000-000000000001')), false, 'D is no longer a member');
select is_empty($$select 1 from public.shared_expenses$$, 'D can no longer read the group expenses');
select is((public.get_month_summary('2026-10-20')->>'expense')::numeric, 83.33::numeric,
  'leaving a group does not rewrite D''s personal history');

-- Act as user A: voiding is blocked once a participant left -------------------------------------------
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select throws_ok($$select public.void_shared_expense(current_setting('test.x1')::uuid)$$, '23514', 'participant_left',
  'an expense with a member who left cannot be voided');
select is(
  (select sum((m->>'net')::numeric) from json_array_elements(public.get_group_balances('90000000-0000-0000-0000-000000000001')->'members') m),
  0::numeric, 'nets still add up to zero after the settlements');

-- Act as user C (outsider) -------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);

select is_empty($$select 1 from public.groups where id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read the group');
select is_empty($$select 1 from public.group_members where group_id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read members');
select is_empty($$select 1 from public.group_invites where group_id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read invites');
select is_empty($$select 1 from public.shared_expenses where group_id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read expenses');
select is_empty($$select 1 from public.shared_expense_splits where group_id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read splits');
select is_empty($$select 1 from public.settlements where group_id = '90000000-0000-0000-0000-000000000001'$$, 'C cannot read settlements');
select is_empty($$select 1 from public.get_my_groups()$$, 'C has no groups');
select throws_ok($$select * from public.get_group_members('90000000-0000-0000-0000-000000000001')$$, '42501', 'not_group_member',
  'get_group_members is hidden from non-members');
select throws_ok($$select public.get_group_balances('90000000-0000-0000-0000-000000000001')$$, '42501', 'not_group_member',
  'C cannot read balances');
select throws_ok($$select public.create_group_invite('90000000-0000-0000-0000-000000000001')$$, '42501', 'not_group_member',
  'C cannot create invites');
select throws_ok(
  $$select public.create_shared_expense(
      p_group => '90000000-0000-0000-0000-000000000001', p_amount => 10, p_description => 'intruso',
      p_template_slug => null, p_occurred_on => '2026-10-08', p_paid_by => '33333333-3333-3333-3333-333333333333',
      p_split_method => 'equal', p_participants => array['33333333-3333-3333-3333-333333333333']::uuid[])$$,
  '42501', 'not_group_member', 'C cannot create expenses');
select throws_ok(
  $$select public.create_settlement('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 5)$$,
  '42501', 'not_group_member', 'C cannot create settlements');
select throws_ok($$select public.leave_group('90000000-0000-0000-0000-000000000001')$$, '42501', 'not_group_member', 'C cannot leave a group they are not in');
select throws_ok($$select public.void_shared_expense(current_setting('test.x1')::uuid)$$, '42501', 'not_group_member', 'C cannot void expenses');
select throws_ok($$select public.void_settlement(current_setting('test.s1')::uuid)$$, '42501', 'not_group_member', 'C cannot void settlements');
select throws_ok($$select public.record_settlement_receipt(current_setting('test.s1')::uuid, 'a0000000-0000-0000-0000-000000000002')$$,
  '42501', 'not_group_member', 'C cannot record receipts');

-- Joining ----------------------------------------------------------------------------------------
-- Every invalid state is indistinguishable: join_group records the failed attempt and returns NULL
-- (the client raises the uniform 'invite_invalid'); an exception would roll the attempt record back.
select is((select public.join_group('ZZZZZZZZZZZ9')), null::uuid, 'unknown code fails uniformly');
select is((select public.join_group('BBBBBBBBBBB2')), null::uuid, 'expired code fails uniformly');
select is((select public.join_group('CCCCCCCCCCC2')), null::uuid, 'revoked code fails uniformly');
select is((select public.join_group('DDDDDDDDDDD2')), null::uuid, 'exhausted code fails uniformly');
select is((select public.join_group(' aaaaaaaaaaa2 ')), '90000000-0000-0000-0000-000000000001'::uuid, 'a valid code (any case) joins');
select is((select uses from public.group_invites where code = 'AAAAAAAAAAA2'), 1, 'joining consumes one use');
select public.join_group('AAAAAAAAAAA2');
select is((select uses from public.group_invites where code = 'AAAAAAAAAAA2'), 1, 'join is idempotent for members');
select is((select count(*)::int from public.get_group_members('90000000-0000-0000-0000-000000000001')), 4, 'C is now listed');
select public.leave_group('90000000-0000-0000-0000-000000000001');
select is((select public.is_group_member('90000000-0000-0000-0000-000000000001')), false, 'C left at zero balance');
select public.join_group('AAAAAAAAAAA2');
select is((select public.is_group_member('90000000-0000-0000-0000-000000000001')), true, 're-join restores the membership');
select is((select uses from public.group_invites where code = 'AAAAAAAAAAA2'), 2, 're-join consumes a use');

-- Archiving: the last active member leaving archives the group and revokes its invites -----------------
reset role;
select ok((select archived_at is null from public.groups where id = '90000000-0000-0000-0000-000000000001'),
  'a group that still has members is not archived');
select set_config('test.casa_test', (select id::text from public.groups where name = 'Casa Test'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);
select lives_ok($$select public.leave_group(current_setting('test.casa_test')::uuid)$$, 'the last member can leave');
select is_empty($$select 1 from public.get_my_groups() where name = 'Casa Test'$$, 'archived groups are not listed');
reset role;
select ok((select archived_at is not null from public.groups where id = current_setting('test.casa_test')::uuid),
  'leaving as the last member archives the group');
select is((select count(*)::int from public.group_invites
           where group_id = current_setting('test.casa_test')::uuid and revoked_at is null),
  0, 'all invites of the archived group are revoked');
-- Reopen one invite to prove the archived check on its own (not masked by the revocation).
update public.group_invites set revoked_at = null
where id = (select id from public.group_invites where group_id = current_setting('test.casa_test')::uuid limit 1);
select set_config('test.casa_code',
  (select code from public.group_invites where group_id = current_setting('test.casa_test')::uuid and revoked_at is null limit 1), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "33333333-3333-3333-3333-333333333333", "role": "authenticated"}', true);
select is((select public.join_group(current_setting('test.casa_code'))), null::uuid,
  'an archived group cannot be joined (uniform failure)');

-- Throttle: C already failed 5 times (4 invalid states + archived group); successful joins did not count.
select public.join_group('ZZZZZZZZZZZ9') from generate_series(1, 4);
select is((select public.join_group('ZZZZZZZZZZZ9')), null::uuid, 'the tenth failed attempt still fails uniformly');
select throws_ok($$select public.join_group('ZZZZZZZZZZZ9')$$, '54000', 'too_many_attempts',
  'the eleventh attempt within the hour is throttled');
select throws_ok($$select public.join_group('AAAAAAAAAAA2')$$, '54000', 'too_many_attempts',
  'a throttled user is blocked even with a valid code');
select throws_ok($$select 1 from public.group_join_attempts$$, '42501', null,
  'clients cannot read the attempts table');

-- Anonymous visitors -------------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from public.groups', '42501', null, 'anon cannot read groups');
select throws_ok('select public.get_my_groups()', '42501', null, 'anon cannot call RPCs');
select throws_ok($$select public.join_group('AAAAAAAAAAA2')$$, '42501', null, 'anon cannot join groups');

-- Database-level invariants (superuser) -------------------------------------------------------------
reset role;
select throws_ok($$update public.shared_expenses set description = 'x' where status = 'voided'$$,
  '23514', 'voided_row_is_immutable', 'voided shared expenses are immutable');
select throws_ok($$update public.settlements set note = 'x' where status = 'voided'$$,
  '23514', 'voided_row_is_immutable', 'voided settlements are immutable');
select throws_ok($$update public.shared_expense_splits set share_amount = 0$$,
  '23514', 'row_is_immutable', 'splits are immutable');
select throws_ok($$delete from public.shared_expense_splits$$, '23514', 'row_is_immutable', 'splits cannot be deleted');
select throws_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  '23503', null, 'a user with group history cannot be deleted (NO ACTION)');
select throws_ok(
  $$insert into public.transactions (owner_id, account_id, kind, amount, occurred_on)
    values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'shared_payment', 1, '2026-10-05')$$,
  '23514', null, 'a shared_payment must reference its shared expense');

select * from finish();
rollback;
