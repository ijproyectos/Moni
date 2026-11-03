-- Push notifications are always on, plus the two scheduled pushes and their admin switches.
--
--   * Always on: a person can no longer delete or switch off a push subscription. The DELETE grant and policy of
--     push_subscriptions and the remove_push_subscription() RPC are dropped. The only deleter left is the service
--     role (push-send / admin-panel) pruning endpoints the push service reports as gone (404 / 410).
--   * push_messages.kind gains 'reminder' (nightly), 'plus_expiry' and 'support'.
--   * private.set_app_secret(): the one way to store a secret in private.app_secrets (used for push_cron_secret).
--   * public.admin_settings: on/off switches of the scheduled pushes. Service role only.
--   * Nightly reminder: every day 21:00 Argentina (00:00 UTC) the job calls push-send for everybody with the text
--     "Cargaste tus gastos de hoy". The URL and the secret are read at run time from private.app_secrets
--     ('supabase_url', 'push_cron_secret'); if either is missing, or the switch is off, the job does nothing (no error).
--   * Plus expiry notices: every day 12:00 Argentina (15:00 UTC) the job asks push-send to run the plus_expiry job.
--     Only people who really lose Plus are notified: an entitlement that ends in 3 or 1 days and that has NO authorized
--     Mercado Pago subscription (an authorized one renews by itself). plus_expiry_notices deduplicates per
--     (user, expiry date, level), so a person is told once per level and a renewal (new expiry date) starts over.
--
-- The cron jobs are scheduled only when pg_cron exists (it does not on a bare local stack). Wrapped in one
-- transaction. Apply AFTER 20261118000000_goal_progress_and_badges.sql.
-- Rollback:
--   select cron.unschedule(jobid) from cron.job where jobname in ('moni-nightly-push', 'moni-plus-expiry');
--   drop function public.record_plus_expiry_notice(uuid, timestamptz, int, text), public.plus_expiry_due(int[]),
--     public.admin_plus_expiring(int), public.admin_set_setting(text, boolean, text), public.admin_avisos(),
--     private.run_plus_expiry_cron(), private.run_nightly_push_cron(), private.run_push_cron(jsonb, text),
--     private.set_app_secret(text, text);
--   drop table public.plus_expiry_notices, public.admin_settings;
--   (the push_messages kind check and the dropped delete path are restored from 20261113000000_web_push.sql.)

begin;

-- 1. Push is always on --------------------------------------------------------------------------------------------

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
revoke delete on table public.push_subscriptions from authenticated;
drop function if exists public.remove_push_subscription(text);

alter table public.push_messages drop constraint if exists push_messages_kind_check;
alter table public.push_messages
  add constraint push_messages_kind_check
  check (kind in ('maintenance', 'feedback', 'news', 'reminder', 'plus_expiry', 'support'));

