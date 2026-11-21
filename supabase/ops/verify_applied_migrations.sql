-- SOLO LECTURA. Ejecutar en el SQL Editor del proyecto de Supabase de producción (Dashboard → SQL Editor). No modifica nada.
-- Responde: ¿qué migraciones están realmente aplicadas? Cada fila comprueba un objeto que esa migración crea; «aplicada = false»
-- significa que ese objeto no existe en la base. (El historial oficial, si el proyecto usa el CLI, está en la consulta 1.)

-- 1) Historial registrado (puede no existir si las migraciones se aplicaron pegando SQL a mano).
select version from supabase_migrations.schema_migrations order by version desc limit 20;

-- 2) Comprobación por objetos.
select * from (
  select '20261027000000_shared_expenses' as migracion,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'join_group') as aplicada
  union all select '20261106000000_moni_plus',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'plus_entitlements')
  union all select '20261111000000_debt_reminders_and_payment_reports',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'payment_reports')
  union all select '20261113000000_web_push',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'push_subscriptions')
  union all select '20261115000000_group_guests',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'group_guests')
  union all select '20261116000000_group_photos',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'set_group_photo')
  union all select '20261117000000_edit_shared_expenses',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'create_shared_expense' and pg_get_function_arguments(p.oid) like '%p_replaces_kind%')
  union all select '20261118000000_goal_progress_and_badges',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'goal_achievements')
  union all select '20261119000000_push_always_on_schedules',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'admin_settings')
  union all select '20261120000000_account_suspension_support',
         exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'account_suspensions')
  union all select '20261122000000_payment_reports_accounts',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'report_payment' and pg_get_function_arguments(p.oid) like '%p_account_id%')
  union all select '20261123000000_debt_reminder_push',
         exists (select 1 from pg_trigger where tgname = 'notifications_push_debt_reminder')
  -- Las tres de G1 (deben dar false hasta que se apliquen):
  union all select '20261126000000_group_hide_archive_roles (G1)',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'group_members' and column_name = 'hidden_at')
  union all select '20261126000100_group_kind_hogar (G1)',
         not exists (select 1 from public.groups where kind = 'casa') and exists (select 1 from public.groups where kind = 'hogar')
  union all select '20261126000200_shared_category_otros (G1)',
         exists (select 1 from public.category_templates where slug = 'otros')
) t
order by migracion;

-- 3) Estado actual de los tipos de grupo y de la restricción (para G1 · Hogar).
select kind, count(*) from public.groups group by kind order by kind;
select pg_get_constraintdef(oid) from pg_constraint where conname = 'groups_kind_check';

-- 4) Objetos que existen en producción pero NO están en el repo (para detectar migraciones fuera del repositorio):
--    ejemplo conocido: la columna de moneda original de los movimientos.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'transactions' and column_name ilike '%currency%';
