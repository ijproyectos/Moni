-- Scheduled Mercado Pago sync (change mp-expense-autoimport, design D7). NOT a migration: it needs the pg_cron and
-- pg_net extensions, which must be enabled on purpose, and it only makes sense AFTER 20261112000000_mp_expense_autoimport.sql
-- and the mp-sync Edge Function are deployed. Apply only with explicit authorization and a backup.
-- Safe to run more than once: it always leaves exactly ONE job.
--
-- The job calls <url>/functions/v1/mp-sync every 15 minutes with the header `x-moni-cron-secret`. Neither the URL nor
-- the secret is written in this file or in cron.job: both are read at run time by private.run_mp_sync_cron(), from
--   1. Vault  (vault.decrypted_secrets: names 'moni_supabase_url' and 'moni_mp_sync_cron_secret'), or, if absent,
--   2. the service-only table private.app_secrets (names 'supabase_url' and 'mp_sync_cron_secret').
-- Residual risk of the fallback: the postgres role can read the table. The secret only triggers an idempotent sync
-- (no data comes back); rotate it by updating the row and the Edge secret MP_SYNC_CRON_SECRET together.
--
-- One-time setup (run by hand, values NOT stored in this repository):
--   select vault.create_secret('<project url, e.g. https://xxxx.supabase.co>', 'moni_supabase_url');
--   select vault.create_secret('<same value as the Edge secret MP_SYNC_CRON_SECRET>', 'moni_mp_sync_cron_secret');
-- or, without Vault:
--   insert into private.app_secrets (name, value) values ('supabase_url', '<url>'), ('mp_sync_cron_secret', '<secret>')
--   on conflict (name) do update set value = excluded.value;
--
-- The whole script runs in ONE transaction (begin ... commit below): if any step or the final check fails, nothing is
-- applied (no half-installed job, and the previous job is left in place).

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Service-only fallback store (not exposed to the API: schema never added to the exposed schemas, no grants).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table private.app_secrets enable row level security;
revoke all on table private.app_secrets from public, anon, authenticated;

-- 2. The call. Reads the URL and the secret, then fires an async pg_net request. Raises (visible in
--    cron.job_run_details) when either value is missing, so a misconfiguration is not silent.
create or replace function private.run_mp_sync_cron()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_url using 'moni_supabase_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
      into v_secret using 'moni_mp_sync_cron_secret';
  end if;
  if v_url is null then
    select value into v_url from private.app_secrets where name = 'supabase_url';
  end if;
  if v_secret is null then
    select value into v_secret from private.app_secrets where name = 'mp_sync_cron_secret';
  end if;
  if v_url is null or v_secret is null then
    raise exception 'mp sync cron: supabase url or cron secret is not configured';
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/mp-sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-moni-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function private.run_mp_sync_cron() from public, anon, authenticated;

-- 3. Remove EVERY job that runs the sync, whatever its name (an old copy, a manual try...).
select cron.unschedule(jobid)
from cron.job
where jobname = 'moni-mp-sync'
   or command ilike '%run_mp_sync_cron%';

-- 4. The one and only job.
select cron.schedule(
  'moni-mp-sync',
  '*/15 * * * *',
  $$ select private.run_mp_sync_cron() $$
);

-- 5. Safety check: exactly one job runs the sync. It does NOT inspect the command text for secrets: none is ever
--    written in it by this script (the secret is read at run time). If the count is wrong the transaction rolls back.
do $$
declare
  n int;
begin
  select count(*) into n from cron.job where command ilike '%run_mp_sync_cron%';
  if n <> 1 then
    raise exception 'expected exactly one mp sync job, found %', n;
  end if;
end $$;

commit;

-- Check:   select jobid, jobname, schedule, active from cron.job where command ilike '%run_mp_sync_cron%';
-- History: select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Undo (kill switch): select cron.unschedule('moni-mp-sync');
