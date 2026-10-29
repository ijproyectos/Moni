-- PROPOSED MIGRATION (not applied yet — review before running).
-- Persists the onboarding answers that today only live in the browser and makes the whole
-- onboarding save atomic (goals + template categories + custom categories + preferences).
--
-- Backwards compatible: existing columns, policies and public.complete_onboarding stay as they are.
--
-- Rollback (if ever needed):
--   drop function if exists public.complete_onboarding_v2(text[], text[], jsonb, text, boolean);
--   alter table public.profiles drop column if exists notifications_opt_in,
--                               drop column if exists secondary_currency;
-- The frontend calls complete_onboarding_v2 and falls back to complete_onboarding while this
-- migration is not applied.

-- 1) New preference columns on profiles.
alter table public.profiles
  add column secondary_currency char(3)
    check (secondary_currency is null or secondary_currency = 'USD'),
  add column notifications_opt_in boolean;

comment on column public.profiles.secondary_currency is 'Optional second currency the person also uses (MVP: USD only).';
comment on column public.profiles.notifications_opt_in is 'Answer to the onboarding notifications step: true = activar, false = más tarde, null = not asked.';

-- The person can change these later from Perfil.
grant update (secondary_currency, notifications_opt_in) on table public.profiles to authenticated;

-- 2) Atomic onboarding completion.
create or replace function public.complete_onboarding_v2(
  p_goals text[],
  p_template_slugs text[],
  p_custom_categories jsonb default '[]'::jsonb,
  p_secondary_currency text default null,
  p_notifications_opt_in boolean default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Input validation (the client validates too; the database is authoritative).
  if coalesce(array_length(p_goals, 1), 0) > 10 then
    raise exception 'too_many_goals' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_goals, '{}')) g where g is null or char_length(g) not between 1 and 40) then
    raise exception 'invalid_goal' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_custom_categories, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_custom_categories, '[]'::jsonb)) > 20 then
    raise exception 'invalid_custom_categories' using errcode = '22023';
  end if;
  if coalesce(array_length(p_template_slugs, 1), 0) + jsonb_array_length(coalesce(p_custom_categories, '[]'::jsonb)) = 0 then
    raise exception 'no_categories' using errcode = '22023';
  end if;
  if p_secondary_currency is not null and p_secondary_currency <> 'USD' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  perform 1 from public.profiles where id = v_user for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  update public.profiles
  set goals = coalesce(p_goals, '{}'),
      secondary_currency = p_secondary_currency,
      notifications_opt_in = p_notifications_opt_in,
      onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = v_user;

  insert into public.categories (kind, name, icon, color)
  select t.kind, t.name, t.icon, t.color
  from public.category_templates t
  where t.slug = any (coalesce(p_template_slugs, '{}'))
  order by t.kind, t.sort_order
  on conflict (owner_id, kind, lower(name)) where archived_at is null do nothing;

  -- Custom categories: same constraints as the categories table (kind enum, name length, color).
  for v_item in select * from jsonb_array_elements(coalesce(p_custom_categories, '[]'::jsonb)) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'kind', '') not in ('expense', 'income')
       or char_length(trim(coalesce(v_item ->> 'name', ''))) not between 1 and 40
       or coalesce(v_item ->> 'color', '') !~ '^#[0-9A-Fa-f]{6}$'
       or char_length(coalesce(v_item ->> 'icon', '')) not between 1 and 40 then
      raise exception 'invalid_custom_category' using errcode = '22023';
    end if;
    insert into public.categories (kind, name, icon, color)
    values (
      v_item ->> 'kind',
      trim(v_item ->> 'name'),
      v_item ->> 'icon',
      v_item ->> 'color'
    )
    on conflict (owner_id, kind, lower(name)) where archived_at is null do nothing;
  end loop;

  if not exists (select 1 from public.accounts where owner_id = v_user) then
    insert into public.accounts (name, kind, opening_balance)
    values ('Efectivo', 'cash', 0);
  end if;
end;
$$;

revoke execute on function public.complete_onboarding_v2(text[], text[], jsonb, text, boolean) from public, anon;
grant execute on function public.complete_onboarding_v2(text[], text[], jsonb, text, boolean) to authenticated;
