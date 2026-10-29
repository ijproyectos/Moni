-- pgTAP for the PROPOSED migration 20261028000000_onboarding_preferences.sql.
-- Run with `supabase test db` against a local stack once the migration is applied.
begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555555', 'e@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'f@example.com');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "55555555-5555-5555-5555-555555555555", "role": "authenticated"}', true);

select public.complete_onboarding_v2(
  array['track_spending'],
  array['comida'],
  '[{"kind":"expense","name":"Gimnasio","icon":"Dumbbell","color":"#2F9E8F"}]'::jsonb,
  'USD',
  true
);
-- Retrying must not duplicate anything.
select public.complete_onboarding_v2(
  array['track_spending'],
  array['comida'],
  '[{"kind":"expense","name":"gimnasio","icon":"Dumbbell","color":"#2F9E8F"}]'::jsonb,
  'USD',
  true
);

select is((select count(*)::int from public.categories), 2, 'templates and custom categories are created once');
select is((select count(*)::int from public.accounts where name = 'Efectivo'), 1, 'one default account');
select is((select secondary_currency::text from public.profiles), 'USD', 'secondary currency is stored');
select is((select notifications_opt_in from public.profiles), true, 'notifications answer is stored');
select isnt((select onboarding_completed_at from public.profiles), null, 'onboarding is marked complete');

select throws_ok(
  $$select public.complete_onboarding_v2(array[]::text[], array[]::text[], '[]'::jsonb, null, null)$$,
  '22023', 'no_categories', 'at least one category is required');
select throws_ok(
  $$select public.complete_onboarding_v2(array[]::text[], array['comida'], '[]'::jsonb, 'EUR', null)$$,
  '22023', 'invalid_currency', 'only USD is accepted as second currency');
select throws_ok(
  $$select public.complete_onboarding_v2(array[]::text[], array[]::text[], '[{"kind":"expense","name":"","icon":"Tag","color":"#000000"}]'::jsonb, null, null)$$,
  '22023', 'invalid_custom_category', 'custom categories are validated');

-- Another user cannot see the first user's onboarding data.
select set_config('request.jwt.claims', '{"sub": "66666666-6666-6666-6666-666666666666", "role": "authenticated"}', true);
select is((select count(*)::int from public.categories), 0, 'categories stay private');

select * from finish();
rollback;
