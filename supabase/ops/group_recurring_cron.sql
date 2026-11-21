-- Daily job for the recurring expenses of Hogar groups. PREPARED, NOT ACTIVE: it is not a migration and nothing runs it by itself.
-- Run it by hand, and only AFTER 20261130000000_group_recurring_expenses.sql is applied and with the owner's authorization.
--
-- What it does: once a day it asks the server to create the PENDING periods that are due and to tell the person who pays
-- (a notice inside Moni and, if they have push on, a push that respects "ocultar detalles"). It NEVER creates an expense or a
-- debt: every period still waits for someone to press "Confirmar gasto". Periods older than two months are not created.
-- The function is idempotent (one period per recurrence and month, one notice per period): running it twice does nothing new.
-- Without this job the periods are created and announced anyway the next time anybody opens the group's recurring expenses.
--
-- 11:10 UTC = 08:10 in Buenos Aires (Argentina has no daylight saving time). Safe to run more than once: it leaves exactly ONE job.
-- To switch only the push off without touching the job: insert/update public.admin_settings key 'group_notice_push_enabled' = false.
-- To remove the job: select cron.unschedule('moni-group-recurring');

create extension if not exists pg_cron;

-- 1. Remove every job that runs the processor, whatever its name.
select cron.unschedule(jobid)
from cron.job
where jobname = 'moni-group-recurring'
   or command ilike '%process_all_group_recurring%';

-- 2. The one and only job.
select cron.schedule(
  'moni-group-recurring',
  '10 11 * * *',
  $$ select private.process_all_group_recurring() $$
);

-- 3. Safety check: this must return exactly 1 row (the transaction fails loudly otherwise).
do $$
declare
  n int;
begin
  select count(*) into n from cron.job where command ilike '%process_all_group_recurring%';
  if n <> 1 then
    raise exception 'expected exactly 1 group recurring job, found %', n;
  end if;
end $$;
