-- Preview of an invitation: the name of the group a code belongs to, shown on "Entrar al grupo" BEFORE the
-- person confirms that they want to join ("Te invitaron a Viaje a Brasil").
--
-- Someone who is not (yet) a member cannot read groups or group_invites (RLS), so the name has to come from a
-- security definer function. To keep it as safe as join_group:
--   * It answers only for a code that join_group would accept right now (not revoked, not expired, not used up,
--     group not archived) and returns ONLY the group name. Every other case is indistinguishable: NULL.
--   * Code guessing is throttled with the same budget as join_group: a NULL answer is recorded in
--     group_join_attempts and 10 failed attempts per user per hour block both functions. Successful previews do
--     not count. Like join_group it returns NULL instead of raising on an invalid code, because an exception
--     would roll the recorded attempt back.
--   * A person who is ALREADY an active member of the code's group also gets the name when the invite has since
--     expired, been revoked or used up, exactly like join_group keeps recognising current members: opening an old
--     link to a group you are in must say "Ya sos parte de este grupo", not "venció". They only learn the name of a
--     group they already belong to, so nothing leaks to outsiders (who still get NULL).
--   * Requires a signed-in user (anon cannot execute it).
--
-- Apply AFTER 20261105000000_shorter_invite_codes.sql. Idempotent (create or replace + grants).
-- Rollback: drop function public.preview_group_invite(text);

begin;

create or replace function public.preview_group_invite(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(left(coalesce(p_code, ''), 64), '[\s-]', '', 'g'));
  v_name text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if (select count(*) from public.group_join_attempts a
      where a.user_id = v_user and a.attempted_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;

  select g.name into v_name
  from public.group_invites gi
  join public.groups g on g.id = gi.group_id
  where gi.code = v_code
    and (
      (gi.revoked_at is null and gi.expires_at > now() and gi.uses < gi.max_uses and g.archived_at is null)
      or exists (
        select 1 from public.group_members m
        where m.group_id = gi.group_id and m.user_id = v_user and m.left_at is null
      )
    );

  if v_name is not null then
    return v_name;
  end if;

  delete from public.group_join_attempts a
  where a.user_id = v_user and a.attempted_at < now() - interval '1 day';
  insert into public.group_join_attempts (user_id) values (v_user);
  return null;
end;
$$;

revoke execute on function public.preview_group_invite(text) from public, anon;
grant execute on function public.preview_group_invite(text) to authenticated;

commit;
