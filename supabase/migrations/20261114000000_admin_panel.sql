-- Admin panel (route /adminmoni): read-only aggregate queries plus two audit tables.
--
-- Everything here is reachable ONLY by service_role, i.e. by the `admin-panel` Edge Function, which first checks that
-- the caller's JWT belongs to an email in the ADMIN_EMAILS allowlist. Browsers can never execute these functions:
--   * every function is SECURITY DEFINER with `set search_path = ''` (fully qualified names),
--   * EXECUTE is revoked from public / anon / authenticated and granted to service_role only,
--   * the audit tables have RLS on, NO policies and no privileges for anon / authenticated.
--
-- Privacy: the functions return account data, counts, dates, amounts and system state ONLY. They never select free
-- text written by users (movement notes, receipt contents, chat or insights content, merchant names, group names).
--
-- Idempotent (create or replace / if not exists) and wrapped in one transaction, so `psql -1` or a SQL Editor paste
-- either applies completely or not at all. Optional schemas (pg_cron, pg_net, storage, supabase_migrations) are
-- guarded with to_regclass() and answer null when absent.
--
-- Apply AFTER 20261113000000_web_push.sql.
-- Rollback:
--   drop function public.admin_sistema(), public.admin_mp(), public.admin_ia(), public.admin_plus(),
--     public.admin_usuario(uuid), public.admin_usuarios(text, text, int, int), public.admin_resumen(),
--     public.admin_last_activity();
--   drop table public.admin_acciones, public.admin_accesos;

begin;

-- Audit tables -------------------------------------------------------------------------------------------

-- One best-effort row per panel request: who looked at which section and when.
create table if not exists public.admin_accesos (
  id bigint generated always as identity primary key,
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  section text not null check (section ~ '^[a-z_]{1,40}$'),
  created_at timestamptz not null default now()
);

create index if not exists admin_accesos_created_idx on public.admin_accesos (created_at desc);

