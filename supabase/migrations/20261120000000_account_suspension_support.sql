-- Account suspension and support inbox for the admin panel (/adminmoni).
--
--   * public.account_suspensions: one row per suspended account (reason, who, when). RLS on, no policies, service
--     role only. The auth ban itself is set by the admin-panel Edge Function (auth.admin.updateUserById); this table
--     is what the app and push-send read, and it carries the reason. A person learns only a boolean
--     (my_account_suspended()), never the reason.
--   * public.admin_apply_suspension() / admin_lift_suspension(): service role only. Applying also deletes the
--     person's auth sessions so refresh tokens stop working at once.
--   * public.support_tickets: what people write to support. A person reads only their own rows (RLS select policy);
--     there is NO insert or update grant: tickets are created through create_support_ticket(), which validates the
--     text and enforces 5 tickets per rolling 24 hours per person. The team answers through admin_support_reply().
--     Support messages are written FOR the team, so the panel shows them (the app says so on the form); everything
--     else in the panel keeps its "no free text written by users" rule.
--   * Panel readers admin_support_list / admin_support_get / admin_usuario_estado / admin_suspended_ids: SECURITY
--     DEFINER, empty search_path, EXECUTE for service_role only.
--
-- Wrapped in one transaction. Apply AFTER 20261119000000_push_always_on_schedules.sql.
-- Rollback:
--   drop function public.admin_suspended_ids(uuid[]), public.admin_usuario_estado(uuid),
--     public.admin_support_set_status(uuid, text), public.admin_support_reply(uuid, text, text, boolean),
--     public.admin_support_get(uuid), public.admin_support_list(text, int, int),
--     public.create_support_ticket(text, text), public.admin_lift_suspension(uuid),
--     public.admin_apply_suspension(uuid, text, text), public.my_account_suspended();
--   drop table public.support_tickets, public.account_suspensions;

begin;

-- Suspension -------------------------------------------------------------------------------------------------------

create table public.account_suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 200),
  suspended_by text not null check (char_length(suspended_by) between 3 and 320),
  suspended_at timestamptz not null default now()
);

alter table public.account_suspensions enable row level security;
revoke all on table public.account_suspensions from public, anon, authenticated;
grant select, insert, update, delete on table public.account_suspensions to service_role;

comment on table public.account_suspensions is 'Suspended accounts with their reason. Service role only.';

-- True when the caller's account is suspended. The reason never leaves the database.
create or replace function public.my_account_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_suspensions s where s.user_id = (select auth.uid()));
$$;

create or replace function public.admin_apply_suspension(p_user uuid, p_reason text, p_admin text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.account_suspensions (user_id, reason, suspended_by)
  values (p_user, btrim(coalesce(p_reason, '')), left(coalesce(p_admin, ''), 320))
  on conflict (user_id) do update
    set reason = excluded.reason, suspended_by = excluded.suspended_by, suspended_at = now();
  -- Close every session: refresh tokens go with them (ON DELETE CASCADE).
  if to_regclass('auth.sessions') is not null then
    delete from auth.sessions where user_id = p_user;
  end if;
end;
$$;

-- TRUE when a suspension existed and was lifted.
create or replace function public.admin_lift_suspension(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted boolean;
begin
  delete from public.account_suspensions where user_id = p_user returning true into v_deleted;
  return coalesce(v_deleted, false);
end;
$$;

-- Which of these users are suspended (list badge).
create or replace function public.admin_suspended_ids(p_ids uuid[])
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id from public.account_suspensions s where s.user_id = any (coalesce(p_ids, '{}'::uuid[]));
$$;

-- Support ----------------------------------------------------------------------------------------------------------

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(btrim(subject)) between 3 and 120),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  reply text check (reply is null or char_length(btrim(reply)) between 1 and 2000),
  replied_at timestamptz,
  replied_by text check (replied_by is null or char_length(replied_by) <= 320),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((reply is null) = (replied_at is null))
);

create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status, created_at desc);

alter table public.support_tickets enable row level security;
revoke all on table public.support_tickets from public, anon, authenticated;
-- A person reads their own tickets. Nobody but the service role writes directly.
grant select on table public.support_tickets to authenticated;
grant select, update on table public.support_tickets to service_role;

create policy "support_tickets_select_own" on public.support_tickets
for select to authenticated using (user_id = (select auth.uid()));

comment on table public.support_tickets is
  'Support inbox. Created through create_support_ticket(); answered by the admin panel (service role).';

