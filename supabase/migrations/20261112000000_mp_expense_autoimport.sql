-- Mercado Pago expense auto-import (Plus): schema, RLS and state / lease / quota RPCs (work unit 1).
--
-- The Edge Functions `mp-oauth`, `mp-oauth-callback` and `mp-sync` (later work units) are the only writers and
-- talk to the database with the service role. Nothing here lets a browser read or write MP tokens.
--
--   * public.mp_connections: one row per Moni user. Tokens are AES-GCM ciphertext produced by the Edge Functions
--     (the database never sees plaintext). RLS on, NO policies, every privilege revoked from public / anon /
--     authenticated: only service_role reads or writes it. Clients use get_my_mp_connection() (safe fields only).
--     A partial unique index on mp_user_id (status <> 'unlinked') reserves an MP account for one Moni user.
--   * public.mp_oauth_states: single-use OAuth state, stored as a sha256 hash, service-only.
--   * public.mp_imported_payments: one row per imported MP payment (payment_id is the idempotency key).
--     Authenticated users can SELECT their own rows only; writes belong to the import RPC (work unit 2).
--   * claim_mp_oauth_state(): atomically consumes a state for the caller; unknown / used / expired / other-user all
--     raise 'invalid_state' (22023) without consuming anything.
--   * claim_mp_sync_batch(): takes a lease (for update skip locked) on active, Plus, consented, due connections.
--     Also reconciles Plus: active -> plus_lapsed when Plus ends, plus_lapsed -> active on renewal.
--   * finish_mp_sync(): records a run. The cursor moves only on a complete ('ok') run. error_class 'token_invalid'
--     nulls the ciphertexts and key_version and sets needs_reconnect.
--   * is_plus_user(), consume_ai_quota_for(): service-only variants of is_plus() / consume_ai_quota() that take the
--     user as an argument (the sync runs without a user JWT). Separate cap per feature, e.g. 'mp_import'.
--   * ensure_mp_wallet(): find-or-create the "Mercado Pago" ARS wallet (relinking never creates a second one).
--   * get_my_mp_connection(): status, mp_user_id, import_since, last_sync_at, last_error_class of the caller.
--
-- Tokens are kept while Plus is lapsed and are removed only on unlink (product decision).
-- Wrapped in one transaction. Apply AFTER 20261111000000_debt_reminders_and_payment_reports.sql (needs
-- 20261106000000_moni_plus.sql and 20261029000000_ai_usage.sql).
-- Rollback:
--   drop function public.get_my_mp_connection(), public.ensure_mp_wallet(uuid),
--     public.consume_ai_quota_for(uuid, text, int), public.is_plus_user(uuid),
--     public.finish_mp_sync(uuid, text, text, timestamptz), public.claim_mp_sync_batch(int),
--     public.claim_mp_oauth_state(text, uuid);
--   drop table public.mp_imported_payments, public.mp_oauth_states, public.mp_connections;
-- (imported transactions stay in public.transactions; wallets created for the user stay in public.accounts.)

begin;

-- Tables -------------------------------------------------------------------------------------------

create table public.mp_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- Mercado Pago user id (text: never parsed as a number).
  mp_user_id text not null check (char_length(mp_user_id) between 1 and 100),
  status text not null default 'active'
    check (status in ('active', 'needs_reconnect', 'plus_lapsed', 'unlinked')),
  -- Ciphertext `v<kid>.<nonce>.<ct+tag>`; NULL after unlink / invalid_grant.
  access_token_enc text,
  refresh_token_enc text,
  key_version text,
  expires_at timestamptz,
  account_id uuid references public.accounts (id) on delete set null,
  import_since timestamptz not null default now(),
  cursor_at timestamptz,
  sync_lease_until timestamptz,
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('ok', 'partial', 'error')),
  last_error_class text check (last_error_class is null or last_error_class in
    ('rate_limited', 'mp_unavailable', 'token_invalid', 'account_unavailable', 'category_unavailable', 'config',
     'unexpected')),
  consecutive_failures int not null default 0 check (consecutive_failures >= 0),
  last_manual_sync_at timestamptz,
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- active, needs_reconnect and plus_lapsed rows all reserve the MP account; only 'unlinked' frees it.
create unique index mp_connections_mp_user_uidx on public.mp_connections (mp_user_id) where status <> 'unlinked';
create index mp_connections_due_idx on public.mp_connections (last_sync_at) where status = 'active';

create table public.mp_oauth_states (
  state_hash text primary key check (char_length(state_hash) between 1 and 128),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_window text not null default 'now' check (import_window in ('now', '30', '90')),
  consent_version text not null check (char_length(consent_version) between 1 and 40),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes',
  used_at timestamptz
);

create index mp_oauth_states_user_idx on public.mp_oauth_states (user_id);