-- One row per admin action (today: push_user). Counts only: message titles and bodies are NEVER stored here.
create table if not exists public.admin_acciones (
  id bigint generated always as identity primary key,
  admin_email text not null check (char_length(admin_email) between 3 and 320),
  action text not null check (action ~ '^[a-z_]{1,40}$'),
  target_user_id uuid references auth.users (id) on delete set null,
  sent_count int check (sent_count is null or sent_count >= 0),
  failed_count int check (failed_count is null or failed_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists admin_acciones_rate_idx on public.admin_acciones (admin_email, action, created_at desc);

alter table public.admin_accesos enable row level security;
alter table public.admin_acciones enable row level security;

revoke all on table public.admin_accesos, public.admin_acciones from public, anon, authenticated;
grant select, insert on table public.admin_accesos to service_role;
grant select, insert, update on table public.admin_acciones to service_role;

comment on table public.admin_accesos is 'Admin panel access log (admin email, section, time). Service role only.';
comment on table public.admin_acciones is 'Admin panel actions (no message bodies). Service role only.';

-- Shared helper -------------------------------------------------------------------------------------------

-- Last REAL activity per user: latest sign-in, latest movement the person created (movements imported by the Mercado
-- Pago sync are excluded) and latest AI call the person made (the automated 'mp_import' categorization is excluded).
-- Falls back to the signup date, so the value is never null.
create or replace function public.admin_last_activity()
returns table (o_user_id uuid, o_last_activity_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         greatest(u.created_at, u.last_sign_in_at, mv.last_at, ai.last_at)
  from auth.users u
  left join (
    select t.owner_id, max(t.created_at) as last_at
    from public.transactions t
    where not exists (select 1 from public.mp_imported_payments p where p.transaction_id = t.id)
    group by t.owner_id
  ) mv on mv.owner_id = u.id
  left join (
    select a.owner_id, max(a.created_at) as last_at
    from public.ai_usage a
    where a.feature <> 'mp_import'
    group by a.owner_id
  ) ai on ai.owner_id = u.id;
$$;

-- Resumen -------------------------------------------------------------------------------------------------

create or replace function public.admin_resumen()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires';
  v_cron_failures int;
  v_result jsonb;
begin
  -- Failed cron runs in the last 24 hours (null when pg_cron is not installed or not readable).
  if to_regclass('cron.job_run_details') is not null then
    begin
      select count(*)::int into v_cron_failures
      from cron.job_run_details d
      where d.status = 'failed' and d.start_time >= now() - interval '24 hours';
    exception when others then
      v_cron_failures := null;
    end;
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from auth.users),
    'users_new_7d', (select count(*) from auth.users where created_at >= now() - interval '7 days'),
    'users_new_30d', (select count(*) from auth.users where created_at >= now() - interval '30 days'),
    'active_today', (select count(*) from public.admin_last_activity() a
      where (a.o_last_activity_at at time zone v_tz)::date = v_today),
    'active_7d', (select count(*) from public.admin_last_activity() a
      where a.o_last_activity_at >= now() - interval '7 days'),
    'active_30d', (select count(*) from public.admin_last_activity() a
      where a.o_last_activity_at >= now() - interval '30 days'),
    'plus_active', (select count(*) from public.plus_entitlements e where e.expires_at > now()),
    'plus_expired', (select count(*) from public.plus_entitlements e where e.expires_at <= now()),
    'mp_linked', (select count(*) from public.mp_connections c where c.status <> 'unlinked'),
    'ai_calls_today', (select count(*) from public.ai_usage a
      where (a.created_at at time zone v_tz)::date = v_today),
    'ai_calls_month', (select count(*) from public.ai_usage a where a.created_at >= v_month_start),
    -- AI cost is not tracked anywhere in Moni (ai_usage stores one row per call, with no model, tokens or cost).
    'ai_cost_tracked', false,
    'alerts', jsonb_build_object(
      'mp_needs_reconnect', (select count(*) from public.mp_connections c where c.status = 'needs_reconnect'),
      'mp_sync_errors', (select count(*) from public.mp_connections c
        where c.status = 'active' and (c.last_sync_status = 'error' or c.consecutive_failures >= 3)),
      'mp_import_failures', (select count(*) from public.mp_import_failures),
      -- Plus payment errors are not recorded as such. Proxy: an authorized subscription older than 2 days with no
      -- credited payment at all.
      'plus_authorized_without_payment', (select count(*) from public.plus_subscriptions s
        where s.status = 'authorized' and s.created_at < now() - interval '2 days'
          and not exists (select 1 from public.plus_payments p where p.subscription_id = s.id)),
      'cron_failures_24h', v_cron_failures
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Usuarios ------------------------------------------------------------------------------------------------

create or replace function public.admin_usuarios(
  p_search text default null,
  p_filter text default 'todos',
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  o_total bigint,
  o_user_id uuid,
  o_email text,
  o_name text,
  o_created_at timestamptz,
  o_last_sign_in_at timestamptz,
  o_last_activity_at timestamptz,
  o_days_inactive int,
  o_plus_expires_at timestamptz,
  o_plus_active boolean,
  o_mp_linked boolean,
  o_movements_total bigint,
  o_accounts_total bigint,
  o_movements_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_filter text := coalesce(nullif(btrim(p_filter), ''), 'todos');
  v_search text := lower(left(btrim(coalesce(p_search, '')), 100));
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if v_filter not in ('todos', 'plus', 'inactivos_7', 'inactivos_30', 'mp_vinculado') then
    raise exception 'invalid_filter' using errcode = '22023';
  end if;

  return query
  with act as (
    select a.o_user_id as uid, a.o_last_activity_at as last_at from public.admin_last_activity() a
  ),
  mv as (
    select t.owner_id,
           count(*) as total,
           count(*) filter (where t.created_at >= now() - interval '30 days') as last30
    from public.transactions t
    where t.status = 'posted'
    group by t.owner_id
  ),
  ac as (
    select c.owner_id, count(*) as total from public.accounts c where c.archived_at is null group by c.owner_id
  ),
  base as (
    select u.id as uid,
           u.email::text as email,
           p.display_name::text as name,
           u.created_at,
           u.last_sign_in_at,
           act.last_at,
           ((now() at time zone 'America/Argentina/Buenos_Aires')::date
             - (act.last_at at time zone 'America/Argentina/Buenos_Aires')::date)::int as days_inactive,
           e.expires_at as plus_expires_at,
           coalesce(e.expires_at > now(), false) as plus_active,
           exists (select 1 from public.mp_connections c where c.user_id = u.id and c.status <> 'unlinked') as mp_linked,
           coalesce(mv.total, 0) as movements_total,
           coalesce(ac.total, 0) as accounts_total,
           coalesce(mv.last30, 0) as movements_30d
    from auth.users u
    join act on act.uid = u.id
    left join public.profiles p on p.id = u.id
    left join public.plus_entitlements e on e.user_id = u.id
    left join mv on mv.owner_id = u.id
    left join ac on ac.owner_id = u.id
    where v_search = '' or position(v_search in lower(coalesce(u.email, ''))) > 0
  ),
  filtered as (
    select b.* from base b
    where case v_filter
      when 'plus' then b.plus_active
      when 'inactivos_7' then b.days_inactive > 7
      when 'inactivos_30' then b.days_inactive > 30
      when 'mp_vinculado' then b.mp_linked
      else true
    end
  )
  select count(*) over (),
         f.uid, f.email, f.name, f.created_at, f.last_sign_in_at, f.last_at, f.days_inactive,
         f.plus_expires_at, f.plus_active, f.mp_linked, f.movements_total, f.accounts_total, f.movements_30d
  from filtered f
  order by f.last_at desc, f.uid
  limit v_limit offset v_offset;
end;
$$;

-- Usuario (detalle) ---------------------------------------------------------------------------------------

-- Returns null when the user does not exist. Nothing the person wrote is returned: only ids, dates, amounts, statuses
-- and counts.
create or replace function public.admin_usuario(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_user jsonb;
  v_result jsonb;
begin
  if p_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'name', p.display_name,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'email_confirmed', u.email_confirmed_at is not null,
    'providers', coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb),
    'last_activity_at', (select a.o_last_activity_at from public.admin_last_activity() a where a.o_user_id = u.id),
    'onboarded', p.onboarding_completed_at is not null,
    'counts', jsonb_build_object(
      'movements_total', (select count(*) from public.transactions t where t.owner_id = u.id and t.status = 'posted'),
      'movements_30d', (select count(*) from public.transactions t
        where t.owner_id = u.id and t.status = 'posted' and t.created_at >= now() - interval '30 days'),
      'accounts', (select count(*) from public.accounts c where c.owner_id = u.id and c.archived_at is null),
      'ai_calls_30d', (select count(*) from public.ai_usage a
        where a.owner_id = u.id and a.created_at >= now() - interval '30 days'),
      'push_devices', (select count(*) from public.push_subscriptions s where s.user_id = u.id)
    )
  ) into v_user
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_id;

  if v_user is null then
    return null;
  end if;

  select v_user || jsonb_build_object(
    'days_inactive', (v_today - ((v_user ->> 'last_activity_at')::timestamptz at time zone v_tz)::date),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'movements', (select count(*) from public.transactions t
          where t.owner_id = p_id and (t.created_at at time zone v_tz)::date = d.day),
        'ai_calls', (select count(*) from public.ai_usage a
          where a.owner_id = p_id and (a.created_at at time zone v_tz)::date = d.day)
      ) order by d.day), '[]'::jsonb)
      from (select (v_today - 29 + g)::date as day from generate_series(0, 29) g) d
    ),
    'ai_by_feature_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('feature', x.feature, 'calls', x.calls) order by x.calls desc), '[]'::jsonb)
      from (
        select a.feature, count(*) as calls from public.ai_usage a
        where a.owner_id = p_id and a.created_at >= now() - interval '30 days'
        group by a.feature
      ) x
    ),
    'plus', jsonb_build_object(
      'entitlement', (select jsonb_build_object('source', e.source, 'granted_at', e.granted_at,
          'expires_at', e.expires_at, 'active', e.expires_at > now())
        from public.plus_entitlements e where e.user_id = p_id),
      'promo_redemptions', (select count(*) from public.promo_redemptions r where r.user_id = p_id),
      'subscriptions', (
        select coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'created_at', s.created_at,
          'updated_at', s.updated_at, 'preapproval_id', s.preapproval_id) order by s.created_at desc), '[]'::jsonb)
        from public.plus_subscriptions s where s.user_id = p_id
      ),
      'payments', (
        select coalesce(jsonb_agg(jsonb_build_object('payment_id', y.payment_id, 'amount', y.amount,
          'created_at', y.created_at) order by y.created_at desc), '[]'::jsonb)
        from (select pp.payment_id, pp.amount, pp.created_at from public.plus_payments pp
              where pp.user_id = p_id order by pp.created_at desc limit 50) y
      )
    ),
    'mp', (
      select jsonb_build_object(
        'status', c.status,
        'connected_at', c.created_at,
        'import_since', c.import_since,
        'last_sync_at', c.last_sync_at,
        'last_sync_status', c.last_sync_status,
        'last_error_class', c.last_error_class,
        'consecutive_failures', c.consecutive_failures,
        'imported_30d', (select count(*) from public.mp_imported_payments m
          where m.owner_id = p_id and m.imported_at >= now() - interval '30 days'),
        'needs_review', (select count(*) from public.mp_imported_payments m
          where m.owner_id = p_id and m.outcome = 'needs_review'),
        'poison_rows', (select count(*) from public.mp_import_failures f where f.owner_id = p_id)
      )
      from public.mp_connections c where c.user_id = p_id
    )
  ) into v_result;

  return v_result;
