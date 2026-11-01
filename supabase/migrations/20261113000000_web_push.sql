-- Web push: device subscriptions and the history of what the owner sent.
--
-- The Edge Function `push-send` (service role, protected by x-moni-push-secret) is the only sender and the only
-- writer of push_messages. Browsers never write push_subscriptions directly either: they go through the RPCs below.
--
--   * public.push_subscriptions: one row per browser endpoint. RLS on; an owner can SELECT and DELETE their own
--     rows. There is NO insert / update policy and the privileges are revoked: registering goes through
--     register_push_subscription() so the endpoint (unique) can be safely reassigned to the current user.
--   * public.push_messages: outbox / history of sent messages. RLS on, NO policies, every privilege revoked from
--     public / anon / authenticated: only service_role reads or writes it.
--   * register_push_subscription(): upserts by endpoint for auth.uid(). If the endpoint already existed for
--     another user (shared browser, new login) the row is reassigned to the caller. Refreshes last_seen_at.
--   * remove_push_subscription(): deletes the caller's own row for that endpoint (no-op otherwise).
--
-- Wrapped in one transaction. Apply AFTER 20261112000500_*.sql.
-- Rollback:
--   drop function public.remove_push_subscription(text), public.register_push_subscription(text, text, text, text);
--   drop table public.push_messages, public.push_subscriptions;

begin;

-- Tables -------------------------------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 1 and 2048),
  p256dh text not null check (char_length(p256dh) between 1 and 512),
  auth text not null check (char_length(auth) between 1 and 512),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

comment on table public.push_subscriptions is
  'Web push endpoints, one per browser. Written only by register_push_subscription(); pruned by push-send on 404/410.';

create table public.push_messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('maintenance', 'feedback', 'news')),
  title text not null check (char_length(title) between 1 and 80),
  body text not null check (char_length(body) between 1 and 240),
  -- In-app path such as '/actividad'; never an absolute URL.
  url text check (url is null or (url like '/%' and url not like '//%' and char_length(url) <= 200)),
  audience text not null default 'all' check (audience in ('all', 'user')),
  target_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_count int check (sent_count is null or sent_count >= 0),
  failed_count int check (failed_count is null or failed_count >= 0),
  removed_count int check (removed_count is null or removed_count >= 0)
);

comment on table public.push_messages is
  'History of push messages sent by the owner through push-send. Service role only.';

-- RLS and grants ---------------------------------------------------------------------------------------

alter table public.push_subscriptions enable row level security;
alter table public.push_messages enable row level security;

revoke all on table public.push_subscriptions, public.push_messages from public, anon, authenticated;

grant select, delete on table public.push_subscriptions to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.push_messages to service_role;

create policy "push_subscriptions_select_own" on public.push_subscriptions
for select to authenticated using (user_id = (select auth.uid()));

create policy "push_subscriptions_delete_own" on public.push_subscriptions
for delete to authenticated using (user_id = (select auth.uid()));

-- RPCs -------------------------------------------------------------------------------------------------

create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://.' or char_length(p_endpoint) > 2048 then
    raise exception 'invalid_endpoint' using errcode = '22023';
  end if;
  if p_p256dh is null or btrim(p_p256dh) = '' or char_length(p_p256dh) > 512 then
    raise exception 'invalid_key' using errcode = '22023';
  end if;
  if p_auth is null or btrim(p_auth) = '' or char_length(p_auth) > 512 then
    raise exception 'invalid_key' using errcode = '22023';
  end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 512))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        user_agent = excluded.user_agent,
        last_seen_at = now();
end;
$$;

create or replace function public.remove_push_subscription(p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or btrim(p_endpoint) = '' or char_length(p_endpoint) > 2048 then
    raise exception 'invalid_endpoint' using errcode = '22023';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = v_uid;
end;
$$;

revoke execute on function
  public.register_push_subscription(text, text, text, text),
  public.remove_push_subscription(text)
from public, anon;
grant execute on function
  public.register_push_subscription(text, text, text, text),
  public.remove_push_subscription(text)
to authenticated;

commit;
