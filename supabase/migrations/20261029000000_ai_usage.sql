-- AI usage ledger and daily quota for the parse-movements Edge Function (voice / text entry of movements).
-- One row per model call. The Edge Function calls consume_ai_quota() with the CALLER's JWT before it talks to
-- the model, so the quota is enforced per user, under RLS, without the service role.
--   * The per-user advisory lock serializes concurrent calls: a burst cannot slip past the limit.
--   * The daily window is the Argentina calendar day (America/Argentina/Buenos_Aires).
--   * The limit is capped inside the function: a client calling the RPC directly cannot raise its own ceiling.
-- Clients can only SELECT their own rows (no INSERT, UPDATE or DELETE); writes go through consume_ai_quota().
-- There is deliberately NO refund: any user-callable refund would let a client undo its own usage and bypass the quota.
-- Old rows can be pruned by an operator.
-- Wrapped in one transaction so a mid-script failure (e.g. in the SQL Editor) rolls back completely.
-- Apply AFTER 20261028000000_insights_budgets.sql.

begin;

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{0,39}$'),
  created_at timestamptz not null default now()
);

create index ai_usage_owner_feature_idx on public.ai_usage (owner_id, feature, created_at desc);

alter table public.ai_usage enable row level security;

revoke all on table public.ai_usage from anon, authenticated;

-- Clients can only READ their own rows. Rows are written exclusively by the SECURITY DEFINER functions below,
-- so a client cannot insert (or fake) usage rows directly.
grant select on table public.ai_usage to authenticated;

create policy "ai_usage_select_own" on public.ai_usage
for select to authenticated using (owner_id = (select auth.uid()));

-- Records one use of p_feature and returns how many uses are left today, or raises 'ai_quota_exceeded' (54000).
-- SECURITY DEFINER: the table has no client INSERT grant, so the function (owned by the migration role) writes
-- the row with an explicit owner_id = auth.uid(). The caller identity always comes from the JWT, never an argument.
-- p_daily_limit is clamped to 1..100 so callers cannot grant themselves a bigger quota.
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

  v_limit := greatest(1, least(coalesce(p_daily_limit, 30), 100));

  -- Serialize this user's quota checks until the end of the transaction.
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

revoke execute on function public.consume_ai_quota(text, int) from public, anon;
grant execute on function public.consume_ai_quota(text, int) to authenticated;

commit;