end;
$$;

-- Plus ----------------------------------------------------------------------------------------------------

create or replace function public.admin_plus()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  return jsonb_build_object(
    'entitlements', jsonb_build_object(
      'active', (select count(*) from public.plus_entitlements e where e.expires_at > now()),
      'expired', (select count(*) from public.plus_entitlements e where e.expires_at <= now()),
      'active_mercadopago', (select count(*) from public.plus_entitlements e
        where e.expires_at > now() and e.source = 'mercadopago'),
      'active_promo', (select count(*) from public.plus_entitlements e
        where e.expires_at > now() and e.source = 'promo'),
      'expiring_7d', (select count(*) from public.plus_entitlements e
        where e.expires_at > now() and e.expires_at <= now() + interval '7 days')
    ),
    'subscriptions', jsonb_build_object(
      'pending', (select count(*) from public.plus_subscriptions s where s.status = 'pending'),
      'authorized', (select count(*) from public.plus_subscriptions s where s.status = 'authorized'),
      'paused', (select count(*) from public.plus_subscriptions s where s.status = 'paused'),
      'cancelled', (select count(*) from public.plus_subscriptions s where s.status = 'cancelled')
    ),
    'revenue', jsonb_build_object(
      'currency', 'ARS',
      'last_30d', coalesce((select sum(p.amount) from public.plus_payments p
        where p.created_at >= now() - interval '30 days'), 0),
      'payments_30d', (select count(*) from public.plus_payments p where p.created_at >= now() - interval '30 days'),
      'total', coalesce((select sum(p.amount) from public.plus_payments p), 0),
      'daily', (
        select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
          'amount', coalesce((select sum(p.amount) from public.plus_payments p
            where (p.created_at at time zone v_tz)::date = d.day), 0)) order by d.day), '[]'::jsonb)
        from (select (v_today - 29 + g)::date as day from generate_series(0, 29) g) d
      )
    ),
    'recent_payments', (
      select coalesce(jsonb_agg(jsonb_build_object('payment_id', r.payment_id, 'user_id', r.user_id,
        'email', r.email, 'amount', r.amount, 'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
      from (
        select p.payment_id, p.user_id, u.email, p.amount, p.created_at
        from public.plus_payments p
        left join auth.users u on u.id = p.user_id
        order by p.created_at desc limit 20
      ) r
    ),
    -- Nothing in Moni records a "payment not credited" event. Proxy: authorized subscriptions older than 2 days
    -- that never got a credited payment.
    'not_credited', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', n.user_id, 'email', n.email,
        'subscription_created_at', n.created_at) order by n.created_at), '[]'::jsonb)
      from (
        select s.user_id, u.email, s.created_at
        from public.plus_subscriptions s
        left join auth.users u on u.id = s.user_id
        where s.status = 'authorized' and s.created_at < now() - interval '2 days'
          and not exists (select 1 from public.plus_payments p where p.subscription_id = s.id)
        order by s.created_at limit 50
      ) n
    )
  );
