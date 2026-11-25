-- «Quitar de la lista» (ocultar un contacto) solo saca a la persona de las sugerencias. Si más adelante se vuelve a compartir un
-- grupo o viaje con ella, tiene que volver a aparecer: al sumarse alguien a un grupo se borran las preferencias «solo ocultas»
-- (nunca los bloqueos) entre esa persona y los demás integrantes, en los dos sentidos. No toca grupos, gastos ni saldos.
--
-- Rollback: drop trigger contacts_reappear_on_share on public.group_members; drop function private.contacts_reappear_on_share();

create or replace function private.contacts_reappear_on_share()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.contact_prefs c
  where c.hidden and not c.blocked
    and (
      (c.owner_id = new.user_id and c.contact_id in (select m.user_id from public.group_members m where m.group_id = new.group_id))
      or
      (c.contact_id = new.user_id and c.owner_id in (select m.user_id from public.group_members m where m.group_id = new.group_id))
    );
  return new;
end;
$$;
revoke execute on function private.contacts_reappear_on_share() from public, anon, authenticated;

create trigger contacts_reappear_on_share
  after insert on public.group_members
  for each row execute function private.contacts_reappear_on_share();
