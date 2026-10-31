-- pgTAP for ensure_mp_wallet reuse rules (20261112000500_mp_wallet_reuse.sql). Run with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email)
values
  ('71111111-1111-1111-1111-111111111111', 'w1@example.com'),
  ('72222222-2222-2222-2222-222222222222', 'w2@example.com'),
  ('73333333-3333-3333-3333-333333333333', 'w3@example.com'),
  ('74444444-4444-4444-4444-444444444444', 'w4@example.com'),
  ('75555555-5555-5555-5555-555555555555', 'w5@example.com');

insert into public.accounts (id, owner_id, name, kind, archived_at, created_at) values
  -- W1: a lower-case, padded name of another spelling.
  ('b1000000-0000-0000-0000-000000000001', '71111111-1111-1111-1111-111111111111', '  mercado   PAGO ', 'wallet', null, now()),
  -- W2: a Mercado Pago account saved as a bank account.
  ('b2000000-0000-0000-0000-000000000001', '72222222-2222-2222-2222-222222222222', 'MercadoPago', 'bank', null, now()),
  -- W3: both a bank and a wallet match: the wallet wins even though it is newer.
  ('b3000000-0000-0000-0000-000000000001', '73333333-3333-3333-3333-333333333333', 'Mercado Pago', 'bank', null, now() - interval '2 days'),
  ('b3000000-0000-0000-0000-000000000002', '73333333-3333-3333-3333-333333333333', 'Mercado Pago', 'wallet', null, now()),
  -- W4: archived, cash and an unrelated name never match.
  ('b4000000-0000-0000-0000-000000000001', '74444444-4444-4444-4444-444444444444', 'Mercado Pago', 'wallet', now(), now()),
  ('b4000000-0000-0000-0000-000000000002', '74444444-4444-4444-4444-444444444444', 'Mercado Pago', 'cash', null, now()),
  ('b4000000-0000-0000-0000-000000000003', '74444444-4444-4444-4444-444444444444', 'Mercado Libre', 'wallet', null, now());

select is(public.ensure_mp_wallet('71111111-1111-1111-1111-111111111111'), 'b1000000-0000-0000-0000-000000000001'::uuid,
  'a case/whitespace variant of the name is reused');
select is((select count(*)::int from public.accounts where owner_id = '71111111-1111-1111-1111-111111111111'), 1,
  'no duplicate was created for the variant');
select is(public.ensure_mp_wallet('72222222-2222-2222-2222-222222222222'), 'b2000000-0000-0000-0000-000000000001'::uuid,
  'a Mercado Pago account of kind bank is reused');
select is(public.ensure_mp_wallet('73333333-3333-3333-3333-333333333333'), 'b3000000-0000-0000-0000-000000000002'::uuid,
  'a wallet is preferred over a bank account');

select is(public.ensure_mp_wallet('74444444-4444-4444-4444-444444444444') = any (
  array['b4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002',
        'b4000000-0000-0000-0000-000000000003']::uuid[]), false,
  'archived, cash and unrelated accounts are never reused');
select is((select count(*)::int from public.accounts
           where owner_id = '74444444-4444-4444-4444-444444444444' and kind = 'wallet' and name = 'Mercado Pago'
             and archived_at is null), 1, 'a new active Mercado Pago wallet was created');

select public.ensure_mp_wallet('75555555-5555-5555-5555-555555555555');
select is((select kind || ':' || currency from public.accounts where owner_id = '75555555-5555-5555-5555-555555555555'),
  'wallet:ARS', 'a user with no accounts gets a new ARS wallet');
select is(public.ensure_mp_wallet('75555555-5555-5555-5555-555555555555'),
  public.ensure_mp_wallet('75555555-5555-5555-5555-555555555555'), 'calling it again returns the same wallet');
select throws_ok($$select public.ensure_mp_wallet(null)$$, '22023', 'invalid_user', 'a NULL user is rejected');

select * from finish();
rollback;