end;
$$;

-- IA ------------------------------------------------------------------------------------------------------

-- Moni records ONE ROW PER AI CALL (ai_usage: user, feature, time). It does not record model, tokens or cost, so the
-- cost fields are reported as untracked and the panel shows "sin datos" for them.
create or replace function public.admin_ia()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz constant text := 'America/Argentina/Buenos_Aires';
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires';
begin
  return jsonb_build_object(
    'cost_tracked', false,
    'calls_today', (select count(*) from public.ai_usage a where (a.created_at at time zone v_tz)::date = v_today),
    'calls_month', (select count(*) from public.ai_usage a where a.created_at >= v_month_start),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d.day,
        'calls', (select count(*) from public.ai_usage a where (a.created_at at time zone v_tz)::date = d.day))
        order by d.day), '[]'::jsonb)
      from (select (v_today - 29 + g)::date as day from generate_series(0, 29) g) d
    ),
    'by_feature_30d', (
      select coalesce(jsonb_agg(jsonb_build_object('feature', x.feature, 'calls', x.calls) order by x.calls desc), '[]'::jsonb)
      from (
        select a.feature, count(*) as calls from public.ai_usage a
        where a.created_at >= now() - interval '30 days' group by a.feature
      ) x
    ),
    'top_users_month', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', t.owner_id, 'email', t.email, 'calls', t.calls)
        order by t.calls desc), '[]'::jsonb)
      from (
        select a.owner_id, u.email, count(*) as calls
        from public.ai_usage a
        left join auth.users u on u.id = a.owner_id
        where a.created_at >= v_month_start
        group by a.owner_id, u.email
        order by count(*) desc limit 10
      ) t
    )
  );