-- 2. Secrets store (service only, same table the Mercado Pago sync cron uses) ------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_secrets (
  name text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table private.app_secrets enable row level security;
revoke all on table private.app_secrets from public, anon, authenticated;

create or replace function private.set_app_secret(p_name text, p_value text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_name is null or p_name !~ '^[a-z0-9_]{1,60}$' then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_value is null or char_length(p_value) < 16 then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into private.app_secrets (name, value) values (p_name, p_value)
  on conflict (name) do update set value = excluded.value, updated_at = now();
end;
$$;
revoke all on function private.set_app_secret(text, text) from public, anon, authenticated;

-- 3. Admin switches -----------------------------------------------------------------------------------------------

create table if not exists public.admin_settings (
  key text primary key check (key ~ '^[a-z_]{1,60}$'),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by text check (updated_by is null or char_length(updated_by) <= 320)
);
alter table public.admin_settings enable row level security;
revoke all on table public.admin_settings from public, anon, authenticated;
grant select, insert, update on table public.admin_settings to service_role;

insert into public.admin_settings (key, enabled) values
  ('nightly_push_enabled', true),
  ('plus_expiry_push_enabled', true)
on conflict (key) do nothing;

comment on table public.admin_settings is 'On/off switches of the scheduled pushes. Service role only.';

-- 4. Scheduled calls ----------------------------------------------------------------------------------------------

-- Fires one async pg_net request to push-send. Returns the request id, or NULL when it did nothing: switch off, or
-- the URL / secret is not stored yet (a not-yet-configured project must not fail every night).
create or replace function private.run_push_cron(p_body jsonb, p_setting text)
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_enabled boolean;
  v_url text;
  v_secret text;
begin
  select s.enabled into v_enabled from public.admin_settings s where s.key = p_setting;
  if coalesce(v_enabled, true) is not true then
    return null;
  end if;
  select value into v_url from private.app_secrets where name = 'supabase_url';
  select value into v_secret from private.app_secrets where name = 'push_cron_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/push-send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-moni-push-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 30000
  );
end;
$$;

create or replace function private.run_nightly_push_cron()
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return private.run_push_cron(
    jsonb_build_object(
      'kind', 'reminder',
      'title', 'Moni',
      'body', 'Cargaste tus gastos de hoy',
      'audience', 'all',
      'url', '/'
    ),
    'nightly_push_enabled'
  );
end;
$$;

create or replace function private.run_plus_expiry_cron()
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  return private.run_push_cron(jsonb_build_object('job', 'plus_expiry'), 'plus_expiry_push_enabled');
end;
$$;

revoke all on function
  private.run_push_cron(jsonb, text),
  private.run_nightly_push_cron(),
  private.run_plus_expiry_cron()
from public, anon, authenticated;

-- Exactly one job each (any older copy is removed first). Skipped when pg_cron is not installed.
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname in ('moni-nightly-push', 'moni-plus-expiry');
    -- 00:00 UTC = 21:00 in Argentina (UTC-3, no daylight saving).
    perform cron.schedule('moni-nightly-push', '0 0 * * *', $job$ select private.run_nightly_push_cron() $job$);
    -- 15:00 UTC = 12:00 in Argentina.
    perform cron.schedule('moni-plus-expiry', '0 15 * * *', $job$ select private.run_plus_expiry_cron() $job$);
  end if;
end $$;

-- 5. Plus expiry notices --------------------------------------------------------------------------------------------

create table public.plus_expiry_notices (
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  -- Days left (Argentina calendar days) when the notice went out.
  level int not null check (level between 0 and 30),
  source text not null check (source in ('cron', 'admin')),
  notified_at timestamptz not null default now(),
  primary key (user_id, expires_at, level)
);

alter table public.plus_expiry_notices enable row level security;
revoke all on table public.plus_expiry_notices from public, anon, authenticated;
grant select, insert on table public.plus_expiry_notices to service_role;

comment on table public.plus_expiry_notices is
  'Deduplication of the Plus expiry pushes, one row per (user, expiry date, days left). Service role only.';

-- Who must be told today: Plus that ends in one of the given Argentina calendar days, with no authorized
-- subscription (that one renews on its own) and no notice for that (expiry, level) yet.
create or replace function public.plus_expiry_due(p_levels int[] default array[3, 1])
returns table (o_user_id uuid, o_expires_at timestamptz, o_days_left int)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select e.user_id, e.expires_at,
           ((e.expires_at at time zone 'America/Argentina/Buenos_Aires')::date
             - (now() at time zone 'America/Argentina/Buenos_Aires')::date)::int as days_left
    from public.plus_entitlements e
    where e.expires_at > now()
  )
  select c.user_id, c.expires_at, c.days_left
  from c
  where c.days_left = any (p_levels)
    and not exists (
      select 1 from public.plus_subscriptions s where s.user_id = c.user_id and s.status = 'authorized'
    )
    and not exists (
      select 1 from public.plus_expiry_notices n
      where n.user_id = c.user_id and n.expires_at = c.expires_at and n.level = c.days_left
    )
  order by c.expires_at, c.user_id;
$$;

