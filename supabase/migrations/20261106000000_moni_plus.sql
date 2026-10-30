-- Moni Plus: Free vs Plus entitlement, enforced in the database.
--
-- There is no payment provider yet. The only way to become Plus is redeem_promo_code(), which grants 30 days.
-- Everything a client does in the UI is only UX: the rules below are what actually protect the paid features.
--
--   * public.plus_entitlements: one row per user. Clients can only SELECT their own row; writes happen
--     exclusively in SECURITY DEFINER code (redeem_promo_code today, a payment webhook later).
--   * public.is_plus() / public.my_plus_status(): "is the caller Plus right now" and "until when" for the UI.
--   * public.redeem_promo_code(p_code): the code lives in this function as a SHA-256 hash of its normalized
--     form and is never sent to the client. Wrong codes are throttled (10 failures per user per hour, same
--     pattern as group_join_attempts) and return NULL, because raising would roll the failure record back.
--   * Free users can have at most ONE active group created by them (create_group raises 'plus_required').
--     Joining other people's groups stays free.
--   * consume_ai_quota rejects free users for the AI features ('parse_movements', 'parse_receipt',
--     'insights_chat') with 'plus_required' (SQLSTATE 54000) BEFORE anything is recorded.
--
-- Redemption policy (documented choice): a user can redeem a given code only ONCE. A second attempt with the same
-- code does not extend anything: it returns the user's current expiry (which may already be in the past) and the
-- client decides the message. A code that does not match returns NULL.
--
-- The hash of a short, human-friendly code is guessable offline by anyone who can read this file, so real
-- protection is the throttle plus keeping the repository private. To rotate the code, ship a new migration with a
-- new hash (the previous redemptions stay valid until they expire).
--
-- Wrapped in one transaction. Apply AFTER 20261105000000_shorter_invite_codes.sql.
-- Rollback: restore create_group / consume_ai_quota from 20261027000000 / 20261029000000, then
--   drop function public.redeem_promo_code(text), public.my_plus_status(), public.is_plus();
--   drop table public.promo_redemptions, public.promo_redeem_attempts, public.plus_entitlements;

begin;

-- Tables -------------------------------------------------------------------------------------------

create table public.plus_entitlements (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Where the entitlement came from, e.g. 'promo' or (later) 'store'.
  source text not null check (char_length(source) between 1 and 40),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > granted_at)
);

-- One row per (user, code): enforces "one redemption per user per code".
create table public.promo_redemptions (
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  redeemed_at timestamptz not null default now(),
  primary key (user_id, code_hash)
);

-- Failed redemption attempts per user, used to throttle code guessing. Written only by redeem_promo_code.
create table public.promo_redeem_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index promo_redeem_attempts_user_idx on public.promo_redeem_attempts (user_id, attempted_at desc);

alter table public.plus_entitlements enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.promo_redeem_attempts enable row level security;

revoke all on table public.plus_entitlements, public.promo_redemptions, public.promo_redeem_attempts
  from anon, authenticated;

-- Clients read their own entitlement only. promo_* tables have RLS on, no policies and no grants.
grant select on table public.plus_entitlements to authenticated;

create policy "plus_entitlements_select_own" on public.plus_entitlements
for select to authenticated using (user_id = (select auth.uid()));

-- Reads ---------------------------------------------------------------------------------------------

-- True while the caller has an unexpired entitlement. SECURITY INVOKER: RLS already limits the read to own row.
create or replace function public.is_plus()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.plus_entitlements e
    where e.user_id = (select auth.uid()) and e.expires_at > now()
  );
$$;

-- When the caller's Plus ends, or NULL when the caller is on Free (never had Plus, or it expired).
create or replace function public.my_plus_status()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select e.expires_at from public.plus_entitlements e
  where e.user_id = (select auth.uid()) and e.expires_at > now();
$$;

-- Redeem --------------------------------------------------------------------------------------------