-- Creates a ticket for the caller. Raises 'too_many_tickets' (54000) after 5 in the last 24 hours.
create or replace function public.create_support_ticket(p_subject text, p_message text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subject text := btrim(coalesce(p_subject, ''));
  v_message text := btrim(coalesce(p_message, ''));
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if char_length(v_subject) < 3 or char_length(v_subject) > 120 then
    raise exception 'invalid_subject' using errcode = '22023';
  end if;
  if char_length(v_message) < 1 or char_length(v_message) > 2000 then
    raise exception 'invalid_message' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('support:' || v_uid::text, 0));

  if (select count(*) from public.support_tickets t
      where t.user_id = v_uid and t.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'too_many_tickets' using errcode = '54000';
  end if;

  insert into public.support_tickets (user_id, subject, message)
  values (v_uid, v_subject, v_message)
  returning id into v_id;
  return v_id;
end;
$$;

-- Suspension and support state of one user (user detail).
create or replace function public.admin_usuario_estado(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'suspended', exists (select 1 from public.account_suspensions s where s.user_id = p_id),
    'suspension', (select jsonb_build_object('reason', s.reason, 'suspended_by', s.suspended_by,
        'suspended_at', s.suspended_at) from public.account_suspensions s where s.user_id = p_id),
    'tickets_total', (select count(*) from public.support_tickets t where t.user_id = p_id),
    'tickets_open', (select count(*) from public.support_tickets t where t.user_id = p_id and t.status = 'open')
  );
$$;

-- Inbox. p_status: 'open', 'resolved' or 'todas'.
create or replace function public.admin_support_list(
  p_status text default 'open',
  p_limit int default 25,
  p_offset int default 0
)
returns table (
  o_total bigint,
  o_id uuid,
  o_user_id uuid,
  o_email text,
  o_subject text,
  o_status text,
  o_created_at timestamptz,
  o_replied_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text := coalesce(nullif(btrim(p_status), ''), 'open');
  v_limit int := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset int := greatest(0, coalesce(p_offset, 0));
begin
  if v_status not in ('open', 'resolved', 'todas') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  return query
  select count(*) over (), t.id, t.user_id, u.email::text, t.subject, t.status, t.created_at, t.replied_at
  from public.support_tickets t
  left join auth.users u on u.id = t.user_id
  where v_status = 'todas' or t.status = v_status
  order by case when t.status = 'open' then 0 else 1 end, t.created_at desc, t.id
  limit v_limit offset v_offset;
end;
$$;

-- One ticket with the person's email. NULL when it does not exist.
create or replace function public.admin_support_get(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'user_id', t.user_id,
    'email', u.email,
    'name', p.display_name,
    'subject', t.subject,
    'message', t.message,
    'status', t.status,
    'reply', t.reply,
    'replied_at', t.replied_at,
    'replied_by', t.replied_by,
    'resolved_at', t.resolved_at,
    'created_at', t.created_at,
    'user_tickets_total', (select count(*) from public.support_tickets x where x.user_id = t.user_id)
  )
  from public.support_tickets t
  left join auth.users u on u.id = t.user_id
  left join public.profiles p on p.id = t.user_id
  where t.id = p_id;
$$;

-- Saves the team's answer (replacing a previous one) and optionally resolves the ticket. Returns the author's id.
create or replace function public.admin_support_reply(
  p_id uuid,
  p_reply text,
  p_admin text,
  p_resolve boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_reply text := btrim(coalesce(p_reply, ''));
  v_user uuid;
begin
  if char_length(v_reply) < 1 or char_length(v_reply) > 2000 then
    raise exception 'invalid_reply' using errcode = '22023';
  end if;
  update public.support_tickets t
  set reply = v_reply,
      replied_at = now(),
      replied_by = left(coalesce(p_admin, ''), 320),
      status = case when coalesce(p_resolve, false) then 'resolved' else t.status end,
      resolved_at = case when coalesce(p_resolve, false) then now() else t.resolved_at end
  where t.id = p_id
  returning t.user_id into v_user;
  if v_user is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

create or replace function public.admin_support_set_status(p_id uuid, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_status is null or p_status not in ('open', 'resolved') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.support_tickets t
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then now() else null end
  where t.id = p_id
  returning t.user_id into v_user;
  if v_user is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return v_user;
end;
$$;

-- Grants -----------------------------------------------------------------------------------------------------------

revoke all on function
  public.my_account_suspended(),
  public.create_support_ticket(text, text),
  public.admin_apply_suspension(uuid, text, text),
  public.admin_lift_suspension(uuid),
  public.admin_suspended_ids(uuid[]),
  public.admin_usuario_estado(uuid),
  public.admin_support_list(text, int, int),
  public.admin_support_get(uuid),
  public.admin_support_reply(uuid, text, text, boolean),
  public.admin_support_set_status(uuid, text)
from public, anon, authenticated;

grant execute on function public.my_account_suspended(), public.create_support_ticket(text, text) to authenticated;

grant execute on function
  public.admin_apply_suspension(uuid, text, text),
  public.admin_lift_suspension(uuid),
  public.admin_suspended_ids(uuid[]),
  public.admin_usuario_estado(uuid),
  public.admin_support_list(text, int, int),
  public.admin_support_get(uuid),
  public.admin_support_reply(uuid, text, text, boolean),
  public.admin_support_set_status(uuid, text)
to service_role;

commit;
