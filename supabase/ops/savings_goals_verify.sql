-- Verification of 20261103000000_savings_goals.sql. Read-only: run it in the Supabase SQL Editor AFTER applying the migration.
-- Every row must show the "expected" value.

-- 1. The two tables exist, with row level security on, and are read-only for the app (no insert/update/delete).
select c.relname as tabla,
       c.relrowsecurity as rls_activa,                                  -- expected: true
       has_table_privilege('authenticated', c.oid, 'select') as app_puede_leer,   -- expected: true
       has_table_privilege('authenticated', c.oid, 'insert') as app_puede_insertar, -- expected: false
       has_table_privilege('authenticated', c.oid, 'update') as app_puede_modificar, -- expected: false
       has_table_privilege('anon', c.oid, 'select') as anonimo_puede_leer          -- expected: false
from pg_class c
where c.oid in ('public.savings_goals'::regclass, 'public.savings_movements'::regclass)
order by 1;

-- 2. The 16 functions exist (expected: 16).
select count(*) as funciones
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('savings_reminder_due_on', 'savings_goal_reserved', 'savings_account_reserved', 'check_savings_account',
                    'lock_savings_account_free', 'savings_next_reminder_cycle', 'create_savings_goal', 'update_savings_goal',
                    'advance_goal_reminder', 'add_goal_deposit', 'withdraw_goal_reserve', 'void_goal_movement',
                    'set_savings_goal_status', 'snooze_goal_reminder', 'skip_goal_reminder', 'get_savings_overview');

-- 3. The app can call the public functions and an anonymous visitor cannot.
select has_function_privilege('authenticated', 'public.get_savings_overview(date)', 'execute') as app_puede_leer_metas,       -- expected: true
       has_function_privilege('anon', 'public.get_savings_overview(date)', 'execute') as anonimo_puede_leer_metas,           -- expected: false
       has_function_privilege('authenticated', 'public.lock_savings_account_free(uuid)', 'execute') as app_puede_helper;     -- expected: false

-- 4. Your data did not change: these are the same counts you had before (accounts, movements, transfers).
select (select count(*) from public.accounts) as cuentas,
       (select count(*) from public.transactions) as movimientos,
       (select count(*) from public.transfers) as transferencias,
       (select count(*) from public.savings_goals) as metas,            -- expected: 0 (until you create one)
       (select count(*) from public.savings_movements) as aportes;      -- expected: 0

-- 5. Make the app see the new functions right away (safe to run more than once).
notify pgrst, 'reload schema';
