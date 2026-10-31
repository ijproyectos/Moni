-- Mercado Pago expense auto-import: dismiss a possible duplicate (UI of work unit 6b).
--
--   * dismiss_mp_import_duplicate(p_payment_id): sets mp_imported_payments.duplicate_dismissed for the caller's own
--     import so get_mp_import_duplicates() stops listing it. Idempotent. An unknown payment and another user's
--     payment raise the same 'payment_not_found' (23503), so the id cannot be probed. The table has no client write
--     grant, hence SECURITY DEFINER with an explicit owner filter (same shape as dismiss_subscription_duplicate).
--
-- Apply AFTER 20261112000200_mp_dedupe_guard.sql.
-- Rollback: drop function public.dismiss_mp_import_duplicate(text);

begin;

create or replace function public.dismiss_mp_import_duplicate(p_payment_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid := (select auth.uid());
begin
  if v_owner is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.mp_imported_payments
  set duplicate_dismissed = true, updated_at = now()
  where payment_id = p_payment_id and owner_id = v_owner and not duplicate_dismissed;
  if not found and not exists (
    select 1 from public.mp_imported_payments where payment_id = p_payment_id and owner_id = v_owner
  ) then
    raise exception 'payment_not_found' using errcode = '23503';
  end if;
end;
$$;

revoke execute on function public.dismiss_mp_import_duplicate(text) from public, anon;
grant execute on function public.dismiss_mp_import_duplicate(text) to authenticated;

commit;
