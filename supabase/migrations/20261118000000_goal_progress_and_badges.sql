-- Savings goals: monthly history for the progress chart, and rewards (goal achievements + badges).
--
-- * get_savings_plan_data(): everything the "Tu progreso en metas" chart needs, month by month and goal by goal, in one
--   read: what was deposited, what the person withdrew, and what a status change released (a goal marked completed or
--   archived releases its reserve; that is not saving or spending, so it is reported apart). Plus each goal's life dates.
-- * goal_achievements: the first moment a goal's reserve really reached its target. It is derived from the movements, so
--   a goal that is merely marked "completed" without reaching its amount never counts. One row per goal, written once.
-- * user_badges: collectible badges the person earned, written once per badge. The catalog (names, images, rules texts)
--   lives in the app; the rules that grant them live here, so nobody can be granted a badge without earning it.
--
-- Nothing is deleted or changed in the existing tables. Awarding never blocks saving: if it fails, the deposit stands.

-- Reads ----------------------------------------------------------------------------------------------------

-- Note prefixes the status changes write on the withdrawal that releases a reserve (see set_savings_goal_status).
create or replace function public.get_savings_plan_data()
returns json
language sql
stable
set search_path = ''
as $$
  select json_build_object(
    'months', coalesce((
      select json_agg(json_build_object(
        'goal_id', x.goal_id, 'month', x.month,
        'deposited', x.deposited, 'withdrawn', x.withdrawn, 'released', x.released
      ) order by x.month, x.goal_id)
      from (
        select m.goal_id,
               date_trunc('month', m.occurred_on)::date as month,
               sum(case when m.kind = 'deposit' then m.amount else 0 end) as deposited,
               sum(case when m.kind = 'withdrawal'
                         and coalesce(m.note, '') not like 'Meta completada:%'
                         and coalesce(m.note, '') not like 'Meta archivada:%' then m.amount else 0 end) as withdrawn,
               sum(case when m.kind = 'withdrawal'
                         and (coalesce(m.note, '') like 'Meta completada:%'
                              or coalesce(m.note, '') like 'Meta archivada:%') then m.amount else 0 end) as released
        from public.savings_movements m
        where m.status = 'posted'
        group by m.goal_id, date_trunc('month', m.occurred_on)
      ) x
    ), '[]'::json),
    'goals', coalesce((
      select json_agg(json_build_object(
        'id', g.id, 'created_at', g.created_at, 'completed_at', g.completed_at,
        'archived_at', g.archived_at, 'paused_at', g.paused_at
      ) order by g.created_at)
      from public.savings_goals g
    ), '[]'::json)
  );
$$;

revoke execute on function public.get_savings_plan_data() from public, anon;
grant execute on function public.get_savings_plan_data() to authenticated;

-- Rewards tables -------------------------------------------------------------------------------------------

create table public.goal_achievements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- The goal can later disappear from the person's view; the achievement keeps its own copy of what it needs.
  goal_id uuid references public.savings_goals (id) on delete set null,
  goal_name text not null,
  icon text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  reached_at timestamptz not null,
  -- null until the person saw the celebration.
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

-- A goal is achieved once: re-running the award never duplicates it.
create unique index goal_achievements_goal_key on public.goal_achievements (goal_id) where goal_id is not null;
create index goal_achievements_owner_idx on public.goal_achievements (owner_id, reached_at);

create table public.user_badges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  badge_key text not null check (badge_key ~ '^[a-z0-9-]{1,40}$'),
  -- The goal that unlocked it, kept as a copy (name and amount) so it survives a deleted goal.
  goal_id uuid references public.savings_goals (id) on delete set null,
  goal_name text,
  target_amount numeric(14,2),
  earned_at timestamptz not null,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, badge_key)
);

alter table public.goal_achievements enable row level security;
alter table public.user_badges enable row level security;
revoke all on table public.goal_achievements, public.user_badges from anon, authenticated;
grant select on table public.goal_achievements, public.user_badges to authenticated;