end;
$$;

-- Mercado Pago ---------------------------------------------------------------------------------------------

create or replace function public.admin_mp()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb;
begin
  -- Last runs of the sync job (moni-mp-sync), when pg_cron is readable.
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    begin
      select jsonb_build_object(
        'last_run_at', max(d.start_time),
        'last_status', (select d2.status from cron.job_run_details d2 where d2.jobid = j.jobid
          order by d2.start_time desc limit 1),
        'runs_24h', count(*) filter (where d.start_time >= now() - interval '24 hours'),
        'failures_24h', count(*) filter (where d.start_time >= now() - interval '24 hours' and d.status = 'failed')
      ) into v_cron
      from cron.job j
      left join cron.job_run_details d on d.jobid = j.jobid
      where j.jobname = 'moni-mp-sync'
      group by j.jobid;
    exception when others then
      v_cron := null;
    end;
  end if;

  return jsonb_build_object(
    'connections', jsonb_build_object(
      'active', (select count(*) from public.mp_connections c where c.status = 'active'),
      'needs_reconnect', (select count(*) from public.mp_connections c where c.status = 'needs_reconnect'),
      'plus_lapsed', (select count(*) from public.mp_connections c where c.status = 'plus_lapsed'),
      'unlinked', (select count(*) from public.mp_connections c where c.status = 'unlinked')
    ),
    'last_sync', jsonb_build_object(
      'ok', (select count(*) from public.mp_connections c where c.status = 'active' and c.last_sync_status = 'ok'),
      'partial', (select count(*) from public.mp_connections c
        where c.status = 'active' and c.last_sync_status = 'partial'),
      'error', (select count(*) from public.mp_connections c where c.status = 'active' and c.last_sync_status = 'error'),
      'never', (select count(*) from public.mp_connections c where c.status = 'active' and c.last_sync_at is null),
      'stale_over_1h', (select count(*) from public.mp_connections c
        where c.status = 'active' and c.last_sync_at < now() - interval '1 hour')
    ),
    'errors_by_class', (
      select coalesce(jsonb_agg(jsonb_build_object('class', x.last_error_class, 'connections', x.n)
        order by x.n desc), '[]'::jsonb)
      from (
        select c.last_error_class, count(*) as n from public.mp_connections c
        where c.status <> 'unlinked' and c.last_error_class is not null group by c.last_error_class
      ) x
    ),
    'with_problems', (
      select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'email', p.email, 'status', p.status,
        'last_sync_at', p.last_sync_at, 'last_sync_status', p.last_sync_status,
        'last_error_class', p.last_error_class, 'consecutive_failures', p.consecutive_failures)
        order by p.consecutive_failures desc), '[]'::jsonb)
      from (
        select c.user_id, u.email, c.status, c.last_sync_at, c.last_sync_status, c.last_error_class,
               c.consecutive_failures
        from public.mp_connections c
        left join auth.users u on u.id = c.user_id
        where c.status = 'needs_reconnect'
           or (c.status = 'active' and (c.last_sync_status = 'error' or c.consecutive_failures >= 1))
        order by c.consecutive_failures desc limit 30
      ) p
    ),
    'imports', jsonb_build_object(
      'posted_30d', (select count(*) from public.mp_imported_payments m
        where m.outcome = 'posted' and m.imported_at >= now() - interval '30 days'),
      'needs_review', (select count(*) from public.mp_imported_payments m where m.outcome = 'needs_review'),
      'voided_30d', (select count(*) from public.mp_imported_payments m
        where m.outcome = 'voided' and m.imported_at >= now() - interval '30 days'),
      'poison_rows', (select count(*) from public.mp_import_failures)
    ),
    'cron', v_cron
  );
