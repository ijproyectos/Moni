-- Shorter invite codes: new codes have 8 characters (shown as ABCD-EFGH) instead of 12.
--
-- 1. group_invites.code accepts 8 or 12 chars of the same unambiguous alphabet (A-HJ-NP-Z2-9), so every
--    invite already issued keeps working until it expires or is used up.
-- 2. create_group_invite draws 8 characters (same generator, only the loop bound changes: 0..7).
-- 3. join_group also strips dashes and any whitespace server-side, so "abcd-efgh", "ABCD EFGH" and
--    "ABCDEFGH" are the same code. NULL-on-invalid and the throttling are unchanged.
--
-- Security: the alphabet has 32 symbols, so 8 chars give 32^8 ~ 1.1e12 codes. join_group allows only 10
-- failed attempts per user per hour (group_join_attempts), so guessing a live code is impractical PER ACCOUNT
-- (at most 240 tries per day per account). The throttle is keyed on the user, so an attacker with many accounts
-- multiplies the rate linearly; accounts here are Google sign-ins, which makes mass creation costly, but this
-- is an accepted trade-off for shorter codes, not a guarantee. If abuse ever shows up, add a global throttle or
-- go back to longer codes. Invites also expire after 7 days and are capped at 20 uses.
--
-- Apply AFTER 20261104000000_cross_claim_guard.sql. Idempotent (drop constraint if exists + create or
-- replace + grants).
-- Rollback: restore the 12-char check
--   alter table public.group_invites drop constraint group_invites_code_check;
--   alter table public.group_invites add constraint group_invites_code_check check (code ~ '^[A-HJ-NP-Z2-9]{12}$');
-- (first delete or revoke any 8-char invites, otherwise the constraint fails), and re-run the original
-- create_group_invite / join_group definitions from 20261027000000_shared_expenses.sql.

begin;

-- Drop whatever check currently restricts the code format, whatever its name (the original is an unnamed
-- inline check, auto-named group_invites_code_check), so a differently named constraint cannot linger.
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.group_invites'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%code%~%'
  loop
    execute format('alter table public.group_invites drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.group_invites
  add constraint group_invites_code_check check (code ~ '^([A-HJ-NP-Z2-9]{8}|[A-HJ-NP-Z2-9]{12})$');

create or replace function public.create_group_invite(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symbols: no modulo bias, no I/O/0/1
  v_bytes bytea;
  v_code text;
  v_attempt int;
  v_active int;
  i int;
begin
  if public.lock_group_as_member(p_group) is not null then
    raise exception 'group_archived' using errcode = '23514';
  end if;

  select count(*) into v_active
  from public.group_invites gi
  where gi.group_id = p_group
    and gi.revoked_at is null
    and gi.expires_at > now()
    and gi.uses < gi.max_uses;
  if v_active >= 5 then
    raise exception 'invite_limit_reached' using errcode = '23514';
  end if;

  for v_attempt in 1..5 loop
    -- gen_random_uuid() is cryptographically random; bytes 6 (version) and 8 (variant) are skipped.
    v_bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    v_code := '';
    for i in 0..7 loop
      -- Byte indexes used: 0-5, 7, 9 (6 and 8 hold the uuid version/variant bits).
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, case when i < 6 then i when i = 6 then 7 else i + 2 end) % 32) + 1, 1);
    end loop;
    begin
      insert into public.group_invites (group_id, code, created_by)
      values (p_group, v_code, v_user);
      return v_code;
    exception when unique_violation then
      null; -- extremely unlikely collision: draw another code
    end;
  end loop;

  raise exception 'invite_code_unavailable' using errcode = '55000';
end;
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(left(coalesce(p_code, ''), 64), '[\s-]', '', 'g'));
  v_group uuid;
  v_invite public.group_invites%rowtype;
  v_archived timestamptz;
  v_valid boolean := false;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Throttle code guessing: 10 failed attempts per user per hour. Successful joins do not count.
  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  -- Lock order matches revoke_group_invite (group row first, then invite row), which rules out
  -- deadlocks. The group is resolved from the invite without locking, then locked, then the invite
  -- is locked and re-validated.
  select gi.group_id into v_group from public.group_invites gi where gi.code = v_code;
  if found then
    select g.archived_at into v_archived from public.groups g where g.id = v_group for update;

    -- Row lock makes the uses counter atomic under concurrent joins.
    select * into v_invite from public.group_invites gi where gi.code = v_code for update;
    if found then
      -- Idempotent for current members: no use is consumed.
      if exists (
        select 1 from public.group_members m
        where m.group_id = v_invite.group_id and m.user_id = v_user and m.left_at is null
      ) then
        return v_invite.group_id;
      end if;

      v_valid := v_archived is null
        and v_invite.group_id = v_group
        and v_invite.revoked_at is null
        and v_invite.expires_at > now()
        and v_invite.uses < v_invite.max_uses;
    end if;
  end if;

  if not v_valid then
    -- Unknown, expired, revoked, exhausted and archived-group codes are indistinguishable. A failed
    -- attempt is recorded and the function RETURNS NULL (an exception would roll the record back);
    -- the client turns NULL into the uniform 'invite_invalid' error.
    delete from public.group_join_attempts a
    where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
    insert into public.group_join_attempts (user_id) values (v_user);
    return null;
  end if;

  -- First join, or re-join after leaving (restores the membership row).
  insert into public.group_members (group_id, user_id, role)
  values (v_invite.group_id, v_user, 'member')
  on conflict (group_id, user_id) do update
    set left_at = null, joined_at = now(), role = 'member';

  update public.group_invites set uses = uses + 1 where id = v_invite.id;

  return v_invite.group_id;
end;
$$;

revoke execute on function public.create_group_invite(uuid), public.join_group(text) from public, anon;
grant execute on function public.create_group_invite(uuid), public.join_group(text) to authenticated;

commit;