-- Returns the new expiry on success, the existing expiry when this user already redeemed this code, and NULL for
-- an unknown code (the failure is recorded). Raises 'too_many_attempts' (54000) after 10 failures in an hour.
create or replace function public.redeem_promo_code(p_code text)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  -- 'Moni Plus', 'moni-plus', ' MONIPLUS ' all normalize to 'moniplus'.
  v_norm text := regexp_replace(lower(coalesce(p_code, '')), '[^a-z0-9]', '', 'g');
  v_hash text;
  -- sha256('moniplus')
  c_hash constant text := '964346036a2ce4e3c80b8207be5822c647af819b1ae26884daee400918272026';
  v_rows int;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('promo:' || v_user::text, 0));

  if (select count(*) from public.promo_redeem_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  v_hash := encode(sha256(convert_to(v_norm, 'utf8')), 'hex');

  if char_length(v_norm) not between 1 and 64 or v_hash <> c_hash then
    -- RETURN NULL (an exception would roll the record back); the client maps NULL to 'promo_invalid'.
    delete from public.promo_redeem_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.promo_redeem_attempts (user_id) values (v_user);
    return null;
  end if;

  insert into public.promo_redemptions (user_id, code_hash) values (v_user, v_hash)
  on conflict (user_id, code_hash) do nothing;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    -- Already redeemed this code: nothing is extended.
    select e.expires_at into v_expires from public.plus_entitlements e where e.user_id = v_user;
    return v_expires;
  end if;

  -- 30 days from now; if the user still has time left from another source, it is added on top of it.
  insert into public.plus_entitlements as e (user_id, source, granted_at, expires_at)
  values (v_user, 'promo', now(), now() + interval '30 days')
  on conflict (user_id) do update
    set source = 'promo',
        granted_at = now(),
        expires_at = greatest(e.expires_at, now()) + interval '30 days'
  returning e.expires_at into v_expires;

  return v_expires;
end;
$$;

-- Groups: Free users can create ONE active group ----------------------------------------------------
-- Same body as 20261027000000_shared_expenses.sql plus the plus check. Groups are only created through this RPC
-- (clients have no INSERT grant), so no trigger is needed.

create or replace function public.create_group(p_name text, p_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 60 then
    raise exception 'invalid_group_name' using errcode = '22023';
  end if;
  if p_kind is null or p_kind not in ('casa', 'viaje', 'pareja', 'amigos') then
    raise exception 'invalid_group_kind' using errcode = '22023';
  end if;

  -- Serialize this user's group creation so two concurrent calls cannot both pass the count.
  perform pg_advisory_xact_lock(hashtextextended('create_group:' || v_user::text, 0));

  if not exists (
    select 1 from public.plus_entitlements e where e.user_id = v_user and e.expires_at > now()
  ) and exists (
    select 1 from public.groups g where g.created_by = v_user and g.archived_at is null
  ) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  insert into public.groups (name, kind, created_by)
  values (v_name, p_kind, v_user)
  returning id into v_id;

  insert into public.group_members (group_id, user_id, role)
  values (v_id, v_user, 'owner');

  return v_id;
end;
$$;

-- AI quota: Plus only --------------------------------------------------------------------------------
-- Same body as 20261029000000_ai_usage.sql plus the plus check, placed before the lock and before any row is
-- written, so a free user's rejected call consumes nothing.

create or replace function public.consume_ai_quota(p_feature text, p_daily_limit int default 30)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int;
  v_used int;
  v_day_start timestamptz;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{0,39}$' then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;

  if p_feature in ('parse_movements', 'parse_receipt', 'insights_chat') and not exists (
    select 1 from public.plus_entitlements e where e.user_id = v_uid and e.expires_at > now()
  ) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  v_limit := greatest(1, least(coalesce(p_daily_limit, 30), 100));

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_day_start := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires';

  select count(*)::int into v_used
  from public.ai_usage u
  where u.owner_id = v_uid and u.feature = p_feature and u.created_at >= v_day_start;

  if v_used >= v_limit then
    raise exception 'ai_quota_exceeded' using errcode = '54000';
  end if;

  insert into public.ai_usage (owner_id, feature) values (v_uid, p_feature);

  return v_limit - v_used - 1;
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------

revoke execute on function
  public.is_plus(), public.my_plus_status(), public.redeem_promo_code(text),
  public.create_group(text, text), public.consume_ai_quota(text, int)
from public, anon;
grant execute on function
  public.is_plus(), public.my_plus_status(), public.redeem_promo_code(text),
  public.create_group(text, text), public.consume_ai_quota(text, int)
to authenticated;

commit;