end;
$$;

-- Sistema -------------------------------------------------------------------------------------------------

create or replace function public.admin_sistema()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron jsonb;
  v_net jsonb;
  v_migration text;
  v_storage jsonb;
begin
  -- pg_cron: jobs with their last run and failures in 24h. The command text is NOT returned (it can embed URLs).
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
        'jobid', j.jobid,
        'name', j.jobname,
        'schedule', j.schedule,
        'active', j.active,
        'last_run_at', (select d.start_time from cron.job_run_details d where d.jobid = j.jobid
          order by d.start_time desc limit 1),
        'last_status', (select d.status from cron.job_run_details d where d.jobid = j.jobid
          order by d.start_time desc limit 1),
        'runs_24h', (select count(*) from cron.job_run_details d
          where d.jobid = j.jobid and d.start_time >= now() - interval '24 hours'),
        'failures_24h', (select count(*) from cron.job_run_details d
          where d.jobid = j.jobid and d.status = 'failed' and d.start_time >= now() - interval '24 hours')
      ) order by j.jobid), '[]'::jsonb) into v_cron
      from cron.job j;
    exception when others then
      v_cron := null;
    end;
  end if;

  -- pg_net: HTTP response status classes in 24h (counts only).
  if to_regclass('net._http_response') is not null then
    begin
      select jsonb_build_object(
        'total_24h', count(*),
        'ok_2xx', count(*) filter (where r.status_code between 200 and 299),
        'redirect_3xx', count(*) filter (where r.status_code between 300 and 399),
        'client_4xx', count(*) filter (where r.status_code between 400 and 499),
        'server_5xx', count(*) filter (where r.status_code >= 500),
        'no_response', count(*) filter (where r.status_code is null)
      ) into v_net
      from net._http_response r
      where r.created >= now() - interval '24 hours';
    exception when others then
      v_net := null;
    end;
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    begin
      select max(m.version) into v_migration from supabase_migrations.schema_migrations m;
    exception when others then
      v_migration := null;
    end;
  end if;

  if to_regclass('storage.objects') is not null then
    begin
      select jsonb_build_object(
        'objects', count(*),
        'bytes', coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,18}$'
          then (o.metadata ->> 'size')::bigint else 0 end), 0)
      ) into v_storage
      from storage.objects o;
    exception when others then
      v_storage := null;
    end;
  end if;

  return jsonb_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'latest_migration', v_migration,
    'cron', v_cron,
    'net_responses_24h', v_net,
    'storage', v_storage,
    'push', jsonb_build_object(
      'devices', (select count(*) from public.push_subscriptions),
      'users', (select count(distinct s.user_id) from public.push_subscriptions s),
      'messages_30d', (select count(*) from public.push_messages m where m.created_at >= now() - interval '30 days'),
      'last_message_at', (select max(m.sent_at) from public.push_messages m)
    ),
    'admin_actions_24h', (select count(*) from public.admin_acciones a where a.created_at >= now() - interval '24 hours'),
    'generated_at', now()
  );
end;
$$;

-- Grants --------------------------------------------------------------------------------------------------

revoke all on function
  public.admin_last_activity(),
  public.admin_resumen(),
  public.admin_usuarios(text, text, int, int),
  public.admin_usuario(uuid),
  public.admin_plus(),
  public.admin_ia(),
  public.admin_mp(),
  public.admin_sistema()
from public, anon, authenticated;

grant execute on function
  public.admin_last_activity(),
  public.admin_resumen(),
  public.admin_usuarios(text, text, int, int),
  public.admin_usuario(uuid),
  public.admin_plus(),
  public.admin_ia(),
  public.admin_mp(),
  public.admin_sistema()
to service_role;

commit;