create policy "goal_achievements_select_own" on public.goal_achievements
for select to authenticated using (owner_id = (select auth.uid()));
create policy "user_badges_select_own" on public.user_badges
for select to authenticated using (owner_id = (select auth.uid()));

-- Awarding (internal) --------------------------------------------------------------------------------------

-- Looks at the person's real movements and records what they have earned that is not recorded yet. Idempotent: it can
-- run any number of times (after every deposit, or from the app) and never duplicates an achievement or a badge.
create or replace function public.award_goal_progress(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 1) Goals whose reserve really reached the target. The running reserve follows the order the movements were recorded;
  --    voided movements do not count, and a later withdrawal or release does not undo an achievement already recorded.
  insert into public.goal_achievements (owner_id, goal_id, goal_name, icon, target_amount, target_date, reached_at)
  select p_owner, c.goal_id, c.name, c.icon, c.target_amount, c.target_date, c.reached_at
  from (
    select g.id as goal_id, g.name, g.icon, g.target_amount, g.target_date,
           min(o.created_at) filter (where o.running >= g.target_amount) as reached_at
    from public.savings_goals g
    join (
      select m.goal_id, m.created_at,
             sum(case m.kind when 'deposit' then m.amount else -m.amount end)
               over (partition by m.goal_id order by m.created_at, m.id) as running
      from public.savings_movements m
      where m.owner_id = p_owner and m.status = 'posted'
    ) o on o.goal_id = g.id
    where g.owner_id = p_owner
    group by g.id, g.name, g.icon, g.target_amount, g.target_date
  ) c
  where c.reached_at is not null
  on conflict do nothing;

  -- 2) Badges. `ach` numbers the achievements in the order they happened; each rule picks the one that unlocked it.
  insert into public.user_badges (owner_id, badge_key, goal_id, goal_name, target_amount, earned_at)
  select p_owner, b.badge_key, b.goal_id, b.goal_name, b.target_amount, b.earned_at
  from (
    with ach as (
      select a.*, row_number() over (order by a.reached_at, a.id) as n,
             sum(a.target_amount) over (order by a.reached_at, a.id) as running_target
      from public.goal_achievements a
      where a.owner_id = p_owner
    ),
    deposits as (
      select m.goal_id, m.created_at, date_trunc('month', m.occurred_on)::date as month
      from public.savings_movements m
      where m.owner_id = p_owner and m.status = 'posted' and m.kind = 'deposit'
    ),
    deposit_months as (
      select d.month, min(d.created_at) as first_at,
             (array_agg(d.goal_id order by d.created_at))[1] as goal_id
      from deposits d group by d.month
    ),
    streak as (
      -- A month that also has deposits in the two months before it closes a 3-month streak.
      select dm.month, dm.first_at, dm.goal_id
      from deposit_months dm
      where exists (select 1 from deposit_months p where p.month = (dm.month - interval '1 month')::date)
        and exists (select 1 from deposit_months p where p.month = (dm.month - interval '2 months')::date)
    ),
    running as (
      select m.goal_id, m.created_at,
             sum(case m.kind when 'deposit' then m.amount else -m.amount end)
               over (partition by m.goal_id order by m.created_at, m.id) as total
      from public.savings_movements m
      where m.owner_id = p_owner and m.status = 'posted'
    ),
    halves as (
      select g.id as goal_id, g.name, g.target_amount, min(r.created_at) as at
      from public.savings_goals g
      join running r on r.goal_id = g.id
      where g.owner_id = p_owner and r.total >= g.target_amount / 2
      group by g.id, g.name, g.target_amount
    )
    -- Count rules: the n-th goal achieved.
    select 'primera-meta' as badge_key, a.goal_id, a.goal_name, a.target_amount, a.reached_at as earned_at
      from ach a where a.n = 1
    union all
    select 'lluvia-de-monedas', a.goal_id, a.goal_name, a.target_amount, a.reached_at from ach a where a.n = 3
    union all
    select 'lingote-de-oro', a.goal_id, a.goal_name, a.target_amount, a.reached_at from ach a where a.n = 5
    union all
    select 'leyenda-del-ahorro', a.goal_id, a.goal_name, a.target_amount, a.reached_at from ach a where a.n = 10
    union all
    -- Goals completed for at least $1.000.000 in total: the goal that took the running total over the line.
    select 'fajo-de-billetes', a.goal_id, a.goal_name, a.target_amount, a.reached_at
      from ach a
      where a.running_target >= 1000000 and a.running_target - a.target_amount < 1000000
    union all
    -- A goal reached while its date was still ahead (the day it was reached is before the target date).
    select 'antes-de-tiempo', x.goal_id, x.goal_name, x.target_amount, x.reached_at
      from (select a.*, row_number() over (order by a.reached_at, a.id) as k
            from ach a where a.target_date is not null and (a.reached_at at time zone 'America/Argentina/Buenos_Aires')::date < a.target_date) x
      where x.k = 1
    union all
    -- An emergency-fund goal reached (identified by its icon, never by the name the person typed).
    select 'fondo-de-emergencia', x.goal_id, x.goal_name, x.target_amount, x.reached_at
      from (select a.*, row_number() over (order by a.reached_at, a.id) as k from ach a where a.icon = 'emergencia') x
      where x.k = 1
    union all
    -- The first contribution ever recorded.
    select 'primer-aporte', x.goal_id, g.name, g.target_amount, x.created_at
      from (select d.*, row_number() over (order by d.created_at) as k from deposits d) x
      join public.savings_goals g on g.id = x.goal_id
      where x.k = 1
    union all
    -- The first goal to get halfway.
    select 'mitad-del-camino', x.goal_id, x.name, x.target_amount, x.at
      from (select h.*, row_number() over (order by h.at) as k from halves h) x
      where x.k = 1
    union all
    -- Contributions in three consecutive months: the earliest month that closes such a streak.
    select 'racha-de-ahorro', x.goal_id, g.name, g.target_amount, x.first_at
      from (select s.*, row_number() over (order by s.month) as k from streak s) x
      join public.savings_goals g on g.id = x.goal_id
      where x.k = 1
  ) b
  on conflict (owner_id, badge_key) do nothing;