-- Records one notice. TRUE when it was new, FALSE when that (user, expiry, level) was already recorded.
create or replace function public.record_plus_expiry_notice(
  p_user uuid,
  p_expires_at timestamptz,
  p_level int,
  p_source text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inserted boolean;
begin
  insert into public.plus_expiry_notices (user_id, expires_at, level, source)
  values (p_user, p_expires_at, p_level, p_source)
  on conflict do nothing
  returning true into v_inserted;
  return coalesce(v_inserted, false);
end;
$$;

-- Panel list: Plus that ends within p_days (1..30) and will NOT renew by itself.
create or replace function public.admin_plus_expiring(p_days int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 7), 30));
  v_result jsonb;
begin
  with c as (
    select e.user_id, e.source, e.expires_at,
           ((e.expires_at at time zone 'America/Argentina/Buenos_Aires')::date
             - (now() at time zone 'America/Argentina/Buenos_Aires')::date)::int as days_left,
           exists (
             select 1 from public.plus_subscriptions s where s.user_id = e.user_id and s.status = 'authorized'
           ) as auto_renews
    from public.plus_entitlements e
    where e.expires_at > now() and e.expires_at <= now() + make_interval(days => v_days)
  )
  select jsonb_build_object(
    'days', v_days,
    'auto_renewing_excluded', count(*) filter (where c.auto_renews),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id,
      'email', u.email,
      'source', c.source,
      'expires_at', c.expires_at,
      'days_left', c.days_left,
      'subscription_status', (select s.status from public.plus_subscriptions s
        where s.user_id = c.user_id order by s.created_at desc limit 1),
      'push_devices', (select count(*) from public.push_subscriptions p where p.user_id = c.user_id),
      'notified_levels', (select coalesce(jsonb_agg(n.level order by n.level desc), '[]'::jsonb)
        from public.plus_expiry_notices n where n.user_id = c.user_id and n.expires_at = c.expires_at)
    ) order by c.expires_at, c.user_id) filter (where not c.auto_renews), '[]'::jsonb)
  ) into v_result
  from c
  left join auth.users u on u.id = c.user_id;

  return v_result;
end;
$$;

-- 6. Admin settings --------------------------------------------------------------------------------------------------

create or replace function public.admin_avisos()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return jsonb_build_object(
    'nightly_push_enabled', coalesce((select s.enabled from public.admin_settings s
      where s.key = 'nightly_push_enabled'), true),
    'plus_expiry_push_enabled', coalesce((select s.enabled from public.admin_settings s
      where s.key = 'plus_expiry_push_enabled'), true),
    -- The cron only fires once its secret is stored.
    'cron_configured', exists (select 1 from private.app_secrets a where a.name = 'push_cron_secret')
      and exists (select 1 from private.app_secrets a where a.name = 'supabase_url'),
    'nightly_last_sent_at', (select max(m.sent_at) from public.push_messages m where m.kind = 'reminder'),
    'nightly_last_sent_count', (select m.sent_count from public.push_messages m
      where m.kind = 'reminder' and m.sent_at is not null order by m.sent_at desc limit 1),
    'plus_notices_30d', (select count(*) from public.plus_expiry_notices n
      where n.notified_at >= now() - interval '30 days')
  );
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_enabled boolean, p_admin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_key is null or p_key not in ('nightly_push_enabled', 'plus_expiry_push_enabled') then
    raise exception 'invalid_setting' using errcode = '22023';
  end if;
  if p_enabled is null then
    raise exception 'invalid_value' using errcode = '22023';
  end if;
  insert into public.admin_settings (key, enabled, updated_at, updated_by)
  values (p_key, p_enabled, now(), left(p_admin, 320))
  on conflict (key) do update
    set enabled = excluded.enabled, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

-- 7. Grants ----------------------------------------------------------------------------------------------------------

revoke all on function
  public.plus_expiry_due(int[]),
  public.record_plus_expiry_notice(uuid, timestamptz, int, text),
  public.admin_plus_expiring(int),
  public.admin_avisos(),
  public.admin_set_setting(text, boolean, text)
from public, anon, authenticated;

grant execute on function
  public.plus_expiry_due(int[]),
  public.record_plus_expiry_notice(uuid, timestamptz, int, text),
  public.admin_plus_expiring(int),
  public.admin_avisos(),
  public.admin_set_setting(text, boolean, text)
to service_role;

commit;
