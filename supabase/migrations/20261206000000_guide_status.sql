-- Guía interactiva: guardar en la cuenta si la persona la completó u omitió, para no volver a mostrarla sola (en ningún dispositivo).
--   profiles.guide_status    null (todavía no la vio) | 'completed' | 'skipped'
--   profiles.guide_seen_at   cuándo
--   public.set_guide_status(p_status): la persona marca el estado de SU perfil (security definer; no se abre la columna a updates directos).
-- No toca datos financieros ni otras columnas. Las cuentas existentes quedan en null: la guía solo se abre sola tras terminar el
-- onboarding (la app lo decide), así que no se les muestra. Aplicar DESPUÉS de 20261205000000, con respaldo previo. NO aplicada.
-- Rollback: drop function public.set_guide_status(text); alter table public.profiles drop column guide_seen_at, drop column guide_status;

begin;

alter table public.profiles
  add column guide_status text check (guide_status in ('completed', 'skipped')),
  add column guide_seen_at timestamptz;

create or replace function public.set_guide_status(p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_status is null or p_status not in ('completed', 'skipped') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.profiles set guide_status = p_status, guide_seen_at = now() where id = v_user;
end;
$$;
revoke execute on function public.set_guide_status(text) from public, anon;
grant execute on function public.set_guide_status(text) to authenticated;

commit;