end;
$$;

revoke execute on function public.award_goal_progress(uuid) from public, anon, authenticated;

-- After every deposit; saving must never fail because of the rewards.
create or replace function public.trg_award_goal_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.award_goal_progress(new.owner_id);
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke execute on function public.trg_award_goal_progress() from public, anon, authenticated;

create trigger savings_movements_award
after insert on public.savings_movements
for each row when (new.kind = 'deposit' and new.status = 'posted')
execute function public.trg_award_goal_progress();

-- RPC ------------------------------------------------------------------------------------------------------

-- The app calls this when it opens the goals (and the achievements screen): it catches up anything not recorded yet
-- (for example after a restore) without ever duplicating.
create or replace function public.claim_goal_rewards()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform public.award_goal_progress(auth.uid());
end;
$$;

-- The person saw the celebration of everything pending (or of the given achievements / badges).
create or replace function public.mark_goal_rewards_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  update public.goal_achievements set seen_at = now() where owner_id = auth.uid() and seen_at is null;
  update public.user_badges set seen_at = now() where owner_id = auth.uid() and seen_at is null;
end;
$$;

revoke execute on function public.claim_goal_rewards(), public.mark_goal_rewards_seen() from public, anon;
grant execute on function public.claim_goal_rewards(), public.mark_goal_rewards_seen() to authenticated;

-- Existing data ----------------------------------------------------------------------------------------------
-- Recognise what people already achieved, once, and mark it as seen so nobody gets a pile of old celebrations.

do $$
declare
  v_owner uuid;
begin
  for v_owner in select distinct owner_id from public.savings_movements loop
    perform public.award_goal_progress(v_owner);
  end loop;
  update public.goal_achievements set seen_at = now() where seen_at is null;
  update public.user_badges set seen_at = now() where seen_at is null;
end;
$$;