create table public.mp_imported_payments (
  payment_id text primary key check (char_length(payment_id) between 1 and 100),
  owner_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  mp_status text not null check (char_length(mp_status) between 1 and 40),
  outcome text not null check (outcome in ('posted', 'voided', 'skipped_subscription', 'needs_review')),
  amount numeric(14, 2) not null check (amount >= 0),
  occurred_on date not null,
  merchant varchar(120),
  operation_type text,
  suggested_subscription_id uuid references public.subscriptions (id) on delete set null,
  edited_at timestamptz,
  duplicate_dismissed boolean not null default false,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index mp_imported_payments_owner_idx on public.mp_imported_payments (owner_id, occurred_on desc);
create index mp_imported_payments_transaction_idx on public.mp_imported_payments (transaction_id)
  where transaction_id is not null;

alter table public.mp_connections enable row level security;
alter table public.mp_oauth_states enable row level security;
alter table public.mp_imported_payments enable row level security;

revoke all on table public.mp_connections, public.mp_oauth_states, public.mp_imported_payments
  from public, anon, authenticated;

-- Tokens: no client access of any kind and no policies. The Edge Functions use the service role.
grant select, insert, update, delete on table public.mp_connections to service_role;
grant select, insert, update, delete on table public.mp_oauth_states to service_role;
-- Imported payments: clients read their own rows; every write goes through the import RPC (work unit 2).
grant select on table public.mp_imported_payments to authenticated;
grant select on table public.mp_imported_payments to service_role;

create policy "mp_imported_payments_select_own" on public.mp_imported_payments
for select to authenticated using (owner_id = (select auth.uid()));

-- OAuth state ------------------------------------------------------------------------------------------

-- Consumes the state in ONE statement, so two concurrent callbacks cannot both win. Unknown, used, expired and
-- other-user states raise the same 'invalid_state' (no oracle); a wrong-user attempt does not burn the state.
create or replace function public.claim_mp_oauth_state(p_state_hash text, p_caller uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.mp_oauth_states;
begin
  if p_state_hash is null or p_caller is null then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  update public.mp_oauth_states s
  set used_at = now()
  where s.state_hash = p_state_hash
    and s.user_id = p_caller
    and s.used_at is null
    and s.expires_at > now()
  returning * into v_row;

  if v_row.state_hash is null then
    raise exception 'invalid_state' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'import_window', v_row.import_window,
    'consent_version', v_row.consent_version
  );
end;
$$;

-- Plus -----------------------------------------------------------------------------------------------------

-- True while p_user has an unexpired entitlement. Service-only: the sync has no user JWT.
create or replace function public.is_plus_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1 from public.plus_entitlements e where e.user_id = p_user and e.expires_at > now()
  );
$$;

-- Sync lease -------------------------------------------------------------------------------------------------

-- Claims up to p_limit (1..50) connections for this run. A claimed row carries a 5-minute lease so the next cron
-- tick skips it; rows locked by a concurrent claim are skipped, not waited for.
create or replace function public.claim_mp_sync_batch(p_limit int default 5)
returns setof public.mp_connections
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Plus reconciliation: movements and tokens stay, only the scheduled sync pauses / resumes.
  update public.mp_connections c
  set status = 'plus_lapsed', updated_at = now()
  where c.status = 'active' and not public.is_plus_user(c.user_id);

  update public.mp_connections c
  set status = 'active', updated_at = now()
  where c.status = 'plus_lapsed' and public.is_plus_user(c.user_id);

  return query
  with picked as (
    select c.user_id
    from public.mp_connections c
    where c.status = 'active'
      and c.consent_version is not null
      and c.consented_at is not null
      and c.refresh_token_enc is not null
      and (c.sync_lease_until is null or c.sync_lease_until <= now())
      and (c.last_sync_at is null or c.last_sync_at <= now() - interval '10 minutes')
      and public.is_plus_user(c.user_id)
    order by c.last_sync_at asc nulls first
    limit greatest(1, least(coalesce(p_limit, 5), 50))
    for update skip locked
  )
  update public.mp_connections c
  set sync_lease_until = now() + interval '5 minutes', updated_at = now()
  from picked
  where c.user_id = picked.user_id
  returning c.*;
end;
$$;

