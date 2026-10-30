-- Scheduled job for subscriptions. NOT a migration: it needs the pg_cron extension, which must be enabled on
-- purpose (Supabase Dashboard > Database > Extensions, or the first statement below) and only AFTER
-- 20261101000000_subscriptions.sql is applied. Safe to run more than once: it always leaves exactly ONE job.
--
-- The job runs at minute 5 of every hour. The function is idempotent (one charge per subscription and due
-- date), serializes overlapping runs with an advisory lock and, if an outage happens, catches up on the next run.
-- Argentina has no daylight saving time: 03:xx UTC is 00:xx in Buenos Aires, when a day's charges become due.

create extension if not exists pg_cron;

-- 1. Remove EVERY job that runs the subscriptions processor, whatever its name (an old copy, a manual try...).
select cron.unschedule(jobid)
from cron.job
where jobname = 'moni-process-subscriptions'
   or command ilike '%process_due_subscriptions%';

-- 2. The one and only job.
select cron.schedule(
  'moni-process-subscriptions',
  '5 * * * *',
  $$ select public.process_due_subscriptions() $$
);

-- 3. Safety check: this must return exactly 1 row (and the transaction fails loudly otherwise).
do $$
declare
  n int;
begin
  select count(*) into n from cron.job where command ilike '%process_due_subscriptions%';
  if n <> 1 then
    raise exception 'expected exactly one subscriptions job, found %', n;
  end if;
end $$;

-- Check:   select jobid, jobname, schedule, active from cron.job where command ilike '%process_due_subscriptions%';
-- History: select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Undo:    select cron.unschedule('moni-process-subscriptions');