-- Records the end of a run and releases the lease. The cursor moves ONLY when p_result = 'ok' (a partial run is
-- re-read from the old cursor; dedupe on payment_id makes that safe). Returns false when the connection is unknown.
create or replace function public.finish_mp_sync(
  p_user uuid,
  p_result text,
  p_error_class text default null,
  p_cursor timestamptz default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows int;
begin
  if p_result is null or p_result not in ('ok', 'partial', 'error') then
    raise exception 'invalid_result' using errcode = '22023';
  end if;
  if p_error_class is not null and p_error_class not in
     ('rate_limited', 'mp_unavailable', 'token_invalid', 'account_unavailable', 'category_unavailable', 'config',
      'unexpected') then
    raise exception 'invalid_error_class' using errcode = '22023';
  end if;

  update public.mp_connections c
  set last_sync_at = now(),
      last_sync_status = p_result,
      last_error_class = case when p_result = 'ok' then null else p_error_class end,
      consecutive_failures = case when p_result = 'ok' then 0 else c.consecutive_failures + 1 end,
      cursor_at = case when p_result = 'ok' and p_cursor is not null then p_cursor else c.cursor_at end,
      sync_lease_until = null,
      -- A dead token ends the sync for this connection until the user relinks (D13).
      status = case when p_error_class = 'token_invalid' and c.status in ('active', 'plus_lapsed')
                    then 'needs_reconnect' else c.status end,
      access_token_enc = case when p_error_class = 'token_invalid' then null else c.access_token_enc end,
      refresh_token_enc = case when p_error_class = 'token_invalid' then null else c.refresh_token_enc end,
      key_version = case when p_error_class = 'token_invalid' then null else c.key_version end,
      updated_at = now()
  where c.user_id = p_user;
  get diagnostics v_rows = row_count;

  return v_rows > 0;
end;
$$;

-- AI quota ---------------------------------------------------------------------------------------------------

-- Same accounting as consume_ai_quota() (20261106000000_moni_plus.sql) for an explicit user. Plus only: a free
-- user raises 'plus_required' (54000) before anything is written. The cap is per feature, so 'mp_import' does not
-- eat into the assistant's quota. p_daily_limit is clamped to 1..100.
create or replace function public.consume_ai_quota_for(p_user uuid, p_feature text, p_daily_limit int default 48)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit int;
  v_used int;
  v_day_start timestamptz;
begin
  if p_user is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;
  if p_feature is null or p_feature !~ '^[a-z][a-z0-9_]{0,39}$' then
    raise exception 'invalid_feature' using errcode = '22023';
  end if;
  if not public.is_plus_user(p_user) then
    raise exception 'plus_required' using errcode = '54000';
  end if;

  v_limit := greatest(1, least(coalesce(p_daily_limit, 48), 100));

  -- Same lock key as consume_ai_quota(), so both serialize per user.
  perform pg_advisory_xact_lock(hashtextextended(p_user::text, 0));

  v_day_start := date_trunc('day', now() at time zone 'America/Argentina/Buenos_Aires')
    at time zone 'America/Argentina/Buenos_Aires';

  select count(*)::int into v_used
  from public.ai_usage u
  where u.owner_id = p_user and u.feature = p_feature and u.created_at >= v_day_start;

  if v_used >= v_limit then
    raise exception 'ai_quota_exceeded' using errcode = '54000';
  end if;

  insert into public.ai_usage (owner_id, feature) values (p_user, p_feature);

  return v_limit - v_used - 1;
end;
$$;

-- Wallet -------------------------------------------------------------------------------------------------------

-- Returns the user's active "Mercado Pago" wallet, creating it (ARS, opening balance 0) when missing. The per-user
-- lock keeps two concurrent links from creating two wallets.
create or replace function public.ensure_mp_wallet(p_user uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    raise exception 'invalid_user' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('mp_wallet:' || p_user::text, 0));

  select a.id into v_id
  from public.accounts a
  where a.owner_id = p_user and a.kind = 'wallet' and a.name = 'Mercado Pago' and a.archived_at is null
  order by a.created_at
  limit 1;

  if v_id is null then
    insert into public.accounts (owner_id, name, kind, currency, opening_balance)
    values (p_user, 'Mercado Pago', 'wallet', 'ARS', 0)
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Client view --------------------------------------------------------------------------------------------------

-- The only client-facing door to mp_connections: safe fields of the caller's own row (zero rows when none).
create or replace function public.get_my_mp_connection()
returns table (
  status text,
  mp_user_id text,
  import_since timestamptz,
  last_sync_at timestamptz,
  last_error_class text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.status, c.mp_user_id, c.import_since, c.last_sync_at, c.last_error_class
  from public.mp_connections c
  where c.user_id = (select auth.uid());
$$;

-- Grants ---------------------------------------------------------------------------------------------------

-- Service-only functions. Revoking from PUBLIC matters because functions are executable by PUBLIC by default;
-- anon / authenticated are revoked explicitly as well (Supabase default privileges grant them).
revoke execute on function
  public.claim_mp_oauth_state(text, uuid),
  public.claim_mp_sync_batch(int),
  public.finish_mp_sync(uuid, text, text, timestamptz),
  public.is_plus_user(uuid),
  public.consume_ai_quota_for(uuid, text, int),
  public.ensure_mp_wallet(uuid)
from public, anon, authenticated;
grant execute on function
  public.claim_mp_oauth_state(text, uuid),
  public.claim_mp_sync_batch(int),
  public.finish_mp_sync(uuid, text, text, timestamptz),
  public.is_plus_user(uuid),
  public.consume_ai_quota_for(uuid, text, int),
  public.ensure_mp_wallet(uuid)
to service_role;

revoke execute on function public.get_my_mp_connection() from public, anon;
grant execute on function public.get_my_mp_connection() to authenticated;

commit;
